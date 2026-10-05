// 生产构建：两次 Vite 构建，都输出 IIFE 经典脚本 + 相对路径。
//   1) 主包 assets/main.js：HUD、开场、核心、2D 版、声音（index.html 一起处理）
//   2) 3D 包 assets/scene3d.js：three.js + 场景，主包运行后用 <script> 懒加载，挂到 window.MingkeScene3D
// 这样 dist/index.html 双击（file://）也能打开，放到 Cloudflare Pages 根路径也一样。
import { build } from "vite";
import { fileURLToPath } from "node:url";
import { readdirSync, statSync, readFileSync } from "node:fs";
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
