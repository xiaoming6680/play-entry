// beat · 节拍幸存者：跟着 BPM 脉动的霓虹同心环；底鼓推出冲击环，反拍踩镲让外圈刻度闪。
import { beatOf, inWell, plate, rgba, type Core } from "./common";

export function beatCore(): Core {
  return {
    draw(g, S, s, item) {
      const bpm = Number(item.coreOptions.bpm) || 128;
      const b = s.reduced ? { phase: 0.18, period: 60 / bpm, count: 0 } : beatOf(s, bpm);
      const ph = b.phase;
      const bar = Math.floor(b.count / 4);
      const swap = Math.floor(bar / 4) % 2 === 1;
      const A = swap ? item.color2 : item.color;
      const B = swap ? item.color : item.color2;
      const bg = g.createRadialGradient(S / 2, S / 2, 0, S / 2, S / 2, S * 0.45);
      bg.addColorStop(0, "#1A0B26");
      bg.addColorStop(1, "#07040C");
      plate(g, S, s.theme, bg);
      inWell(
        g,
        S,
        (c, R) => {
          g.globalCompositeOperation = "lighter";
          g.lineCap = "round";
          // 一团跟着底鼓呼吸的光：磨砂时看到的就是它
          const kick0 = Math.exp(-ph * 4);
          const glow = g.createRadialGradient(c, c, 0, c, c, R);
          glow.addColorStop(0, rgba(A, 0.5 + 0.35 * kick0));
          glow.addColorStop(0.45, rgba(B, 0.22 + 0.2 * kick0));
          glow.addColorStop(1, rgba(B, 0.05));
          g.fillStyle = glow;
          g.fillRect(c - R, c - R, 2 * R, 2 * R);
          // 底鼓：从中心推出的冲击环
          const kick = Math.exp(-ph * 5);
          const sw = (0.12 + ph * 0.95) * R;
          g.beginPath();
          g.arc(c, c, sw, 0, Math.PI * 2);
          g.strokeStyle = rgba(A, 0.55 * (1 - ph) ** 2);
          g.lineWidth = S * (0.035 * (1 - ph) + 0.006);
          g.stroke();
          // 四圈同心环，按距离依次亮起
          const radii = [0.2, 0.35, 0.5, 0.65];
          radii.forEach((k, i) => {
            const e = Math.exp(-Math.max(0, ph - i * 0.06) * 6);
            const col = i % 2 ? B : A;
            const lw = S * 0.016;
            g.beginPath();
            g.arc(c, c, k * R, 0, Math.PI * 2);
            g.strokeStyle = rgba(col, 0.1 + 0.22 * e);
            g.lineWidth = lw * 5;
            g.stroke();
            g.strokeStyle = rgba(col, 0.45 + 0.55 * e);
            g.lineWidth = lw * (0.8 + 0.6 * e);
            g.stroke();
          });
          // 外圈 32 根频谱刻度；反拍时闪
          const hat = Math.exp(-Math.abs(ph - 0.5) * 14);
          for (let i = 0; i < 32; i++) {
            const a = (i / 32) * Math.PI * 2 - Math.PI / 2;
            const spec =
              0.5 + 0.5 * Math.sin(i * 1.71 + s.t * 2.6) * Math.cos(i * 0.53 - s.t * 1.3);
            const len = (0.04 + 0.14 * spec * (0.45 + 0.55 * kick) + 0.05 * hat) * R;
            const r0 = 0.76 * R;
            g.beginPath();
            g.moveTo(c + Math.cos(a) * r0, c + Math.sin(a) * r0);
            g.lineTo(c + Math.cos(a) * (r0 + len), c + Math.sin(a) * (r0 + len));
            g.strokeStyle = rgba(i % 4 === 0 ? A : B, 0.35 + 0.5 * hat + 0.15 * spec);
            g.lineWidth = S * 0.011;
            g.stroke();
          }
          // 中心
          const core = g.createRadialGradient(c, c, 0, c, c, R * 0.16);
          core.addColorStop(0, rgba("#FFFFFF", 0.6 + 0.4 * kick));
          core.addColorStop(0.35, rgba(A, 0.7 * kick + 0.2));
          core.addColorStop(1, rgba(A, 0));
          g.fillStyle = core;
          g.beginPath();
          g.arc(c, c, R * 0.16, 0, Math.PI * 2);
          g.fill();
          g.globalCompositeOperation = "source-over";
        },
        0.5,
      );
    },
  };
}
