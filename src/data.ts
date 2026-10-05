import raw from "../content/games.json";
import type { GameData, Item, SiteData } from "./types";

export const site = raw.site as SiteData;
const games = (raw.games as GameData[])
  .filter((g) => !g.hidden)
  .map((g, i) => ({ g, i }))
  .sort((a, b) => (a.g.order ?? a.i + 1) - (b.g.order ?? b.i + 1))
  .map(({ g }) => g);

export const STATUS_LABEL: Record<Item["status"], string> = {
  dev: "开发中",
  preview: "可试玩",
  live: "已上线",
  paused: "暂停开发",
  blank: "未刻录",
};

export const DEVICE_LABEL: Record<Item["device"], string> = {
  desktop: "建议电脑游玩",
  any: "电脑手机都行",
  mobile: "建议手机游玩",
};

const pad = (n: number) => String(n).padStart(2, "0");

export function buildItems(withSecret = false): Item[] {
  const prefix = site.codePrefix || "MK";
  const items: Item[] = games.map((g, i) => ({
    kind: "game",
    id: g.id,
    code: g.code ?? `${prefix}-${pad(i + 1)}`,
    title: g.title,
    titleEn: g.titleEn ?? g.id.toUpperCase(),
    url: g.url,
    tagline: g.tagline,
    intro: g.intro ?? g.tagline,
    genre: g.genre ?? [],
    session: g.session ?? "",
    controls: g.controls ?? "",
    device: g.device,
    status: g.status,
    color: g.color,
    color2: g.color2 ?? g.color,
    core: g.core ?? "generic",
    glyph: g.glyph ?? g.title.slice(0, 1),
    coreOptions: g.coreOptions ?? {},
  }));
  const blank = site.blank;
  if (blank?.enabled !== false) {
    items.push({
      kind: "blank",
      id: "blank",
      code: `${prefix}-${pad(items.length + 1)}`,
      title: blank?.title ?? "下一盒",
      titleEn: "BLANK CARTRIDGE",
      url: null,
      tagline: blank?.tagline ?? "空白卡带，还没有刻录任何东西",
      intro: blank?.intro ?? "下一个游戏正在构思。",
      genre: [],
      session: "",
      controls: "",
      device: "any",
      status: "blank",
      color: "#9AA3AD",
      color2: "#9AA3AD",
      core: "blank",
      glyph: "+",
      coreOptions: {},
    });
  }
  if (withSecret) {
    items.push({
      kind: "secret",
      id: "secret",
      code: `${prefix}-00`,
      title: "入口本身",
      titleEn: "THE ARCHIVE ITSELF",
      url: null,
      tagline: "一盒装着这座卡带库的卡带",
      intro: `你翻到了不在架子上的那一盒。这座卡带库由${site.author}制作：three.js 画卡带，Canvas 画每个游戏的核心，声音全部由浏览器现场合成，总共不到 300KB。阵列、抽取与磨砂解密的思路借鉴自 RhineLabUI（LBEILC，MIT），在此致谢。`,
      genre: ["彩蛋"],
      session: "",
      controls: "↑↑↓↓←→←→BA",
      device: "any",
      status: "blank",
      color: "#FF3B2F",
      color2: "#FF3B2F",
      core: "secret",
      glyph: "◆",
      coreOptions: {},
    });
  }
  return items;
}

export const wrap = (v: number, n: number) => ((v % n) + n) % n;
