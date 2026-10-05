import type { CoreState, Item, Theme } from "../types";
import { beatCore } from "./beat";
import { MONO, type Core } from "./common";
import { dotCore } from "./dot";
import { blankCore, genericCore, secretCore } from "./misc";
import { stayCore } from "./stay";

export { PLATE, WELL } from "./common";

function make(kind: Item["core"]): Core {
  switch (kind) {
    case "beat":
      return beatCore();
    case "stay":
      return stayCore();
    case "dot":
      return dotCore();
    case "blank":
      return blankCore();
    case "secret":
      return secretCore();
    default:
      return genericCore();
  }
}

const canvas = (w: number, h: number) => {
  const c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  return c;
};

/**
 * 所有核心画布：
 * - hero：当前选中那盒，全分辨率、每帧画
 * - atlas：每种卡带一格的小图集，给整片仓库用（磨砂下看不出分辨率），降频画
 * - labels：贴签图集（编号 + 名字 + 色条），换主题或换列表时重画
 */
export class CoreBank {
  readonly hero: HTMLCanvasElement;
  readonly atlas: HTMLCanvasElement;
  readonly labels: HTMLCanvasElement;
  readonly heroSize: number;
  readonly tile: number;
  cols = 1;
  rows = 1;
  labelCols = 2;
  labelRows = 1;
  heroVersion = 0;
  atlasVersion = 0;
  labelsVersion = 0;
  items: Item[] = [];
  onEra: ((era: number) => void) | null = null;
  private heroCores = new Map<string, Core>();
  private atlasCores = new Map<string, Core>();
  private hg: CanvasRenderingContext2D;
  private ag: CanvasRenderingContext2D;
  private lg: CanvasRenderingContext2D;

  constructor(heroSize: number, tile: number) {
    this.heroSize = heroSize;
    this.tile = tile;
    this.hero = canvas(heroSize, heroSize);
    this.atlas = canvas(tile, tile);
    this.labels = canvas(512, 128);
    this.hg = this.hero.getContext("2d")!;
    this.ag = this.atlas.getContext("2d")!;
    this.lg = this.labels.getContext("2d")!;
  }

  setItems(items: Item[], theme: Theme) {
    this.items = items;
    const n = items.length;
    this.cols = Math.min(4, n);
    this.rows = Math.ceil(n / this.cols);
    this.atlas.width = this.cols * this.tile;
    this.atlas.height = this.rows * this.tile;
    this.labelRows = Math.ceil((n + 1) / this.labelCols);
    this.labels.width = 512 * this.labelCols;
    this.labels.height = 128 * this.labelRows;
    this.drawLabels(theme);
  }

  private core(map: Map<string, Core>, item: Item) {
    let c = map.get(item.id);
    if (!c) {
      c = make(item.core);
      map.set(item.id, c);
      if (map === this.heroCores) c.onEra = (e) => this.onEra?.(e);
    }
    return c;
  }

  drawHero(item: Item, s: CoreState) {
    const g = this.hg;
    g.setTransform(1, 0, 0, 1, 0, 0);
    g.save();
    this.core(this.heroCores, item).draw(g, this.heroSize, s, item);
    g.restore();
    this.heroVersion++;
  }

  drawAtlas(state: (item: Item) => CoreState) {
    const g = this.ag,
      T = this.tile;
    this.items.forEach((item, i) => {
      const x = (i % this.cols) * T,
        y = Math.floor(i / this.cols) * T;
      g.save();
      g.setTransform(1, 0, 0, 1, x, y);
      g.beginPath();
      g.rect(0, 0, T, T);
      g.clip();
      this.core(this.atlasCores, item).draw(g, T, state(item), item);
      g.restore();
    });
    this.atlasVersion++;
  }

  /** 第 i 盒在图集里的格子（2D 版用来裁图） */
  tileRect(i: number) {
    const T = this.tile;
    return { x: (i % this.cols) * T, y: Math.floor(i / this.cols) * T, w: T, h: T };
  }

  drawLabels(theme: Theme) {
    const g = this.lg;
    const W = 512,
      H = 128;
    g.setTransform(1, 0, 0, 1, 0, 0);
    g.clearRect(0, 0, this.labels.width, this.labels.height);
    const tiles = [...this.items, null];
    tiles.forEach((item, i) => {
      const x = (i % this.labelCols) * W,
        y = Math.floor(i / this.labelCols) * H;
      g.save();
      g.translate(x, y);
      g.fillStyle = theme === "dark" ? "#E4E6E2" : "#F7F7F3";
      g.fillRect(0, 0, W, H);
      if (item) {
        g.fillStyle = item.kind === "blank" ? "#B9C0C8" : item.color;
        g.fillRect(18, 22, 16, H - 44);
        if (item.color2 !== item.color && item.kind === "game") {
          g.fillStyle = item.color2;
          g.fillRect(34, 22, 6, H - 44);
        }
        g.fillStyle = "#111417";
        g.font = `700 30px ${MONO}`;
        g.textBaseline = "middle";
        g.fillText(item.code, 60, 42);
        g.font = `800 40px "PingFang SC","HarmonyOS Sans SC","Microsoft YaHei",sans-serif`;
        const title = fit(g, item.title, W - 60 - 120);
        g.fillText(title, 60, 88);
      } else {
        // 空白库存：一张没写字的贴签
        g.fillStyle = theme === "dark" ? "#2A3139" : "#E3E7EB";
        g.fillRect(0, 0, W, H);
        g.fillStyle = theme === "dark" ? "#3A434D" : "#C3C9CF";
        g.fillRect(18, 22, 16, H - 44);
        g.fillRect(60, 46, 220, 8);
        g.fillRect(60, 74, 150, 8);
        g.restore();
        return;
      }
      // 条码
      g.fillStyle = "#111417";
      for (let k = 0, bx = W - 104; k < 22; k++) {
        const w = ((k * 7 + i * 3) % 3) + 1.5;
        if ((k + i) % 4 !== 3) g.fillRect(bx, 30, w, H - 60);
        bx += w + 2.2;
      }
      g.restore();
    });
    this.labelsVersion++;
  }
}


function fit(g: CanvasRenderingContext2D, text: string, max: number) {
  if (g.measureText(text).width <= max) return text;
  let t = text;
  while (t.length > 1 && g.measureText(t + "…").width > max) t = t.slice(0, -1);
  return t + "…";
}
