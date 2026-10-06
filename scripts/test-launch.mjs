// 进入转场截帧：每个游戏 × 几种宽高比，把转场冻结在若干时间点截图，拼成一张对照表。
// 用法：先 npm run dev，再 node scripts/test-launch.mjs [截图目录]
import { mkdirSync, readFileSync } from "node:fs";
import { chromium } from "playwright-core";
const out = process.argv[2] ?? ".shots/launch";
mkdirSync(out, { recursive: true });
const b = await chromium.launch({ channel: "msedge", headless: true, args: ["--use-angle=d3d11", "--enable-gpu", "--ignore-gpu-blocklist"] });
const errs = [];
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const VIEWS = [
  { name: "16x9", viewport: { width: 1280, height: 720 } },
  { name: "21x9", viewport: { width: 1680, height: 720 } },
  { name: "square", viewport: { width: 760, height: 760 } },
  { name: "phone", viewport: { width: 375, height: 812 }, isMobile: true, hasTouch: true },
];
const TIMES = {
  beat: [0.12, 0.3, 0.55, 1.0, 1.25, 1.45],
  stay: [0.2, 0.55, 0.85, 1.35, 1.72, 1.85],
  dot: [0.25, 0.6, 0.85, 1.1, 1.4, 1.6],
};

async function frame(view, id, t) {
  const ctx = await b.newContext({ ...view, deviceScaleFactor: 1 });
  const p = await ctx.newPage();
  p.on("pageerror", (e) => errs.push(`${view.name} ${id} ${t}: ${e.message}`));
  await p.goto(`http://127.0.0.1:5180/?skipboot&launchT=${t}`);
  await sleep(1800);
  await p.keyboard.type(id);
  await sleep(700);
  await p.evaluate(() => window.__mk.openRead());
  await sleep(1900);
  // 转场被冻结后永远不会结束，所以不等 doInsert 返回；手机上第二次才算「仍然插入」
  await p.evaluate(() => {
    window.__mk.doInsert();
    window.__mk.doInsert();
  });
  await sleep(1900);
  const file = `${out}/${id}-${view.name}-${t}.png`;
  await p.screenshot({ path: file });
  await ctx.close();
  return file;
}

// 四种比例并行跑
await Promise.all(VIEWS.map(async (view) => {
  const rows = [];
  for (const id of Object.keys(TIMES)) {
    const files = [];
    for (const t of TIMES[id]) files.push(await frame(view, id, t));
    rows.push({ id, files });
  }
  // 拼对照表
  const ctx = await b.newContext({ viewport: { width: 1800, height: 600 } });
  const p = await ctx.newPage();
  const w = view.viewport.width / view.viewport.height > 1 ? 290 : 160;
  const html = `<body style="margin:0;background:#888;font:12px monospace">${rows
    .map(
      (r) =>
        `<div style="display:flex;gap:4px;margin:4px;align-items:center"><b style="width:40px">${r.id}</b>${r.files
          .map((f, i) => `<figure style="margin:0"><img width="${w}" src="data:image/png;base64,${readFileSync(f).toString("base64")}"><figcaption>${TIMES[r.id][i]}s</figcaption></figure>`)
          .join("")}</div>`,
    )
    .join("")}</body>`;
  await p.setContent(html);
  await p.screenshot({ path: `${out}/sheet-${view.name}.png`, fullPage: true });
  await ctx.close();
  console.log("sheet", view.name);
}));
console.log(errs.length ? errs : "no page errors");
await b.close();
