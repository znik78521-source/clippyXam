// Development only. Does not compile, package or create an installer.
import { spawn } from "node:child_process";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import { createServer } from "vite";
import { loopbackURL } from "./launch-policy.mjs";
import "./prepare-agents.mjs";

const require = createRequire(import.meta.url);
async function main() {
  let executable;
  try {
    executable = require("electron");
  } catch {
    throw new Error(
      "Electron runtime не установлен. Выполни npm rebuild electron (без ELECTRON_SKIP_BINARY_DOWNLOAD), затем npm run desktop:dev.",
    );
  }
  if (
    process.platform === "linux" &&
    !process.env.DISPLAY &&
    !process.env.WAYLAND_DISPLAY
  )
    throw new Error(
      "Для desktop нужен графический рабочий стол. В этой среде используй npm run dev для браузерного предпросмотра.",
    );
  const root = fileURLToPath(new URL("../", import.meta.url));
  const server = await createServer({
    root,
    server: { host: "127.0.0.1", port: 5174, strictPort: false, open: false },
  });
  let child,
    stopping = false;
  async function stop(code = 0) {
    if (stopping) return;
    stopping = true;
    child?.kill();
    await server.close();
    process.exitCode = code;
  }
  try {
    await server.listen();
    // A second launch must reach Electron's single-instance lock, even when
    // the first app still owns 5174. Its temporary Vite instance then exits.
    const env = {
      ...process.env,
      CLIPPYXAM_DEV_URL: loopbackURL(server.httpServer.address()),
    };
    delete env.ELECTRON_RUN_AS_NODE;
    child = spawn(executable, ["electron/main.cjs"], {
      cwd: root,
      env,
      stdio: "inherit",
    });
    child.once("exit", (code, signal) => void stop(code ?? (signal ? 1 : 0)));
    child.once("error", (error) => {
      console.error(error.message);
      void stop(1);
    });
    process.once("SIGINT", () => void stop());
    process.once("SIGTERM", () => void stop());
  } catch (error) {
    await stop(1);
    throw error;
  }
}
main().catch((error) => {
  console.error(`clippyXam: ${error.message}`);
  process.exitCode = 1;
});
