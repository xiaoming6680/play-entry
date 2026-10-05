// 开场逐时刻截图：开机画面 + 开机后 12 个时刻。
// 用法：先 npm run dev，再 node scripts/test-opening.mjs [截图目录] [标签] [宽] [高] [light|dark]
import { mkdirSync } from "node:fs";
import { chromium } from "playwright-core";
mkdirSync(process.argv[2] ?? ".shots", { recursive: true });
const [out = ".shots", tag = "desk", w = "1440", h = "900", scheme = "light"] = process.argv.slice(2);
const mobile = Number(w) < 700;
const b = await chromium.launch({ channel: "msedge", headless: true, args: ["--use-angle=d3d11", "--enable-gpu", "--ignore-gpu-blocklist", "--autoplay-policy=user-gesture-required"] });
const ctx = await b.newContext({ viewport: { width: +w, height: +h }, deviceScaleFactor: mobile ? 2 : 1, isMobile: mobile, hasTouch: mobile, colorScheme: scheme });
const p = await ctx.newPage();
const errs = [];
p.on("pageerror", (e) => errs.push(e.message));
p.on("console", (m) => m.type() === "error" && errs.push(m.text().slice(0, 200)));
await p.goto("http://127.0.0.1:5180/?boot");
await new Promise((r) => setTimeout(r, 1500));
await p.screenshot({ path: `${out}/op-${tag}-00-gate.png` });
if (mobile) await p.tap("#op-power", { force: true }); else await p.click("#op-power", { force: true });
const t0 = Date.now();
const marks = [400, 1100, 1600, 2300, 3100, 3800, 4300, 4700, 5000, 5600, 6600, 8800];
for (const [i, ms] of marks.entries()) {
  const wait = ms - (Date.now() - t0);
  if (wait > 0) await new Promise((r) => setTimeout(r, wait));
  await p.screenshot({ path: `${out}/op-${tag}-${String(i + 1).padStart(2, "0")}.png` });
}
const st = await p.evaluate(() => ({ mode: window.__mk.mode, stage: window.__mk.stage, audio: !!document.querySelector(".boot.snd") }));
console.log(tag, JSON.stringify(st), errs.length ? errs : "no errors");
await b.close();
