import { describe, expect, it, vi } from "vitest";
import request from "supertest";
import { createApp } from "../app.js";
import { authenticate, clampName, enduserAuthConfig, registerUrlFor } from "../http/enduserAuth.js";

/**
 * Playing requires a real account now. These pin the whole contract: /login rejects
 * missing/bad credentials, mints the game session ONLY for an IdP-verified identity
 * (whose name is the verified one, not user input), and the Keycloak-mode config
 * exposes the account-console registration URL. All offline — fetch/auth injected.
 */

const KC = { endusersUrl: "http://127.0.0.1:8475", endusersIssuer: "http://127.0.0.1:8484/realms/matvs" };
const LEGACY = { endusersUrl: "http://127.0.0.1:8475", endusersIssuer: "https://endusers.matvs.dev" };

function fakeJwt(payload: Record<string, unknown>): string {
  const b64 = (o: unknown) => Buffer.from(JSON.stringify(o)).toString("base64url");
  return `${b64({ alg: "RS256" })}.${b64(payload)}.sig`;
}

describe("register URL", () => {
  it("Keycloak mode points at the realm account console; legacy has none", () => {
    expect(registerUrlFor(KC)).toBe("http://127.0.0.1:8484/realms/matvs/account");
    expect(registerUrlFor(LEGACY)).toBeNull();
  });

  it("reads the fleet env contract", () => {
    const cfg = enduserAuthConfig({ ENDUSERS_ISSUER: KC.endusersIssuer } as NodeJS.ProcessEnv);
    expect(cfg.endusersIssuer).toBe(KC.endusersIssuer);
  });
});

describe("clampName", () => {
  it("fits verified names into the table-name budget without ever failing", () => {
    expect(clampName("Mateusz von Schiller")).toHaveLength(12);
    expect(clampName("  a  ")).toBe("a__");
  });
});

describe("authenticate (Keycloak mode, fetch injected)", () => {
  const token = fakeJwt({ sub: "kc-1", preferred_username: "anna", roles: ["user"], apps: ["all-or-nothing"] });

  function fetchScript(responses: Array<{ ok: boolean; status: number; json: unknown }>): typeof fetch {
    const queue = [...responses];
    return vi.fn(async () => {
      const next = queue.shift() ?? { ok: false, status: 500, json: {} };
      return { ok: next.ok, status: next.status, json: async () => next.json };
    }) as unknown as typeof fetch;
  }

  it("verified + approved → ok with the account's name", async () => {
    const fetchImpl = fetchScript([
      { ok: true, status: 200, json: { access_token: token, expires_in: 300 } }, // token grant
      { ok: true, status: 200, json: { sub: "kc-1" } }, // userinfo attestation
    ]);
    expect(await authenticate(KC, "anna", "pw", fetchImpl)).toEqual({ ok: true, name: "anna" });
  });

  it("bad credentials → 401 with a human message", async () => {
    const fetchImpl = fetchScript([{ ok: false, status: 400, json: { error: "invalid_grant" } }]);
    const r = await authenticate(KC, "anna", "wrong", fetchImpl);
    expect(r).toMatchObject({ ok: false, status: 401 });
  });

  it("valid account without the app grant → 403 awaiting-approval", async () => {
    const pending = fakeJwt({ sub: "kc-2", preferred_username: "nowa", roles: ["user"], apps: [] });
    const fetchImpl = fetchScript([
      { ok: true, status: 200, json: { access_token: pending, expires_in: 300 } },
      { ok: true, status: 200, json: { sub: "kc-2" } },
    ]);
    const r = await authenticate(KC, "nowa", "pw", fetchImpl);
    expect(r).toMatchObject({ ok: false, status: 403 });
  });
});

describe("POST /api/login (route contract, auth injected)", () => {
  it("missing credentials → 400, no session minted", async () => {
    const { app } = createApp({ staticDir: null });
    const res = await request(app).post("/api/login").send({ username: "anna" });
    expect(res.status).toBe(400);
    expect(res.body.error).toBe(true);
  });

  it("IdP-rejected credentials → the IdP's status and message, no session", async () => {
    const { app } = createApp({
      staticDir: null,
      apiDeps: { authenticate: async () => ({ ok: false as const, status: 401, message: "Invalid username or password." }) },
    });
    const res = await request(app).post("/api/login").send({ username: "anna", password: "zle" });
    expect(res.status).toBe(401);
    expect(res.body.message).toBe("Invalid username or password.");
  });

  it("verified identity → session minted under the VERIFIED name, not user input", async () => {
    const { app } = createApp({
      staticDir: null,
      apiDeps: { authenticate: async () => ({ ok: true as const, name: "anna" }) },
    });
    const res = await request(app).post("/api/login").send({ username: "whoever", password: "pw" });
    expect(res.status).toBe(200);
    expect(res.body.name).toBe("anna");
    expect(typeof res.body.token).toBe("string");
    expect(res.body.token.length).toBeGreaterThan(0);
  });

  it("exposes the Keycloak account console to the login modal when configured", async () => {
    process.env.ENDUSERS_ISSUER = "http://127.0.0.1:8484/realms/matvs";
    try {
      const { app } = createApp({ staticDir: null });
      const res = await request(app).get("/api/auth/config");
      expect(res.body.registerUrl).toBe("http://127.0.0.1:8484/realms/matvs/account");
    } finally {
      delete process.env.ENDUSERS_ISSUER;
    }
  });
});
