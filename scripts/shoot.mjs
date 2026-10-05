// 用本机 Edge（Playwright）跑自测截图，或生成分享图 / 图标。
//   node scripts/shoot.mjs og               生成 public/og.jpg（1200×630）和 public/apple-touch-icon.png
//   node scripts/shoot.mjs test [url] [out] 桌面 / 手机 / 减少动态效果 / 无 WebGL 各截几张，保存到 out 目录
// url 默认 http://127.0.0.1:5180/（先 npm run dev 或 npm run preview）
import { chromium } from "playwright-core";
import { mkdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { join } from "node:path";

const root = fileURLToPath(new URL("..", import.meta.url));
const [cmd = "test", base = "http://127.0.0.1:5180/", outArg] = process.argv.slice(2);
const out = outArg ?? join(root, ".shots");
mkdirSync(out, { recursive: true });

const browser = await chromium.launch({
  channel: "msedge",
  headless: true,
  args: ["--use-angle=d3d11", "--enable-gpu", "--ignore-gpu-blocklist"],
});
const errors = [];
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function open(name, { viewport, mobile = false, dark = false, reduced = false, noGL = false, query = "skipboot" }) {
  const ctx = await browser.newContext({
    viewport,
    deviceScaleFactor: mobile ? 2 : 1,
    isMobile: mobile,
    hasTouch: mobile,
    colorScheme: dark ? "dark" : "light",
    reducedMotion: reduced ? "reduce" : "no-preference",
  });
  if (noGL)
    await ctx.addInitScript(() => {
      const orig = HTMLCanvasElement.prototype.getContext;
      HTMLCanvasElement.prototype.getContext = function (type, ...rest) {
        if (/webgl/.test(type)) return null;
        return orig.call(this, type, ...rest);
      };
    });
  const page = await ctx.newPage();
  page.on("console", (m) => m.type() === "error" && errors.push(`[${name}] ${m.text().slice(0, 300)}`));
  page.on("pageerror", (e) => errors.push(`[${name}] ${e.message}`));
  await page.goto(base + (base.includes("?") ? "&" : "?") + query);
  return { ctx, page };
}

const shot = (page, file) => page.screenshot({ path: join(out, file) });

if (cmd === "og") {
  const { ctx, page } = await open("og", { viewport: { width: 1200, height: 630 }, dark: true, query: "skipboot&shot=og" });
  await sleep(3500);
  await page.screenshot({ path: join(root, "public/og.jpg"), type: "jpeg", quality: 86 });
  await ctx.close();
  const icon = await browser.newContext({ viewport: { width: 180, height: 180 } });
  const p = await icon.newPage();
  await p.setContent(
    `<body style="margin:0;background:#E9EBEE;display:grid;place-items:center;height:180px"><svg viewBox="0 0 40 46" width="104" height="120"><path d="M7 4H30L36 10V39Q36 42 33 42H7Q4 42 4 39V7Q4 4 7 4Z" fill="#F4F5F7" stroke="#0F1216" stroke-width="2.6" stroke-linejoin="round"/><path d="M10 35.5H19" stroke="#0F1216" stroke-width="2.6" stroke-linecap="round"/><circle cx="20" cy="19" r="4.8" fill="#FF3B2F"/></svg></body>`,
  );
  await p.screenshot({ path: join(root, "public/apple-touch-icon.png") });
  await icon.close();
} else {
  const cases = [
    { name: "desk", viewport: { width: 1440, height: 900 } },
    { name: "desk-dark", viewport: { width: 1440, height: 900 }, dark: true },
    { name: "mobile", viewport: { width: 375, height: 812 }, mobile: true },
    { name: "mobile-dark", viewport: { width: 375, height: 812 }, mobile: true, dark: true },
    { name: "reduced", viewport: { width: 1280, height: 800 }, reduced: true },
    { name: "nogl", viewport: { width: 375, height: 812 }, mobile: true, noGL: true },
  ];
  const only = process.env.ONLY?.split(",");
  for (const c of cases.filter((c) => !only || only.includes(c.name))) {
    const { ctx, page } = await open(c.name, c);
    await sleep(2800);
    await shot(page, `${c.name}-1-browse.png`);
    const info = await page.evaluate(() => ({ mode: window.__mk?.mode, stage: window.__mk?.stage }));
    console.log(c.name, JSON.stringify(info));
    // 翻到下一盒
    if (c.mobile) {
      const vw = c.viewport.width;
      await page.touchscreen?.tap?.(vw / 2, 200).catch?.(() => {});
      await page.evaluate(() => window.__mk.rail.nudge(1));
    } else await page.keyboard.press("ArrowDown");
    await sleep(900);
    await shot(page, `${c.name}-2-next.png`);
    // 读取
    await page.evaluate(() => void window.__mk.openRead());
    await sleep(800);
    await shot(page, `${c.name}-3-reading.png`);
    await sleep(1500);
    await shot(page, `${c.name}-4-read.png`);
    // 插入（开发中 → 弹出）
    await page.evaluate(() => void window.__mk.doInsert());
    await sleep(1500);
    await shot(page, `${c.name}-5-insert.png`);
    await sleep(2200);
    await shot(page, `${c.name}-6-eject.png`);
    await ctx.close();
  }
}
await browser.close();
if (errors.length) {
  console.log("\n页面报错：\n" + [...new Set(errors)].slice(0, 20).join("\n"));
  process.exitCode = 1;
} else console.log("无页面报错");
