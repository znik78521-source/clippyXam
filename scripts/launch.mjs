// Source-package bootstrap. No build, packaging, autostart, administrator rights or saved API keys.
import { spawn } from "node:child_process";
import { readFile, writeFile, access } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";
import {
  supportedNode,
  installFingerprint,
  npmInvocation,
} from "./launch-policy.mjs";

const root = fileURLToPath(new URL("../", import.meta.url));
const require = createRequire(import.meta.url);
const mode = process.argv[2] || "desktop";
const exists = async (path) => {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
};
async function run(kind) {
  const { command, args } = npmInvocation(kind);
  const env = { ...process.env };
  // This launcher installs the actual OS runtime, not the app's compiled output.
  delete env.ELECTRON_SKIP_BINARY_DOWNLOAD;
  delete env.ELECTRON_RUN_AS_NODE;
  return await new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd: root,
      env,
      stdio: "inherit",
      shell: false,
    });
    const interrupt = () => child.kill();
    process.once("SIGINT", interrupt);
    process.once("SIGTERM", interrupt);
    const cleanup = () => {
      process.removeListener("SIGINT", interrupt);
      process.removeListener("SIGTERM", interrupt);
    };
    child.once("error", (error) => {
      cleanup();
      reject(error);
    });
    child.once("exit", (code, signal) => {
      cleanup();
      resolve(code ?? (signal ? 1 : 0));
    });
  });
}
async function runtimeReady() {
  try {
    return await exists(require("electron"));
  } catch {
    return false;
  }
}
async function main() {
  if (!["desktop", "check"].includes(mode))
    throw new Error("Use: node scripts/launch.mjs [desktop|check]");
  if (!supportedNode(process.versions.node))
    throw new Error(
      "Install Node.js 22.12 or newer, then reopen this launcher. See START-HERE-RU.md.",
    );
  if (process.platform !== "win32" && mode === "desktop")
    console.log(
      "This archive targets Windows QA. Other desktop platforms are experimental.",
    );
  const lock = await readFile(new URL("../package-lock.json", import.meta.url));
  const fingerprint = installFingerprint(
    lock,
    process.platform,
    process.arch,
    process.versions.node,
  );
  const stampPath = new URL(
    "../node_modules/.clippyxam-install",
    import.meta.url,
  );
  let stamp = "";
  try {
    stamp = await readFile(stampPath, "utf8");
  } catch {
    /* Fresh extraction. */
  }
  if (
    stamp !== fingerprint ||
    !(await exists(
      new URL("../node_modules/vite/package.json", import.meta.url),
    )) ||
    !(await runtimeReady())
  ) {
    console.log(
      "Installing locked dependencies and the Electron runtime. Internet is required. This does NOT compile clippyXam.",
    );
    const code = await run("install");
    if (code)
      throw new Error(
        `npm ci failed (${code}). Check internet access to npm and GitHub; no API key is needed.`,
      );
    // Drop cached Electron resolution from a previous missing-runtime check.
    try {
      delete require.cache[require.resolve("electron")];
    } catch {
      /* Missing module. */
    }
    if (!(await runtimeReady()))
      throw new Error(
        "Electron runtime is missing. Check antivirus/download errors. See START-HERE-RU.md.",
      );
    await writeFile(stampPath, fingerprint);
  }
  console.log(
    mode === "check"
      ? "Running source checks (no compilation or paid API calls)..."
      : "Starting XP desktop window. Keep this console open. Close the app via X or the tray menu.",
  );
  process.exitCode = await run(mode);
}
main().catch((error) => {
  console.error(`\nclippyXam: ${error.message}`);
  process.exitCode = 1;
});
