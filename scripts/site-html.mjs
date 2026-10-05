// 把 content/games.json 注入 index.html：<head> 里的 meta、正文的品牌占位、<noscript> 游戏列表。
// 开发服务器和生产构建共用；生产构建时还把 module 脚本改成经典脚本，保证双击 dist/index.html 能打开。
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const DATA = fileURLToPath(new URL("../content/games.json", import.meta.url));
const esc = (s) =>
  String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
const STATUS = { dev: "开发中", preview: "可试玩", live: "已上线", paused: "暂停开发" };

export function loadData() {
  return JSON.parse(readFileSync(DATA, "utf8"));
}

function meta(site, games) {
  const shown = games.filter((g) => !g.hidden);
  const desc = `${site.description} 收录：${shown.map((g) => g.title).join("、")}。`;
  const og = `${site.url.replace(/\/$/, "")}/og.jpg`;
  return [
    `<title>${esc(site.title)}</title>`,
    `<meta name="description" content="${esc(desc)}">`,
    `<meta name="author" content="${esc(site.author)}">`,
    `<meta property="og:type" content="website">`,
    `<meta property="og:site_name" content="${esc(site.brand)}">`,
    `<meta property="og:title" content="${esc(site.title)}">`,
    `<meta property="og:description" content="${esc(desc)}">`,
    `<meta property="og:url" content="${esc(site.url)}">`,
    `<meta property="og:image" content="${esc(og)}">`,
    `<meta property="og:image:width" content="1200">`,
    `<meta property="og:image:height" content="630">`,
    `<meta property="og:locale" content="zh_CN">`,
    `<meta name="twitter:card" content="summary_large_image">`,
    `<meta name="twitter:title" content="${esc(site.title)}">`,
    `<meta name="twitter:description" content="${esc(desc)}">`,
    `<meta name="twitter:image" content="${esc(og)}">`,
    `<meta itemprop="name" content="${esc(site.title)}">`,
    `<meta itemprop="description" content="${esc(desc)}">`,
    `<meta itemprop="image" content="${esc(og)}">`,
    `<link rel="canonical" href="${esc(site.url)}">`,
  ].join("\n    ");
}

function noscript(site, games) {
  const items = games
    .filter((g) => !g.hidden)
    .map(
      (g) =>
        `<li><a href="${esc(g.url)}"><b>${esc(g.title)}</b></a> <span>${esc(STATUS[g.status] ?? g.status)}</span><br>${esc(g.tagline)}</li>`,
    )
    .join("");
  return `<noscript><style>#app,#boot{display:none!important}</style><main class="ns"><h1>${esc(site.brand)}</h1><p>${esc(site.description)}</p><ul>${items}</ul><p class="ns-foot">打开 JavaScript 可以看到完整的卡带库。</p></main></noscript>`;
}

export function siteHtml({ build = false } = {}) {
  return {
    name: "site-html",
    transformIndexHtml: {
      order: "post",
      handler(html) {
        const { site, games } = loadData();
        let out = html
          .replace("<!--@meta-->", meta(site, games))
          .replace("<!--@noscript-->", noscript(site, games))
          .replace(/\{\{site\.(\w+)\}\}/g, (_, k) => esc(site[k]));
        if (build) {
          // file:// 下 module 脚本和带 crossorigin 的资源会被当成跨域拦截
          out = out
            .replace(/<script type="module" crossorigin src="([^"]+)"><\/script>/g, '<script defer src="$1"></script>')
            .replace(/<script type="module" src="([^"]+)"><\/script>/g, '<script defer src="$1"></script>')
            .replace(/ crossorigin(="[^"]*")?(?=[\s>])/g, "")
            .replace(/<link rel="modulepreload"[^>]*>\s*/g, "");
        }
        return out;
      },
    },
  };
}
