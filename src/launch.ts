// 插入成功后的转场：每个游戏一段约 1.5 秒的演出，最后一帧正好是游戏首屏的底色，然后跳转。
// 所有尺寸都按短边 u / 对角线算，图形保持等比，任何宽高比都铺满、不变形。
import { drawEra } from "./cores/dot";
import { rgba } from "./cores/common";
import type { Item } from "./types";

/** 转场里的声音节点：name 是这一下的名字，n 是附带的序号（dot 的时代） */
export type LaunchCue = (name: string, n?: number) => void;

interface Ctx {
  g: CanvasRenderingContext2D;
  W: number;
  H: number;
  u: number; // 短边
  cx: number;
  cy: number;
  far: number; // 中心到角
  from: { x: number; y: number };
  farFrom: number; // 槽口到最远的角
  item: Item;
  dpr: number;
}

interface Scene {
  dur: number;
  end: string; // 游戏首屏底色
  cues: { at: number; name: string; n?: number }[];
  draw(c: Ctx, t: number): void;
}

const clamp = (x: number, a = 0, b = 1) => Math.max(a, Math.min(b, x));
const seg = (t: number, a: number, b: number) => clamp((t - a) / (b - a));
const smooth = (x: number) => x * x * (3 - 2 * x);
const outCubic = (x: number) => 1 - (1 - x) ** 3;
const inCubic = (x: number) => x * x * x;
const outExpo = (x: number) => (x >= 1 ? 1 : 1 - 2 ** (-10 * x));

// ———————————————————— beat：踩着 128 BPM 冲进霓虹隧道 ————————————————————
function beatScene(item: Item): Scene {
  const bpm = Number(item.coreOptions.bpm) || 128;
  const b = 60 / bpm;
  const kicks = [0, b, 2 * b]; // 三下底鼓
  const drop = 2.5 * b; // 最后一个反拍上冲过去
  const dur = drop + 0.38;
  const BG = "#05040D";
  return {
    dur,
    end: BG,
    cues: [
      ...kicks.map((at) => ({ at, name: "kick" })),
      { at: b / 2, name: "hat" },
      { at: 1.5 * b, name: "hat" },
      { at: b * 1.75, name: "rise" },
      { at: drop, name: "drop" },
    ],
    draw(c, t) {
      const { g, W, H, u, cx, cy, far, from, farFrom } = c;
      const A = item.color,
        B = item.color2;
      // 底：从槽口推出去的第一圈冲击波
      const w = outCubic(seg(t, 0, 0.3));
      if (w < 1) {
        g.fillStyle = BG;
        g.beginPath();
        g.arc(from.x, from.y, w * farFrom * 1.02, 0, Math.PI * 2);
        g.fill();
        g.globalCompositeOperation = "lighter";
        g.strokeStyle = rgba(A, 0.9 * (1 - w));
        g.lineWidth = u * 0.03 * (1 - w) + 2;
        g.stroke();
        g.globalCompositeOperation = "source-over";
      } else {
        g.fillStyle = BG;
        g.fillRect(0, 0, W, H);
      }
      // 隧道的推进量：每下底鼓猛推一个八度，中间缓缓漂；最后冲过去
      let z = t * 0.35;
      for (const k of kicks) z += outExpo(seg(t, k, k + 0.28));
      const d = seg(t, drop, dur);
      z += 2.6 * inCubic(d);
      let last = 0;
      for (const k of kicks) if (t >= k) last = k;
      const hit = Math.exp(-(t - last) * 7); // 底鼓刚打下的亮
      const hat = Math.max(...[b / 2, 1.5 * b].map((h) => (t >= h ? Math.exp(-(t - h) * 14) : 0)));
      const fadeIn = smooth(seg(t, 0.04, 0.24));
      const fadeOut = 1 - smooth(seg(t, drop + 0.08, dur - 0.04));
      const vis = fadeIn * fadeOut;
      if (vis <= 0) return;
      g.globalCompositeOperation = "lighter";
      g.lineCap = "round";
      // 中心的光团
      const core = g.createRadialGradient(cx, cy, 0, cx, cy, u * 0.42);
      core.addColorStop(0, rgba(A, (0.35 + 0.4 * hit) * vis));
      core.addColorStop(0.5, rgba(B, (0.1 + 0.15 * hit) * vis));
      core.addColorStop(1, rgba(B, 0));
      g.fillStyle = core;
      g.fillRect(cx - u * 0.42, cy - u * 0.42, u * 0.84, u * 0.84);
      // 同心环：半径按 2 的幂排开，推进 z 时整体放大，看起来是在一直往里钻
      const base = u * 0.07;
      const k0 = Math.floor(z) - 1;
      for (let k = k0; k < k0 + 12; k++) {
        const r = base * 2 ** (k - z + 1);
        if (r < u * 0.012 || r > far * 1.6) continue;
        const col = ((k % 2) + 2) % 2 ? B : A;
        const near = clamp(1 - Math.log2(r / (u * 0.35)) / 2.2); // 越外越淡
        const a = vis * near * (0.5 + 0.5 * hit);
        g.beginPath();
        g.arc(cx, cy, r, 0, Math.PI * 2);
        g.strokeStyle = rgba(col, 0.16 * a);
        g.lineWidth = r * 0.09;
        g.stroke();
        g.strokeStyle = rgba(col, 0.9 * a);
        g.lineWidth = Math.max(1.5, r * 0.018 * (1 + hit));
        g.stroke();
      }
      // 频谱刻度：一圈放射线，反拍时闪
      const R0 = u * 0.26 * (1 + 0.08 * hit) * (1 + 3 * inCubic(d));
      const n = 48;
      for (let i = 0; i < n; i++) {
        const ang = (i / n) * Math.PI * 2 - Math.PI / 2 + t * 0.4;
        const spec = 0.5 + 0.5 * Math.sin(i * 1.71 + t * 9) * Math.cos(i * 0.53 - t * 5);
        const len = u * (0.025 + 0.07 * spec * (0.4 + 0.6 * Math.max(hit, hat)));
        g.strokeStyle = rgba(i % 2 ? B : A, vis * (0.35 + 0.55 * hat));
        g.lineWidth = Math.max(1.5, u * 0.005);
        g.beginPath();
        g.moveTo(cx + Math.cos(ang) * R0, cy + Math.sin(ang) * R0);
        g.lineTo(cx + Math.cos(ang) * (R0 + len), cy + Math.sin(ang) * (R0 + len));
        g.stroke();
      }
      // 冲过去的那一下：白闪
      if (t >= drop) {
        const f = Math.exp(-(t - drop) * 9) * 0.55;
        g.fillStyle = `rgba(255,255,255,${f})`;
        g.fillRect(0, 0, W, H);
      }
      g.globalCompositeOperation = "source-over";
    },
  };
}

// ———————————————————— stay：睁眼、看你、眨眼，钻进瞳孔，再从里面睁开 ————————————————————
function stayScene(): Scene {
  const PAPER = "#F3EFE7",
    INK = "#1E1C19",
    DIM = "#8B857B";
  const T = { open: 0.3, look: 0.6, blink: 1.02, dive: 1.2, black: 1.5, wake: 1.56, dur: 2.02 };
  // 视线：先往左看，往右看，然后看着你
  const gaze = (t: number) => {
    const s1 = smooth(seg(t, T.look, T.look + 0.08)),
      s2 = smooth(seg(t, T.look + 0.18, T.look + 0.26)),
      s3 = smooth(seg(t, T.look + 0.36, T.look + 0.44));
    return { x: -0.55 * s1 + 0.9 * s2 - 0.35 * s3, y: 0.12 * s1 - 0.12 * s3 };
  };
  const almond = (g: CanvasRenderingContext2D, x: number, y: number, w: number, h: number) => {
    // 二次曲线的控制点要放在两倍高度，曲线顶点才是 h
    g.beginPath();
    g.moveTo(x - w, y);
    g.quadraticCurveTo(x, y - 2 * h, x + w, y);
    g.quadraticCurveTo(x, y + 2 * h, x - w, y);
    g.closePath();
  };
  return {
    dur: T.dur,
    end: PAPER,
    cues: [
      { at: 0, name: "wipe" },
      { at: T.open, name: "open" },
      { at: T.look, name: "look" },
      { at: T.look + 0.18, name: "look" },
      { at: T.look + 0.36, name: "look" },
      { at: T.blink, name: "blink" },
      { at: T.dive, name: "dive" },
      { at: T.wake, name: "wake" },
    ],
    draw(c, t) {
      const { g, W, H, u, cx, cy, far, from, farFrom } = c;
      // 纸从槽口铺开
      const w = smooth(seg(t, 0, 0.36));
      g.fillStyle = PAPER;
      if (w < 1) {
        g.beginPath();
        g.arc(from.x, from.y, w * farFrom * 1.02, 0, Math.PI * 2);
        g.fill();
        g.strokeStyle = rgba(INK, 0.25 * (1 - w));
        g.lineWidth = 1.5;
        g.stroke();
      } else g.fillRect(0, 0, W, H);
      if (t >= T.wake) {
        // 从瞳孔里面睁开：黑底上一只眼形的开口张大到铺满
        const p = smooth(seg(t, T.wake, T.dur - 0.04));
        g.fillStyle = "#000";
        g.fillRect(0, 0, W, H);
        g.fillStyle = PAPER;
        const big = Math.max(W, H);
        // 先是一道细缝，再慢慢张开（像刚醒）
        almond(g, cx, cy, big * (0.03 + 2.3 * p ** 2.2), big * (0.004 + 1.5 * p ** 2.6));
        g.fill();
        const rim = 1 - p;
        if (rim > 0) {
          g.strokeStyle = rgba(INK, 0.5 * rim);
          g.lineWidth = Math.max(2, u * 0.006);
          g.stroke();
        }
        return;
      }
      if (t < T.open - 0.06) return;
      // 眼睛：宽高都只看短边，竖屏横屏都是同一只眼
      const ew = u * 0.36,
        eh = ew * 0.44;
      let open = outCubic(seg(t, T.open, T.open + 0.3));
      open *= 1 - Math.sin(Math.PI * seg(t, T.blink, T.blink + 0.16)); // 眨一下
      const gz = gaze(t);
      // 钻进去：以瞳孔为中心整体放大，瞳孔盖满屏幕
      const pr = eh * 0.5 * (1 + 0.18 * smooth(seg(t, T.dive - 0.1, T.dive))); // 盯着你时瞳孔放大一点
      const px = cx + gz.x * ew * 0.42,
        py = cy + gz.y * eh * 0.5;
      const zoomTo = (far * 2.4) / pr;
      const z = 1 + (zoomTo - 1) * inCubic(seg(t, T.dive, T.black));
      g.save();
      g.translate(px, py);
      g.scale(z, z);
      g.translate(-px, -py);
      g.lineWidth = Math.max(2, u * 0.0055);
      g.lineJoin = "round";
      g.strokeStyle = INK;
      if (open < 0.02) {
        g.beginPath();
        g.moveTo(cx - ew, cy);
        g.quadraticCurveTo(cx, cy + eh * 0.25, cx + ew, cy);
        g.stroke();
      } else {
        g.save();
        almond(g, cx, cy, ew, eh * open);
        g.stroke();
        g.clip();
        g.fillStyle = INK;
        g.beginPath();
        g.arc(px, py, pr, 0, Math.PI * 2);
        g.fill();
        // 高光
        g.fillStyle = PAPER;
        g.beginPath();
        g.arc(px + pr * 0.32, py - pr * 0.34, pr * 0.16, 0, Math.PI * 2);
        g.fill();
        g.restore();
      }
      g.restore();
      // 一句话
      const say = smooth(seg(t, T.look + 0.1, T.look + 0.3)) * (1 - smooth(seg(t, T.dive, T.dive + 0.12)));
      if (say > 0) {
        g.fillStyle = rgba(DIM, say);
        g.font = `${Math.round(u * 0.04)}px "楷体", "KaiTi", "STKaiti", "Kaiti SC", serif`;
        g.textAlign = "center";
        g.textBaseline = "middle";
        g.fillText("……你来了。", cx, cy + eh + u * 0.13);
      }
    },
  };
}

// ———————————————————— dot：一个像素，进化一遍，再缩回一个点 ————————————————————
function dotScene(): Scene {
  const ERA0 = 0.5,
    STEP = 0.11,
    SHRINK = ERA0 + 6 * STEP,
    DOT = SHRINK + 0.24,
    OFF = DOT + 0.26,
    DUR = OFF + 0.08;
  const GREEN = "#3BFF6E";
  let off: HTMLCanvasElement | null = null;
  return {
    dur: DUR,
    end: "#000000",
    cues: [
      { at: 0, name: "wipe" },
      { at: 0.2, name: "cursor" },
      { at: 0.36, name: "cursor" },
      ...[0, 1, 2, 3, 4, 5].map((n) => ({ at: ERA0 + n * STEP, name: "era", n })),
      { at: SHRINK, name: "shrink" },
      { at: OFF, name: "off" },
    ],
    draw(c, t) {
      const { g, W, H, u, cx, cy, from, farFrom, dpr } = c;
      // 黑色按 8 档台阶铺开：方的，一格一格
      const w = Math.ceil(smooth(seg(t, 0, 0.24)) * 8) / 8;
      g.fillStyle = "#000";
      if (w < 1) {
        const s = w * farFrom * 2;
        g.fillRect(from.x - s / 2, from.y - s / 2, s, s);
      } else g.fillRect(0, 0, W, H);
      const px = Math.max(3, Math.round(u / 110));
      const dot = (a = 1) => {
        const glow = g.createRadialGradient(cx, cy, 0, cx, cy, px * 6);
        glow.addColorStop(0, rgba(GREEN, 0.4 * a));
        glow.addColorStop(1, rgba(GREEN, 0));
        g.fillStyle = glow;
        g.fillRect(cx - px * 6, cy - px * 6, px * 12, px * 12);
        g.fillStyle = rgba(GREEN, a);
        g.fillRect(Math.round(cx - px / 2), Math.round(cy - px / 2), px, px);
      };
      if (t < ERA0) {
        // 光标闪两下
        if ((t >= 0.2 && t < 0.3) || (t >= 0.36 && t < ERA0)) dot();
        return;
      }
      if (t >= DOT) {
        if (t < OFF) dot();
        else dot(1 - seg(t, OFF, DUR));
        return;
      }
      // 中间一扇方窗：卡带核心里的那六个时代，一格一个
      const open = Math.ceil(outCubic(seg(t, ERA0, ERA0 + 0.08)) * 6) / 6;
      const Sw = Math.round(u * 0.56 * open);
      if (Sw < px) return dot();
      const Sp = Math.round(Sw * dpr);
      if (!off) off = document.createElement("canvas");
      if (off.width !== Sp) off.width = off.height = Sp;
      const o = off.getContext("2d")!;
      o.setTransform(1, 0, 0, 1, 0, 0);
      o.fillStyle = "#000";
      o.fillRect(0, 0, Sp, Sp);
      const era = t < SHRINK ? Math.min(5, Math.floor((t - ERA0) / STEP)) : -2;
      const shrink = smooth(seg(t, SHRINK, DOT - 0.02));
      o.save();
      drawEra(o, Sp, Sp / 2, Sp / 2, era, t * 2, shrink);
      o.restore();
      // 换代时白闪一下
      const since = t < SHRINK ? (t - ERA0) % STEP : 1;
      if (since < 0.05) {
        o.fillStyle = `rgba(255,255,255,${0.7 * (1 - since / 0.05)})`;
        o.fillRect(0, 0, Sp, Sp);
      }
      const x = Math.round(cx - Sw / 2),
        y = Math.round(cy - Sw / 2);
      // 缩回去时，窗户本身也跟着收成一个点
      const k = t < SHRINK ? 1 : 1 - shrink;
      const s = Math.max(px, Math.round(Sw * (0.25 + 0.75 * k)));
      g.imageSmoothingEnabled = era === 2 || era === 3 ? false : true;
      g.globalAlpha = 0.2 + 0.8 * k;
      g.drawImage(off, Math.round(cx - s / 2), Math.round(cy - s / 2), s, s);
      g.globalAlpha = 1;
      g.imageSmoothingEnabled = true;
      if (t < SHRINK) {
        g.strokeStyle = rgba(GREEN, 0.5);
        g.lineWidth = 1;
        g.strokeRect(x - 4.5, y - 4.5, Sw + 9, Sw + 9);
      }
    },
  };
}

function solidScene(item: Item): Scene {
  return {
    dur: 0.8,
    end: item.color,
    cues: [],
    draw({ g, from, farFrom }, t) {
      g.fillStyle = item.color;
      g.beginPath();
      g.arc(from.x, from.y, smooth(seg(t, 0, 0.8)) * farFrom * 1.05, 0, Math.PI * 2);
      g.fill();
    },
  };
}

function sceneFor(item: Item): Scene {
  switch (item.core) {
    case "beat":
      return beatScene(item);
    case "stay":
      return stayScene();
    case "dot":
      return dotScene();
    default:
      return solidScene(item);
  }
}

export function playLaunch(canvas: HTMLCanvasElement, item: Item, from: { x: number; y: number }, reduced: boolean, cue: LaunchCue = () => {}) {
  return new Promise<void>((resolve) => {
    if (reduced) return resolve();
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const W = innerWidth,
      H = innerHeight;
    canvas.width = Math.round(W * dpr);
    canvas.height = Math.round(H * dpr);
    canvas.classList.add("on");
    const g = canvas.getContext("2d")!;
    const scene = sceneFor(item);
    const c: Ctx = {
      g,
      W,
      H,
      u: Math.min(W, H),
      cx: W / 2,
      cy: H / 2,
      far: Math.hypot(W, H) / 2,
      from,
      farFrom: Math.hypot(Math.max(from.x, W - from.x), Math.max(from.y, H - from.y)),
      item,
      dpr,
    };
    const cues = scene.cues.slice().sort((a, b) => a.at - b.at);
    let next = 0;
    // 调试 / 截帧用：?launchT=秒 固定在某一帧
    const freeze = Number(new URLSearchParams(location.search).get("launchT"));
    const t0 = performance.now();
    const frame = (now: number) => {
      const t = Number.isFinite(freeze) && freeze > 0 ? freeze : (now - t0) / 1000;
      while (next < cues.length && cues[next].at <= t) {
        cue(cues[next].name, cues[next].n);
        next++;
      }
      g.setTransform(dpr, 0, 0, dpr, 0, 0);
      g.globalCompositeOperation = "source-over";
      g.globalAlpha = 1;
      g.clearRect(0, 0, W, H);
      if (t >= scene.dur) {
        // 最后一帧：游戏首屏的底色，跳过去不会闪
        g.fillStyle = scene.end;
        g.fillRect(0, 0, W, H);
        return resolve();
      }
      scene.draw(c, t);
      requestAnimationFrame(frame);
    };
    requestAnimationFrame(frame);
  });
}

export function hideLaunch(canvas: HTMLCanvasElement) {
  canvas.classList.remove("on");
  canvas.getContext("2d")?.clearRect(0, 0, canvas.width, canvas.height);
}
