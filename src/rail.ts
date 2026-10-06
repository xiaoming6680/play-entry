/*
 * 主架的连续位置：键盘/滚轮的阻尼跳转、拖动跟手、松手惯性滑行再吸附、横向橡皮筋。
 * 拖动分解与惯性部分改编自 RhineLabUI 的 src/archive-drag.ts（https://github.com/LBEILC/RhineLabUI）
 * Copyright (c) 2026 LBEILC — MIT License，全文见 public/licenses/RhineLabUI-MIT.txt
 * 改动：两条轨道改为「主架卡位 + 横向橡皮筋」；增加键盘目标模式与橡皮筋回弹。
 */
import { damp, spring, type Spring } from "./motion";

type V2 = { x: number; y: number };

export class Rail {
  pos: number;
  vel = 0;
  target: number;
  mode: "spring" | "drag" | "coast" | "snap" = "spring";
  lateral: Spring = spring(0);
  private rawLateral = 0;
  // 拖动
  private start = { x: 0, y: 0, pos: 0, lat: 0 };
  private inverse: { a: V2; b: V2 } | null = null;
  private samples: { v: number; t: number }[] = [];
  private lastMotion = -Infinity;
  dragging = false;
  moved = false;
  /** 最近一次松手时的速度（卡位/秒，触屏换算前），彩蛋「轻拿轻放」用 */
  throwV = 0;
  private readonly friction = 2.4;

  constructor(slot = 0) {
    this.pos = slot;
    this.target = slot;
  }

  /** 当前应当显示为"选中"的卡位 */
  get selected() {
    return this.mode === "spring" || this.mode === "snap" ? this.target : Math.round(this.pos);
  }

  goto(slot: number) {
    if (this.mode === "coast" || this.mode === "drag") this.vel *= 0.3;
    this.mode = "spring";
    this.target = slot;
  }

  nudge(dir: number) {
    const base = this.mode === "spring" || this.mode === "snap" ? this.target : Math.round(this.pos);
    this.goto(base + dir);
  }

  /** axis = 内容前进一个卡位时卡带在屏幕上的位移；lane = 横向一个架子的位移 */
  dragStart(x: number, y: number, axis: V2, lane: V2, t: number) {
    this.dragging = true;
    this.moved = false;
    this.start = { x, y, pos: this.pos, lat: this.rawLateral };
    const det = axis.x * lane.y - lane.x * axis.y;
    const area = Math.hypot(axis.x, axis.y) * Math.hypot(lane.x, lane.y);
    this.inverse =
      Number.isFinite(area) && area > 0 && Math.abs(det) > area * 0.001
        ? { a: { x: lane.y / det, y: -lane.x / det }, b: { x: -axis.y / det, y: axis.x / det } }
        : null;
    this.samples = [{ v: this.pos, t }];
    this.lastMotion = -Infinity;
    this.throwV = 0;
  }

  dragMove(x: number, y: number, t: number) {
    if (!this.dragging) return;
    const dx = x - this.start.x,
      dy = y - this.start.y;
    const dist = Math.hypot(dx, dy);
    if (!this.moved && dist < 9) return;
    if (!this.inverse) return;
    if (!this.moved) {
      // 越过阈值时以当前点为新起点，避免起拖时跳一下
      this.moved = true;
      this.mode = "drag";
      this.start = { x, y, pos: this.pos, lat: this.rawLateral };
      this.samples = [{ v: this.pos, t }];
      return;
    }
    const a = dx * this.inverse.a.x + dy * this.inverse.a.y;
    const b = dx * this.inverse.b.x + dy * this.inverse.b.y;
    const prev = this.samples[this.samples.length - 1];
    this.pos = this.start.pos - a;
    this.rawLateral = this.start.lat - b;
    if (prev && Math.abs(this.pos - prev.v) > 1e-6) {
      // 反向时重新估速
      const dir = Math.sign(this.pos - prev.v);
      const before = this.samples.length > 1 ? Math.sign(prev.v - this.samples[this.samples.length - 2].v) : dir;
      if (dir !== before) this.samples = [prev];
      this.lastMotion = t;
    }
    if (prev?.t === t) this.samples[this.samples.length - 1] = { v: this.pos, t };
    else this.samples.push({ v: this.pos, t });
    this.samples = this.samples.filter((s) => t - s.t <= 120).slice(-32);
  }

  /** 松手：返回这次是不是"点按"（没拖动） */
  /** paging = 触屏：短滑一下就翻一盒（像刷短视频），用力甩才连翻 */
  dragEnd(t: number, reduced: boolean, paging = false): boolean {
    if (!this.dragging) return false;
    this.dragging = false;
    this.rawLateral = 0;
    if (!this.moved) return true;
    const first = this.samples[0],
      last = this.samples[this.samples.length - 1];
    let v = 0;
    if (!reduced && first && last && t - this.lastMotion <= 80 && last.t - first.t >= 8)
      v = ((last.v - first.v) * 1000) / (last.t - first.t);
    v = Math.max(-24, Math.min(24, v));
    this.throwV = v;
    const moved = this.pos - this.start.pos;
    if (paging) {
      v *= 0.42;
      if (Math.abs(moved) < 1.4 && (Math.abs(v) > 0.8 || Math.abs(moved) > 0.3)) {
        this.vel = v;
        this.mode = "snap";
        this.target = Math.round(this.start.pos) + Math.sign(Math.abs(v) > 0.8 ? v : moved);
        return false;
      }
    }
    this.vel = v;
    if (Math.abs(v) >= 0.75) this.mode = "coast";
    else {
      this.mode = "snap";
      this.target = Math.round(this.pos + v / this.friction);
    }
    return false;
  }

  cancelDrag() {
    if (!this.dragging) return;
    this.dragging = false;
    this.rawLateral = 0;
    this.mode = "snap";
    this.target = Math.round(this.pos);
  }

  /** 按住正在滑行的架子：立即停住 */
  catch() {
    if (this.mode === "coast") {
      this.vel = 0;
      this.mode = "snap";
      this.target = Math.round(this.pos);
    }
  }

  step(dt: number, reduced: boolean) {
    if (this.mode === "coast") {
      const decay = Math.exp(-this.friction * dt);
      this.pos += (this.vel * (1 - decay)) / this.friction;
      this.vel *= decay;
      if (Math.abs(this.vel) < 0.6) {
        this.target = Math.round(this.pos + this.vel / this.friction);
        this.mode = "snap";
      }
    } else if (this.mode === "spring" || this.mode === "snap") {
      if (reduced) {
        this.pos = this.target;
        this.vel = 0;
      } else {
        const s = { value: this.pos, velocity: this.vel };
        damp(s, this.target, this.mode === "snap" ? 10 : 8.5, dt);
        this.pos = s.value;
        this.vel = s.velocity;
        if (Math.abs(this.pos - this.target) < 1e-4 && Math.abs(this.vel) < 1e-3) {
          this.pos = this.target;
          this.vel = 0;
        }
      }
    }
    // 横向橡皮筋：拖得越远越"沉"，松手弹回
    const rubber = this.rawLateral / (1 + Math.abs(this.rawLateral) * 2.2);
    if (this.dragging) this.lateral.value = rubber * 0.55;
    else damp(this.lateral, 0, 9, dt);
  }

  get settled() {
    return (this.mode === "spring" || this.mode === "snap") && this.pos === this.target;
  }
}
