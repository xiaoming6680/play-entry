// 开场演出（约 8.5 秒，可跳过，每个会话只播一次）。风格：克制、精致——细线、柔光、慢而稳，跟随明暗主题。
// 先停在开机画面：浏览器只有在用户点击/按键之后才允许发声，所以把这一下点击做成"开始"；
// 点了就带声音开演，也可以静音进入，9 秒没人点就静音自动开演（右下角还能再开声音）。
// 一道发丝线展开又收拢 → 笔尖沿轮廓描出卡带（发丝线），再"上墨"到正式线宽 → 红点轻轻落下
// → 「铭刻」从左到右缓缓显出，副标题字距从宽收拢
// → 推近：整组标志像镜头推进一样放大（按对数缩放，看起来匀速），轮廓变细，正好落在 3D 卡带正面的边上
// → 显形：红点化开成一圈波纹，背景从红点向外褪去，玻璃卡带从里面显出来；轮廓交给卡带自己的玻璃边，玻璃上扫过一道柔光
// → 显形还没收尾镜头就开始拉远（动作重叠，不会"停一下再动"），卡带落回卡位，整片仓库从雾里淡出 → HUD 分批入场。
import type { Sound } from "./audio";
import { smooth } from "./motion";

type P = { x: number; y: number };

// 标志轮廓（与 index.html 的 SVG 同一图形，40×46 坐标）：竖版圆角 + 右上切角。
// r = 圆角半径：标志是 3，卡带实物是 1.4（DIM.R 0.14 × 10），推近时从前者过渡到后者，点数不变
function outline(r: number): P[] {
  const pts: P[] = [];
  const seg = (a: P, b: P, n = 1) => {
    for (let i = 1; i <= n; i++) pts.push({ x: a.x + ((b.x - a.x) * i) / n, y: a.y + ((b.y - a.y) * i) / n });
  };
  const quad = (a: P, c: P, b: P, n = 8) => {
    for (let i = 1; i <= n; i++) {
      const t = i / n,
        u = 1 - t;
      pts.push({ x: u * u * a.x + 2 * u * t * c.x + t * t * b.x, y: u * u * a.y + 2 * u * t * c.y + t * t * b.y });
    }
  };
  pts.push({ x: 4 + r, y: 4 });
  seg({ x: 4 + r, y: 4 }, { x: 30, y: 4 }, 12);
  seg({ x: 30, y: 4 }, { x: 36, y: 10 }, 4);
  seg({ x: 36, y: 10 }, { x: 36, y: 42 - r }, 14);
  quad({ x: 36, y: 42 - r }, { x: 36, y: 42 }, { x: 36 - r, y: 42 });
  seg({ x: 36 - r, y: 42 }, { x: 4 + r, y: 42 }, 13);
  quad({ x: 4 + r, y: 42 }, { x: 4, y: 42 }, { x: 4, y: 42 - r });
  seg({ x: 4, y: 42 - r }, { x: 4, y: 4 + r }, 16);
  quad({ x: 4, y: 4 + r }, { x: 4, y: 4 }, { x: 4 + r, y: 4 });
  return pts;
}
const OUT = outline(3);
const OUT_CARD = outline(1.4);
const LEN: number[] = [0];
for (let i = 1; i < OUT.length; i++) LEN.push(LEN[i - 1] + Math.hypot(OUT[i].x - OUT[i - 1].x, OUT[i].y - OUT[i - 1].y));
const TOTAL = LEN[LEN.length - 1];
// 红点圆心：标志里在 (20,19)，卡带上是核心井的中心
const DOT = { x: 20, y: 19 };
const WELL = { x: 20, y: 4 + 38 * 0.437 };

// 时间轴（秒，从开始算）
const T = {
  line0: 0.1,
  line1: 0.9,
  draw0: 0.8,
  draw1: 2.0,
  ink1: 2.4, // 发丝线"上墨"到正式线宽
  lbl1: 2.35,
  dot0: 2.3,
  word0: 2.45,
  hold: 3.5, // 推近开始
  morph: 1.1, // 推近、贴合到卡带上
  reveal: 0.85, // 红点化开、卡带显形
  lead: 0.35, // 显形结束前多久开始拉远
  intro: 3.4, // 3D：镜头拉远
  intro2d: 1.6, // 2D：其余卡片淡入
};

const cubicIO = (x: number) => (x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2);
const quartOut = (x: number) => 1 - Math.pow(1 - Math.max(0, Math.min(1, x)), 4);
const clamp01 = (x: number) => Math.max(0, Math.min(1, x));
const lerpP = (a: P, b: P, k: number) => ({ x: a.x + (b.x - a.x) * k, y: a.y + (b.y - a.y) * k });

export interface OpeningHooks {
  /** 3D/2D 舞台是否已经准备好（没好就停在标志上等） */
  ready: () => boolean;
  is3D: () => boolean;
  /** 选中卡带正面的四个角（屏幕坐标，左上、右上、右下、左下），用来让标志贴合上去 */
  quad: () => P[] | null;
  /** 卡带显形的那一刻：玻璃上扫过一道柔光 */
  onGlint: () => void;
  /** HUD 该进场了（切到浏览模式） */
  onBrowse: () => void;
  /** 全部结束 */
  onDone: () => void;
  onSoundOn: () => void;
  onMute: () => void;
}

/** 推近：标志坐标 → 屏幕坐标的映射，外加整组标志（文字）该怎么跟着缩放 */
interface Zoom {
  map: (p: P) => P;
  /** 绕这个点缩放（屏幕坐标） */
  at: P;
  /** 相对推近前的缩放倍数 */
  k: number;
}

export class Opening {
  /** 拉远镜头进度；null = 还没开始 */
  intro: number | null = null;
  /** 点亮波开始后的秒数；-1 = 还没开始 */
  ignite = -1;
  done = false;
  private t = 0;
  private speed = 1;
  private browsed = false;
  private g: CanvasRenderingContext2D;
  private brand: HTMLElement;
  private W = 0;
  private H = 0;
  private dpr = 1;
  private cues = new Set<string>();
  /** 推近开始那一刻标志的位置和大小（之后整组标志会被缩放，不能再去量占位框） */
  private from: { o: P; s: number } | null = null;
  private tcStart = performance.now();
  private soundOn = false;
  private skipped = false;
  private powered = false;
  private gateStart = performance.now();
  private colors = { ink: "#0F1216", bg: "#E9EBEE", bg2: "#F4F5F7", accent: "#FF3B2F" };
  private colorsAt = -1;
  private onKey: (e: KeyboardEvent) => void;

  constructor(
    private root: HTMLElement,
    private sound: Sound,
    private hooks: OpeningHooks,
  ) {
    const c = root.querySelector<HTMLCanvasElement>(".op-c")!;
    this.g = c.getContext("2d")!;
    this.brand = root.querySelector<HTMLElement>(".op-brand")!;
    this.brand.style.transform = this.brand.style.transformOrigin = "";
    this.fit();
    addEventListener("resize", () => this.fit());
    root.classList.add("run");
    // 开始：点按钮 / 画面任意处 / 回车空格 = 带声音；「静音进入」= 不出声
    root.querySelector("#op-mute")!.addEventListener("click", (e) => {
      e.stopPropagation();
      this.power(false);
    });
    root.addEventListener("click", (e) => {
      const el = e.target as HTMLElement;
      if (el.closest(".op-skip")) return this.skip();
      if (el.closest(".op-snd")) return this.enableSound();
      if (!this.powered) this.power(true);
    });
    this.onKey = (e: KeyboardEvent) => {
      if (this.done) return;
      if (!this.powered && (e.key === "Enter" || e.key === " ")) {
        e.preventDefault();
        this.power(true);
      } else if (this.powered && e.key === "Escape") this.skip();
    };
    addEventListener("keydown", this.onKey);
  }

  /** 开场时间（秒，调试和截图用） */
  get time() {
    return this.t;
  }

  /** 卡带已经完全显形、开场画布不再铺底（之后背后的东西才看得见） */
  get revealed() {
    return this.t >= T.hold + T.morph + T.reveal;
  }

  /** withSound：true 带声音；false 用户选了静音；null 没人点、自动静音开演（不改声音设置）。要在用户手势里调用 */
  power(withSound: boolean | null) {
    if (this.powered) return;
    this.powered = true;
    this.root.classList.add("on");
    if (withSound) this.enableSound();
    else if (withSound === false) this.hooks.onMute();
    this.tcStart = performance.now();
  }

  private fit() {
    const c = this.g.canvas;
    this.dpr = Math.min(devicePixelRatio || 1, 2);
    this.W = innerWidth;
    this.H = innerHeight;
    c.width = this.W * this.dpr;
    c.height = this.H * this.dpr;
  }

  private enableSound() {
    this.soundOn = true;
    this.hooks.onSoundOn();
    this.root.classList.add("snd");
  }

  skip() {
    if (this.skipped || this.done) return;
    if (!this.powered) this.power(null);
    this.skipped = true;
    this.speed = 3.5;
    this.root.classList.add("skip");
  }

  private once(name: string, fn: () => void) {
    if (this.cues.has(name)) return;
    this.cues.add(name);
    fn();
  }

  private get introDur() {
    return this.hooks.is3D() ? T.intro : T.intro2d;
  }

  /** 明暗主题的颜色（开场跟随主题：浅色是白底黑细线，深色是黑底白细线） */
  private themeColors() {
    const now = performance.now();
    if (now - this.colorsAt > 500) {
      const cs = getComputedStyle(document.documentElement);
      const v = (k: string, d: string) => cs.getPropertyValue(k).trim() || d;
      this.colors = { ink: v("--ink", "#0F1216"), bg: v("--bg", "#E9EBEE"), bg2: v("--bg2", "#F4F5F7"), accent: v("--accent", "#FF3B2F") };
      this.colorsAt = now;
    }
    return this.colors;
  }

  /** 标志在屏幕上的位置（由 .op-mark 占位框决定，桌面在文字左边，手机在上面） */
  private markRect() {
    const r = this.root.querySelector(".op-mark")!.getBoundingClientRect();
    return { o: { x: r.left, y: r.top }, s: r.width / 32 };
  }
  /** 标志坐标 → 3D 卡带正面（双线性） */
  private toQuad(p: P, q: P[]) {
    const a = (p.x - 4) / 32,
      b = (p.y - 4) / 38;
    return lerpP(lerpP(q[0], q[1], a), lerpP(q[3], q[2], a), b);
  }

  /**
   * 推近到第 e（0..1，已缓动）步时的映射。两个相似矩形之间"缩放 + 平移"有一个不动点，
   * 绕它按对数插值缩放倍数，就是镜头匀速推进的感觉；终点再把透视的那点偏差补上，正好贴住卡带正面。
   */
  private zoom(e: number, q: P[] | null): Zoom {
    const m = this.from ?? this.markRect();
    const { o, s } = m;
    const logo = (p: P) => ({ x: o.x + (p.x - 4) * s, y: o.y + (p.y - 4) * s });
    if (!this.from || e <= 0) return { map: logo, at: o, k: 1 };
    if (!q) {
      // 拿不到卡带（舞台还没画出来）：原地轻轻放大
      const at = { x: this.W / 2, y: this.H / 2 },
        k = 1 + e * 0.35;
      return { map: (p) => lerpP(at, logo(p), k), at, k };
    }
    const o1 = q[0];
    const s1 = Math.hypot(q[1].x - q[0].x, q[1].y - q[0].y) / 32;
    const end = (p: P) => ({ x: o1.x + (p.x - 4) * s1, y: o1.y + (p.y - 4) * s1 });
    const fix = (p: P) => {
      const a = end(p),
        b = this.toQuad(p, q);
      return { x: (b.x - a.x) * e, y: (b.y - a.y) * e };
    };
    if (Math.abs(s1 - s) < s * 0.05) {
      // 大小几乎一样：直接平移过去
      return {
        map: (p) => {
          const a = lerpP(logo(p), end(p), e),
            d = fix(p);
          return { x: a.x + d.x, y: a.y + d.y };
        },
        at: o,
        k: 1,
      };
    }
    const ux = (o1.x - o.x) / (s - s1),
      uy = (o1.y - o.y) / (s - s1);
    const at = { x: o.x + s * ux, y: o.y + s * uy };
    const S = s * Math.pow(s1 / s, e);
    return {
      map: (p) => {
        const d = fix(p);
        return { x: at.x + S * (p.x - 4 - ux) + d.x, y: at.y + S * (p.y - 4 - uy) + d.y };
      },
      at,
      k: S / s,
    };
  }

  /** 推进时间轴、触发各个节点（不画东西；画在 paint 里，等舞台这一帧画完、卡带位置是最新的再画） */
  tick(dt: number) {
    if (this.done) return;
    if (!this.powered) {
      this.timecode();
      this.root.classList.toggle("ready", this.hooks.ready());
      if (performance.now() - this.gateStart > 9000) this.power(null);
      return;
    }
    // 停在标志上等舞台准备好
    const waiting = this.t >= T.hold && this.intro === null && !this.hooks.ready();
    this.root.classList.toggle("wait", waiting && this.t > T.hold + 0.4);
    if (!waiting) this.t += dt * this.speed;
    if (this.skipped && !this.hooks.ready()) this.t = Math.min(this.t, T.hold);
    const t = this.t;
    this.timecode();

    if (t >= T.hold && !this.from) {
      this.from = this.markRect();
      this.root.classList.add("morph");
      if (this.soundOn && !this.skipped) this.sound.opWhoosh();
    }
    const revealT = (t - T.hold - T.morph) / T.reveal;
    if (revealT >= 0)
      this.once("bloom", () => {
        if (this.soundOn && !this.skipped) {
          this.sound.opBoom();
          this.sound.opSwell(T.reveal - T.lead + this.introDur);
        }
      });
    if (revealT >= 0.55) this.once("glint", () => this.hooks.onGlint());
    if (revealT >= 1) this.root.classList.add("out");
    const introT = (t - T.hold - T.morph - T.reveal + T.lead) / this.introDur;
    if (introT >= 0) {
      this.intro = Math.min(1, introT);
      if (this.ignite < 0) this.ignite = 0;
      else this.ignite += dt * this.speed;
      if (introT >= 0.72 && !this.browsed) {
        this.browsed = true;
        this.hooks.onBrowse();
      }
      if (introT >= 1) {
        this.done = true;
        this.intro = null;
        this.ignite = Infinity;
        removeEventListener("keydown", this.onKey);
        this.hooks.onDone();
      }
    }
  }

  private timecode() {
    const el = this.root.querySelector("#op-time");
    if (!el) return;
    const ms = performance.now() - this.tcStart;
    const p = (n: number) => String(n).padStart(2, "0");
    const f = Math.floor((ms % 1000) / 40);
    const s = Math.floor(ms / 1000);
    el.textContent = `00:${p(Math.floor(s / 60))}:${p(s % 60)}:${p(f)}`;
  }

  /** 画这一帧（main 在舞台画完之后调用） */
  paint() {
    if (this.done) return;
    const g = this.g;
    g.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    g.clearRect(0, 0, this.W, this.H);
    if (this.powered) this.draw(this.t);
    else this.warm();
  }

  /**
   * 预热：画布第一次用某种画法（不透明三段渐变铺满、径向渐变镂空）时浏览器要现编着色器，
   * 正好卡在推近、显形开始的那一帧（实测 70–100ms）。只有原样画（全屏、不透明）才算数，
   * 所以趁停在开机画面等点击时照正式的画法画一帧——和开机画面的 CSS 背景同一道渐变，看不出来。
   */
  private warmed = false;
  private warm() {
    if (this.warmed) return;
    this.warmed = true;
    this.backdrop(this.themeColors(), 0.5, { x: this.W / 2, y: this.H / 2 }, Math.min(this.W, this.H) / 3);
  }

  /** 背景铺底；k > 0 时以 c 为圆心镂空（显形），far = 圆心到卡带最远角的距离 */
  private backdrop(col: { bg: string; bg2: string }, k: number, c: P, far: number) {
    const g = this.g;
    const bg = g.createLinearGradient(0, 0, 0, this.H);
    bg.addColorStop(0, col.bg2);
    bg.addColorStop(0.6, col.bg);
    bg.addColorStop(1, col.bg);
    g.fillStyle = bg;
    g.fillRect(0, 0, this.W, this.H);
    if (k <= 0) return 0;
    const R = Math.max(1, (far / 0.62) * (1 - Math.pow(1 - k, 2.2)));
    const hole = g.createRadialGradient(c.x, c.y, 0, c.x, c.y, R);
    hole.addColorStop(0, "rgba(0,0,0,1)");
    hole.addColorStop(0.62, "rgba(0,0,0,1)");
    hole.addColorStop(1, "rgba(0,0,0,0)");
    g.globalCompositeOperation = "destination-out";
    g.fillStyle = hole;
    g.fillRect(0, 0, this.W, this.H);
    g.globalCompositeOperation = "source-over";
    return R;
  }

  private draw(t: number) {
    const g = this.g,
      W = this.W,
      H = this.H;
    const col = this.themeColors();
    const morphT = (t - T.hold) / T.morph;
    const m = clamp01(morphT);
    const em = cubicIO(m);
    const revealT = (t - T.hold - T.morph) / T.reveal;
    const k = clamp01(revealT);
    const q = this.from ? this.hooks.quad() : null;
    const z = this.zoom(em, q);
    // 整组标志（文字）跟着一起推近，同一个不动点、同一个倍数
    if (this.from) {
      this.brand.style.transformOrigin = `${z.at.x.toFixed(1)}px ${z.at.y.toFixed(1)}px`;
      this.brand.style.transform = `scale(${z.k.toFixed(4)})`;
    }
    const s = (this.from ?? this.markRect()).s;
    const well = z.map(lerpP(DOT, WELL, em));

    // 0) 背景：推近时一直不透明（盖住背后的 3D），显形时从红点向外镂空，露出背后同色调的页面和卡带
    //   （镂空到 k = 1 时内圈已经盖过卡带四角，外面的铺底和页面背景是同一道渐变，直接撤掉看不出来）
    if (this.from && k < 1) {
      const far = q ? Math.max(...q.map((c) => Math.hypot(c.x - well.x, c.y - well.y))) : Math.hypot(W, H) / 2;
      const R = this.backdrop(col, revealT > 0 ? k : 0, well, far);
      if (revealT > 0) {
        // 波纹：一圈很淡的细线跟着显形的前沿往外走
        const ra = 0.32 * (1 - k) * smooth(k / 0.12);
        if (ra > 0.004) {
          g.globalAlpha = ra;
          g.strokeStyle = col.ink;
          g.lineWidth = 1;
          g.beginPath();
          g.arc(well.x, well.y, R * 0.66, 0, Math.PI * 2);
          g.stroke();
          g.globalAlpha = 1;
        }
      }
    }
    const start = z.map(OUT[0]);

    // 1) 一道发丝线从中间展开，再收拢到起笔点
    if (t >= T.line0 && t < T.line1) {
      const lk = (t - T.line0) / (T.line1 - T.line0);
      this.once("power", () => this.soundOn && this.sound.opPowerOn());
      const open = cubicIO(Math.min(1, lk / 0.5)),
        close = cubicIO(Math.max(0, (lk - 0.5) / 0.5));
      const cx = W / 2 + (start.x - W / 2) * close,
        cy = H / 2 + (start.y - H / 2) * close;
      const half = W * 0.22 * open * (1 - close);
      g.globalAlpha = 0.85 * (1 - close * 0.3);
      g.fillStyle = col.ink;
      g.fillRect(cx - half, cy - 0.5, half * 2, 1);
      g.globalAlpha = 1;
    }

    // 2) 笔尖描轮廓：发丝线 → 上墨；推近时线变细，圆角收成卡带实物的圆角
    const dk = (t - T.draw0) / (T.draw1 - T.draw0);
    const drawn = dk <= 0 ? 0 : dk >= 1 ? TOTAL : TOTAL * cubicIO(dk);
    const pts = OUT.map((p, i) => z.map(em > 0 ? lerpP(p, OUT_CARD[i], em) : p));
    const lineA = 1 - smooth((k - 0.4) / 0.55);
    const inkK = smooth((t - T.draw1) / (T.ink1 - T.draw1));
    const lw0 = 1 + (Math.max(1.6, 2.4 * s) - 1) * inkK;
    const lw = lw0 + (1.25 - lw0) * smooth(m);
    if (drawn > 0 && lineA > 0) {
      g.lineJoin = "round";
      g.lineCap = "round";
      g.beginPath();
      g.moveTo(pts[0].x, pts[0].y);
      let tip = pts[0];
      for (let i = 1; i < pts.length; i++) {
        if (LEN[i] <= drawn) {
          g.lineTo(pts[i].x, pts[i].y);
          tip = pts[i];
        } else {
          const f = (drawn - LEN[i - 1]) / (LEN[i] - LEN[i - 1]);
          tip = lerpP(pts[i - 1], pts[i], f);
          g.lineTo(tip.x, tip.y);
          break;
        }
      }
      g.globalAlpha = lineA;
      g.strokeStyle = col.ink;
      g.lineWidth = lw;
      g.stroke();
      // 笔尖：一个很小的实心点，描完就收起
      if (dk > 0 && dk < 1) {
        g.fillStyle = col.ink;
        g.beginPath();
        g.arc(tip.x, tip.y, 2.2, 0, Math.PI * 2);
        g.fill();
        this.once("pen", () => this.soundOn && this.sound.opLaser(T.draw1 - T.draw0));
      }
      // 贴签横线：推近的前半段淡掉
      const lk = clamp01((t - (T.draw1 - 0.05)) / (T.lbl1 - T.draw1 + 0.05));
      const la = 1 - smooth(m / 0.5);
      if (lk > 0 && la > 0) {
        const a = z.map({ x: 10, y: 35.5 }),
          b = z.map({ x: 10 + 9 * quartOut(lk), y: 35.5 });
        g.globalAlpha = lineA * la;
        g.beginPath();
        g.moveTo(a.x, a.y);
        g.lineTo(b.x, b.y);
        g.stroke();
      }
      g.globalAlpha = 1;
    }

    // 3) 红点轻轻落下（一圈很淡的环）；推近时跟着放大一点、移到核心井中心，显形时化开
    const pk = (t - T.dot0) / 0.6;
    if (pk > 0) {
      this.once("bell", () => this.soundOn && this.sound.opDing());
      const r = 4.6 * s * quartOut(pk) * Math.pow(z.k, 0.35) * (1 + 0.5 * k);
      const dotA = 1 - smooth(k / 0.45);
      if (dotA > 0) {
        g.globalAlpha = dotA;
        g.fillStyle = col.accent;
        g.beginPath();
        g.arc(well.x, well.y, r, 0, Math.PI * 2);
        g.fill();
        g.globalAlpha = 1;
      }
      const ring = (t - T.dot0) / 1.4;
      if (ring > 0 && ring < 1 && morphT < 0) {
        g.globalAlpha = 0.28 * (1 - ring);
        g.strokeStyle = col.ink;
        g.lineWidth = 1;
        g.beginPath();
        g.arc(well.x, well.y, 4.6 * s + quartOut(ring) * 34 * Math.max(1, s / 2.4), 0, Math.PI * 2);
        g.stroke();
        g.globalAlpha = 1;
      }
    }

    // 文字：从左到右缓缓显出（CSS 变量驱动遮罩和下面那条细线）
    const wk = (t - T.word0) / 0.9;
    this.root.style.setProperty("--scan", String(cubicIO(clamp01(wk))));
    if (wk > 0) this.root.classList.add("word");
  }
}
