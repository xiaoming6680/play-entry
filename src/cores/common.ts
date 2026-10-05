import type { CoreState, Item, Theme } from "../types";

/** 卡带内衬板颜色：核心井以外的部分；3D 着色器里用同一个值，保证接缝看不出来 */
export const PLATE: Record<Theme, string> = { light: "#E1E6EB", dark: "#151A21" };
/** 核心井半径（占贴图半边长的比例） */
export const WELL = 0.84;

export interface Core {
  draw(g: CanvasRenderingContext2D, size: number, s: CoreState, item: Item): void;
  /** dot 用：进化到新时代时回调（主程序据此放音效） */
  onEra?: (era: number) => void;
}

export function plate(g: CanvasRenderingContext2D, size: number, theme: Theme, wellBg: string | CanvasGradient) {
  const c = size / 2,
    r = c * WELL;
  g.globalCompositeOperation = "source-over";
  g.globalAlpha = 1;
  g.fillStyle = PLATE[theme];
  g.fillRect(0, 0, size, size);
  // 井沿：一圈细亮边 + 内侧阴影，让核心像嵌在板子里
  g.beginPath();
  g.arc(c, c, r + size * 0.018, 0, Math.PI * 2);
  g.fillStyle = theme === "light" ? "#F2F4F7" : "#252C35";
  g.fill();
  g.beginPath();
  g.arc(c, c, r, 0, Math.PI * 2);
  g.fillStyle = wellBg;
  g.fill();
}

/** 在核心井里画东西（自动裁成圆，结束后补一圈内阴影） */
export function inWell(g: CanvasRenderingContext2D, size: number, fn: (c: number, r: number) => void, shade = 0.35) {
  const c = size / 2,
    r = c * WELL;
  g.save();
  g.beginPath();
  g.arc(c, c, r, 0, Math.PI * 2);
  g.clip();
  fn(c, r);
  g.restore();
  if (shade > 0) {
    const grad = g.createRadialGradient(c, c, r * 0.78, c, c, r);
    grad.addColorStop(0, "rgba(0,0,0,0)");
    grad.addColorStop(1, `rgba(0,0,0,${shade})`);
    g.globalCompositeOperation = "source-over";
    g.beginPath();
    g.arc(c, c, r, 0, Math.PI * 2);
    g.fillStyle = grad;
    g.fill();
  }
}

export function hexToRgb(hex: string): [number, number, number] {
  const n = parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}
export const rgba = (hex: string, a: number) => {
  const [r, g, b] = hexToRgb(hex);
  return `rgba(${r},${g},${b},${a})`;
};

/** 节拍：有音频时钟用音频的，没有就按 BPM 自己走 */
export function beatOf(s: CoreState, bpm: number) {
  if (s.beat) return { phase: s.beat.phase / s.beat.period, period: s.beat.period, count: s.beat.count };
  const period = 60 / bpm;
  const x = s.t / period;
  return { phase: x - Math.floor(x), period, count: Math.floor(x) };
}

/** 可复现的伪随机 */
export function hash(n: number) {
  const x = Math.sin(n * 127.1 + 311.7) * 43758.5453;
  return x - Math.floor(x);
}

export const MONO = '"JBM", ui-monospace, Menlo, Consolas, monospace';
