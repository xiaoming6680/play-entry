// 空白卡带「下一盒」、通用核心（新游戏不写代码也能用）、彩蛋卡带「入口本身」
import { beatOf, inWell, MONO, plate, rgba, type Core } from "./common";

export function blankCore(): Core {
  return {
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
          g.fillText("NO DATA", c, c + R * 0.78);
          g.textAlign = "start";
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

/** 彩蛋：卡带里装着一盒小卡带，小卡带里有一个红点 */
export function secretCore(): Core {
  return {
    draw(g, S, s) {
      plate(g, S, s.theme, "#0C0E12");
      inWell(g, S, (c, R) => {
        const turn = s.reduced ? 0.6 : Math.cos(s.t * 0.8);
        const w = R * 0.5 * Math.max(0.08, Math.abs(turn)),
          h = R * 0.6;
        const x0 = c - w,
          y0 = c - h,
          ch = Math.min(w, h) * 0.3;
        g.strokeStyle = "#E8EBEE";
        g.lineWidth = S * 0.012;
        g.lineJoin = "round";
        g.beginPath();
        const right = turn >= 0;
        g.moveTo(x0, y0);
        g.lineTo(right ? x0 + 2 * w - ch : x0 + 2 * w, y0);
        if (right) g.lineTo(x0 + 2 * w, y0 + ch);
        g.lineTo(x0 + 2 * w, y0 + 2 * h);
        g.lineTo(x0, y0 + 2 * h);
        g.closePath();
        g.stroke();
        g.fillStyle = "#FF3B2F";
        g.beginPath();
        g.arc(c, c - h * 0.25, Math.min(w, R * 0.12), 0, Math.PI * 2);
        g.fill();
        g.globalCompositeOperation = "lighter";
        for (let i = 0; i < 18; i++) {
          const a = s.t * 0.7 + i * 0.35;
          const x = c + Math.cos(a) * R * 0.82,
            y = c + Math.sin(a) * R * 0.82;
          g.fillStyle = `rgba(255,59,47,${0.15 + 0.6 * (i / 18)})`;
          g.fillRect(x - 1.5, y - 1.5, 3, 3);
        }
        g.globalCompositeOperation = "source-over";
      });
    },
  };
}
