export type Status = "dev" | "preview" | "live" | "paused";
export type Device = "desktop" | "any" | "mobile";
export type CoreKind = "beat" | "stay" | "dot" | "generic" | "blank" | "secret";
export type Theme = "light" | "dark";
/** 节拍：phase = 距上一拍的秒数，period = 拍长，count = 第几拍 */
export type Beat = { phase: number; period: number; count: number };

export interface SiteData {
  brand: string;
  brandEn: string;
  subtitle: string;
  device: string;
  codePrefix: string;
  title: string;
  description: string;
  url: string;
  author: string;
  repo?: string;
  links?: { title: string; url: string }[];
  blank?: { enabled: boolean; title: string; tagline: string; intro: string; teaser?: string };
}

export interface GameData {
  id: string;
  title: string;
  titleEn?: string;
  url: string;
  tagline: string;
  intro?: string;
  genre?: string[];
  session?: string;
  controls?: string;
  device: Device;
  status: Status;
  color: string;
  color2?: string;
  core?: "beat" | "stay" | "dot" | "generic";
  glyph?: string;
  coreOptions?: Record<string, number | string>;
  code?: string;
  cover?: string;
  shelf?: string;
  order?: number;
  hidden?: boolean;
}

/** 架子上的一盒卡带：游戏、空白「下一盒」或彩蛋卡带 */
export interface Item {
  kind: "game" | "blank" | "secret";
  id: string;
  code: string;
  title: string;
  titleEn: string;
  url: string | null;
  tagline: string;
  intro: string;
  genre: string[];
  session: string;
  controls: string;
  device: Device;
  status: Status | "blank";
  color: string;
  color2: string;
  core: CoreKind;
  glyph: string;
  coreOptions: Record<string, number | string>;
}

export type Mode = "boot" | "browse" | "read" | "insert";

/** 主循环每帧交给舞台的状态；舞台只负责按它画，不做业务判断 */
export interface Frame {
  t: number; // 秒，页面时钟
  dt: number;
  mode: Mode;
  /** 主架的连续位置（卡位，可为小数），整数 = 正对某一盒 */
  rail: number;
  /** 横向橡皮筋偏移（架子数，通常 |x| < 0.4） */
  lateral: number;
  /** 当前选中的卡位（整数，可为负，循环取模得到 item） */
  slot: number;
  /** 0..1 读取：卡带升起转正的进度目标（舞台自己做阻尼） */
  reading: boolean;
  /** 0..1 读卡头前沿 */
  reveal: number;
  /** 0..1 插入下沉量；>1 时视为弹出过冲由舞台弹簧处理 */
  insert: number;
  /** 读取状态下拖动卡带的转角（弧度） */
  spin: number;
  /** 开场入场进度 0..1 */
  enter: number;
  /** 发呆程度 0..1（停手后渐入的呼吸） */
  idle: number;
  /** 节拍：上一拍以来的秒数与拍长；没有节拍时 null */
  beat: Beat | null;
  /** 全场跟拍的幅度（读取 beat = 1，浏览时选中 beat = 0.35） */
  beatAmp: number;
  /** 开场拉远镜头的进度 0..1；不在开场时 null */
  intro: number | null;
  /** 点亮波开始后的秒数；Infinity = 全部已点亮 */
  ignite: number;
  /** 读完时卡面高光扫过的进度 0..1；<0 不扫 */
  glint: number;
  /** 鼠标相对画面中心（-1..1），用来做镜头视差；触屏为 null */
  parallax: { x: number; y: number } | null;
  /** 选中波：最近几次切换 */
  waves: { slot: number; t0: number; dir: number }[];
  hoverSlot: number | null;
  hoverLane: number;
  pointer: { x: number; y: number } | null; // 屏幕像素
  theme: Theme;
  reduced: boolean;
}

export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface Pick {
  lane: number;
  slot: number;
}

export interface Stage {
  readonly kind: "3d" | "2d";
  /** 0..1 加载进度；ready 后才能进入 */
  ready: Promise<void>;
  setItems(items: Item[]): void;
  setTheme(theme: Theme): void;
  resize(): void;
  draw(frame: Frame): void;
  /** 屏幕上前进一个卡位，内容移动的像素向量（拖动换算用） */
  slotAxis(): { x: number; y: number };
  laneAxis(): { x: number; y: number };
  pick(x: number, y: number): Pick | null;
  /** 选中卡带在屏幕上的外框（取景框用） */
  focusRect(): Rect | null;
  /** 读取时：屏幕上的点落在选中卡带核心贴图的哪里（u、v 为 0..1，左上为原点）；不在卡带上为 null */
  corePoint?(x: number, y: number, slot: number): { u: number; v: number } | null;
  /** 卡槽在屏幕上的位置（插入转场的起点） */
  dispose(): void;
}

export interface CoreState {
  t: number;
  dt: number;
  /** 0 = 全磨砂，1 = 全清晰 */
  clarity: number;
  /** 读卡头前沿 0..1（dot 用它决定进化到第几个时代） */
  reveal: number;
  reading: boolean;
  selected: boolean;
  /** 指针相对卡带核心中心的位置，单位 = 核心半径；没有时 null */
  look: { x: number; y: number } | null;
  beat: Beat | null;
  theme: Theme;
  reduced: boolean;
  /** 彩蛋：发呆太久，stay 的眼睛都睁开 */
  awake: boolean;
  /** stay：刚刚被翻走的方向（-1/1），0 = 没有 */
  leaving: number;
}
