// 校验 content/games.json：必填字段、取值范围、颜色格式、id 唯一、url 合法。
import { loadData } from "./site-html.mjs";

const STATUS = ["dev", "preview", "live", "paused"];
const DEVICE = ["desktop", "any", "mobile"];
const CORES = ["beat", "stay", "dot", "generic"];
const errors = [];
let data;
try {
  data = loadData();
} catch (e) {
  console.error("content/games.json 不是合法 JSON：", e.message);
  process.exit(1);
}
const { site, games } = data;
const need = (obj, keys, where) =>
  keys.forEach((k) => (obj?.[k] == null || obj[k] === "") && errors.push(`${where} 缺少 ${k}`));
need(site, ["brand", "title", "description", "url", "codePrefix"], "site");
if (!Array.isArray(games) || !games.length) errors.push("games 必须是非空数组");
const ids = new Set();
(games ?? []).forEach((g, i) => {
  const w = `games[${i}]${g?.id ? `（${g.id}）` : ""}`;
  need(g, ["id", "title", "url", "tagline", "device", "status", "color"], w);
  if (g.id && !/^[a-z][a-z0-9-]*$/.test(g.id)) errors.push(`${w} id 只能是小写英文、数字、连字符`);
  if (ids.has(g.id)) errors.push(`${w} id 重复`);
  ids.add(g.id);
  if (g.status && !STATUS.includes(g.status)) errors.push(`${w} status 只能是 ${STATUS.join(" / ")}`);
  if (g.device && !DEVICE.includes(g.device)) errors.push(`${w} device 只能是 ${DEVICE.join(" / ")}`);
  if (g.core && !CORES.includes(g.core)) errors.push(`${w} core 只能是 ${CORES.join(" / ")}（或省略）`);
  for (const k of ["color", "color2"])
    if (g[k] && !/^#[0-9a-fA-F]{6}$/.test(g[k])) errors.push(`${w} ${k} 要写成 #RRGGBB`);
  try {
    if (g.url) new URL(g.url);
  } catch {
    errors.push(`${w} url 不合法`);
  }
});
if (errors.length) {
  console.error("content/games.json 有问题：\n- " + errors.join("\n- "));
  process.exit(1);
}
console.log(`games.json OK：${games.length} 个游戏`);
