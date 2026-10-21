import { defineConfig } from "vite";
import { fileURLToPath } from "node:url";
export default defineConfig({
  root: fileURLToPath(new URL(".", import.meta.url)),
  server: {
    host: "0.0.0.0",
    port: 5174,
    strictPort: true,
    allowedHosts: [".e2b.app"],
    fs: { allow: [fileURLToPath(new URL("../..", import.meta.url))] },
  },
});
