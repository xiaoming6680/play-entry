// 插入成功后的转场：屏幕被这个游戏的核心铺满，然后跳转。
import type { Item } from "./types";

export function playLaunch(canvas: HTMLCanvasElement, item: Item, from: { x: number; y: number }, reduced: boolean) {
  return new Promise<void>((resolve) => {
    if (reduced) return resolve();
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const W = innerWidth,
      H = innerHeight;
    canvas.width = W * dpr;
    canvas.height = H * dpr;
    canvas.classList.add("on");
    const g = canvas.getContext("2d")!;
    g.scale(dpr, dpr);
    const far = Math.hypot(Math.max(from.x, W - from.x), Math.max(from.y, H - from.y));
    const t0 = performance.now();
    const D = 820;
    const frame = (now: number) => {
      const p = Math.min(1, (now - t0) / D);
      const e = p * p * (3 - 2 * p);
      g.clearRect(0, 0, W, H);
      switch (item.core) {
        case "beat": {
          g.fillStyle = `rgba(7,4,12,${Math.min(1, e * 1.6)})`;
          g.fillRect(0, 0, W, H);
          g.globalCompositeOperation = "lighter";
          for (let i = 0; i < 7; i++) {
            const k = e * 1.5 - i * 0.12;
            if (k <= 0) continue;
            g.beginPath();
            g.arc(from.x, from.y, k * far, 0, Math.PI * 2);
            g.strokeStyle = i % 2 ? item.color2 : item.color;
            g.globalAlpha = Math.max(0, 1 - k * 0.6);
            g.lineWidth = 6 + 30 * (1 - Math.min(1, k));
            g.stroke();
          }
          g.globalAlpha = 1;
          g.globalCompositeOperation = "source-over";
          break;
        }
        case "stay": {
          g.fillStyle = `rgba(244,241,234,${Math.min(1, e * 1.5)})`;
          g.fillRect(0, 0, W, H);
          const w = W * 0.42 * (0.4 + e),
            h = H * 0.6 * Math.max(0, (e - 0.25) / 0.75);
          g.lineWidth = 3;
          g.strokeStyle = "#111";
          g.beginPath();
          g.moveTo(W / 2 - w, H / 2);
          g.quadraticCurveTo(W / 2, H / 2 - h, W / 2 + w, H / 2);
          g.quadraticCurveTo(W / 2, H / 2 + h, W / 2 - w, H / 2);
          g.stroke();
          if (h > 10) {
            g.fillStyle = "#111";
            g.beginPath();
            g.arc(W / 2, H / 2, Math.min(h * 0.32, H * 0.12), 0, Math.PI * 2);
            g.fill();
          }
          break;
        }
        case "dot": {
          g.fillStyle = `rgba(2,4,3,${Math.min(1, e * 2)})`;
          g.fillRect(0, 0, W, H);
          const step = Math.max(4, Math.round(far * 2 * e ** 2 / 16) * 16);
          g.fillStyle = "#3BFF6E";
          g.fillRect(Math.round(from.x - step / 2), Math.round(from.y - step / 2), step, step);
          break;
        }
        default: {
          g.fillStyle = item.color;
          g.beginPath();
          g.arc(from.x, from.y, e * far * 1.05, 0, Math.PI * 2);
          g.fill();
        }
      }
      if (p < 1) requestAnimationFrame(frame);
      else resolve();
    };
    requestAnimationFrame(frame);
  });
}

export function hideLaunch(canvas: HTMLCanvasElement) {
  canvas.classList.remove("on");
  canvas.getContext("2d")?.clearRect(0, 0, canvas.width, canvas.height);
}
