/*
 * 正文同步解密：按文字的每一行盖一条墨块，读卡头扫过时依次滑走。
 * 改编自 RhineLabUI 的 src/document-decryption.ts（https://github.com/LBEILC/RhineLabUI）
 * Copyright (c) 2026 LBEILC — MIT License，全文见 public/licenses/RhineLabUI-MIT.txt
 * 改动：墨块颜色改为该游戏的主题色；进度改由读卡头直接驱动；去掉舞台缩放换算。
 */

type Cover = { win: HTMLElement; ink: HTMLElement; order: number };

export class Redactor {
  private covers: Cover[] = [];
  private targets: HTMLElement[] = [];

  /** 先全部测量、再统一插入遮挡，避免每段都触发一次排版 */
  cover(targets: HTMLElement[], color: string) {
    this.clear();
    this.targets = targets;
    const measured: { t: HTMLElement; width: number; lines: { x: number; y: number; r: number; b: number }[] }[] = [];
    for (const t of targets) {
      t.classList.add("redacting");
      const box = t.getBoundingClientRect();
      if (!box.width) continue;
      const lines: { x: number; y: number; r: number; b: number }[] = [];
      const walker = document.createTreeWalker(t, NodeFilter.SHOW_TEXT);
      let node: Node | null;
      while ((node = walker.nextNode())) {
        if (!node.textContent?.trim()) continue;
        const range = document.createRange();
        range.selectNodeContents(node);
        for (const r of range.getClientRects()) {
          if (!r.width || !r.height) continue;
          const x = r.left - box.left,
            y = r.top - box.top,
            rr = r.right - box.left,
            b = r.bottom - box.top;
          const line = lines.find((l) => Math.abs(l.y - y) < 6);
          if (line) {
            line.x = Math.min(line.x, x);
            line.y = Math.min(line.y, y);
            line.r = Math.max(line.r, rr);
            line.b = Math.max(line.b, b);
          } else lines.push({ x, y, r: rr, b });
        }
      }
      measured.push({ t, width: t.clientWidth, lines });
    }
    for (const { t, width, lines } of measured)
      for (const l of lines) {
        const win = document.createElement("span");
        win.className = "rd-win";
        win.setAttribute("aria-hidden", "true");
        const left = Math.max(0, l.x - 1),
          right = Math.min(width, l.r + 1);
        win.style.cssText = `left:${left}px;top:${l.y + 1}px;width:${right - left}px;height:${l.b - l.y - 2}px`;
        const ink = document.createElement("span");
        ink.className = "rd-ink";
        ink.style.setProperty("--redact", color);
        win.append(ink);
        t.append(win);
        this.covers.push({ win, ink, order: this.covers.length });
      }
  }

  /** p: 0 = 全盖住，1 = 全揭开 */
  paint(p: number) {
    const count = Math.max(1, this.covers.length - 1);
    for (const c of this.covers) {
      const delay = (c.order / count) * 0.3;
      const t = Math.min(1, Math.max(0, (p - delay) / 0.7));
      // 短暂加速、果断离开、长长的减速，不回弹
      const e = t < 0.2 ? 0.4 * (t / 0.2) ** 2 : 1 - 0.6 * ((1 - t) / 0.8) ** (16 / 3);
      c.ink.style.transform = `translateX(${e * 101}%)`;
    }
    if (p >= 1) this.clear();
  }

  clear() {
    for (const c of this.covers) c.win.remove();
    for (const t of this.targets) t.classList.remove("redacting");
    this.covers = [];
    this.targets = [];
  }
}
