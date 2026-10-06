// 彩蛋：登记表（发现过哪些，存在 localStorage）、发现时的「刻印」弹出、HUD 计数、「关于」里的图鉴，
// 以及几个全屏的小把戏：屏保、熄灯手电筒、从标志上掉下来的红点、甩架子时的震动。
import type { Sound } from "./audio";

export interface EggDef {
  id: string;
  name: string;
  /** 图鉴里的提示（没找到时也显示，像谜语） */
  hint: string;
  /** 找到时弹出的一句话 */
  line: string;
}

export const EGGS: EggDef[] = [
  { id: "konami", name: "入口本身", hint: "一串很老的按键，从 ↑ ↑ ↓ ↓ 开始", line: "翻出了一盒不在架子上的卡带。" },
  { id: "dive", name: "套娃", hint: "「入口本身」里面，还有什么？", line: "最里面是一个红点。就是开场落下的那一个。" },
  { id: "typeid", name: "直达", hint: "不用翻：直接在键盘上打出卡带的名字", line: "beat、stay、dot，打字就能到。" },
  { id: "tempo", name: "跟拍", hint: "读取「节拍幸存者」，跟着拍子点它", line: "整座仓库跟着你的速度起伏。" },
  { id: "poke", name: "别戳了", hint: "读取「别关我」，戳它的眼睛", line: "stay：哼。" },
  { id: "clicker", name: "放置游戏", hint: "读取「从一个点开始」，一直点那个点", line: "你已经在玩放置游戏了。真正的那个更好玩。" },
  { id: "doodle", name: "刻点什么", hint: "空白卡带真的什么都没有吗？多点几下", line: "真的什么都没有……好吧，那你来刻点什么。" },
  { id: "fling", name: "轻拿轻放", hint: "用力甩一下架子", line: "都是玻璃做的，轻一点。" },
  { id: "loop", name: "转圈", hint: "一直翻，翻很久很久", line: "你翻了一百盒。其实仓库一直在转圈。" },
  { id: "away", name: "你去哪了", hint: "去别的标签页转一圈，再回来", line: "标签页上的字，你看到了吗？" },
  { id: "idle", name: "你还在吗", hint: "什么都别做，等一分钟", line: "啊，你在。" },
  { id: "saver", name: "屏保", hint: "什么都别做，等两分钟", line: "这台机器也是会走神的。" },
  { id: "corner", name: "正中角落", hint: "屏保里的标志，总有一次会正好撞进角落", line: "等了这么久，终于撞进去了。" },
  { id: "console", name: "看源码的人", hint: "开发者工具（F12）的控制台里，有人在等你", line: "stay：你真的输了。" },
  { id: "terminal", name: "命令行", hint: "按一下 / 键；手机上连点三下卡位数字", line: "输入 help 看看能做什么。" },
  { id: "drop", name: "红点", hint: "连点左上角标志里的那个红点", line: "掉下来了。可以拖着它甩。" },
  { id: "night", name: "熄灯", hint: "凌晨 0 到 5 点来；或者在命令行里关灯", line: "仓库熄灯了。拿着手电筒找吧。" },
  { id: "replay", name: "再来一遍", hint: "长按左上角的标志", line: "开场再播一遍。" },
];

const KEY = "mk-eggs";
const pad = (n: number) => String(n).padStart(2, "0");

export class Eggs {
  private found: Record<string, number> = {};
  private pop: HTMLElement;
  private counter: HTMLButtonElement;
  private list: HTMLElement;
  private queue: EggDef[] = [];
  private showing = false;
  onOpenList: (() => void) | null = null;

  constructor(
    private sound: Sound,
    private reduced: () => boolean,
  ) {
    try {
      this.found = JSON.parse(localStorage.getItem(KEY) || "{}") || {};
    } catch {
      this.found = {};
    }
    // 刻印弹出
    this.pop = document.createElement("div");
    this.pop.className = "egg-pop";
    this.pop.setAttribute("role", "status");
    document.querySelector(".hud")!.append(this.pop);
    // HUD 计数：找到第一个以后才出现
    this.counter = document.createElement("button");
    this.counter.type = "button";
    this.counter.className = "egg-n";
    this.counter.title = "彩蛋图鉴";
    this.counter.addEventListener("click", () => this.onOpenList?.());
    document.querySelector(".hud-foot")!.prepend(this.counter);
    // 「关于」里的图鉴，替换原来那一行提示
    this.list = document.createElement("section");
    this.list.className = "ab-eggs";
    this.list.id = "ab-eggs";
    const old = document.querySelector(".ab-egg");
    if (old) old.replaceWith(this.list);
    else document.querySelector(".ab-in")!.append(this.list);
    this.render();
  }

  get count() {
    return EGGS.filter((e) => this.found[e.id]).length;
  }
  has(id: string) {
    return !!this.found[id];
  }

  /** 发现一个彩蛋；已经找到过就什么都不做，返回 false */
  find(id: string) {
    const def = EGGS.find((e) => e.id === id);
    if (!def || this.found[id]) return false;
    this.found[id] = Date.now();
    try {
      localStorage.setItem(KEY, JSON.stringify(this.found));
    } catch {
      /* 隐私模式 */
    }
    this.render();
    this.queue.push(def);
    if (!this.showing) this.next();
    return true;
  }

  /** 测试 / 命令行用：忘掉全部 */
  reset() {
    this.found = {};
    try {
      localStorage.removeItem(KEY);
    } catch {
      /* ignore */
    }
    this.render();
  }

  /** 还没找到的里面随便挑一个提示 */
  randomHint() {
    const left = EGGS.filter((e) => !this.found[e.id]);
    if (!left.length) return null;
    return left[Math.floor(Math.random() * left.length)];
  }

  private next() {
    const def = this.queue.shift();
    if (!def) {
      this.showing = false;
      return;
    }
    this.showing = true;
    const n = EGGS.indexOf(def) + 1;
    this.pop.innerHTML = `<i class="ep-seal"><svg viewBox="0 0 40 46" aria-hidden="true"><path d="M7 4H30L36 10V39Q36 42 33 42H7Q4 42 4 39V7Q4 4 7 4Z"/><circle cx="20" cy="19" r="4.6"/></svg></i><span class="ep-txt"><small>发现彩蛋 · ${pad(n)} / ${EGGS.length}</small><b></b><em></em></span>`;
    this.pop.querySelector("b")!.textContent = def.name;
    this.pop.querySelector("em")!.textContent = def.line;
    this.pop.classList.remove("on");
    void this.pop.offsetWidth;
    this.pop.classList.add("on");
    this.sound.egg();
    this.counter.classList.remove("bump");
    void this.counter.offsetWidth;
    this.counter.classList.add("bump");
    window.setTimeout(
      () => {
        this.pop.classList.remove("on");
        window.setTimeout(() => this.next(), 450);
      },
      this.reduced() ? 3000 : 3800,
    );
  }

  private render() {
    const n = this.count;
    this.counter.hidden = n === 0;
    this.counter.innerHTML = `<i></i>彩蛋 ${pad(n)}/${EGGS.length}`;
    const all = n === EGGS.length;
    this.list.innerHTML = `<h3>暗格 · 彩蛋 <em>${pad(n)} / ${EGGS.length}</em></h3><p class="ab-eggs-sub">${
      all ? "全部找到了。谢谢你翻得这么仔细。" : n === 0 ? "仓库里藏着一些东西。慢慢翻。" : "还有一些没找到。慢慢翻。"
    }</p><ol></ol>`;
    const ol = this.list.querySelector("ol")!;
    EGGS.forEach((e, i) => {
      const li = document.createElement("li");
      const got = !!this.found[e.id];
      li.className = got ? "got" : "";
      li.innerHTML = `<span class="n">${pad(i + 1)}</span><b></b><i></i>`;
      li.querySelector("b")!.textContent = got ? e.name : "？？？";
      li.querySelector("i")!.textContent = got ? e.line : "";
      ol.append(li);
    });
  }
}

// ———————————————————— 屏保 ————————————————————
/** 发呆两分钟：标志在屏幕里弹来弹去，每撞一次墙换一种颜色；撞进角落有庆祝 */
export class Saver {
  private el: HTMLDivElement | null = null;
  private raf = 0;
  private x = 0;
  private y = 0;
  private vx = 1;
  private vy = 1;
  private colorIdx = 0;
  private startAt = 0;
  private moveFrom: { x: number; y: number } | null = null;
  onCorner: (() => void) | null = null;
  onExit: (() => void) | null = null;

  constructor(
    private sound: Sound,
    private colors: () => string[],
  ) {}

  get active() {
    return !!this.el;
  }

  start() {
    if (this.el) return;
    const el = document.createElement("div");
    el.className = "saver";
    el.innerHTML = `<div class="sv-logo"><svg viewBox="0 0 40 46" aria-hidden="true"><path class="o" d="M7 4H30L36 10V39Q36 42 33 42H7Q4 42 4 39V7Q4 4 7 4Z"/><path class="l" d="M10 35.5H19"/><circle class="c" cx="20" cy="19" r="4.6"/></svg><b>铭刻</b></div><span class="sv-tip">动一下就回来</span>`;
    document.body.append(el);
    this.el = el;
    const logo = el.querySelector<HTMLElement>(".sv-logo")!;
    const W = innerWidth,
      H = innerHeight;
    const lw = logo.offsetWidth,
      lh = logo.offsetHeight;
    this.x = Math.random() * (W - lw);
    this.y = Math.random() * (H - lh);
    const sp = Math.max(70, Math.min(W, H) * 0.16);
    this.vx = (Math.random() < 0.5 ? -1 : 1) * sp;
    this.vy = (Math.random() < 0.5 ? -1 : 1) * sp * 0.8;
    this.colorIdx = 0;
    this.paint(logo);
    requestAnimationFrame(() => el.classList.add("on"));
    this.startAt = performance.now();
    this.moveFrom = null;
    addEventListener("pointermove", this.onMove, true);
    addEventListener("pointerdown", this.exit, true);
    addEventListener("keydown", this.exit, true);
    addEventListener("wheel", this.exit, true);
    addEventListener("touchstart", this.exit, true);
    let last = performance.now();
    const step = (now: number) => {
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;
      this.step(dt, logo);
      this.raf = requestAnimationFrame(step);
    };
    this.raf = requestAnimationFrame(step);
  }

  private onMove = (e: PointerEvent) => {
    if (performance.now() - this.startAt < 400) return;
    if (!this.moveFrom) this.moveFrom = { x: e.clientX, y: e.clientY };
    else if (Math.hypot(e.clientX - this.moveFrom.x, e.clientY - this.moveFrom.y) > 12) this.exit();
  };

  exit = (e?: Event) => {
    if (!this.el) return;
    // 退出屏保那一下按键 / 点击不再传给页面
    if (e && e.type !== "pointermove" && e.type !== "wheel") {
      e.stopPropagation();
      if (e.type === "keydown" || e.type === "pointerdown") e.preventDefault();
    }
    removeEventListener("pointermove", this.onMove, true);
    removeEventListener("pointerdown", this.exit, true);
    removeEventListener("keydown", this.exit, true);
    removeEventListener("wheel", this.exit, true);
    removeEventListener("touchstart", this.exit, true);
    cancelAnimationFrame(this.raf);
    const el = this.el;
    this.el = null;
    el.classList.remove("on");
    setTimeout(() => el.remove(), 500);
    this.onExit?.();
  };

  private paint(logo: HTMLElement) {
    const cs = this.colors();
    logo.style.setProperty("--sv", cs[this.colorIdx % cs.length]);
  }

  private step(dt: number, logo: HTMLElement) {
    const W = innerWidth,
      H = innerHeight;
    const lw = logo.offsetWidth,
      lh = logo.offsetHeight;
    const mx = W - lw,
      my = H - lh;
    this.x += this.vx * dt;
    this.y += this.vy * dt;
    let hitX = false,
      hitY = false;
    if (this.x <= 0 || this.x >= mx) {
      hitX = true;
      // 快撞到墙时，另一边也差不多到了：悄悄推一把，让它正好进角落（不然要等很久）
      const toY = this.vy > 0 ? my - this.y : this.y;
      if (toY > 0 && toY < 46) {
        this.y = this.vy > 0 ? my : 0;
        hitY = true;
      }
    }
    if (this.y <= 0 || this.y >= my) {
      hitY = true;
      const toX = this.vx > 0 ? mx - this.x : this.x;
      if (!hitX && toX > 0 && toX < 46) {
        this.x = this.vx > 0 ? mx : 0;
        hitX = true;
      }
    }
    if (hitX) {
      this.x = Math.max(0, Math.min(mx, this.x));
      this.vx = this.x <= 0 ? Math.abs(this.vx) : -Math.abs(this.vx);
    }
    if (hitY) {
      this.y = Math.max(0, Math.min(my, this.y));
      this.vy = this.y <= 0 ? Math.abs(this.vy) : -Math.abs(this.vy);
    }
    if (hitX || hitY) {
      this.colorIdx++;
      this.paint(logo);
      if (hitX && hitY) {
        this.sound.corner();
        logo.classList.remove("hit");
        void logo.offsetWidth;
        logo.classList.add("hit");
        burst(this.x + lw / 2, this.y + lh / 2, this.colors(), this.el!);
        this.onCorner?.();
      } else this.sound.bounce(0.5);
    }
    logo.style.transform = `translate(${this.x.toFixed(1)}px,${this.y.toFixed(1)}px)`;
  }
}

/** 一把小卡带碎屑从某点炸开 */
function burst(x: number, y: number, colors: string[], host: HTMLElement) {
  for (let i = 0; i < 26; i++) {
    const p = document.createElement("i");
    p.className = "sv-bit";
    const a = Math.random() * Math.PI * 2,
      d = 80 + Math.random() * 220;
    p.style.cssText = `left:${x}px;top:${y}px;--dx:${Math.cos(a) * d}px;--dy:${Math.sin(a) * d}px;--r:${(Math.random() - 0.5) * 720}deg;background:${colors[i % colors.length]}`;
    host.append(p);
    setTimeout(() => p.remove(), 1400);
  }
}

// ———————————————————— 熄灯 ————————————————————
/** 仓库熄灯：一层黑幕，只有指针附近一圈手电筒光；读取卡带或 40 秒后，日光灯闪几下亮回来 */
export class Night {
  private el: HTMLDivElement | null = null;
  private timer = 0;
  onOn: (() => void) | null = null;

  constructor(private sound: Sound) {}

  get dark() {
    return !!this.el;
  }

  off() {
    if (this.el) return;
    const el = document.createElement("div");
    el.className = "night";
    el.style.setProperty("--x", `${innerWidth / 2}px`);
    el.style.setProperty("--y", `${innerHeight * 0.45}px`);
    document.getElementById("app")!.append(el);
    this.el = el;
    requestAnimationFrame(() => el.classList.add("on"));
    addEventListener("pointermove", this.move, true);
    addEventListener("pointerdown", this.move, true);
    this.sound.lamp(false);
    clearTimeout(this.timer);
    this.timer = window.setTimeout(() => this.on(), 40000);
  }

  on() {
    const el = this.el;
    if (!el) return;
    this.el = null;
    clearTimeout(this.timer);
    removeEventListener("pointermove", this.move, true);
    removeEventListener("pointerdown", this.move, true);
    this.sound.lamp(true);
    el.classList.add("flick");
    setTimeout(() => el.remove(), 1300);
    this.onOn?.();
  }

  private move = (e: PointerEvent) => {
    this.el?.style.setProperty("--x", `${e.clientX}px`);
    this.el?.style.setProperty("--y", `${e.clientY}px`);
  };
}

// ———————————————————— 掉下来的红点 ————————————————————
/** 标志里的红点被连点掉下来：有重力、会弹、可以拖着甩；停稳一会儿（或双击它）自己飞回去 */
export class LooseDot {
  private el: HTMLDivElement | null = null;
  private raf = 0;
  private x = 0;
  private y = 0;
  private vx = 0;
  private vy = 0;
  private held: { id: number; ox: number; oy: number; samples: { x: number; y: number; t: number }[] } | null = null;
  private restSince = 0;
  private home: () => { x: number; y: number; r: number } | null;
  private homing = 0;
  private hx0 = 0;
  private hy0 = 0;

  constructor(
    private sound: Sound,
    home: () => { x: number; y: number; r: number } | null,
    private onHome: () => void,
  ) {
    this.home = home;
  }

  get loose() {
    return !!this.el;
  }

  drop() {
    if (this.el) return;
    const h = this.home();
    if (!h) return;
    const el = document.createElement("div");
    el.className = "loose-dot";
    el.style.setProperty("--d", `${Math.max(9, h.r * 2)}px`);
    document.body.append(el);
    this.el = el;
    this.x = h.x;
    this.y = h.y;
    this.vx = 60 + Math.random() * 120;
    this.vy = -160;
    this.restSince = 0;
    this.homing = 0;
    el.addEventListener("pointerdown", this.grab);
    el.addEventListener("dblclick", () => this.goHome());
    let last = performance.now();
    const step = (now: number) => {
      const dt = Math.min(0.033, (now - last) / 1000);
      last = now;
      this.step(dt, now);
      if (this.el) this.raf = requestAnimationFrame(step);
    };
    this.raf = requestAnimationFrame(step);
  }

  private goHome() {
    if (!this.el || this.homing) return;
    this.held = null;
    this.homing = performance.now();
    this.hx0 = this.x;
    this.hy0 = this.y;
  }

  private grab = (e: PointerEvent) => {
    if (!this.el || this.homing) return;
    e.preventDefault();
    e.stopPropagation();
    this.el.setPointerCapture(e.pointerId);
    this.held = { id: e.pointerId, ox: this.x - e.clientX, oy: this.y - e.clientY, samples: [] };
    const move = (ev: PointerEvent) => {
      if (!this.held || ev.pointerId !== this.held.id) return;
      this.x = ev.clientX + this.held.ox;
      this.y = ev.clientY + this.held.oy;
      const t = performance.now();
      this.held.samples.push({ x: this.x, y: this.y, t });
      this.held.samples = this.held.samples.filter((s) => t - s.t < 90);
    };
    const up = (ev: PointerEvent) => {
      if (!this.held || ev.pointerId !== this.held.id) return;
      const s = this.held.samples;
      if (s.length >= 2) {
        const a = s[0],
          b = s[s.length - 1];
        const dt = Math.max(0.016, (b.t - a.t) / 1000);
        this.vx = Math.max(-3000, Math.min(3000, (b.x - a.x) / dt));
        this.vy = Math.max(-3000, Math.min(3000, (b.y - a.y) / dt));
      } else {
        this.vx = 0;
        this.vy = 0;
      }
      this.held = null;
      this.restSince = 0;
      this.el?.removeEventListener("pointermove", move);
      this.el?.removeEventListener("pointerup", up);
      this.el?.removeEventListener("pointercancel", up);
    };
    this.el.addEventListener("pointermove", move);
    this.el.addEventListener("pointerup", up);
    this.el.addEventListener("pointercancel", up);
  };

  private step(dt: number, now: number) {
    const el = this.el!;
    const d = el.offsetWidth;
    const r = d / 2;
    if (this.homing) {
      const h = this.home();
      const p = Math.min(1, (now - this.homing) / 700);
      const e = p < 0.5 ? 2 * p * p : 1 - Math.pow(-2 * p + 2, 2) / 2;
      const tx = h?.x ?? this.hx0,
        ty = h?.y ?? this.hy0;
      this.x = this.hx0 + (tx - this.hx0) * e;
      this.y = this.hy0 + (ty - this.hy0) * e - Math.sin(p * Math.PI) * 140;
      if (p >= 1) {
        cancelAnimationFrame(this.raf);
        el.remove();
        this.el = null;
        this.sound.bounce(0.8);
        this.onHome();
        return;
      }
    } else if (!this.held) {
      const W = innerWidth,
        H = innerHeight;
      this.vy += 1800 * dt;
      this.x += this.vx * dt;
      this.y += this.vy * dt;
      const hit = (v: number) => {
        const s = Math.min(1, Math.abs(v) / 900);
        if (s > 0.08) this.sound.bounce(s);
      };
      if (this.y > H - r) {
        hit(this.vy);
        this.y = H - r;
        this.vy = -Math.abs(this.vy) * 0.62;
        this.vx *= 0.9;
        if (Math.abs(this.vy) < 40) this.vy = 0;
      }
      if (this.y < r) {
        hit(this.vy);
        this.y = r;
        this.vy = Math.abs(this.vy) * 0.62;
      }
      if (this.x < r || this.x > W - r) {
        hit(this.vx);
        this.x = Math.max(r, Math.min(W - r, this.x));
        this.vx = -this.vx * 0.7;
      }
      // 地上滚：摩擦
      if (this.y >= H - r - 0.5) this.vx *= Math.exp(-dt * 1.6);
      const resting = Math.abs(this.vx) < 6 && this.vy === 0 && this.y >= H - r - 0.5;
      if (resting) {
        if (!this.restSince) this.restSince = now;
        else if (now - this.restSince > 9000) this.goHome();
      } else this.restSince = 0;
    }
    el.style.transform = `translate(${(this.x - r).toFixed(1)}px,${(this.y - r).toFixed(1)}px)`;
  }
}

/** 甩架子：整个舞台抖一下 */
export function shake(el: HTMLElement) {
  el.classList.remove("shake");
  void el.offsetWidth;
  el.classList.add("shake");
  setTimeout(() => el.classList.remove("shake"), 520);
}

/** 屏幕正中的一段大字（彩蛋的"演出"用）：小标题 + 大字 + 一句，带扫描线显出 */
let curBanner: HTMLElement | null = null;
export function banner(kicker: string, big: string, sub = "", color = "var(--accent)", ms = 2600) {
  // 同一时间只演一段：新的来了，旧的立刻收起
  if (curBanner) {
    const old = curBanner;
    old.classList.remove("on");
    old.classList.add("off");
    setTimeout(() => old.remove(), 600);
  }
  const el = document.createElement("div");
  curBanner = el;
  el.className = "egg-banner";
  el.style.setProperty("--bc", color);
  el.innerHTML = `<small></small><b></b><span></span>`;
  el.querySelector("small")!.textContent = kicker;
  el.querySelector("b")!.textContent = big;
  el.querySelector("span")!.textContent = sub;
  document.getElementById("app")!.append(el);
  requestAnimationFrame(() => el.classList.add("on"));
  setTimeout(() => {
    if (curBanner !== el) return;
    curBanner = null;
    el.classList.remove("on");
    el.classList.add("off");
    setTimeout(() => el.remove(), 700);
  }, ms);
}
