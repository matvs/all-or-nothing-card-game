/*
 * End-to-end multiplayer verification with TWO real headless clients.
 *
 * Starts the production server in-process, seeds two players and a room, then
 * drives two isolated browser contexts (Alice + Bob) through the real UI: take
 * seats, press Start, and have Alice claim an ACTUAL set computed from the live
 * board. Asserts the SERVER-AUTHORITATIVE score shows up on BOTH clients, then
 * screenshots the running table.
 *
 *   npm run build && npm run verify:mp
 */
import { mkdirSync } from "node:fs";
import path from "node:path";
import type { AddressInfo } from "node:net";
import puppeteer, { type Browser, type Page } from "puppeteer-core";
import { buildServer } from "../server/build.js";
import { cardFromId, findAllSets } from "../shared/engine/index.js";
import { SEAT_COLORS } from "../shared/protocol.js";

const CHROME =
  process.env.CHROME_PATH ??
  `${process.env.HOME}/.cache/puppeteer/chrome-headless-shell/linux-149.0.7827.22/chrome-headless-shell-linux64/chrome-headless-shell`;
const OUT = process.env.SHOT_DIR ?? path.join(process.env.TMPDIR ?? "/tmp", "set-shots");
mkdirSync(OUT, { recursive: true });

const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function clickButtonWithText(page: Page, text: string): Promise<boolean> {
  return page.evaluate((t: string) => {
    const btn = Array.from(document.querySelectorAll("button")).find((b) =>
      (b.textContent ?? "").trim().startsWith(t),
    );
    if (btn) {
      (btn as HTMLButtonElement).click();
      return true;
    }
    return false;
  }, text);
}

async function pointsOf(page: Page, name: string): Promise<number> {
  const txt = await page.evaluate((n: string) => {
    const rows = Array.from(document.querySelectorAll(".roster__player"));
    const row = rows.find((r) => (r.textContent ?? "").includes(n));
    return row?.querySelector(".roster__points")?.textContent ?? "";
  }, name);
  const m = txt.match(/-?\d+/);
  return m ? Number(m[0]) : NaN;
}

async function boardIds(page: Page): Promise<number[]> {
  return page.evaluate(() =>
    Array.from(document.querySelectorAll<HTMLElement>(".set-card")).map((el) =>
      Number(el.dataset.cardId),
    ),
  );
}

async function openPlayer(
  browser: Browser,
  base: string,
  roomId: string,
  player: { id: string; name: string; token: string },
): Promise<Page> {
  const context = await browser.createBrowserContext();
  const page = await context.newPage();
  await page.setViewport({ width: 1280, height: 900, deviceScaleFactor: 1 });
  await page.evaluateOnNewDocument((p: unknown) => {
    localStorage.setItem("aon:player", JSON.stringify(p));
  }, player);
  await page.goto(`${base}/room/${roomId}`, { waitUntil: "networkidle0", timeout: 20000 });
  await page.waitForSelector(".seat-picker", { timeout: 10000 });
  return page;
}

function assert(cond: boolean, message: string): void {
  if (!cond) throw new Error("ASSERTION FAILED: " + message);
  console.log("  ok —", message);
}

async function main(): Promise<void> {
  const built = buildServer({ staticDir: path.resolve(process.cwd(), "dist") });
  await new Promise<void>((resolve) => built.httpServer.listen(0, "127.0.0.1", resolve));
  const port = (built.httpServer.address() as AddressInfo).port;
  const base = `http://127.0.0.1:${port}`;

  const alice = built.registry.createPlayer("Alice");
  const bob = built.registry.createPlayer("Bob");
  const room = built.registry.createRoom("TEST");
  const roomId = "id" in room ? room.id : "TEST";

  const browser: Browser = await puppeteer.launch({
    executablePath: CHROME,
    headless: true,
    args: ["--no-sandbox", "--disable-gpu", "--disable-dev-shm-usage", "--force-color-profile=srgb"],
  });

  try {
    const pageA = await openPlayer(browser, base, roomId, alice);
    const pageB = await openPlayer(browser, base, roomId, bob);
    console.log("Two clients joined room", roomId);

    // Both players see each other in the roster (join broadcast).
    await pageA.waitForFunction(
      () => document.querySelectorAll(".roster__player").length >= 2,
      { timeout: 10000 },
    );
    assert((await pageA.$$(".roster__player")).length >= 2, "Alice sees both players in the roster");

    // Take different coloured seats.
    await pageA.$$eval(".seat-swatch", (els) => (els[0] as HTMLButtonElement).click());
    await pageB.$$eval(".seat-swatch", (els) => (els[1] as HTMLButtonElement).click());
    await wait(400);
    await pageA.screenshot({ path: path.join(OUT, "race-lobby.png") as `${string}.png` });

    // Both press Start; the round begins once both seated players are ready.
    await pageA.waitForFunction(
      () => {
        const b = Array.from(document.querySelectorAll("button")).find((x) =>
          (x.textContent ?? "").trim().startsWith("Start"),
        ) as HTMLButtonElement | undefined;
        return b && !b.disabled;
      },
      { timeout: 8000 },
    );
    assert(await clickButtonWithText(pageA, "Start"), "Alice pressed Start");
    await wait(300);
    assert(await clickButtonWithText(pageB, "Start"), "Bob pressed Start");

    // Board dealt on BOTH clients.
    await pageA.waitForSelector(".set-card", { timeout: 10000 });
    await pageB.waitForSelector(".set-card", { timeout: 10000 });
    await wait(600);
    const idsA = await boardIds(pageA);
    const idsB = await boardIds(pageB);
    assert(idsA.length === 12, `Alice's board has 12 cards (got ${idsA.length})`);
    assert(JSON.stringify(idsA) === JSON.stringify(idsB), "Both clients see the SAME shared board");
    await pageA.screenshot({ path: path.join(OUT, "race-playing.png") as `${string}.png` });

    // Alice claims a REAL set computed from the live board (server validates).
    const sets = findAllSets(idsA.map(cardFromId));
    assert(sets.length > 0, `board contains at least one set (found ${sets.length})`);
    const claimIds = sets[0].cards.map((c) => c.id);
    for (const id of claimIds) {
      await pageA.click(`.set-card[data-card-id="${id}"]`);
      await wait(120);
    }

    // Server-authoritative score shows on BOTH clients.
    await pageA.waitForFunction(
      () => {
        const rows = Array.from(document.querySelectorAll(".roster__player"));
        const row = rows.find((r) => (r.textContent ?? "").includes("Alice"));
        return /·\s*1/.test(row?.querySelector(".roster__points")?.textContent ?? "");
      },
      { timeout: 8000 },
    );
    const aOnA = await pointsOf(pageA, "Alice");
    const aOnB = await pointsOf(pageB, "Alice");
    assert(aOnA === 1, `Alice's score is 1 on her own client (got ${aOnA})`);
    assert(aOnB === 1, `Alice's score is 1 on Bob's client too — broadcast works (got ${aOnB})`);

    const foundCount = (await pageB.$$(".found-set-card")).length;
    assert(foundCount >= 1, "Bob's 'found sets' panel shows Alice's claimed set");
    await pageA.screenshot({ path: path.join(OUT, "race-after-claim.png") as `${string}.png` });

    // Chat: Bob sends a message, Alice receives it over the same socket.
    await pageB.type(".chat__form input", "gg Alice!");
    assert(await clickButtonWithText(pageB, "Send"), "Bob sent a chat message");
    await pageA.waitForFunction(
      () => (document.querySelector(".chat__log")?.textContent ?? "").includes("gg Alice!"),
      { timeout: 8000 },
    );
    assert(true, "Alice received Bob's chat message");
    await pageA.type(".chat__form input", "well played :)");
    await clickButtonWithText(pageA, "Send");
    await pageB.waitForFunction(
      () => (document.querySelector(".chat__log")?.textContent ?? "").includes("well played"),
      { timeout: 8000 },
    );
    assert(true, "Bob received Alice's reply");
    await wait(200);
    await pageA.screenshot({ path: path.join(OUT, "race-chat.png") as `${string}.png` });

    console.log("\nMULTIPLAYER E2E PASSED — screenshots in", OUT);
  } finally {
    await browser.close();
    built.dispose();
    built.httpServer.close();
  }
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
