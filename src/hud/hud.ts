import { DEVICE_LABEL, STATUS_LABEL } from "../data";
import type { Item, Mode, Rect } from "../types";
import { Redactor } from "./redaction";
import { RollingDigits, RollingText } from "./rolling";

const $ = <T extends HTMLElement = HTMLElement>(id: string) => document.getElementById(id) as T;
const LED_COLOR: Record<string, string> = {
  dev: "var(--accent)",
  preview: "var(--warn)",
  live: "var(--ok)",
  paused: "var(--idle)",
  blank: "var(--idle)",
};

export class Hud {
  readonly app = $("app");
  readonly panel = $("panel");
  readonly btnMain = $<HTMLButtonElement>("btn-main");
  readonly btnCopy = $<HTMLButtonElement>("btn-copy");
  readonly btnBack = $<HTMLButtonElement>("btn-back");
  private title: RollingText;
  private en: RollingText;
  private code: RollingText;
  private cur: RollingDigits;
  private tot = $("c-tot");
  private ticks = $("c-ticks");
  private tag = $("p-tag");
  private chips = $("p-chips");
  private fields = $("p-fields");
  private intro = $("p-intro");
  private note = $("p-note");
  private led = $("p-led");
  private mainLbl = $("btn-main-lbl");
  private vf = $("vf");
  private vfTag = $("vf-tag");
  private term = $("term");
  private slotEl = $("slot");
  private toastEl = $("toast");
  private whisperEl = $("whisper");
  private hintEl = $("hint");
  private clockEl = $("clock");
  private recEl = $("rec-time");
  private tempoEl = $("tempo");
  private redactor = new Redactor();
  private vfr: Rect | null = null;
  private toastTimer = 0;
  private whisperTimer = 0;
  private termToken = 0;
  private item: Item | null = null;
  onTick: ((index: number) => void) | null = null;

  constructor(private reduced: () => boolean) {
    this.title = new RollingText($("p-title"), reduced);
    this.en = new RollingText($("p-en"), reduced);
    this.code = new RollingText($("p-code"), reduced);
    this.cur = new RollingDigits($("c-cur"), 2, reduced);
  }

  setMode(mode: Mode) {
    this.app.dataset.mode = mode;
  }

  setItems(items: Item[]) {
    this.tot.textContent = String(items.length).padStart(2, "0");
    this.ticks.textContent = "";
    items.forEach((it, i) => {
      const b = document.createElement("button");
      b.type = "button";
      b.className = "c-tick";
      b.setAttribute("aria-label", `第 ${i + 1} 盒：${it.title}`);
      const dot = document.createElement("i");
      dot.style.setProperty("--tc", it.kind === "blank" ? "var(--line)" : it.color);
      b.append(dot);
      b.addEventListener("click", () => this.onTick?.(i));
      this.ticks.append(b);
    });
  }

  /** 浏览时换到另一盒 */
  setItem(item: Item, index: number, dir: number) {
    this.item = item;
    this.title.set(item.title, dir);
    this.en.set(item.titleEn, dir);
    this.code.set(item.code, dir);
    this.cur.set(index + 1, dir);
    [...this.ticks.children].forEach((c, i) => c.classList.toggle("on", i === index));
    this.tag.textContent = item.tagline;
    this.led.style.setProperty("--led", LED_COLOR[item.status]);
    this.led.classList.toggle("blink", item.status === "dev");
    const statusText = item.kind === "secret" ? "彩蛋" : STATUS_LABEL[item.status];
    this.vfTag.textContent = `${item.code} · ${statusText}`;
    // 标签
    this.chips.textContent = "";
    const chip = (text: string, cls = "") => {
      const c = document.createElement("span");
      c.className = `chip ${cls}`;
      c.textContent = text;
      this.chips.append(c);
      return c;
    };
    chip(statusText, "status").style.setProperty("--led", item.kind === "secret" ? "var(--accent)" : LED_COLOR[item.status]);
    if (item.kind === "game") {
      if (item.device === "desktop") chip(DEVICE_LABEL.desktop, "pc");
      item.genre.slice(0, 2).forEach((g) => chip(g));
    }
    // 详情
    this.fields.textContent = "";
    const field = (k: string, v: string, wide = false) => {
      if (!v) return;
      const d = document.createElement("div");
      if (wide) d.className = "wide";
      const dt = document.createElement("dt");
      dt.textContent = k;
      const dd = document.createElement("dd");
      dd.textContent = v;
      d.append(dt, dd);
      this.fields.append(d);
    };
    if (item.kind === "game") {
      field("TYPE / 类型", item.genre.join(" · "));
      field("SESSION / 一局", item.session);
      field("INPUT / 操作", item.controls);
      field("DEVICE / 设备", DEVICE_LABEL[item.device]);
      field("ADDRESS / 地址", item.url?.replace(/^https?:\/\//, "") ?? "", true);
    } else if (item.kind === "secret") {
      field("FOUND BY / 解锁方式", item.controls);
      field("WEIGHT / 体积", "< 300 KB");
    } else {
      field("STATUS / 状态", "未刻录");
      field("NEXT / 下一个", "正在构思");
    }
    this.intro.textContent = item.intro;
    this.note.textContent = "";
    this.btnCopy.hidden = !item.url;
    this.setMainLabel("读取卡带");
  }

  /** 开场后标题"解码"出来：随机字符从左到右定格成真正的标题 */
  scrambleTitle() {
    const el = document.getElementById("p-title")?.lastElementChild as HTMLElement | null;
    const final = this.item?.title ?? "";
    if (!el || !final || this.reduced()) return;
    const pool = "卡带刻录读取铭节拍点关我从开始零壹#/*01";
    const t0 = performance.now();
    const step = () => {
      const p = Math.min(1, (performance.now() - t0) / 700);
      const n = Math.floor(final.length * p);
      el.textContent =
        final.slice(0, n) +
        [...final.slice(n)].map(() => pool[Math.floor(Math.random() * pool.length)]).join("");
      if (p < 1) requestAnimationFrame(step);
      else el.textContent = final;
    };
    setTimeout(() => requestAnimationFrame(step), 250);
  }

  setMainLabel(text: string) {
    this.mainLbl.textContent = text;
  }

  setNote(text: string) {
    this.note.textContent = text;
  }

  /** 读取开始：给正文盖上墨块 */
  redact() {
    const it = this.item;
    const light = (hex: string) => {
      const n = parseInt(hex.slice(1), 16);
      return (0.299 * (n >> 16) + 0.587 * ((n >> 8) & 255) + 0.114 * (n & 255)) / 255 > 0.8;
    };
    const color = it?.kind === "game" ? (light(it.color) ? (light(it.color2) ? "var(--ink)" : it.color2) : it.color) : "var(--ink)";
    // 一句话简介在浏览时就看得到，不再盖；只盖读取后才展开的字段和简介
    const els = [...this.fields.querySelectorAll<HTMLElement>("dd"), this.intro].filter(
      (e) => e.textContent?.trim(),
    );
    this.redactor.cover(els, color);
  }
  revealText(p: number) {
    this.redactor.paint(p);
  }
  clearRedact() {
    this.redactor.clear();
  }

  // ——— 取景框 ———
  setFocus(r: Rect | null, show: boolean, dt: number) {
    if (!r || !show) {
      this.vf.classList.remove("on");
      if (r) this.vfr = { ...r };
      return;
    }
    const pad = 10;
    const t = { x: r.x - pad, y: r.y - pad, w: r.w + pad * 2, h: r.h + pad * 2 };
    if (!this.vfr || this.reduced()) this.vfr = t;
    else {
      const k = 1 - Math.exp(-dt * 16);
      this.vfr.x += (t.x - this.vfr.x) * k;
      this.vfr.y += (t.y - this.vfr.y) * k;
      this.vfr.w += (t.w - this.vfr.w) * k;
      this.vfr.h += (t.h - this.vfr.h) * k;
    }
    const v = this.vfr;
    this.vf.style.transform = `translate(${v.x.toFixed(1)}px,${v.y.toFixed(1)}px)`;
    this.vf.style.width = `${v.w.toFixed(1)}px`;
    this.vf.style.height = `${v.h.toFixed(1)}px`;
    this.vf.classList.add("on");
  }

  // ——— 卡槽与终端 ———
  slot(state: "off" | "on" | "ok" | "err") {
    this.slotEl.className = `slot${state === "off" ? "" : " on"}${state === "ok" ? " ok" : state === "err" ? " err" : ""}`;
  }

  async typeLines(lines: { text: string; cls?: string }[], speed = 22): Promise<boolean> {
    const token = ++this.termToken;
    this.term.textContent = "";
    for (const l of lines) {
      const row = document.createElement("div");
      if (l.cls) row.className = l.cls;
      this.term.append(row);
      if (this.reduced()) {
        row.textContent = l.text;
        continue;
      }
      for (let i = 1; i <= l.text.length; i++) {
        if (token !== this.termToken) return false;
        row.textContent = l.text.slice(0, i);
        await wait(speed);
      }
      await wait(140);
    }
    return token === this.termToken;
  }
  clearTerm() {
    this.termToken++;
    this.term.textContent = "";
  }

  // ——— 提示 ———
  toast(msg: string, ms = 2200) {
    this.toastEl.textContent = msg;
    this.toastEl.classList.add("on");
    clearTimeout(this.toastTimer);
    this.toastTimer = window.setTimeout(() => this.toastEl.classList.remove("on"), ms);
  }
  whisper(msg: string, ms = 2600) {
    this.whisperEl.textContent = msg;
    this.whisperEl.classList.add("on");
    clearTimeout(this.whisperTimer);
    this.whisperTimer = window.setTimeout(() => this.whisperEl.classList.remove("on"), ms);
  }
  hint(touch: boolean) {
    this.hintEl.innerHTML = touch
      ? "<b>上下滑</b> 翻找 · <b>轻点</b> 读取"
      : "<b>↑ ↓</b> / 滚轮 / 拖动 翻找 · <b>Enter</b> 读取 · <b>Esc</b> 返回";
  }
  tempo(bpm: number | null) {
    this.tempoEl.textContent = bpm ? `♩=${Math.round(bpm)}` : "";
  }

  tickClock(t: number) {
    const now = new Date();
    const p = (n: number) => String(n).padStart(2, "0");
    this.clockEl.textContent = `${p(now.getHours())}:${p(now.getMinutes())}:${p(now.getSeconds())}`;
    const s = Math.floor(t);
    this.recEl.textContent = `${p(Math.floor(s / 3600))}:${p(Math.floor(s / 60) % 60)}:${p(s % 60)}`;
  }
}

export const wait = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));
