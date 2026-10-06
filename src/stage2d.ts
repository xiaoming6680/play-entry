// 2D 版：没有 WebGL2、省流量、3D 太卡、手动选择或"减少动态效果"时使用。
// 同一套 HUD；中间是「一叠卡」：选中的那张在最前面、不被任何卡挡住；后面的依次往下、往后缩小，只露出底边的贴签；
// 翻到下一张时，最前面那张往上飞走，后面那张升上来（和手机上"上滑 = 下一个"同方向）。
// 磨砂用模糊的核心画布叠在清晰画布上，读卡头自上而下擦清。
import type { CoreBank } from "./cores";
import { smooth } from "./motion";
import type { Frame, Item, Pick, Rect, Stage, Theme } from "./types";

const wrap = (v: number, n: number) => ((v % n) + n) % n;
const LED: Record<string, string> = {
  dev: "var(--accent)",
  preview: "var(--warn)",
  live: "var(--ok)",
  paused: "var(--idle)",
  blank: "transparent",
};

interface Card {
  el: HTMLDivElement;
  sharp: HTMLCanvasElement;
  frost: HTMLCanvasElement;
  milk: HTMLDivElement;
  scan: HTMLDivElement;
  led: HTMLElement;
  slot: number;
  itemId: string;
  drawn: number;
}

export function createStage2D(host: HTMLElement, bank: CoreBank): Stage {
  return new Stage2D(host, bank);
}

class Stage2D implements Stage {
  readonly kind = "2d" as const;
  ready = Promise.resolve();
  private deck: HTMLDivElement;
  private cards = new Map<number, Card>();
  private pool: Card[] = [];
  private items: Item[] = [];
  private w = 1;
  private h = 1;
  private cw = 200;
  private focus: Rect | null = null;
  private lastRail = 0;
  private lastAtlas = -1;

  constructor(
    private host: HTMLElement,
    private bank: CoreBank,
  ) {
    this.deck = document.createElement("div");
    this.deck.className = "deck";
    host.append(this.deck);
    this.resize();
  }

  setItems(items: Item[]) {
    this.items = items;
    for (const c of this.cards.values()) c.itemId = "";
  }
  setTheme(_: Theme) {}

  private get portrait() {
    return this.w / this.h < 0.85 || this.w < 700;
  }

  resize() {
    const r = this.host.getBoundingClientRect();
    this.w = Math.max(1, r.width);
    this.h = Math.max(1, r.height);
    this.cw = this.portrait ? Math.min(this.w * 0.5, this.h * 0.26) : Math.min(this.h * 0.34, this.w * 0.2, 300);
    this.deck.style.setProperty("--cw", `${this.cw}px`);
  }

  private anchor(reading: boolean) {
    if (this.portrait) return { x: this.w * 0.5, y: this.h * (reading ? 0.38 : 0.47) };
    return { x: this.w * (reading ? 0.3 : 0.38), y: this.h * 0.64 };
  }

  private make(): Card {
    const el = document.createElement("div");
    el.className = "c2";
    el.innerHTML =
      '<div class="c2-body"><div class="c2-core"><canvas class="sharp"></canvas><canvas class="frost"></canvas><div class="c2-milk"></div><div class="c2-scan"></div></div><div class="c2-label"><b></b><span></span></div><div class="c2-sheen"></div></div><i class="c2-led"></i>';
    const [sharp, frost] = [...el.querySelectorAll("canvas")] as HTMLCanvasElement[];
    sharp.width = sharp.height = frost.width = frost.height = 256;
    this.deck.append(el);
    return {
      el,
      sharp,
      frost,
      milk: el.querySelector(".c2-milk")!,
      scan: el.querySelector(".c2-scan")!,
      led: el.querySelector(".c2-led")!,
      slot: 0,
      itemId: "",
      drawn: -1,
    };
  }

  draw(f: Frame) {
    const n = this.items.length;
    if (!n) return;
    this.lastRail = f.rail;
    const reading = f.reading;
    const A = this.anchor(reading);
    const cw = this.cw,
      ch = cw * 1.1875;
    const lo = Math.floor(f.rail) - 1,
      hi = Math.ceil(f.rail) + 3;
    const live = new Set<number>();
    for (let s = lo; s <= hi; s++) {
      live.add(s);
      let c = this.cards.get(s);
      if (!c) {
        c = this.pool.pop() ?? this.make();
        c.slot = s;
        c.itemId = "";
        c.el.style.display = "";
        this.cards.set(s, c);
      }
      const item = this.items[wrap(s, n)];
      const idx = wrap(s, n);
      if (c.itemId !== item.id) {
        c.itemId = item.id;
        c.el.dataset.slot = String(s);
        c.el.style.setProperty("--gc", item.kind === "blank" ? "#B9C0C8" : item.color);
        c.el.querySelector(".c2-label b")!.textContent = item.code;
        c.el.querySelector(".c2-label span")!.textContent = item.title;
        c.led.style.setProperty("--led", LED[item.status] ?? "transparent");
        c.led.classList.toggle("blink", item.status === "dev");
        c.drawn = -1;
      }
      const isSel = s === f.slot;
      // —— 位置：一叠卡 ——
      const d = s - f.rail; // >0 后面还没翻到的（往下、往后缩），<0 已经翻过去的（往上飞走）
      let x: number, y: number, sc: number, op: number, z: number;
      let dim = 0;
      if (d >= 0) {
        x = A.x + d * cw * (this.portrait ? 0.02 : 0.07);
        y = A.y + d * cw * (this.portrait ? 0.115 : 0.13);
        sc = 1 - 0.075 * d;
        op = d < 2.6 ? 1 : Math.max(0, 1 - (d - 2.6) / 0.6);
        z = 300 - Math.round(d * 10);
        dim = Math.min(0.42, d * 0.14);
      } else {
        const u = -d;
        x = A.x - u * cw * 0.06;
        y = A.y - u * ch * 1.2;
        sc = 1 + u * 0.05;
        op = Math.max(0, 1 - u * 1.8);
        z = 310 + Math.round(u * 10);
      }
      x += f.lateral * cw;
      if (reading) {
        if (isSel) {
          sc = this.portrait ? 1.05 : 1.3;
          x = A.x;
          y = A.y + ch * 0.5 * sc - ch * 0.5;
          y += f.insert * this.h * 0.9;
          dim = 0;
        } else {
          op *= 0.12;
          y += this.h * 0.12;
        }
      }
      // 入场：选中的那张开场时就在原位（标志推近贴合到它上面），其余的轻轻升起、淡入
      // （入场前不透明度留 0.002 而不是 0：完全透明的元素浏览器不画，淡入第一帧才画会卡一下）
      const e = f.reduced || (isSel && f.mode === "boot") ? 1 : smooth((f.enter - Math.min(0.4, Math.abs(d) * 0.08)) / 0.6);
      y += (1 - e) * ch * 0.3;
      op *= Math.max(0.002, e);
      c.el.style.transform = `translate3d(${(x - cw / 2).toFixed(1)}px,${(y - ch).toFixed(1)}px,0) scale(${sc.toFixed(3)})`;
      c.el.style.opacity = String(Math.max(0, op).toFixed(3));
      c.el.style.zIndex = String(z);
      c.el.style.pointerEvents = op < 0.1 ? "none" : "";
      c.el.style.filter = dim > 0.01 ? `brightness(${(1 - dim).toFixed(3)})` : "";
      // —— 核心 ——
      const sg = c.sharp.getContext("2d")!;
      if (isSel) {
        sg.drawImage(this.bank.hero, 0, 0, 256, 256);
        c.drawn = -2;
      } else if (c.drawn !== this.bank.atlasVersion || this.lastAtlas !== this.bank.atlasVersion) {
        const r = this.bank.tileRect(idx);
        sg.drawImage(this.bank.atlas, r.x, r.y, r.w, r.h, 0, 0, 256, 256);
        c.drawn = this.bank.atlasVersion;
      }
      const fg = c.frost.getContext("2d")!;
      fg.drawImage(c.sharp, 0, 0);
      // 磨砂：选中时 85%，读取时由读卡头自上而下擦清
      const frost = isSel ? (reading ? 1 : 0.86) : 1;
      const front = isSel && reading ? f.reveal : 0;
      const edge = (1 - front * 1.24) * 100;
      const mask =
        front > 0 ? `linear-gradient(to top, #000 ${Math.max(0, edge - 12)}%, transparent ${Math.min(100, edge + 12)}%)` : "none";
      c.frost.style.opacity = String(frost);
      c.frost.style.maskImage = c.frost.style.webkitMaskImage = mask;
      c.milk.style.opacity = String(frost);
      c.milk.style.maskImage = c.milk.style.webkitMaskImage = mask;
      const scanOn = isSel && reading && f.reveal > 0 && f.reveal < 1;
      c.scan.style.opacity = scanOn ? "1" : "0";
      if (scanOn) c.scan.style.top = `${Math.min(100, Math.max(0, 100 - edge))}%`;
      if (isSel) {
        const vis = sc;
        this.focus = { x: x - (cw * vis) / 2, y: y - ch * vis, w: cw * vis, h: ch * vis };
      }
    }
    this.lastAtlas = this.bank.atlasVersion;
    for (const [s, c] of this.cards)
      if (!live.has(s)) {
        c.el.style.display = "none";
        this.cards.delete(s);
        this.pool.push(c);
      }
  }

  /** 内容前进一个卡位时的屏幕位移：后面那张从下面升到最前（向上） */
  slotAxis() {
    const k = this.portrait ? { x: -0.02, y: -0.115 } : { x: -0.07, y: -0.13 };
    return { x: k.x * this.cw, y: k.y * this.cw };
  }
  laneAxis() {
    return { x: this.cw, y: 0 };
  }
  pick(x: number, y: number): Pick | null {
    for (const el of document.elementsFromPoint(x, y)) {
      const c = (el as HTMLElement).closest?.(".c2") as HTMLElement | null;
      if (c?.dataset.slot != null) return { lane: 0, slot: Number(c.dataset.slot) };
    }
    void this.lastRail;
    return null;
  }
  focusRect() {
    return this.focus;
  }
  corePoint(x: number, y: number, slot: number) {
    const el = this.deck.querySelector<HTMLElement>(`.c2[data-slot="${slot}"] .c2-core`);
    if (!el) return null;
    const r = el.getBoundingClientRect();
    const u = (x - r.left) / r.width,
      v = (y - r.top) / r.height;
    return u >= 0 && u <= 1 && v >= 0 && v <= 1 ? { u, v } : null;
  }
  /** 开场「推近」用：选中卡片正面的四个角（左上、右上、右下、左下） */
  faceQuad() {
    const r = this.focus;
    if (!r) return null;
    return [
      { x: r.x, y: r.y },
      { x: r.x + r.w, y: r.y },
      { x: r.x + r.w, y: r.y + r.h },
      { x: r.x, y: r.y + r.h },
    ];
  }
  dispose() {
    this.deck.remove();
  }
}
