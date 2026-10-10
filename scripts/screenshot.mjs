/**
 * Visual QA: logs in as the demo owner and screenshots pages.
 *   node scripts/screenshot.mjs [baseUrl] [outDir] [paths...]
 * Uses the locally installed Chrome (no browser download needed).
 */
import { chromium } from "playwright";

const [base = "http://localhost:3000", out = "./screenshots", ...paths] = process.argv.slice(2);
// SHOT_MODES=desktop-light,desktop-dark,mobile-light (default: all three)
const MODES = (process.env.SHOT_MODES ?? "desktop-light,desktop-dark,mobile-light").split(",");
const pages = paths.length ? paths : ["/dashboard"];

const browser = await chromium.launch({ channel: "chrome", headless: true });
const ctx = await browser.newContext({ viewport: { width: 1440, height: 960 }, deviceScaleFactor: 1 });
const page = await ctx.newPage();
const errors = [];
page.on("pageerror", (e) => errors.push(`pageerror: ${e.message}`));
page.on("console", (m) => m.type() === "error" && errors.push(`console: ${m.text()}`));

const res = await page.request.post(`${base}/api/auth/login`, { data: { email: "usman@demo.commerceai.app", password: "Demo@12345" }, headers: { Origin: base } });
if (!res.ok()) throw new Error(`login failed ${res.status()}`);

for (const p of pages) {
  const slug = p.replace(/[^a-z0-9]+/gi, "_").replace(/^_|_$/g, "") || "root";
  for (const [mode, vp] of [["desktop", { width: 1440, height: 960 }], ["mobile", { width: 390, height: 844 }]]) {
    for (const theme of ["light", "dark"]) {
      if (!MODES.includes(`${mode}-${theme}`)) continue;
      await page.setViewportSize(vp);
      await page.emulateMedia({ colorScheme: theme });
      await page.addInitScript((t) => localStorage.setItem("theme", t), theme);
      await page.goto(`${base}${p}`, { waitUntil: "networkidle", timeout: 60_000 });
      await page.waitForTimeout(900);
      await page.screenshot({ path: `${out}/${slug}-${mode}-${theme}.png`, fullPage: mode === "desktop" });
      console.log(`✓ ${p} ${mode} ${theme}`);
    }
  }
}
if (errors.length) console.log("\nBrowser errors:\n" + [...new Set(errors)].slice(0, 20).join("\n"));
await browser.close();
