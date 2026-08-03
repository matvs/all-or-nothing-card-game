// Real sign-in for All or Nothing. The old "login" was a bare nickname prompt — anyone
// could play as anyone. Identity is now delegated to the central IdP with the fleet's
// single-env cutover (infra-migration/DECOMMISSION.md, Stage 2): ENDUSERS_ISSUER containing
// `/realms/` selects Keycloak (Direct Access Grant + userinfo attestation via
// @matvs/core-node), anything else keeps the legacy endusers-manager proxy. Either way the
// display name comes from the VERIFIED identity, never from user input.

import {
  isKeycloakIssuer,
  keycloakAccountUrl,
  loginViaKeycloak,
  proxyEnduserAuthRequest,
  verifyViaKeycloak,
} from "@matvs/core-node/auth";
import { NAME_MAX_LENGTH } from "../../shared/protocol.js";

export const APP_ID = "all-or-nothing";

export interface EnduserAuthConfig {
  readonly endusersUrl: string;
  readonly endusersIssuer: string;
}

export function enduserAuthConfig(processEnv: NodeJS.ProcessEnv = process.env): EnduserAuthConfig {
  return {
    endusersUrl: processEnv.ENDUSERS_MANAGER_URL ?? "http://127.0.0.1:8475",
    endusersIssuer: processEnv.ENDUSERS_ISSUER ?? "https://endusers.matvs.dev",
  };
}

/** Where "Create account" points. Keycloak's own account console in Keycloak mode. */
export function registerUrlFor(cfg: EnduserAuthConfig): string | null {
  return isKeycloakIssuer(cfg.endusersIssuer) ? keycloakAccountUrl(cfg.endusersIssuer) : null;
}

export type AuthOutcome =
  | { readonly ok: true; readonly name: string }
  | { readonly ok: false; readonly status: number; readonly message: string };

/** Clamp a verified identity name into the game's display-name budget. */
export function clampName(name: string): string {
  const trimmed = name.trim().replace(/\s+/g, " ");
  const cut = trimmed.slice(0, NAME_MAX_LENGTH);
  return cut.length >= 3 ? cut : cut.padEnd(3, "_");
}

/**
 * Authenticate a username/password against the active IdP and resolve the verified
 * display name. Bad credentials → 401; valid account without the app grant → 403
 * (pending-approval model); IdP down → 502.
 */
export async function authenticate(
  cfg: EnduserAuthConfig,
  username: string,
  password: string,
  fetchImpl: typeof fetch = fetch,
): Promise<AuthOutcome> {
  if (isKeycloakIssuer(cfg.endusersIssuer)) {
    const login = await loginViaKeycloak({
      issuer: cfg.endusersIssuer,
      username,
      password,
      fetchImpl,
    });
    if (login.status !== 200) {
      const message =
        login.status === 401 ? "Invalid username or password." : "Sign-in is temporarily unavailable.";
      return { ok: false, status: login.status, message };
    }
    const token = (login.body as { token?: string }).token ?? "";
    const identity = await verifyViaKeycloak({
      issuer: cfg.endusersIssuer,
      token,
      appId: APP_ID,
      fetchImpl,
    });
    if (!identity) {
      return { ok: false, status: 403, message: "Your account is awaiting approval for All or Nothing." };
    }
    return { ok: true, name: clampName(identity.name) };
  }

  // Legacy endusers-manager: the proxy injects appId, so the manager enforces approval itself.
  try {
    const result = await proxyEnduserAuthRequest({
      endusersUrl: cfg.endusersUrl,
      appId: APP_ID,
      action: "login",
      payload: { username: username.toLowerCase(), password },
    });
    if (result.status !== 200) {
      const body = (result.body ?? {}) as { message?: string };
      const message =
        result.status === 403
          ? (body.message ?? "Your account is awaiting approval for All or Nothing.")
          : (body.message ?? "Invalid username or password.");
      return { ok: false, status: result.status === 200 ? 502 : result.status, message };
    }
    const user = (result.body as { user?: { username?: string; displayName?: string } }).user;
    const name = user?.displayName || user?.username || username;
    return { ok: true, name: clampName(String(name)) };
  } catch {
    return { ok: false, status: 502, message: "Sign-in is temporarily unavailable." };
  }
}
