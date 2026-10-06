// 生产构建：两次 Vite 构建，都输出 IIFE 经典脚本 + 相对路径。
//   1) 主包 assets/main.js：HUD、开场、核心、2D 版、声音（index.html 一起处理）
//   2) 3D 包 assets/scene3d.js：three.js + 场景，主包运行后用 <script> 懒加载，挂到 window.MingkeScene3D
// 这样 dist/index.html 双击（file://）也能打开，放到 Cloudflare Pages 根路径也一样。
import { build } from "vite";
import { fileURLToPath } from "node:url";
import { readdirSync, statSync, readFileSync, writeFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { gzipSync } from "node:zlib";
import { join } from "node:path";
import { siteHtml } from "./site-html.mjs";

const root = fileURLToPath(new URL("..", import.meta.url));
const common = { root, base: "./", configFile: false, logLevel: "warn" };

await build({
  ...common,
  plugins: [siteHtml({ build: true })],
  build: {
    outDir: "dist",
    emptyOutDir: true,
    target: "es2019",
    modulePreload: false,
    cssCodeSplit: false,
    assetsInlineLimit: 0,
    rollupOptions: {
      output: {
        format: "iife",
        entryFileNames: "assets/main.js",
        assetFileNames: (info) =>
          (info.names?.[0] ?? info.name ?? "").endsWith(".css") ? "assets/main.css" : "assets/[name][extname]",
      },
    },
  },
});

await build({
  ...common,
  publicDir: false,
  build: {
    outDir: "dist/assets",
    emptyOutDir: false,
    target: "es2019",
    minify: true,
    lib: {
      entry: join(root, "src/scene3d/index.ts"),
      formats: ["iife"],
      name: "MingkeScene3D",
      fileName: () => "scene3d.js",
    },
  },
});

// 防缓存：assets 下文件名是固定的，而线上会被浏览器缓存 4 小时（HTML 不缓存）。
// 给每个引用加上内容哈希 ?v=xxxx，内容变了地址就变，普通刷新就能拿到新版。
// 顺序：先算 scene3d / 字体 → 改进 main.js / main.css → 再算它们自己的哈希 → 改进 index.html
const A = join(root, "dist/assets");
const ver = (f) => createHash("sha256").update(readFileSync(join(A, f))).digest("hex").slice(0, 10);
const stamp = (file, refs) => {
  let s = readFileSync(file, "utf8");
  for (const r of refs) {
    const n = s.split(`./${r}`).length - 1 + s.split(`./assets/${r}`).length - 1;
    if (!n) throw new Error(`防缓存：${file} 里找不到对 ${r} 的引用`);
    s = s.replaceAll(`./assets/${r}`, `./assets/${r}?v=${ver(r)}`).replace(new RegExp(`\\./${r.replace(".", "\\.")}(?!\\?)`, "g"), `./${r}?v=${ver(r)}`);
  }
  writeFileSync(file, s);
};
stamp(join(A, "main.js"), ["scene3d.js"]);
stamp(join(A, "main.css"), ["jbm-400.woff2", "jbm-700.woff2"]);
stamp(join(root, "dist/index.html"), ["main.js", "main.css"]);

// 体积报告（gzip 后）
const walk = (dir) =>
  readdirSync(dir).flatMap((f) => {
    const p = join(dir, f);
    return statSync(p).isDirectory() ? walk(p) : [p];
  });
let total = 0;
const rows = walk(join(root, "dist"))
  .filter((p) => !/licenses|og\.jpg|apple-touch/.test(p))
  .map((p) => {
    const raw = readFileSync(p);
    const gz = /\.(woff2|png|jpg)$/.test(p) ? raw.length : gzipSync(raw).length;
    total += gz;
    return [p.slice(root.length).split(String.fromCharCode(92)).join("/"), (raw.length / 1024).toFixed(1), (gz / 1024).toFixed(1)];
  });
console.log("\n文件                              原始KB   gzipKB");
for (const [p, r, g] of rows) console.log(p.padEnd(34), r.padStart(7), g.padStart(8));
console.log("首次加载合计（gzip）:".padEnd(34), "".padStart(7), (total / 1024).toFixed(1).padStart(8), "KB\n");
