// 生成 README 配图（docs/images/），用本机 Edge（Playwright）截线上或本地页面。
//   node scripts/readme-shots.mjs [url]
// url 默认线上备用地址 https://play-entry.pages.dev/；本地可用 http://127.0.0.1:5180/（先 npm run dev）
import { chromium } from "playwright-core";
import { mkdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { join } from "node:path";

const root = fileURLToPath(new URL("..", import.meta.url));
const base = process.argv[2] ?? "https://play-entry.pages.dev/";
const out = join(root, "docs/images");
mkdirSync(out, { recursive: true });

const browser = await chromium.launch({
  channel: "msedge",
  headless: true,
  args: ["--use-angle=d3d11", "--enable-gpu", "--ignore-gpu-blocklist"],
});
const errors = [];
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const jpg = (page, name) => page.screenshot({ path: join(out, name), type: "jpeg", quality: 82 });

async function open(viewport, mobile = false, scheme = "dark") {
  const ctx = await browser.newContext({
    viewport,
    deviceScaleFactor: mobile ? 2 : 1,
    isMobile: mobile,
    hasTouch: mobile,
    colorScheme: scheme,
  });
  const page = await ctx.newPage();
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto(base + (base.includes("?") ? "&" : "?") + "skipboot");
  await sleep(4000);
  return { ctx, page };
}

// 桌面：翻找 → 读取
{
  const { ctx, page } = await open({ width: 1600, height: 900 });
  await jpg(page, "browse.jpg");
  await page.keyboard.press("ArrowDown");
  await page.keyboard.press("ArrowDown");
  await sleep(1500);
  await page.keyboard.press("Enter");
  await sleep(5500);
  await jpg(page, "read.jpg");
  await ctx.close();
}

// 亮色主题：翻到别关我
{
  const { ctx, page } = await open({ width: 1600, height: 900 }, false, "light");
  await page.keyboard.press("ArrowDown");
  await sleep(1500);
  await jpg(page, "light.jpg");
  await ctx.close();
}

// 手机竖屏：读取一盒卡带
{
  const { ctx, page } = await open({ width: 390, height: 844 }, true);
  await page.keyboard.press("ArrowDown");
  await sleep(1200);
  await page.keyboard.press("Enter");
  await sleep(5500);
  await jpg(page, "mobile.jpg");
  await ctx.close();
}

await browser.close();
if (errors.length) console.log("页面报错：\n" + errors.join("\n"));
console.log("配图已保存到 docs/images/");
