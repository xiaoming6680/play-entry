// stay · 别关我：一只极简的眼睛。选中时追着指针看；盯太久会害羞地移开；被翻走时追着你看。
import { inWell, plate, rgba, type Core } from "./common";

export function stayCore(): Core {
  let px = 0,
    py = 0; // 瞳孔（平滑后）
  let open = 0.3;
  let nextBlink = 2 + Math.random() * 3;
  let blinkAt = -1;
  let still = 0; // 指针停在正中多久
  let shyUntil = -1;
  let lastLook: { x: number; y: number } | null = null;
  let leaveT = -1,
    leaveDir = 0;
  return {
    draw(g, S, s, item) {
      const dark = s.theme === "dark";
      const paper = dark ? "#16181B" : "#F4F1EA";
      const ink = dark ? "#ECE8E0" : "#111111";
      plate(g, S, s.theme, paper);
      const t = s.t;
      const dt = Math.min(0.1, s.dt);

      // —— 目标：睁眼程度与视线 ——
      let wantOpen = s.selected || s.awake ? 1 : 0.28;
      let tx = 0,
        ty = s.selected || s.awake ? 0 : 0.35; // 没选中时半闭、往下看
      if (s.leaving && leaveDir !== s.leaving) {
        leaveDir = s.leaving;
        leaveT = t;
      }
      if (!s.leaving) leaveDir = 0;
      const leaving = leaveDir !== 0 && t - leaveT < 1.6;
      if (s.look && (s.selected || s.awake)) {
        tx = Math.max(-1, Math.min(1, s.look.x));
        ty = Math.max(-1, Math.min(1, s.look.y));
        const moved = lastLook ? Math.hypot(s.look.x - lastLook.x, s.look.y - lastLook.y) : 1;
        if (Math.hypot(tx, ty) < 0.35 && moved < 0.02) still += dt;
        else still = 0;
        lastLook = { ...s.look };
        if (still > 3.2 && shyUntil < t) {
          shyUntil = t + 1.6;
          still = 0;
        }
      }
      if (t < shyUntil) {
        tx = 0.75;
        ty = 0.45;
        wantOpen = 0.7;
      }
      if (leaving) {
        // 你要走了吗：瞪大眼睛看向你翻走的方向
        tx = 0;
        ty = leaveDir > 0 ? 0.9 : -0.9;
        wantOpen = 1.12;
      }
      if (s.reduced) {
        tx = 0;
        ty = 0;
      }
      const k = 1 - Math.exp(-dt * (leaving ? 14 : 9));
      px += (tx - px) * k;
      py += (ty - py) * k;
      open += (wantOpen - open) * (1 - Math.exp(-dt * 6));

      // 眨眼
      let lid = 1;
      if (!s.reduced) {
        if (blinkAt < 0 && t > nextBlink) blinkAt = t;
        if (blinkAt >= 0) {
          const b = (t - blinkAt) / 0.16;
          if (b >= 1) {
            blinkAt = -1;
            nextBlink = t + 2.4 + Math.random() * 3.6;
          } else lid = Math.abs(1 - 2 * b);
        }
      }
      const h = open * lid;

      inWell(
        g,
        S,
        (c, R) => {
          const w = R * 0.62;
          const eh = R * 0.36 * h;
          g.lineJoin = "round";
          g.lineCap = "round";
          // 瞳孔（裁在眼眶里）
          g.save();
          g.beginPath();
          g.moveTo(c - w, c);
          g.quadraticCurveTo(c, c - eh * 2, c + w, c);
          g.quadraticCurveTo(c, c + eh * 2, c - w, c);
          g.closePath();
          g.clip();
          const ix = c + px * w * 0.48,
            iy = c + py * eh * 0.55;
          g.beginPath();
          g.arc(ix, iy, R * 0.22, 0, Math.PI * 2);
          g.lineWidth = S * 0.012;
          g.strokeStyle = ink;
          g.stroke();
          g.beginPath();
          g.arc(ix, iy, R * 0.105, 0, Math.PI * 2);
          g.fillStyle = ink;
          g.fill();
          g.beginPath();
          g.arc(ix + R * 0.045, iy - R * 0.05, R * 0.03, 0, Math.PI * 2);
          g.fillStyle = paper;
          g.fill();
          g.restore();
          // 眼眶
          g.beginPath();
          g.moveTo(c - w, c);
          g.quadraticCurveTo(c, c - eh * 2, c + w, c);
          g.quadraticCurveTo(c, c + eh * 2, c - w, c);
          g.closePath();
          g.lineWidth = S * 0.02;
          g.strokeStyle = ink;
          g.stroke();
          // 害羞 / 挽留时的一点情绪粉
          const blush = t < shyUntil ? 1 : leaving ? 0.6 : 0;
          if (blush > 0) {
            for (const sx of [-1, 1]) {
              const gx = c + sx * w * 0.78,
                gy = c + R * 0.42;
              const grad = g.createRadialGradient(gx, gy, 0, gx, gy, R * 0.2);
              grad.addColorStop(0, rgba(item.color2, 0.55 * blush));
              grad.addColorStop(1, rgba(item.color2, 0));
              g.fillStyle = grad;
              g.fillRect(gx - R * 0.2, gy - R * 0.2, R * 0.4, R * 0.4);
            }
          }
        },
        dark ? 0.45 : 0.12,
      );
    },
  };
}
