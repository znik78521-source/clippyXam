const fs = require("node:fs/promises");
const path = require("node:path");
// Only Windows DPAPI / Electron safeStorage; never a plaintext fallback.
function createKeyVault({
  directory,
  safeStorage,
  platform = process.platform,
}) {
  const file = path.join(directory, "openrouter-key.bin");
  let queue = Promise.resolve();
  const available = () =>
    platform === "win32" && safeStorage.isEncryptionAvailable();
  async function load() {
    await queue.catch(() => {});
    try {
      if (!available())
        return {
          key: "",
          warning:
            "Безопасное хранилище недоступно; ключ остаётся только в памяти.",
        };
      const bytes = await fs.readFile(file);
      if (bytes.length > 8192) throw new Error("Invalid key file");
      const key = safeStorage.decryptString(bytes);
      if (typeof key !== "string" || key.length > 512)
        throw new Error("Invalid key");
      return { key, warning: "" };
    } catch (error) {
      return {
        key: "",
        warning:
          error.code === "ENOENT"
            ? ""
            : "Не удалось расшифровать ключ. При переносе на другой компьютер введи его заново.",
      };
    }
  }
  function save(key) {
    if (typeof key !== "string" || key.length > 512)
      return Promise.reject(new Error("Некорректный ключ."));
    const task = queue
      .catch(() => {})
      .then(async () => {
        if (!key.trim()) {
          await fs.rm(file, { force: true });
          return;
        }
        if (!available())
          throw new Error(
            "Защищённое сохранение недоступно. Ключ используется только в этом запуске.",
          );
        const bytes = safeStorage.encryptString(key.trim());
        await fs.mkdir(directory, { recursive: true });
        await fs.writeFile(file + ".tmp", bytes, { mode: 0o600 });
        await fs.rename(file + ".tmp", file);
      });
    queue = task;
    return task;
  }
  return { load, save };
}
module.exports = { createKeyVault };
