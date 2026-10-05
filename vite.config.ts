import { defineConfig } from "vite";
// @ts-ignore 纯 JS 构建辅助
import { siteHtml } from "./scripts/site-html.mjs";

// 只用于开发服务器；生产构建见 scripts/build.mjs（主包和 3D 包分两次构建成经典脚本）
export default defineConfig({
  base: "./",
  plugins: [siteHtml()],
  server: { host: "127.0.0.1", port: 5180 },
});
