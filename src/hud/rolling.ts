// 滚动数字与滚动标题：保持导航方向（翻到下一盒时永远向上滚，循环回 01 也不倒着滚）。

export class RollingDigits {
  private strips: HTMLElement[] = [];
  private pos: number[] = [];
  private timers: number[] = [];

  constructor(
    el: HTMLElement,
    digits = 2,
    private reduced = () => false,
  ) {
    el.textContent = "";
    el.classList.add("rnum");
    el.setAttribute("aria-hidden", "true");
    for (let i = 0; i < digits; i++) {
      const box = document.createElement("span");
      box.className = "rd";
      const strip = document.createElement("span");
      strip.className = "rd-strip";
      for (let k = 0; k < 30; k++) {
        const s = document.createElement("span");
        s.textContent = String(k % 10);
        strip.append(s);
      }
      box.append(strip);
      el.append(box);
      this.strips.push(strip);
      this.pos.push(10);
      this.timers.push(0);
      this.place(i, 10, false);
    }
  }

  private place(i: number, p: number, animate: boolean) {
    const s = this.strips[i];
    s.style.transition = animate ? "transform .46s cubic-bezier(.2,.8,.2,1)" : "none";
    s.style.transform = `translateY(${-p}em)`;
    this.pos[i] = p;
  }

  set(value: number, dir: number) {
    const str = String(Math.max(0, value)).padStart(this.strips.length, "0").slice(-this.strips.length);
    const animate = dir !== 0 && !this.reduced();
    [...str].forEach((ch, i) => {
      const d = Number(ch);
      let p = this.pos[i];
      const cur = ((p % 10) + 10) % 10;
      if (!animate) {
        this.place(i, 10 + d, false);
        return;
      }
      if (d === cur) return;
      if (p < 10 || p > 19) {
        this.place(i, 10 + cur, false);
        void this.strips[i].offsetHeight;
        p = 10 + cur;
      }
      const np = dir > 0 ? p + ((d - cur + 10) % 10) : p - ((cur - d + 10) % 10);
      this.place(i, np, true);
      clearTimeout(this.timers[i]);
      this.timers[i] = window.setTimeout(() => this.place(i, 10 + d, false), 480);
    });
  }
}

export class RollingText {
  private cur: HTMLSpanElement;
  private text = "";

  constructor(
    private el: HTMLElement,
    private reduced = () => false,
  ) {
    el.classList.add("roll");
    el.textContent = "";
    this.cur = document.createElement("span");
    el.append(this.cur);
  }

  set(text: string, dir: number) {
    if (text === this.text) return;
    this.text = text;
    const old = this.cur;
    const next = document.createElement("span");
    next.textContent = text || " ";
    this.cur = next;
    if (!dir || this.reduced() || !old.textContent || !next.animate) {
      old.replaceWith(next);
      return;
    }
    this.el.querySelectorAll(".out").forEach((n) => n.remove());
    old.classList.add("out");
    this.el.append(next);
    const opts = { duration: 460, easing: "cubic-bezier(.2,.8,.2,1)" };
    old
      .animate(
        [
          { transform: "translateY(0)", opacity: 1, filter: "blur(0)" },
          { transform: `translateY(${-dir * 70}%)`, opacity: 0, filter: "blur(3px)" },
        ],
        { ...opts, fill: "forwards" },
      )
      .finished.then(
        () => old.remove(),
        () => old.remove(),
      );
    next.animate(
      [
        { transform: `translateY(${dir * 70}%)`, opacity: 0, filter: "blur(3px)" },
        { transform: "translateY(0)", opacity: 1, filter: "blur(0)" },
      ],
      opts,
    );
  }
}
