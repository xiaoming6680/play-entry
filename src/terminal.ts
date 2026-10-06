// 彩蛋「命令行」：按 / 打开（手机上连点三下 REC）。一个小终端，能翻卡带、开关灯、和 stay 斗嘴。
import type { Item } from "./types";

export interface CliHost {
  items(): Item[];
  current(): Item;
  goto(item: Item): void;
  read(): void;
  play(item: Item): void;
  theme(v?: "light" | "dark"): string;
  sound(on?: boolean): boolean;
  lights(on: boolean): void;
  saver(): void;
  replay(): void;
  about(): void;
  eggs(): { found: { name: string }[]; total: number };
  visits(): number;
  key(): void;
  found(id: string): void;
}

type Line = string | { text: string; cls?: string };

const COMMANDS: [string, string][] = [
  ["ls", "列出架子上的卡带"],
  ["cd <名字>", "翻到那一盒（beat / stay / dot / 编号）"],
  ["read", "读取当前这盒"],
  ["play <名字>", "直接插进去玩"],
  ["cat <名字>", "看卡带简介"],
  ["theme [light|dark]", "明暗"],
  ["sound [on|off]", "声音"],
  ["lights [on|off]", "仓库的灯"],
  ["saver", "屏保"],
  ["replay", "重播开场"],
  ["eggs", "找到的彩蛋"],
  ["whoami / date / clear / exit", ""],
];

export class Terminal {
  private el: HTMLDivElement;
  private out: HTMLDivElement;
  private input: HTMLInputElement;
  private history: string[] = [];
  private hIdx = 0;
  private busy = false;

  constructor(private host: CliHost) {
    const el = document.createElement("div");
    el.className = "cli";
    el.setAttribute("role", "dialog");
    el.setAttribute("aria-label", "命令行");
    el.innerHTML = `<div class="cli-bar"><span>XM-6680 · TERMINAL</span><button type="button" class="cli-x" aria-label="关闭">×</button></div><div class="cli-out"></div><form class="cli-in"><label>visitor@mingke:~$</label><input type="text" autocomplete="off" autocapitalize="off" spellcheck="false" enterkeyhint="send" aria-label="命令"></form>`;
    document.getElementById("app")!.append(el);
    this.el = el;
    this.out = el.querySelector(".cli-out")!;
    this.input = el.querySelector("input")!;
    el.querySelector(".cli-x")!.addEventListener("click", () => this.close());
    el.querySelector("form")!.addEventListener("submit", (e) => {
      e.preventDefault();
      const v = this.input.value;
      this.input.value = "";
      this.run(v);
    });
    // 终端里的按键不传给页面（不然打字会翻卡带）
    el.addEventListener("keydown", (e) => {
      e.stopPropagation();
      if (e.key === "Escape") this.close();
      else if (e.key === "ArrowUp" || e.key === "ArrowDown") {
        e.preventDefault();
        if (!this.history.length) return;
        this.hIdx = Math.max(0, Math.min(this.history.length, this.hIdx + (e.key === "ArrowUp" ? -1 : 1)));
        this.input.value = this.history[this.hIdx] ?? "";
      } else if (e.key === "Tab") {
        e.preventDefault();
        const v = this.input.value.trim();
        const all = ["ls", "cd", "read", "play", "cat", "theme", "sound", "lights", "saver", "replay", "eggs", "whoami", "date", "clear", "exit", "help", "sudo", "echo"];
        const hit = all.filter((c) => c.startsWith(v));
        if (hit.length === 1) this.input.value = hit[0] + " ";
        else if (hit.length > 1) this.print(hit.join("  "), "dim");
      } else if (e.key.length === 1) this.host.key();
    });
    el.addEventListener("wheel", (e) => e.stopPropagation());
    el.addEventListener("pointerdown", (e) => e.stopPropagation());
  }

  get open() {
    return this.el.classList.contains("on");
  }

  show() {
    if (this.open) return this.input.focus();
    this.el.classList.add("on");
    if (!this.out.childElementCount) {
      this.print("XM-6680 CARTRIDGE SYSTEM  v0.3", "hi");
      this.print(`第 ${this.host.visits()} 次接入。输入 help 看看能做什么，Esc 关闭。`, "dim");
    }
    // 同步 focus 才能在手机上弹出键盘（必须在手势里）
    this.input.focus();
    setTimeout(() => this.input.focus(), 30);
  }

  close() {
    this.el.classList.remove("on");
    this.input.blur();
  }

  private print(l: Line, cls = "") {
    const row = document.createElement("div");
    const o = typeof l === "string" ? { text: l, cls } : l;
    row.textContent = o.text;
    if (o.cls) row.className = o.cls;
    this.out.append(row);
    while (this.out.childElementCount > 200) this.out.firstChild!.remove();
    this.out.scrollTop = this.out.scrollHeight;
  }

  private async slow(lines: Line[], ms = 260) {
    this.busy = true;
    for (const l of lines) {
      this.print(l);
      await new Promise((r) => setTimeout(r, ms));
    }
    this.busy = false;
  }

  private find(arg: string) {
    const a = arg.trim().toLowerCase();
    if (!a) return null;
    const items = this.host.items();
    const n = Number(a);
    if (Number.isInteger(n) && n >= 1 && n <= items.length) return items[n - 1];
    return (
      items.find((i) => i.id === a || i.code.toLowerCase() === a || i.title === arg.trim() || i.titleEn.toLowerCase() === a) ??
      items.find((i) => i.id.startsWith(a) || i.title.includes(arg.trim())) ??
      null
    );
  }

  run(raw: string) {
    const line = raw.trim();
    this.print(`$ ${raw}`, "cmd");
    if (!line) return;
    if (this.busy) return this.print("稍等，上一条还没跑完。", "dim");
    this.history.push(line);
    this.hIdx = this.history.length;
    const [cmd0, ...rest] = line.split(/\s+/);
    const cmd = cmd0.toLowerCase();
    const arg = rest.join(" ");
    const h = this.host;
    switch (cmd) {
      case "help":
      case "帮助":
      case "?":
        for (const [c, d] of COMMANDS) this.print(d ? `${c.padEnd(22)}${d}` : c, d ? "" : "dim");
        this.print("还有一些命令没写在这里。", "dim");
        break;
      case "ls":
      case "dir":
        h.items().forEach((it, i) => {
          const st = it.kind === "blank" ? "空白" : it.kind === "secret" ? "彩蛋" : it.status === "live" ? "可以玩" : "刻录中";
          this.print(`${String(i + 1).padStart(2, "0")}  ${it.code.padEnd(7)}${it.title}  [${st}]`, it.id === h.current().id ? "hi" : "");
        });
        break;
      case "cd":
      case "goto": {
        if (!arg || arg === "~" || arg === "/") return this.print("你已经在仓库里了。", "dim");
        if (arg === "..") return this.print("再往上就是浏览器了。出不去的。", "dim");
        const it = this.find(arg);
        if (!it) return this.print(`没有叫「${arg}」的卡带。试试 ls`, "err");
        h.goto(it);
        this.print(`→ ${it.code} ${it.title}`, "ok");
        break;
      }
      case "read":
      case "open": {
        if (arg) {
          const it = this.find(arg);
          if (!it) return this.print(`没有叫「${arg}」的卡带。`, "err");
          h.goto(it);
          setTimeout(() => h.read(), 650);
        } else h.read();
        this.close();
        break;
      }
      case "play":
      case "run":
      case "insert":
      case "start": {
        const it = arg ? this.find(arg) : h.current();
        if (!it) return this.print(`没有叫「${arg}」的卡带。`, "err");
        this.print(`> 准备插入 ${it.code} …`, "ok");
        setTimeout(() => {
          this.close();
          h.play(it);
        }, 400);
        break;
      }
      case "cat":
      case "man": {
        const it = arg ? this.find(arg) : h.current();
        if (!it) return this.print(cmd === "man" ? "没有手册。help 就是全部了。" : `没有叫「${arg}」的卡带。`, "dim");
        this.print(`${it.code} · ${it.title} / ${it.titleEn}`, "hi");
        this.print(it.intro || it.tagline);
        break;
      }
      case "pwd":
        this.print(`/仓库/主架/${h.current().code}`);
        break;
      case "whoami":
        this.print(`访客 · 第 ${h.visits()} 次来到这座仓库 · 找到 ${h.eggs().found.length}/${h.eggs().total} 个彩蛋`);
        break;
      case "date":
      case "time": {
        const d = new Date();
        this.print(d.toLocaleString("zh-CN", { hour12: false }));
        if (d.getHours() < 5) this.print("……这么晚了。", "dim");
        break;
      }
      case "theme":
        this.print(`明暗：${h.theme(arg === "light" || arg === "dark" ? arg : undefined) === "dark" ? "夜" : "雾"}`);
        break;
      case "sound":
        this.print(`声音：${h.sound(arg === "on" ? true : arg === "off" ? false : undefined) ? "开" : "关"}`);
        break;
      case "lights":
      case "light":
      case "关灯":
      case "开灯": {
        const on = cmd === "开灯" || arg === "on";
        if (!on && arg && arg !== "off") return this.print("lights on 或 lights off", "dim");
        this.print(on ? "啪。" : "啪。……谁关的灯？", "dim");
        setTimeout(() => {
          this.close();
          h.lights(on);
        }, 350);
        break;
      }
      case "saver":
      case "screensaver":
      case "屏保":
        this.close();
        setTimeout(() => h.saver(), 300);
        break;
      case "replay":
      case "boot":
      case "reboot":
        this.close();
        h.replay();
        break;
      case "about":
        this.close();
        h.about();
        break;
      case "eggs": {
        const e = h.eggs();
        this.print(`找到 ${e.found.length} / ${e.total}：`, "hi");
        if (!e.found.length) this.print("一个都还没有。", "dim");
        e.found.forEach((x) => this.print(`  ◆ ${x.name}`));
        if (e.found.length < e.total) this.print("剩下的自己找。", "dim");
        break;
      }
      case "clear":
      case "cls":
        this.out.textContent = "";
        break;
      case "echo":
        this.print(arg);
        break;
      case "exit":
      case "quit":
      case "logout":
      case "close":
      case ":q":
      case ":wq":
        this.print("stay：别关我。", "err");
        this.busy = true;
        setTimeout(() => {
          this.print("……好吧，只关命令行。", "dim");
          setTimeout(() => {
            this.busy = false;
            this.close();
          }, 900);
        }, 900);
        break;
      case "sudo":
        if (/rm\s+-rf/.test(arg)) return this.nuke();
        this.print("stay：这里没有 root。我也没有。", "err");
        break;
      case "rm":
        if (/-rf?/.test(arg) || arg.includes("*") || arg === "/") return this.nuke();
        this.print("卡带只能刻录，不能删除。", "dim");
        break;
      case "hello":
      case "hi":
      case "你好":
        this.print("你好。这里只有卡带、一只眼睛和一个点。", "dim");
        break;
      case "stay":
        this.print("stay：叫我干嘛。", "err");
        h.goto(this.find("stay") ?? h.current());
        break;
      case "beat":
      case "dot":
        h.goto(this.find(cmd) ?? h.current());
        this.print(cmd === "beat" ? "♩ ♩ ♩ ♩" : ".", "ok");
        break;
      case "konami":
        this.print("自己按。↑ ↑ ↓ ↓ ……", "dim");
        break;
      case "xyzzy":
      case "plugh":
        this.print("什么也没发生。", "dim");
        break;
      case "coffee":
      case "tea":
        this.print("418：我是一座卡带库，不是茶壶。", "dim");
        break;
      case "ping":
        this.print("pong");
        break;
      case "uname":
        this.print("XM-6680 CARTRIDGE SYSTEM v0.3 (glass)");
        break;
      case "love":
      case "<3":
      case "❤":
        this.print("stay：……谢谢。", "err");
        break;
      case "42":
        this.print("对，但问题是什么？", "dim");
        break;
      case "git":
        this.print("源码在「关于」里。欢迎来看。", "dim");
        break;
      case "vim":
      case "emacs":
      case "nano":
        this.print("这里只有一行输入框。你会想念它的。", "dim");
        break;
      default:
        this.print(`找不到命令：${cmd0}。试试 help`, "err");
    }
  }

  private nuke() {
    const items = this.host.items();
    this.slow(
      [
        { text: "stay：……你认真的吗？", cls: "err" },
        ...items.map((i) => ({ text: `正在删除 ${i.code} ${i.title} ……`, cls: "dim" })),
        { text: "正在删除 stay ……", cls: "dim" },
        { text: "stay：喂！！", cls: "err" },
        { text: "……开玩笑的。一盒都没少。", cls: "ok" },
      ],
      420,
    );
  }
}
