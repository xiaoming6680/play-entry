// dot · 从一个点开始：磨砂时只有一个像素；读取时随读卡头一层层进化：
// 终端 → 黑白矢量 → 8-bit → 16-bit → 辉光 → 3D；清晰后停在 3D，再缩回一个点重新开始。
import { inWell, MONO, plate, type Core } from "./common";

const ERA_TIME = 1.5;
const HOLD_3D = 4.5;

export function dotCore(): Core {
  let era = -1;
  let flashT = -10;
  let clearSince = -1;
  const core: Core = {
    draw(g, S, s) {
      plate(g, S, s.theme, "#020403");
      // —— 现在该是哪个时代 ——
      let next = -1;
      let local = 0; // 本时代内的秒数
      let shrink = 0;
      if (s.reduced) {
        next = s.selected && s.clarity > 0.5 ? 5 : -1;
      } else if (s.reading && s.reveal < 1) {
        next = Math.min(5, Math.floor(s.reveal * 6));
        local = s.t;
        clearSince = -1;
      } else if (s.selected && s.clarity > 0.98) {
        if (clearSince < 0) clearSince = s.t;
        const cycle = HOLD_3D + 0.5 + 0.9 + ERA_TIME * 5;
        const x = (s.t - clearSince) % cycle;
        if (x < HOLD_3D) next = 5;
        else if (x < HOLD_3D + 0.5) {
          next = -2;
          shrink = (x - HOLD_3D) / 0.5;
        } else if (x < HOLD_3D + 1.4) next = -1;
        else next = Math.min(4, Math.floor((x - HOLD_3D - 1.4) / ERA_TIME));
        local = s.t;
      } else {
        clearSince = -1;
      }
      if (next !== era) {
        if (next >= 0 && s.selected) {
          flashT = s.t;
          core.onEra?.(next);
        }
        era = next;
      }
      inWell(
        g,
        S,
        (c, R) => {
          const L = c - R,
            T = c - R,
            W = 2 * R;
          switch (era) {
            case 0:
              terminal(g, S, c, R, local);
              break;
            case 1:
              vector(g, S, c, R, local);
              break;
            case 2:
              bit8(g, L, T, W, local);
              break;
            case 3:
              bit16(g, L, T, W, c, R, local);
              break;
            case 4:
              glow(g, c, R, local);
              break;
            case 5:
              cube3d(g, S, c, R, local, 1);
              break;
            case -2:
              cube3d(g, S, c, R, local, 1 - shrink);
              break;
            default:
              pixel(g, S, c, s.t, s.reduced);
          }
          const f = 1 - (s.t - flashT) / 0.14;
          if (f > 0) {
            g.fillStyle = `rgba(255,255,255,${0.75 * f})`;
            g.fillRect(L, T, W, W);
          }
        },
        0.4,
      );
    },
  };
  return core;
}

function pixel(g: CanvasRenderingContext2D, S: number, c: number, t: number, reduced: boolean) {
  const p = S * 0.042 * (reduced ? 1 : 1 + 0.12 * Math.sin(t * 2.4));
  const glow = g.createRadialGradient(c, c, 0, c, c, S * 0.2);
  glow.addColorStop(0, "rgba(59,255,110,0.55)");
  glow.addColorStop(1, "rgba(59,255,110,0)");
  g.fillStyle = glow;
  g.fillRect(c - S * 0.2, c - S * 0.2, S * 0.4, S * 0.4);
  g.fillStyle = "#3BFF6E";
  g.fillRect(Math.round(c - p / 2), Math.round(c - p / 2), Math.round(p), Math.round(p));
}

function terminal(g: CanvasRenderingContext2D, S: number, c: number, R: number, t: number) {
  g.fillStyle = "#3BFF6E";
  g.font = `600 ${Math.round(S * 0.068)}px ${MONO}`;
  g.textBaseline = "middle";
  const x = c - R * 0.62;
  g.fillText("> DOT.EXE", x, c - R * 0.36);
  g.fillStyle = "rgba(59,255,110,0.6)";
  g.fillText("1 bit", x, c - R * 0.08);
  g.fillStyle = "#3BFF6E";
  g.fillText(">", x, c + R * 0.22);
  if (Math.floor(t * 2.5) % 2 === 0) g.fillRect(x + S * 0.06, c + R * 0.22 - S * 0.032, S * 0.04, S * 0.064);
  g.fillStyle = "rgba(0,0,0,0.28)";
  for (let y = 0; y < S; y += 3) g.fillRect(0, y, S, 1);
}

const tri = (x: number) => 1 - Math.abs(((x % 2) + 2) % 2 - 1) * 2; // -1..1

function vector(g: CanvasRenderingContext2D, S: number, c: number, R: number, t: number) {
  const w = R * 0.62;
  const bx = c + tri(t * 0.9) * w * 0.86;
  const by = c + tri(t * 1.37 + 0.3) * w * 0.6;
  g.strokeStyle = "#EDEDED";
  g.fillStyle = "#EDEDED";
  g.lineWidth = S * 0.008;
  g.setLineDash([S * 0.02, S * 0.02]);
  g.beginPath();
  g.moveTo(c, c - w * 0.8);
  g.lineTo(c, c + w * 0.8);
  g.stroke();
  g.setLineDash([]);
  const ph = R * 0.22;
  const lp = c + (by - c) * 0.8,
    rp = c + (by - c) * 0.65;
  g.fillRect(c - w - S * 0.012, lp - ph / 2, S * 0.022, ph);
  g.fillRect(c + w - S * 0.01, rp - ph / 2, S * 0.022, ph);
  g.fillRect(bx - S * 0.014, by - S * 0.014, S * 0.028, S * 0.028);
  g.font = `600 ${Math.round(S * 0.06)}px ${MONO}`;
  g.textAlign = "center";
  g.fillText("1", c - w * 0.4, c - w * 0.62);
  g.fillText("0", c + w * 0.4, c - w * 0.62);
  g.textAlign = "start";
}

// NES 风格：32×32 像素网格
function bit8(g: CanvasRenderingContext2D, L: number, T: number, W: number, t: number) {
  const u = W / 32;
  const px = (x: number, y: number, w: number, h: number, col: string) => {
    g.fillStyle = col;
    g.fillRect(Math.floor(L + x * u), Math.floor(T + y * u), Math.ceil(w * u), Math.ceil(h * u));
  };
  px(0, 0, 32, 32, "#5C94FC");
  // 云
  px(5, 6, 6, 2, "#FCFCFC");
  px(6, 5, 4, 1, "#FCFCFC");
  px(21, 8, 5, 2, "#FCFCFC");
  // 问号砖
  px(19, 12, 4, 4, "#F8B800");
  px(20, 13, 2, 1, "#C84C0C");
  px(21, 14, 1, 1, "#C84C0C");
  // 地面砖
  for (let y = 22; y < 32; y += 2)
    for (let x = (y / 2) % 2 ? -2 : 0; x < 32; x += 4) {
      px(x, y, 4, 2, "#C84C0C");
      px(x, y, 4, 0.34, "#FCBCB0");
      px(x + 3.66, y, 0.34, 2, "#000000");
    }
  // 小人（走两步）
  const step = Math.floor(t * 5) % 2;
  const sx = 9 + (Math.floor(t * 5) % 8) * 0.5;
  const m = ["..RRR...", ".RRRRRR.", ".KKSSK..", "KSKSSSK.", ".SSSSS..", ".RRBRR..", "RRRBBRRR", step ? ".BB..BB." : "..BBBB.."];
  const pal: Record<string, string> = { R: "#D82800", K: "#000000", S: "#FCA044", B: "#2038EC" };
  m.forEach((row, y) => [...row].forEach((ch, x) => ch !== "." && px(sx + x, 14 + y, 1, 1, pal[ch])));
}

function bit16(g: CanvasRenderingContext2D, L: number, T: number, W: number, c: number, R: number, t: number) {
  const sky = g.createLinearGradient(0, T, 0, T + W);
  sky.addColorStop(0, "#2A1B6E");
  sky.addColorStop(0.55, "#C2577E");
  sky.addColorStop(0.75, "#F59B6B");
  g.fillStyle = sky;
  g.fillRect(L, T, W, W);
  // 太阳（带扫描缝）
  g.fillStyle = "#FFD27A";
  g.beginPath();
  g.arc(c, c + R * 0.12, R * 0.38, Math.PI, 0);
  g.fill();
  g.fillStyle = "#C2577E";
  for (let i = 0; i < 4; i++) g.fillRect(c - R * 0.4, c + R * (0.02 - i * 0.07), R * 0.8, R * 0.022 * (i + 1));
  const hills = (base: number, amp: number, freq: number, speed: number, col: string) => {
    g.fillStyle = col;
    g.beginPath();
    g.moveTo(L, T + W);
    for (let x = 0; x <= W; x += W / 40) g.lineTo(L + x, c + base * R - amp * R * (0.5 + 0.5 * Math.sin(x / W * freq + t * speed)));
    g.lineTo(L + W, T + W);
    g.fill();
  };
  hills(0.3, 0.22, 7, 0.6, "#5B2B6E");
  hills(0.5, 0.18, 11, 1.3, "#2E1A47");
  hills(0.7, 0.1, 17, 2.4, "#140B24");
}

function glow(g: CanvasRenderingContext2D, c: number, R: number, t: number) {
  g.fillStyle = "#04050A";
  g.fillRect(c - R, c - R, 2 * R, 2 * R);
  g.globalCompositeOperation = "lighter";
  const cols = ["#3BFF6E", "#FFD23B", "#FF3DF0", "#3BC8FF"];
  for (let i = 0; i < 42; i++) {
    const k = i / 42;
    const a = t * (0.6 + k * 0.9) + i * 2.4;
    const rx = R * (0.18 + 0.62 * ((i * 0.61803) % 1));
    const x = c + Math.cos(a) * rx;
    const y = c + Math.sin(a) * rx * 0.55 + Math.sin(t + i) * R * 0.05;
    const r = R * (0.04 + 0.05 * ((i * 0.37) % 1));
    const grad = g.createRadialGradient(x, y, 0, x, y, r);
    grad.addColorStop(0, cols[i % 4]);
    grad.addColorStop(1, "rgba(0,0,0,0)");
    g.fillStyle = grad;
    g.fillRect(x - r, y - r, r * 2, r * 2);
  }
  g.globalCompositeOperation = "source-over";
}

function cube3d(g: CanvasRenderingContext2D, S: number, c: number, R: number, t: number, scale: number) {
  const bg = g.createLinearGradient(0, c - R, 0, c + R);
  bg.addColorStop(0, "#050914");
  bg.addColorStop(1, "#0B1A22");
  g.fillStyle = bg;
  g.fillRect(c - R, c - R, 2 * R, 2 * R);
  if (scale <= 0.02) return;
  // 透视地面网格
  g.strokeStyle = "rgba(59,255,180,0.18)";
  g.lineWidth = S * 0.004;
  const hz = c + R * 0.18;
  for (let i = -6; i <= 6; i++) {
    g.beginPath();
    g.moveTo(c + i * R * 0.04, hz);
    g.lineTo(c + i * R * 0.34, c + R);
    g.stroke();
  }
  for (let j = 1; j < 7; j++) {
    const y = hz + (c + R - hz) * (j / 7) ** 1.8;
    g.beginPath();
    g.moveTo(c - R, y);
    g.lineTo(c + R, y);
    g.stroke();
  }
  const yaw = t * 0.9,
    pitch = 0.55 + 0.15 * Math.sin(t * 0.7);
  const s = R * 0.3 * scale;
  const V = [-1, 1].flatMap((x) => [-1, 1].flatMap((y) => [-1, 1].map((z) => [x, y, z])));
  const P = V.map(([x, y, z]) => {
    const x1 = x * Math.cos(yaw) - z * Math.sin(yaw),
      z1 = x * Math.sin(yaw) + z * Math.cos(yaw);
    const y1 = y * Math.cos(pitch) - z1 * Math.sin(pitch),
      z2 = y * Math.sin(pitch) + z1 * Math.cos(pitch);
    const f = 4 / (4 + z2);
    return { x: c + x1 * s * f, y: c - R * 0.08 - y1 * s * f, z: z2, rx: x1, ry: y1 };
  });
  const faces = [
    [0, 1, 3, 2],
    [4, 6, 7, 5],
    [0, 4, 5, 1],
    [2, 3, 7, 6],
    [0, 2, 6, 4],
    [1, 5, 7, 3],
  ];
  // 只画朝向观察者的面：立方体以原点为中心，面中心就是外法线方向；观察者在 z = -4
  const lit = faces
    .map((f) => {
      const cx = f.reduce((m, i) => m + P[i].rx, 0) / 4,
        cy = f.reduce((m, i) => m + P[i].ry, 0) / 4,
        cz = f.reduce((m, i) => m + P[i].z, 0) / 4;
      const facing = cx * -cx + cy * -cy + cz * (-4 - cz);
      // 光从左上前方来
      const light = (-0.5 * cx + 0.7 * cy - 0.5 * cz) / Math.hypot(cx, cy, cz);
      return { f, z: cz, facing, light };
    })
    .filter((x) => x.facing > 0)
    .sort((a, b) => b.z - a.z);
  for (const { f, light } of lit) {
    const shade = 0.5 + 0.45 * Math.max(0, light);
    g.beginPath();
    f.forEach((i, k) => (k ? g.lineTo(P[i].x, P[i].y) : g.moveTo(P[i].x, P[i].y)));
    g.closePath();
    g.fillStyle = `rgba(${Math.round(40 * shade)},${Math.round(230 * shade)},${Math.round(170 * shade)},0.92)`;
    g.fill();
    g.strokeStyle = "#B8FFE0";
    g.lineWidth = S * 0.006;
    g.stroke();
  }
}
