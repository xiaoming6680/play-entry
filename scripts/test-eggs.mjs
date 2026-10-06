// 彩蛋自测：逐个触发彩蛋，截图，检查登记和报错。
// 用法：先 npm run dev，再 node scripts/test-eggs.mjs [截图目录] [--2d] [--mobile]
import { mkdirSync } from "node:fs";
import { chromium } from "playwright-core";
const args = process.argv.slice(2);
const out = args.find((a) => !a.startsWith("--")) ?? ".shots/eggs";
const two = args.includes("--2d");
const mobile = args.includes("--mobile");
mkdirSync(out, { recursive: true });
const b = await chromium.launch({ channel: "msedge", headless: true, args: ["--use-angle=d3d11", "--enable-gpu", "--ignore-gpu-blocklist"] });
const errs = [];
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const log = (...a) => console.log(...a);
const ctx = await b.newContext(
  mobile ? { viewport: { width: 375, height: 812 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true } : { viewport: { width: 1440, height: 900 } },
);
const p = await ctx.newPage();
p.on("pageerror", (e) => errs.push(e.message));
p.on("console", (m) => m.type() === "error" && errs.push("console: " + m.text()));
await p.goto(`http://127.0.0.1:5180/?skipboot${two ? "&r=2d" : ""}`);
await p.evaluate(() => localStorage.clear());
await p.reload();
await sleep(2800);
const shot = (n) => p.screenshot({ path: `${out}/${n}.png` });
const state = () => p.evaluate(() => ({ mode: window.__mk.mode, title: document.getElementById("p-title").textContent, eggs: window.__mk.eggs.count }));
const tap = (x, y) => (mobile ? p.touchscreen.tap(x, y) : p.mouse.click(x, y));
// 找到核心贴图上 (u,v) 对应的屏幕点
const coreXY = (u = 0.5, v = 0.5) =>
  p.evaluate(
    ([u, v]) => {
      let best = null,
        bd = 1e9;
      for (let y = 0; y < innerHeight; y += 6)
        for (let x = 0; x < innerWidth; x += 6) {
          const c = window.__mk.corePoint(x, y);
          if (!c) continue;
          const d = Math.hypot(c.u - u, c.v - v);
          if (d < bd) {
            bd = d;
            best = { x, y };
          }
        }
      return best;
    },
    [u, v],
  );
const goto = async (id) => {
  await p.evaluate((id) => {
    const mk = window.__mk;
    if (mk.mode === "read") mk.closeRead();
    const items = mk.items();
    const i = items.findIndex((x) => x.id === id);
    const n = items.length,
      s = mk.rail.selected;
    let tgt = s - (((s % n) + n) % n) + i;
    mk.rail.goto(tgt);
  }, id);
  await sleep(900);
};
const read = async () => {
  await p.evaluate(() => window.__mk.openRead());
  await sleep(2000);
};

// 1. Konami
if (!mobile) {
  for (const k of ["ArrowUp", "ArrowUp", "ArrowDown", "ArrowDown", "ArrowLeft", "ArrowRight", "ArrowLeft", "ArrowRight", "b", "a"]) {
    await p.keyboard.press(k);
    await sleep(60);
  }
  await sleep(500);
  await shot("01-konami-banner");
  await sleep(1400);
  await shot("01b-konami-pop");
  log("konami", await state());
  await sleep(2400);
  // 2. 套娃
  await goto("secret");
  await read();
  for (let i = 0; i < 6; i++) {
    const c = await coreXY();
    await tap(c.x, c.y);
    await sleep(i === 2 ? 900 : 700);
    if (i === 2) await shot("02-dive-mid");
  }
  await sleep(1200);
  await shot("02b-dive-bottom");
  log("dive", await state());
}

// 3. 直达 + 戳 stay
if (!mobile) {
  await p.evaluate(() => window.__mk.closeRead());
  await sleep(500);
  await p.keyboard.type("sta", { delay: 90 });
  await shot("03-typed");
  await p.keyboard.type("y", { delay: 90 });
  await sleep(900);
  log("typeid", await state());
} else await goto("stay");
await read();
for (let i = 0; i < 5; i++) {
  const c = await coreXY(0.5, 0.5);
  await tap(c.x, c.y);
  await sleep(260);
}
await sleep(400);
await shot("04-stay-poked");
log("poke", await state());

// 4. dot 点 30 下
await goto("dot");
await read();
for (let i = 0; i < 30; i++) {
  const c = await coreXY(0.3 + (i % 5) * 0.1, 0.4 + (i % 3) * 0.1);
  await tap(c.x, c.y);
  await sleep(40);
}
await sleep(500);
await shot("05-dot-clicker");
log("clicker", await state());

// 5. beat 跟拍
await sleep(2500);
await goto("beat");
await read();
for (let i = 0; i < 5; i++) {
  const c = await coreXY();
  await tap(c.x, c.y);
  await sleep(500);
}
await sleep(500);
await shot("06-tempo");
log("tempo", await state());

// 6. 空白卡带：连点 7 下 → 画画 → 刻录
await sleep(2500);
await goto("blank");
await read();
for (let i = 0; i < 7; i++) {
  const c = await coreXY(0.5, 0.5);
  await tap(c.x, c.y);
  await sleep(150);
}
await sleep(900);
await shot("07-doodle-unlocked");
const pts = [];
for (let i = 0; i <= 40; i++) {
  const a = (i / 40) * Math.PI * 2;
  pts.push(await coreXY(0.5 + Math.cos(a) * 0.22, 0.5 + Math.sin(a) * 0.22 * 0.9 - (i < 20 ? 0 : 0)));
}
const smile = [];
for (let i = 0; i <= 12; i++) smile.push(await coreXY(0.4 + i * 0.0167, 0.56 + Math.sin((i / 12) * Math.PI) * 0.06));
const draw = async (ps) => {
  if (mobile) {
    const cdp = await ctx.newCDPSession(p);
    await cdp.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [ps[0]] });
    for (const q of ps.slice(1)) await cdp.send("Input.dispatchTouchEvent", { type: "touchMove", touchPoints: [q] });
    await cdp.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
    return;
  }
  await p.mouse.move(ps[0].x, ps[0].y);
  await p.mouse.down();
  for (const q of ps.slice(1)) await p.mouse.move(q.x, q.y, { steps: 2 });
  await p.mouse.up();
};
await draw(pts);
await draw(smile);
for (const [u, v] of [
  [0.43, 0.43],
  [0.57, 0.43],
]) {
  const c = await coreXY(u, v);
  await tap(c.x, c.y);
}
await sleep(300);
await shot("08-doodle-drawn");
log("main label", await p.evaluate(() => document.getElementById("btn-main-lbl").textContent));
await p.click("#btn-main");
await sleep(1200);
await shot("08b-doodle-burned");
await p.evaluate(() => window.__mk.closeRead());
await sleep(1500);
await shot("08c-shelf-with-doodle");
log("doodle", await state(), await p.evaluate(() => !!localStorage.getItem("mk-doodle")));

// 7. 甩
await sleep(3000);
if (mobile) {
  const cdp = await ctx.newCDPSession(p);
  await cdp.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [{ x: 190, y: 400 }] });
  for (let i = 1; i <= 6; i++) {
    await cdp.send("Input.dispatchTouchEvent", { type: "touchMove", touchPoints: [{ x: 190, y: 400 - i * 55 }] });
    await sleep(10);
  }
  await cdp.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
} else {
  await p.mouse.move(720, 700);
  await p.mouse.down();
  for (let i = 1; i <= 6; i++) {
    await p.mouse.move(720, 700 - i * 80);
    await sleep(12);
  }
  await p.mouse.up();
}
await sleep(300);
log("throwV", await p.evaluate(() => window.__mk.rail.throwV));
await shot("09-fling");
log("fling", await state());

// 8. 转圈
await sleep(3000);
await p.evaluate(() => window.__mk.rail.goto(window.__mk.rail.selected + 100));
await sleep(1200);
await shot("10-loop");
log("loop", await state());

// 9. 命令行
await sleep(3500);
if (mobile) {
  for (let i = 0; i < 3; i++) await p.tap(".c-num").catch((e) => log("tap c-num failed", e.message.slice(0, 80)));
  log("cli focus", await p.evaluate(() => document.activeElement?.tagName));
} else await p.keyboard.press("/");
await sleep(400);
for (const c of ["help", "ls", "whoami", "sudo rm -rf /"]) {
  await p.keyboard.type(c, { delay: 10 });
  await p.keyboard.press("Enter");
  await sleep(200);
}
await sleep(3000);
await shot("11-cli");
log("cli", await state());
await p.keyboard.type("lights off");
await p.keyboard.press("Enter");
await sleep(1200);
await p.mouse.move(500, 420);
await sleep(300);
await shot("12-night");
log("night", await state());
await sleep(3500);
await p.evaluate(() => window.__mk.night.on());
await sleep(1500);

// 10. 屏保
await p.evaluate(() => window.__mk.saver.start());
await sleep(2500);
await shot("13-saver");
await p.mouse.move(100, 100);
await p.mouse.move(300, 300);
await sleep(1500);
log("saver", await state());

// 11. 红点
await sleep(2500);
for (let i = 0; i < 5; i++) {
  await p.click(".brand-mark", { delay: 10 }).catch(() => {});
  await sleep(90);
}
await sleep(900);
await shot("14-dot-drop");
log("drop", await state());

// 12. 控制台
await sleep(3000);
log("stay()", await p.evaluate(() => window.stay()));
await sleep(600);
await shot("15-console");

// 13. 明暗扩散
await sleep(3500);
await p.click("#btn-theme");
await sleep(380);
await shot("16-theme-spread");
await sleep(1200);
await shot("16b-theme-done");

// 14. 图鉴（手机上底栏藏起来了，从「关于」进）
if (await p.isVisible(".egg-n")) await p.click(".egg-n");
else {
  await p.click("#btn-about");
  await sleep(300);
  await p.evaluate(() => document.getElementById("ab-eggs").scrollIntoView());
}
await sleep(900);
await shot("17-about-eggs");
log("final", await state());
log("found", await p.evaluate(() => JSON.parse(localStorage.getItem("mk-eggs") || "{}")));
log("errors", errs);
await b.close();
