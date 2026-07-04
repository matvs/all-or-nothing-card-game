/*
 * Visual self-review / design verification.
 *
 * Starts the production server IN-PROCESS (serving the built dist/) and drives
 * it with the sandbox's chrome-headless-shell, capturing the landing page and
 * the single-player tableau in both themes, plus the selected state. It also
 * samples the card canvases and asserts the three EXACT original colours
 * (#4B0082 purple, #228B22 green, #DC143C crimson) are actually painted — a
 * pixel-level guard for the faithful card figures.
 *
 * Run after `npm run build`:
 *   npm run screenshot            # -> screenshots in $TMPDIR/set-shots
 *   SHOT_DIR=/tmp/shots npm run screenshot
 */
import { mkdirSync } from "node:fs";
import path from "node:path";
import type { AddressInfo } from "node:net";
import puppeteer, { type Browser, type Page } from "puppeteer-core";
import { buildServer } from "../server/build.js";

const CHROME =
  process.env.CHROME_PATH ??
  `${process.env.HOME}/.cache/puppeteer/chrome-headless-shell/linux-149.0.7827.22/chrome-headless-shell-linux64/chrome-headless-shell`;
const OUT = process.env.SHOT_DIR ?? path.join(process.env.TMPDIR ?? "/tmp", "set-shots");

const TARGET_COLORS: Record<string, string> = {
  "#4B0082": "purple",
  "#228B22": "green",
  "#DC143C": "crimson",
};

mkdirSync(OUT, { recursive: true });

async function setTheme(page: Page, theme: "light" | "dark"): Promise<void> {
  await page.evaluate((t) => document.documentElement.setAttribute("data-bs-theme", t), theme);
}

/** Read every board canvas and report which exact target colours appear. */
async function sampleBoardColors(page: Page): Promise<Record<string, number>> {
  return page.evaluate((targets: string[]) => {
    const counts: Record<string, number> = {};
    for (const t of targets) counts[t] = 0;
    for (const canvas of Array.from(document.querySelectorAll<HTMLCanvasElement>(".set-card__canvas"))) {
      const ctx = canvas.getContext("2d");
      if (!ctx) continue;
      const { data } = ctx.getImageData(0, 0, canvas.width, canvas.height);
      for (let i = 0; i < data.length; i += 4) {
        if (data[i + 3] < 250) continue; // opaque pixels only
        const hex =
          "#" +
          [data[i], data[i + 1], data[i + 2]]
            .map((v) => v.toString(16).padStart(2, "0"))
            .join("")
            .toUpperCase();
        if (hex in counts) counts[hex]++;
      }
    }
    return counts;
  }, Object.keys(TARGET_COLORS));
}

async function main(): Promise<void> {
  const built = buildServer({ staticDir: path.resolve(process.cwd(), "dist") });
  await new Promise<void>((resolve) => built.httpServer.listen(0, "127.0.0.1", resolve));
  const port = (built.httpServer.address() as AddressInfo).port;
  const base = `http://127.0.0.1:${port}`;

  const browser: Browser = await puppeteer.launch({
    executablePath: CHROME,
    headless: true,
    args: ["--no-sandbox", "--disable-gpu", "--disable-dev-shm-usage", "--force-color-profile=srgb"],
  });
  try {
    const page = await browser.newPage();
    await page.setViewport({ width: 1280, height: 900, deviceScaleFactor: 2 });

    // Landing page.
    await page.goto(base + "/", { waitUntil: "networkidle0", timeout: 20000 });
    await setTheme(page, "light");
    await new Promise((r) => setTimeout(r, 250));
    await page.screenshot({ path: path.join(OUT, "home-light.png") as `${string}.png` });

    // Single-player tableau.
    await page.goto(base + "/singleplayer", { waitUntil: "networkidle0", timeout: 20000 });
    await page.waitForSelector(".set-card", { timeout: 10000 });
    await new Promise((r) => setTimeout(r, 700)); // let every canvas paint

    await setTheme(page, "light");
    await new Promise((r) => setTimeout(r, 250));
    await page.screenshot({ path: path.join(OUT, "solo-light.png") as `${string}.png` });

    const colors = await sampleBoardColors(page);
    const missing = Object.keys(TARGET_COLORS).filter((hex) => (colors[hex] ?? 0) === 0);
    console.log("Card colour pixel counts:", colors);
    if (missing.length > 0) {
      throw new Error(
        `Faithful colours MISSING from the rendered board: ${missing
          .map((h) => `${h} (${TARGET_COLORS[h]})`)
          .join(", ")}`,
      );
    }
    console.log("OK — all three original colours (#4B0082, #228B22, #DC143C) are painted.");

    await setTheme(page, "dark");
    await new Promise((r) => setTimeout(r, 300));
    await page.screenshot({ path: path.join(OUT, "solo-dark.png") as `${string}.png` });

    // Selection state: pick the first two cards.
    await setTheme(page, "light");
    await page.evaluate(() => {
      const tiles = Array.from(document.querySelectorAll<HTMLElement>(".set-card")).slice(0, 2);
      tiles.forEach((t) => t.click());
    });
    await new Promise((r) => setTimeout(r, 250));
    await page.screenshot({ path: path.join(OUT, "solo-selected.png") as `${string}.png` });

    // Hover-pop: confirm a hovered card actually lifts + scales.
    const firstCard = await page.$(".set-card");
    await firstCard?.hover();
    await new Promise((r) => setTimeout(r, 250));
    const transform = await page.evaluate(() => {
      const el = document.querySelector<HTMLElement>(".set-card:hover");
      return el ? getComputedStyle(el).transform : "none";
    });
    console.log("Hovered card transform:", transform);
    await page.screenshot({ path: path.join(OUT, "solo-hover.png") as `${string}.png` });

    console.log(`Saved screenshots to ${OUT}`);
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
