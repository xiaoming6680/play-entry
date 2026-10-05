// 一键检查所有线上站点（总入口 + 各个游戏）：npm run check:sites
// 每个站点查：正式域名 200 且标题对、页面引用的 js/css 都真的存在（Pages 缺文件会回退成首页，
// 状态码照样 200，所以要看内容类型）、http 自动跳 https、备用 pages.dev 地址能开、不该上线的路径是 404。
// 站点的完整登记见 docs/站点总表.md；加新站点时两边一起改。
const SITES = [
  { id: "play", name: "铭刻（总入口）", url: "https://play.xiaoming6680.link", backup: "https://play-entry.pages.dev", title: "铭刻" },
  { id: "beat", name: "节拍幸存者", url: "https://beat.xiaoming6680.link", backup: "https://beat-survivors.pages.dev", title: "节拍幸存者" },
  {
    id: "stay",
    name: "别关我",
    url: "https://stay.xiaoming6680.link",
    backup: "https://dont-close-me.pages.dev",
    title: "别关我",
    // docs/ 是完整剧透，tests/ 是测试，线上必须访问不到
    mustBe404: ["/docs/设计.md", "/docs/开发.md", "/tests/playthrough.py", "/findings.md"],
  },
  { id: "dot", name: "从一个点开始", url: "https://dot.xiaoming6680.link", backup: "https://from-a-dot.pages.dev", title: "从一个点开始" },
];

const TIMEOUT = 15000;
const get = (url, opt = {}) => fetch(url, { signal: AbortSignal.timeout(TIMEOUT), ...opt });
const isHtml = (res) => (res.headers.get("content-type") ?? "").includes("text/html");

async function checkSite(s) {
  const fails = [];
  const notes = [];
  // 1. 正式域名
  let html = "";
  try {
    const res = await get(s.url + "/");
    html = await res.text();
    if (res.status !== 200) fails.push(`首页 ${res.status}`);
    const title = html.match(/<title>([^<]*)<\/title>/)?.[1] ?? "";
    if (!title.includes(s.title)) fails.push(`标题是「${title}」，应包含「${s.title}」`);
  } catch (e) {
    fails.push(`首页打不开：${e.cause?.code ?? e.name}`);
  }
  // 2. 页面引用的本站 js/css
  const refs = [...new Set([...html.matchAll(/(?:src|href)="([^"]+\.(?:js|css))"/g)].map((m) => m[1]))].filter(
    (r) => !/^(https?:)?\/\//.test(r),
  );
  await Promise.all(
    refs.map(async (r) => {
      try {
        const res = await get(new URL(r, s.url + "/").href);
        if (res.status !== 200 || isHtml(res)) fails.push(`资源 ${r} 缺失（${res.status}${isHtml(res) ? "，回退成了网页" : ""}）`);
        await res.arrayBuffer();
      } catch (e) {
        fails.push(`资源 ${r} 取不到：${e.name}`);
      }
    }),
  );
  if (html) notes.push(`${refs.length} 个资源`);
  // 3. http → https
  try {
    const res = await get(s.url.replace("https://", "http://") + "/", { redirect: "manual" });
    const loc = res.headers.get("location") ?? "";
    if (![301, 302, 307, 308].includes(res.status) || !loc.startsWith("https://")) fails.push(`http 没有跳到 https（${res.status}）`);
  } catch (e) {
    fails.push(`http 访问失败：${e.name}`);
  }
  // 4. 备用地址
  try {
    const res = await get(s.backup + "/");
    if (res.status !== 200) fails.push(`备用地址 ${res.status}`);
    await res.arrayBuffer();
  } catch (e) {
    fails.push(`备用地址打不开：${e.name}`);
  }
  // 5. 不该上线的路径
  for (const p of s.mustBe404 ?? []) {
    try {
      const res = await get(s.url + encodeURI(p));
      if (res.status !== 404) fails.push(`${p} 应该是 404，实际 ${res.status}`);
      await res.arrayBuffer();
    } catch (e) {
      fails.push(`${p} 检查失败：${e.name}`);
    }
  }
  if (s.mustBe404) notes.push(`${s.mustBe404.length} 个禁止路径`);
  return { s, fails, notes };
}

const only = process.argv.slice(2);
const targets = only.length ? SITES.filter((s) => only.includes(s.id)) : SITES;
const results = await Promise.all(targets.map(checkSite));
let bad = 0;
for (const { s, fails, notes } of results) {
  if (fails.length) bad++;
  console.log(`${fails.length ? "✗" : "✓"} ${s.name.padEnd(10, "　")} ${s.url}  ${notes.join("，")}`);
  for (const f of fails) console.log(`    - ${f}`);
}
console.log(bad ? `\n${bad} 个站点有问题` : `\n全部 ${results.length} 个站点正常`);
process.exit(bad ? 1 : 0);
