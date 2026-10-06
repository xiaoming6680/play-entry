// 空白卡带「下一盒」、通用核心（新游戏不写代码也能用）、彩蛋卡带「入口本身」
import { beatOf, inWell, MONO, plate, rgba, type Core } from "./common";
import { doodle } from "./doodle";

const NO_DATA = ["NO DATA", "NO DATA", "NO DATA", "STILL NO DATA", "STILL NO DATA", "REALLY.", "…OK FINE"];

export function blankCore(): Core {
  // 彩蛋：连点 7 下，"真的什么都没有……好吧"，然后可以在里面画画
  let pokes = 0;
  const ripples: { u: number; v: number; t: number }[] = [];
  return {
    poke(u, v, t) {
      pokes++;
      ripples.push({ u, v, t });
      if (ripples.length > 8) ripples.shift();
      return pokes;
    },
    draw(g, S, s) {
      const dark = s.theme === "dark";
      plate(g, S, s.theme, dark ? "#1B2129" : "#CBD2D9");
      inWell(
        g,
        S,
        (c, R) => {
          const ink = dark ? "rgba(220,226,232,0.55)" : "rgba(40,48,58,0.45)";
          g.strokeStyle = ink;
          g.lineWidth = S * 0.008;
          g.setLineDash([S * 0.022, S * 0.018]);
          g.lineDashOffset = s.reduced ? 0 : -s.t * S * 0.02;
          g.beginPath();
          g.arc(c, c, R * 0.58, 0, Math.PI * 2);
          g.stroke();
          g.setLineDash([]);
          const blink = s.reduced ? 1 : 0.35 + 0.65 * (0.5 + 0.5 * Math.cos(s.t * 2.2));
          g.strokeStyle = dark ? `rgba(230,236,242,${blink})` : `rgba(20,26,34,${blink * 0.8})`;
          g.lineWidth = S * 0.016;
          g.lineCap = "round";
          g.beginPath();
          g.moveTo(c - R * 0.14, c);
          g.lineTo(c + R * 0.14, c);
          g.moveTo(c, c - R * 0.14);
          g.lineTo(c, c + R * 0.14);
          g.stroke();
          g.fillStyle = ink;
          g.font = `600 ${Math.round(S * 0.042)}px ${MONO}`;
          g.textAlign = "center";
          const on = doodle.enabled;
          g.fillText(on ? (doodle.has ? "" : "DRAW HERE") : NO_DATA[Math.min(pokes, NO_DATA.length - 1)], c, c + R * 0.78);
          g.textAlign = "start";
          for (const r of ripples) {
            const k = (s.t - r.t) / 0.7;
            if (k < 0 || k > 1) continue;
            g.strokeStyle = dark ? `rgba(230,236,242,${0.6 * (1 - k)})` : `rgba(20,26,34,${0.5 * (1 - k)})`;
            g.lineWidth = S * 0.006;
            g.beginPath();
            g.arc(r.u * S, r.v * S, S * (0.02 + 0.12 * k), 0, Math.PI * 2);
            g.stroke();
          }
          if (on && doodle.has) {
            // 有画就盖住虚线圈和十字，只留画
            g.fillStyle = dark ? "#1B2129" : "#CBD2D9";
            g.fillRect(c - R, c - R, 2 * R, 2 * R);
          }
          if (doodle.has) g.drawImage(doodle.canvas, 0, 0, S, S);
        },
        0.18,
      );
    },
  };
}

export function genericCore(): Core {
  return {
    draw(g, S, s, item) {
      const bpm = Number(item.coreOptions.pulse) || 0;
      const env = bpm && !s.reduced ? Math.exp(-beatOf(s, bpm).phase * 4) : 0.5 + 0.5 * Math.sin(s.t * 1.4);
      plate(g, S, s.theme, "#0A0C10");
      inWell(g, S, (c, R) => {
        g.globalCompositeOperation = "lighter";
        const halo = g.createRadialGradient(c, c, 0, c, c, R);
        halo.addColorStop(0, rgba(item.color, 0.35 + 0.25 * env));
        halo.addColorStop(1, rgba(item.color, 0));
        g.fillStyle = halo;
        g.fillRect(c - R, c - R, 2 * R, 2 * R);
        for (let i = 0; i < 48; i++) {
          const a = (i / 48) * Math.PI * 2 + (s.reduced ? 0 : s.t * 0.25);
          g.strokeStyle = rgba(i % 6 ? item.color2 : item.color, 0.5);
          g.lineWidth = S * 0.006;
          g.beginPath();
          g.moveTo(c + Math.cos(a) * R * 0.8, c + Math.sin(a) * R * 0.8);
          g.lineTo(c + Math.cos(a) * R * (i % 6 ? 0.86 : 0.92), c + Math.sin(a) * R * (i % 6 ? 0.86 : 0.92));
          g.stroke();
        }
        g.fillStyle = "#FFFFFF";
        g.shadowColor = item.color;
        g.shadowBlur = S * 0.05;
        g.font = `800 ${Math.round(R * 0.8)}px "PingFang SC","Microsoft YaHei",sans-serif`;
        g.textAlign = "center";
        g.textBaseline = "middle";
        g.fillText(item.glyph, c, c + R * 0.04);
        g.shadowBlur = 0;
        g.textAlign = "start";
        g.globalCompositeOperation = "source-over";
      });
    },
  };
}

/** 彩蛋「入口本身」：卡带里装着一盒小卡带，小卡带里还有一盒……点一下钻进去一层，最里面是一个红点 */
export const DIVE_MAX = 6;
export function secretCore(): Core {
  let depth = 0; // 目标层数
  let z = 0; // 平滑后的层数
  const K = 0.36; // 里面那盒相对外面的大小
  return {
    poke() {
      if (depth < DIVE_MAX) depth++;
      else depth = 0; // 到底了再点：浮回最外层
      return depth;
    },
    draw(g, S, s) {
      plate(g, S, s.theme, "#0C0E12");
      z += (depth - z) * (s.reduced ? 1 : 1 - Math.exp(-Math.min(0.1, s.dt) * (depth < z ? 3 : 4.5)));
      inWell(g, S, (c, R) => {
        // 背景：一圈慢慢转的红色光点
        g.globalCompositeOperation = "lighter";
        for (let i = 0; i < 18; i++) {
          const a = s.t * 0.7 + i * 0.35;
          const x = c + Math.cos(a) * R * 0.86,
            y = c + Math.sin(a) * R * 0.86;
          g.fillStyle = `rgba(255,59,47,${0.15 + 0.6 * (i / 18)})`;
          g.fillRect(x - 1.5, y - 1.5, 3, 3);
        }
        g.globalCompositeOperation = "source-over";
        // 第 L 层的卡带大小 = 基准 × K^(L - z)；只画看得见的几层
        const base = R * 0.62;
        const sway = s.reduced ? 0 : Math.sin(s.t * 0.8) * 0.06;
        const L0 = Math.max(0, Math.floor(z) - 1);
        for (let L = L0; L <= Math.min(DIVE_MAX, L0 + 5); L++) {
          const h = base * Math.pow(K, L - z);
          if (h > R * 8 || h < 1.5) continue;
          const last = L === DIVE_MAX;
          const w = h * 0.84;
          g.save();
          g.translate(c, c + h * 0.05);
          g.rotate(sway * (L % 2 ? -1 : 1));
          const x0 = -w,
            y0 = -h,
            ch = w * 0.34;
          g.strokeStyle = L % 2 ? "#FF3B2F" : "#E8EBEE";
          g.lineWidth = Math.max(1, Math.min(S * 0.012, h * 0.03));
          g.lineJoin = "round";
          g.beginPath();
          g.moveTo(x0, y0);
          g.lineTo(x0 + 2 * w - ch, y0);
          g.lineTo(x0 + 2 * w, y0 + ch);
          g.lineTo(x0 + 2 * w, y0 + 2 * h);
          g.lineTo(x0, y0 + 2 * h);
          g.closePath();
          g.stroke();
          // 贴签
          g.globalAlpha = 0.5;
          g.fillStyle = g.strokeStyle;
          g.fillRect(x0 + w * 0.18, y0 + h * 1.66, w * 0.7, h * 0.08);
          g.globalAlpha = 1;
          if (last) {
            // 最里面：开场那个红点
            g.fillStyle = "#FF3B2F";
            g.shadowColor = "#FF3B2F";
            g.shadowBlur = h * 0.3;
            g.beginPath();
            g.arc(0, -h * 0.05, h * 0.3 * (s.reduced ? 1 : 1 + 0.06 * Math.sin(s.t * 3)), 0, Math.PI * 2);
            g.fill();
            g.shadowBlur = 0;
          }
          g.restore();
        }
        // 层数
        g.fillStyle = "rgba(232,235,238,0.75)";
        g.font = `600 ${Math.round(S * 0.036)}px ${MONO}`;
        g.textAlign = "center";
        g.fillText(depth ? `LAYER ${depth} / ${DIVE_MAX}` : "TAP TO ENTER", c, c + R * 0.9 - S * 0.02);
        g.textAlign = "start";
      });
    },
  };
}
