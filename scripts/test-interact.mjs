// 交互自测：触屏滑动/点按、滚轮、刻度、键入游戏 id、拖动、Konami、关于、明暗、可游玩游戏的插入转场。
// 用法：先 npm run dev，再 node scripts/test-interact.mjs [截图目录]
import { mkdirSync } from "node:fs";
import { chromium } from "playwright-core";
mkdirSync(process.argv[2] ?? ".shots", { recursive: true });
const out = process.argv[2] ?? ".shots";
const b = await chromium.launch({ channel: "msedge", headless: true, args: ["--use-angle=d3d11", "--enable-gpu", "--ignore-gpu-blocklist"] });
const errs = [];
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const log = (...a) => console.log(...a);

// —— 手机：触摸上滑翻卡、点卡读取 ——
{
  const ctx = await b.newContext({ viewport: { width: 375, height: 812 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
  const p = await ctx.newPage();
  p.on("pageerror", (e) => errs.push("m " + e.message));
  await p.goto("http://127.0.0.1:5180/?skipboot");
  await sleep(2600);
  const cdp = await ctx.newCDPSession(p);
  const swipe = async (x0, y0, x1, y1, steps = 8, dur = 120) => {
    await cdp.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [{ x: x0, y: y0 }] });
    for (let i = 1; i <= steps; i++) {
      await cdp.send("Input.dispatchTouchEvent", { type: "touchMove", touchPoints: [{ x: x0 + ((x1 - x0) * i) / steps, y: y0 + ((y1 - y0) * i) / steps }] });
      await sleep(dur / steps);
    }
    await cdp.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
  };
  const sel = () => p.evaluate(() => ({ slot: window.__mk.rail.selected, mode: window.__mk.mode, title: document.getElementById("p-title").textContent }));
  log("mobile start", await sel());
  await swipe(190, 500, 190, 380); // 上滑一点 → 下一盒
  await sleep(1200);
  log("after swipe up", await sel());
  await swipe(190, 300, 190, 620, 6, 80); // 快速下滑 → 惯性滑几盒
  await sleep(2000);
  log("after fling down", await sel());
  await p.screenshot({ path: out + "/i-mobile-after-swipe.png" });
  // 点选中卡带 → 读取
  const r = await p.evaluate(() => window.__mk.stageFocus?.() ?? null);
  const fr = await p.evaluate(() => { const v = document.getElementById("vf"); const t = v.style.transform.match(/-?[\d.]+/g).map(Number); return { x: t[0] + parseFloat(v.style.width) / 2, y: t[1] + parseFloat(v.style.height) / 2 }; });
  await p.touchscreen.tap(fr.x, fr.y);
  await sleep(2200);
  log("after tap card", await sel());
  await p.screenshot({ path: out + "/i-mobile-tap-read.png" });
  await ctx.close();
}

// —— 桌面：滚轮、点击刻度、键入 dot、Konami、关于、明暗、转场 ——
{
  const ctx = await b.newContext({ viewport: { width: 1440, height: 900 } });
  const p = await ctx.newPage();
  p.on("pageerror", (e) => errs.push("d " + e.message));
  await p.goto("http://127.0.0.1:5180/?skipboot");
  await sleep(2600);
  const sel = () => p.evaluate(() => ({ slot: window.__mk.rail.selected, mode: window.__mk.mode, title: document.getElementById("p-title").textContent }));
  await p.mouse.move(500, 500);
  await p.mouse.wheel(0, 120);
  await sleep(700);
  log("wheel down", await sel());
  await p.click(".c-tick:nth-child(3)");
  await sleep(900);
  log("tick 3", await sel());
  await p.keyboard.type("beat");
  await sleep(900);
  log("typed beat", await sel());
  // 拖动
  await p.mouse.move(600, 450);
  await p.mouse.down();
  for (let i = 1; i <= 10; i++) { await p.mouse.move(600 + i * 12, 450 - i * 14); await sleep(16); }
  await p.mouse.up();
  await sleep(1500);
  log("drag", await sel());
  // Konami
  for (const k of ["ArrowUp", "ArrowUp", "ArrowDown", "ArrowDown", "ArrowLeft", "ArrowRight", "ArrowLeft", "ArrowRight", "b", "a"]) await p.keyboard.press(k);
  await sleep(1800);
  log("konami", await sel(), await p.evaluate(() => window.__mk.items().length));
  await p.screenshot({ path: out + "/i-desk-konami.png" });
  await p.keyboard.press("Enter");
  await sleep(2200);
  await p.screenshot({ path: out + "/i-desk-secret-read.png" });
  await p.keyboard.press("Escape");
  await sleep(600);
  // 关于
  await p.click("#btn-about");
  await sleep(500);
  await p.screenshot({ path: out + "/i-desk-about.png" });
  await p.keyboard.press("Escape");
  await sleep(300);
  // 明暗
  await p.click("#btn-theme");
  await sleep(1200);
  log("theme", await p.evaluate(() => document.documentElement.dataset.theme));
  await p.screenshot({ path: out + "/i-desk-theme.png" });
  // 模拟可游玩：把 dot 改成 live，插入后应该转场并跳转
  await p.evaluate(() => { const it = window.__mk.items().find((i) => i.id === "dot"); it.status = "live"; it.url = location.origin + "/?skipboot#launched"; });
  await p.keyboard.type("dot");
  await sleep(900);
  await p.keyboard.press("Enter");
  await sleep(2000);
  await p.keyboard.press("Enter");
  await sleep(1400);
  await p.screenshot({ path: out + "/i-desk-launch.png" });
  await sleep(3000); // 转场 v0.4 约 1.7 秒，加上插入和终端行
  log("after launch url", p.url());
  await ctx.close();
}
console.log(errs.length ? errs : "no page errors");
await b.close();
