/**
 * Visual self-review: drive the running app with the sandbox's
 * chrome-headless-shell and capture the home screen and a solo board in both
 * themes. Not part of the app; a dev/QA aid.
 *
 *   SHOT_URL=http://127.0.0.1:4173 SHOT_DIR=/tmp/set-shots npm run screenshot
 */
import { mkdirSync } from "node:fs";
import path from "node:path";
import puppeteer, { type Browser, type Page } from "puppeteer-core";

const CHROME =
  process.env.CHROME_PATH ??
  `${process.env.HOME}/.cache/puppeteer/chrome-headless-shell/linux-149.0.7827.22/chrome-headless-shell-linux64/chrome-headless-shell`;
const URL = process.env.SHOT_URL ?? "http://127.0.0.1:4173";
const OUT = process.env.SHOT_DIR ?? path.join(process.env.TMPDIR ?? "/tmp", "set-shots");

mkdirSync(OUT, { recursive: true });

async function clickButtonWithText(page: Page, text: string): Promise<boolean> {
  return page.evaluate((t) => {
    const btn = [...document.querySelectorAll("button")].find((b) => b.textContent?.includes(t));
    if (btn) {
      (btn as HTMLButtonElement).click();
      return true;
    }
    return false;
  }, text);
}

async function setTheme(page: Page, theme: "light" | "dark"): Promise<void> {
  await page.evaluate((t) => document.documentElement.setAttribute("data-bs-theme", t), theme);
}

async function main(): Promise<void> {
  const browser: Browser = await puppeteer.launch({
    executablePath: CHROME,
    headless: true,
    args: ["--no-sandbox", "--disable-gpu", "--disable-dev-shm-usage", "--force-color-profile=srgb"],
  });
  try {
    const page = await browser.newPage();
    await page.setViewport({ width: 1200, height: 900, deviceScaleFactor: 2 });
    await page.goto(URL, { waitUntil: "networkidle0", timeout: 20000 });
    await new Promise((r) => setTimeout(r, 300));

    await setTheme(page, "light");
    await page.screenshot({ path: path.join(OUT, "home-light.png") as `${string}.png` });

    // Enter the solo game.
    const started = await clickButtonWithText(page, "Play solo");
    if (!started) throw new Error("Could not find the Play solo button");
    await page.waitForSelector("set-card", { timeout: 10000 });
    await new Promise((r) => setTimeout(r, 600)); // let every canvas paint

    await setTheme(page, "light");
    await new Promise((r) => setTimeout(r, 250));
    await page.screenshot({ path: path.join(OUT, "solo-light.png") as `${string}.png` });

    await setTheme(page, "dark");
    await new Promise((r) => setTimeout(r, 300));
    await page.screenshot({ path: path.join(OUT, "solo-dark.png") as `${string}.png` });

    // Select two cards to show the selection state, then screenshot.
    await page.evaluate(() => {
      const tiles = [...document.querySelectorAll("set-card")].slice(0, 2) as HTMLElement[];
      tiles.forEach((t) => t.click());
    });
    await new Promise((r) => setTimeout(r, 250));
    await page.screenshot({ path: path.join(OUT, "solo-dark-selected.png") as `${string}.png` });

    // Multiplayer: create a room (needs the running server), show lobby + board.
    await captureRace(page);

    console.log(`Saved screenshots to ${OUT}`);
  } finally {
    await browser.close();
  }
}

async function captureRace(page: Page): Promise<void> {
  await page.goto(URL, { waitUntil: "networkidle0", timeout: 20000 });
  await setTheme(page, "light");
  await new Promise((r) => setTimeout(r, 200));
  if (!(await clickButtonWithText(page, "Create room"))) throw new Error("no Create room button");
  await page.waitForFunction(
    () => {
      const code = document.querySelector(".room-code")?.textContent ?? "";
      return /^[A-Z]{4}$/.test(code.trim());
    },
    { timeout: 12000 },
  );
  await new Promise((r) => setTimeout(r, 400));
  await page.screenshot({ path: path.join(OUT, "race-lobby.png") as `${string}.png` });

  if (!(await clickButtonWithText(page, "Start race"))) throw new Error("no Start race button");
  await page.waitForSelector("set-card", { timeout: 10000 });
  await new Promise((r) => setTimeout(r, 700));
  await page.screenshot({ path: path.join(OUT, "race-playing.png") as `${string}.png` });
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
