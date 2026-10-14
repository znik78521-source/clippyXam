const fs = require("node:fs/promises");
const path = require("node:path");
const crypto = require("node:crypto");
const { spawn: nodeSpawn } = require("node:child_process");
const manifest = require("./voice-manifest.cjs");
function validFile(bytes, file) {
  if (bytes.length !== file.size) return false;
  const hash = crypto.createHash(file.sha256 ? "sha256" : "sha1");
  if (!file.sha256) hash.update(`blob ${bytes.length}\0`);
  return hash.update(bytes).digest("hex") === (file.sha256 || file.gitSha1);
}
function wavFromPCM(pcm) {
  const h = Buffer.alloc(44);
  h.write("RIFF");
  h.writeUInt32LE(36 + pcm.length, 4);
  h.write("WAVEfmt ", 8);
  h.writeUInt32LE(16, 16);
  h.writeUInt16LE(1, 20);
  h.writeUInt16LE(1, 22);
  h.writeUInt32LE(22050, 24);
  h.writeUInt32LE(44100, 28);
  h.writeUInt16LE(2, 32);
  h.writeUInt16LE(16, 34);
  h.write("data", 36);
  h.writeUInt32LE(pcm.length, 40);
  return Buffer.concat([h, pcm]);
}
function createLocalVoice({
  baseDir,
  engineDir,
  fetchImpl = fetch,
  spawn = nodeSpawn,
  platform = process.platform,
  changed = () => {},
  files = manifest.files,
  timeoutMs = 60000,
}) {
  let state = { phase: "idle", progress: 0, error: "" },
    preparing = null,
    download = null,
    job = null,
    disposed = false;
  const emit = (patch) => {
    state = { ...state, ...patch };
    changed({ ...state });
  };
  const executable = path.join(engineDir, "piper.exe");
  async function prepare() {
    if (state.phase === "ready") return { ...state };
    if (preparing) return preparing;
    if (disposed) throw new Error("Озвучка остановлена.");
    preparing = (async () => {
      try {
        if (platform !== "win32")
          throw new Error("Встроенный голос доступен в Windows portable.");
        await fs.access(executable);
        await fs.mkdir(baseDir, { recursive: true });
        emit({ phase: "downloading", progress: 0, error: "" });
        download = new AbortController();
        const timeout = setTimeout(() => download?.abort(), 300000);
        try {
          const total = files.reduce((sum, f) => sum + f.size, 0);
          let finished = 0;
          for (const file of files) {
            const dest = path.join(baseDir, file.name);
            const cached = await fs.readFile(dest).catch(() => null);
            if (cached && validFile(cached, file)) {
              finished += file.size;
              continue;
            }
            const response = await fetchImpl(file.url, {
              signal: download.signal,
            });
            if (!response.ok || !response.body)
              throw new Error(
                "Не удалось скачать русский голос. Проверь доступ к huggingface.co.",
              );
            let size = 0;
            const parts = [];
            for await (const chunk of response.body) {
              size += chunk.length;
              if (size > file.size)
                throw new Error("Размер голосового пакета не совпадает.");
              parts.push(Buffer.from(chunk));
              emit({
                progress: Math.min(
                  99,
                  Math.floor(((finished + size) / total) * 100),
                ),
              });
            }
            const bytes = Buffer.concat(parts);
            if (!validFile(bytes, file))
              throw new Error(
                "Контрольная сумма голоса не совпала; файл не используется.",
              );
            await fs.writeFile(dest + ".part", bytes);
            await fs.rename(dest + ".part", dest);
            finished += file.size;
          }
        } finally {
          clearTimeout(timeout);
          download = null;
        }
        if (disposed) throw new Error("Озвучка остановлена.");
        emit({ phase: "ready", progress: 100, error: "" });
        return { ...state };
      } catch (error) {
        emit({
          phase: "error",
          error:
            error.code === "ENOENT"
              ? "Движок Piper не найден. Используй portable со встроенным движком."
              : String(error.message || error),
        });
        throw new Error(state.error);
      } finally {
        preparing = null;
      }
    })();
    return preparing;
  }
  function stop(owner) {
    if (job && (!owner || job.owner === owner)) job.finish(null, null);
  }
  async function synthesize(owner, text, rate = 1) {
    if (
      typeof text !== "string" ||
      !text.trim() ||
      text.length > 2500 ||
      typeof rate !== "number" ||
      !Number.isFinite(rate) ||
      rate < 0.7 ||
      rate > 1.4
    )
      throw new Error("Некорректные параметры голоса.");
    if (job) throw new Error("Голос уже занят.");
    // Register cancellation BEFORE waiting for a first-run model download.
    return new Promise((resolve, reject) => {
      let child,
        timer,
        done = false,
        total = 0;
      const chunks = [];
      const destroyed = () => stop(owner);
      const finish = (error, audio) => {
        if (done) return;
        done = true;
        clearTimeout(timer);
        owner.removeListener("destroyed", destroyed);
        owner.removeListener("did-start-navigation", destroyed);
        job = null;
        child?.kill();
        error ? reject(error) : resolve(audio);
      };
      job = { owner, finish };
      owner.once("destroyed", destroyed);
      owner.once("did-start-navigation", destroyed);
      timer = setTimeout(
        () => finish(new Error("Локальная озвучка не завершилась вовремя.")),
        timeoutMs,
      );
      prepare().then(
        () => {
          if (done) return;
          try {
            child = spawn(
              executable,
              [
                "--model",
                path.join(baseDir, files[0].name),
                "--output_raw",
                "--length_scale",
                String(1 / rate),
              ],
              {
                cwd: engineDir,
                windowsHide: true,
                stdio: ["pipe", "pipe", "ignore"],
              },
            );
            child.stdout.on("data", (chunk) => {
              total += chunk.length;
              if (total > 8 * 1024 * 1024)
                finish(new Error("Слишком длинное аудио."));
              else chunks.push(Buffer.from(chunk));
            });
            child.once("error", () =>
              finish(new Error("Не удалось запустить Piper.")),
            );
            child.once("close", (code) => {
              if (done) return;
              if (code !== 0 || total < 2 || total % 2)
                finish(new Error("Piper не создал аудио."));
              else finish(null, wavFromPCM(Buffer.concat(chunks)));
            });
            child.stdin.on("error", () =>
              finish(new Error("Не удалось передать текст голосу.")),
            );
            child.stdin.end(text.replace(/[\r\n]+/g, " ") + "\n", "utf8");
          } catch {
            finish(new Error("Не удалось включить голос."));
          }
        },
        (error) => finish(error),
      );
    });
  }
  return {
    prepare,
    synthesize,
    stop,
    state: () => ({ ...state }),
    dispose() {
      disposed = true;
      download?.abort();
      stop();
    },
  };
}
module.exports = { createLocalVoice, validFile, wavFromPCM };
