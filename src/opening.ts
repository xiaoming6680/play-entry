// 开场演出（约 7 秒，可跳过，每个会话只播一次）：
// 先停在「开机」画面：浏览器只有在用户点击/按键之后才允许发声，所以把这一下点击做成开机键，
// 点了就带声音开演；也可以静音进入；9 秒没人点就静音自动开演（右下角还能再开声音）。
// 开机线 → 激光沿轮廓「刻」出标志（火花）→ 红点落下 → 扫描显出「铭刻」
// → 「入盒」：标志变形贴合 3D 卡带的正面，红点炸成闪光，黑场褪去 → 一镜到底拉远到整片卡带海。
import type { Sound } from "./audio";
import { smooth } from "./motion";

type P = { x: number; y: number };

// 标志轮廓（与 index.html 的 SVG 同一图形，40×46 坐标）：竖版圆角 + 右上切角
function outline(): P[] {
  const pts: P[] = [];
  const seg = (a: P, b: P, n = 1) => {
    for (let i = 1; i <= n; i++) pts.push({ x: a.x + ((b.x - a.x) * i) / n, y: a.y + ((b.y - a.y) * i) / n });
  };
  const quad = (a: P, c: P, b: P, n = 6) => {
    for (let i = 1; i <= n; i++) {
      const t = i / n,
        u = 1 - t;
      pts.push({ x: u * u * a.x + 2 * u * t * c.x + t * t * b.x, y: u * u * a.y + 2 * u * t * c.y + t * t * b.y });
    }
  };
  pts.push({ x: 7, y: 4 });
  seg({ x: 7, y: 4 }, { x: 30, y: 4 }, 8);
  seg({ x: 30, y: 4 }, { x: 36, y: 10 }, 3);
  seg({ x: 36, y: 10 }, { x: 36, y: 39 }, 10);
  quad({ x: 36, y: 39 }, { x: 36, y: 42 }, { x: 33, y: 42 });
  seg({ x: 33, y: 42 }, { x: 7, y: 42 }, 9);
  quad({ x: 7, y: 42 }, { x: 4, y: 42 }, { x: 4, y: 39 });
  seg({ x: 4, y: 39 }, { x: 4, y: 7 }, 11);
  quad({ x: 4, y: 7 }, { x: 4, y: 4 }, { x: 7, y: 4 });
  return pts;
}
const OUT = outline();
const LEN: number[] = [0];
for (let i = 1; i < OUT.length; i++) LEN.push(LEN[i - 1] + Math.hypot(OUT[i].x - OUT[i - 1].x, OUT[i].y - OUT[i - 1].y));
const TOTAL = LEN[LEN.length - 1];

// 时间轴（秒）
const T = {
  line0: 0.15,
  line1: 0.75,
  eng0: 0.75,
  eng1: 1.9,
  lbl1: 2.05,
  dot0: 2.02,
  word0: 2.1,
  hold: 2.95,
  morph: 0.7,
  intro: 3.1,
};

interface Spark {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
}

export interface OpeningHooks {
  /** 3D/2D 舞台是否已经准备好（没好就停在标志上等） */
  ready: () => boolean;
  is3D: () => boolean;
  /** 3D 选中卡带正面的四个角（屏幕坐标），用来让标志贴合上去 */
  quad: () => P[] | null;
  /** HUD 该进场了（切到浏览模式） */
  onBrowse: () => void;
  /** 全部结束 */
  onDone: () => void;
  onSoundOn: () => void;
  onMute: () => void;
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
  private sparks: Spark[] = [];
  private g: CanvasRenderingContext2D;
  private W = 0;
  private H = 0;
  private dpr = 1;
  private cues = new Set<string>();
  private morphFrom: P[] | null = null;
  private quadAt: P[] | null = null;
  private tcStart = performance.now();
  private soundOn = false;
  private skipped = false;
  private powered = false;
  private gateStart = performance.now();

  constructor(
    private root: HTMLElement,
    private sound: Sound,
    private hooks: OpeningHooks,
  ) {
    const c = root.querySelector<HTMLCanvasElement>(".op-c")!;
    this.g = c.getContext("2d")!;
    this.fit();
    addEventListener("resize", () => this.fit());
    root.classList.add("run");
    // 开机：点开机键 / 画面任意处 / 回车空格 = 带声音；「静音进入」= 不出声
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
  private onKey: (e: KeyboardEvent) => void;

  /** 在用户手势里调用：带声音时同步解锁 AudioContext */
  /** withSound：true 带声音；false 用户选了静音；null 没人点、自动静音开演（不改声音设置） */
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
    this.speed = 4;
    this.root.classList.add("skip");
  }

  private once(name: string, fn: () => void) {
    if (this.cues.has(name)) return;
    this.cues.add(name);
    fn();
  }

  /** 标志在屏幕上的位置（由 .op-mark 占位框决定，桌面在文字左边，手机在上面） */
  private markRect() {
    const r = this.root.querySelector(".op-mark")!.getBoundingClientRect();
    return { x: r.left, y: r.top, s: r.width / 32 };
  }
  private toScreen(p: P) {
    const m = this.markRect();
    return { x: m.x + (p.x - 4) * m.s, y: m.y + (p.y - 4) * m.s };
  }
  /** 标志坐标 → 3D 卡带正面（双线性） */
  private toQuad(p: P, q: P[]) {
    const a = (p.x - 4) / 32,
      b = (p.y - 4) / 38;
    const top = { x: q[0].x + (q[1].x - q[0].x) * a, y: q[0].y + (q[1].y - q[0].y) * a };
    const bot = { x: q[3].x + (q[2].x - q[3].x) * a, y: q[3].y + (q[2].y - q[3].y) * a };
    return { x: top.x + (bot.x - top.x) * b, y: top.y + (bot.y - top.y) * b };
  }

  tick(dt: number) {
    if (this.done) return;
    if (!this.powered) {
      this.timecode();
      this.root.classList.toggle("ready", this.hooks.ready());
      if (performance.now() - this.gateStart > 9000) this.power(null);
      this.drawGate();
      return;
    }
    // 停在标志上等舞台准备好
    const waiting = this.t >= T.hold && this.intro === null && !this.hooks.ready();
    this.root.classList.toggle("wait", waiting && this.t > T.hold + 0.4);
    if (!waiting) this.t += dt * this.speed;
    if (this.skipped && !this.hooks.ready()) this.t = Math.min(this.t, T.hold);
    const t = this.t;
    this.timecode();

    const morphT = (t - T.hold) / T.morph;
    // 只在「入盒」开始的那一帧初始化（2D 版没有可贴合的卡带，quadAt 一直是 null，不能拿它当标记）
    if (morphT >= 0 && !this.morphFrom) {
      this.quadAt = this.hooks.is3D() ? this.hooks.quad() : null;
      this.morphFrom = OUT.map((p) => this.toScreen(p));
      this.root.classList.add("morph");
      if (this.soundOn) this.sound.opWhoosh();
    }
    const introT = (t - T.hold - T.morph) / T.intro;
    if (introT >= 0) {
      this.intro = Math.min(1, introT);
      if (this.ignite < 0) this.ignite = 0;
      else this.ignite += dt * this.speed;
      this.once("boom", () => {
        if (this.soundOn) {
          this.sound.opBoom();
          this.sound.opSwell(T.intro / this.speed);
        }
      });
      if (introT > 0.05) this.root.classList.add("out");
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
        return;
      }
    }
    this.draw(t, morphT, dt * this.speed);
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

  private draw(t: number, morphT: number, dt: number) {
    const g = this.g,
      W = this.W,
      H = this.H;
    g.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    g.clearRect(0, 0, W, H);
    const m = Math.max(0, Math.min(1, morphT));
    const em = m < 0.5 ? 4 * m * m * m : 1 - Math.pow(-2 * m + 2, 3) / 2;
    // 黑场：「入盒」后半段褪去，露出背后的 3D 特写
    const bgA = morphT < 0 ? 1 : 1 - smooth((m - 0.42) / 0.58);
    if (bgA > 0) {
      g.fillStyle = `rgba(6,7,8,${bgA})`;
      g.fillRect(0, 0, W, H);
    }
    const start = this.toScreen(OUT[0]);
    const s = this.markRect().s;

    // 1) 开机线：一道横线从中间展开，再收成一个点（激光头）
    if (t >= T.line0 && t < T.line1) {
      const k = (t - T.line0) / (T.line1 - T.line0);
      this.once("power", () => this.soundOn && this.sound.opPowerOn());
      const open = smooth(k / 0.45),
        close = smooth((k - 0.55) / 0.45);
      const cx = W / 2 + (start.x - W / 2) * close,
        cy = H / 2 + (start.y - H / 2) * close;
      const half = W * 0.36 * open * (1 - close) + 2;
      const grad = g.createLinearGradient(cx - half, 0, cx + half, 0);
      grad.addColorStop(0, "rgba(255,59,47,0)");
      grad.addColorStop(0.5, "rgba(255,240,235,1)");
      grad.addColorStop(1, "rgba(255,59,47,0)");
      g.fillStyle = grad;
      g.fillRect(cx - half, cy - 1, half * 2, 2);
      this.glow(cx, cy, 10 + 26 * (1 - Math.abs(k - 0.5) * 2), 0.9);
    }

    // 2) 激光刻轮廓
    const ek = (t - T.eng0) / (T.eng1 - T.eng0);
    const drawn = ek <= 0 ? 0 : ek >= 1 ? TOTAL : TOTAL * (ek < 0.5 ? 2 * ek * ek : 1 - Math.pow(-2 * ek + 2, 2) / 2);
    let pts: P[] = [];
    if (this.morphFrom && this.quadAt) {
      pts = OUT.map((p, i) => {
        const a = this.morphFrom![i],
          b = this.toQuad(p, this.quadAt!);
        return { x: a.x + (b.x - a.x) * em, y: a.y + (b.y - a.y) * em };
      });
    } else if (this.morphFrom) {
      // 2D：标志原地放大淡出
      const c = { x: W / 2, y: H / 2 };
      pts = this.morphFrom.map((a) => ({ x: a.x + (a.x - c.x) * em * 2.4, y: a.y + (a.y - c.y) * em * 2.4 }));
    } else pts = OUT.map((p) => this.toScreen(p));

    const lineA = morphT < 0 ? 1 : 1 - smooth((m - 0.55) / 0.45);
    if (drawn > 0 && lineA > 0) {
      g.lineJoin = "round";
      g.lineCap = "round";
      const path = () => {
        g.beginPath();
        g.moveTo(pts[0].x, pts[0].y);
        for (let i = 1; i < pts.length; i++) {
          if (LEN[i] <= drawn) g.lineTo(pts[i].x, pts[i].y);
          else {
            const k = (drawn - LEN[i - 1]) / (LEN[i] - LEN[i - 1]);
            g.lineTo(pts[i - 1].x + (pts[i].x - pts[i - 1].x) * k, pts[i - 1].y + (pts[i].y - pts[i - 1].y) * k);
            break;
          }
        }
      };
      const lw = Math.max(2, 2.4 * s) * (1 - em * 0.4);
      path();
      g.strokeStyle = `rgba(255,59,47,${0.35 * lineA})`;
      g.lineWidth = lw * 3.2;
      g.stroke();
      path();
      g.strokeStyle = `rgba(236,239,242,${lineA})`;
      g.lineWidth = lw;
      g.stroke();
      // 激光头 + 火花
      if (ek > 0 && ek < 1) {
        let i = 1;
        while (i < LEN.length - 1 && LEN[i] < drawn) i++;
        const k = (drawn - LEN[i - 1]) / (LEN[i] - LEN[i - 1] || 1);
        const tip = { x: pts[i - 1].x + (pts[i].x - pts[i - 1].x) * k, y: pts[i - 1].y + (pts[i].y - pts[i - 1].y) * k };
        this.glow(tip.x, tip.y, 16, 1);
        for (let n = 0; n < 4; n++) {
          const a = Math.random() * Math.PI * 2,
            v = 60 + Math.random() * 220;
          this.sparks.push({ x: tip.x, y: tip.y, vx: Math.cos(a) * v, vy: Math.sin(a) * v - 60, life: 0.25 + Math.random() * 0.35 });
        }
        this.once("laser", () => this.soundOn && this.sound.opLaser(T.eng1 - T.eng0));
      }
    }
    // 标签横线
    const lk = Math.max(0, Math.min(1, (t - T.eng1) / (T.lbl1 - T.eng1)));
    if (lk > 0 && lineA > 0) {
      const a = this.morphPoint({ x: 10, y: 35.5 }, em),
        b = this.morphPoint({ x: 10 + 9 * lk, y: 35.5 }, em);
      g.strokeStyle = `rgba(236,239,242,${lineA})`;
      g.lineWidth = Math.max(2, 2.4 * s) * (1 - em * 0.4);
      g.beginPath();
      g.moveTo(a.x, a.y);
      g.lineTo(b.x, b.y);
      g.stroke();
    }
    // 3) 红点落下（带一圈冲击环），「入盒」时变成核心井，最后炸成闪光
    const dk = (t - T.dot0) / 0.32;
    if (dk > 0) {
      this.once("ding", () => this.soundOn && this.sound.opDing());
      const pop = dk >= 1 ? 1 : 1 + Math.sin(dk * Math.PI) * 0.35 * (1 - dk) + (dk - 1) * (1 - dk) * 0;
      const scale = Math.min(1, dk * 1.4) * pop;
      const from = this.toScreen({ x: 20, y: 19 });
      let c = from,
        r = 4.6 * s * scale;
      if (this.morphFrom) {
        if (this.quadAt) {
          const to = this.toQuad({ x: 20, y: 4 + 38 * 0.437 }, this.quadAt);
          const qw = Math.hypot(this.quadAt[1].x - this.quadAt[0].x, this.quadAt[1].y - this.quadAt[0].y);
          c = { x: from.x + (to.x - from.x) * em, y: from.y + (to.y - from.y) * em };
          r = r + (qw * 0.394 - r) * em;
        } else r = r * (1 + em * 6);
      }
      const dotA = morphT < 0 ? 1 : 1 - smooth((m - 0.3) / 0.5);
      if (dotA > 0) {
        g.fillStyle = `rgba(255,59,47,${dotA * (morphT < 0 ? 1 : 0.42)})`;
        g.beginPath();
        g.arc(c.x, c.y, r, 0, Math.PI * 2);
        g.fill();
      }
      const ring = (t - T.dot0) / 0.6;
      if (ring > 0 && ring < 1) {
        g.strokeStyle = `rgba(255,59,47,${(1 - ring) * 0.8})`;
        g.lineWidth = 2;
        g.beginPath();
        g.arc(from.x, from.y, 4.6 * s + ring * 60 * Math.max(1, s / 2.6), 0, Math.PI * 2);
        g.stroke();
      }
      // 闪光
      if (morphT > 0.78) {
        const fk = (morphT - 0.78) / 0.8;
        if (fk < 1) {
          const R = Math.max(W, H) * (0.2 + fk * 1.1);
          const grad = g.createRadialGradient(c.x, c.y, 0, c.x, c.y, R);
          const a = (1 - fk) ** 1.6;
          grad.addColorStop(0, `rgba(255,255,255,${0.95 * a})`);
          grad.addColorStop(0.25, `rgba(255,120,100,${0.55 * a})`);
          grad.addColorStop(1, "rgba(255,59,47,0)");
          g.fillStyle = grad;
          g.fillRect(0, 0, W, H);
        }
      }
    }
    // 火花
    g.globalCompositeOperation = "lighter";
    for (const p of this.sparks) {
      p.life -= dt;
      p.vy += 520 * dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      if (p.life <= 0) continue;
      g.strokeStyle = `rgba(255,${150 + Math.random() * 100},${90 + Math.random() * 60},${Math.min(1, p.life * 2.5)})`;
      g.lineWidth = 1.4;
      g.beginPath();
      g.moveTo(p.x, p.y);
      g.lineTo(p.x - p.vx * 0.025, p.y - p.vy * 0.025);
      g.stroke();
    }
    g.globalCompositeOperation = "source-over";
    this.sparks = this.sparks.filter((p) => p.life > 0);
    // 文字：扫描显出品牌字（CSS 变量驱动遮罩）
    const wk = (t - T.word0) / 0.55;
    this.root.style.setProperty("--scan", String(Math.max(0, Math.min(1, wk))));
    if (wk > 0) this.root.classList.add("word");
  }

  /** 开机画面：黑场 + 极淡的扫描纹，开机键是 DOM */
  private drawGate() {
    const g = this.g;
    g.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    g.fillStyle = "rgb(6,7,8)";
    g.fillRect(0, 0, this.W, this.H);
    const y = ((performance.now() / 2400) % 1) * this.H;
    const grad = g.createLinearGradient(0, y - 60, 0, y + 2);
    grad.addColorStop(0, "rgba(255,255,255,0)");
    grad.addColorStop(1, "rgba(255,255,255,0.035)");
    g.fillStyle = grad;
    g.fillRect(0, y - 60, this.W, 62);
  }

  private morphPoint(p: P, em: number) {
    const a = this.toScreen(p);
    if (!this.morphFrom) return a;
    if (!this.quadAt) {
      const c = { x: this.W / 2, y: this.H / 2 };
      return { x: a.x + (a.x - c.x) * em * 2.4, y: a.y + (a.y - c.y) * em * 2.4 };
    }
    const b = this.toQuad(p, this.quadAt);
    return { x: a.x + (b.x - a.x) * em, y: a.y + (b.y - a.y) * em };
  }

  private glow(x: number, y: number, r: number, a: number) {
    const g = this.g;
    const grad = g.createRadialGradient(x, y, 0, x, y, r);
    grad.addColorStop(0, `rgba(255,255,255,${a})`);
    grad.addColorStop(0.3, `rgba(255,120,90,${a * 0.7})`);
    grad.addColorStop(1, "rgba(255,59,47,0)");
    g.fillStyle = grad;
    g.fillRect(x - r, y - r, r * 2, r * 2);
  }
}
