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
    worker = null,
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
  function killWorker() {
    const old = worker;
    worker = null;
    old?.child.kill();
  }
  function ensureWorker(rate) {
    if (worker?.rate === rate) return worker;
    killWorker();
    const child = spawn(
      executable,
      [
        "--model",
        path.join(baseDir, files[0].name),
        "--output_raw",
        "--sentence_silence",
        "0",
        "--length_scale",
        String(1 / rate),
      ],
      { cwd: engineDir, windowsHide: true, stdio: ["pipe", "pipe", "pipe"] },
    );
    const current = { child, rate, totalSamples: 0, stderr: "" };
    worker = current;
    const fail = () => {
      if (worker !== current) return;
      job?.finish(new Error("Не удалось выполнить локальную озвучку."));
      killWorker();
    };
    child.once("error", fail);
    child.once("close", fail);
    child.stdin.on("error", fail);
    child.stdout.on("data", (chunk) => {
      if (worker !== current || !job) return;
      job.total += chunk.length;
      if (job.total > 8 * 1024 * 1024) {
        job.finish(new Error("Слишком длинное аудио."));
        return;
      }
      job.chunks.push(Buffer.from(chunk));
      complete();
    });
    child.stderr.on("data", (chunk) => {
      if (worker !== current) return;
      current.stderr += chunk.toString("utf8");
      let newline;
      while ((newline = current.stderr.indexOf("\n")) >= 0) {
        const line = current.stderr.slice(0, newline);
        current.stderr = current.stderr.slice(newline + 1);
        // Pinned Piper 2023.11.14-2 reports cumulative synthesized duration.
        // With sentence_silence=0 it exactly frames PCM, regardless of pipe event order.
        const match = /Real-time factor:.*audio=([0-9.eE+-]+) sec/.exec(line);
        if (match && job) {
          const samples = Math.round(Number(match[1]) * 22050);
          job.expected = (samples - current.totalSamples) * 2;
          current.totalSamples = samples;
          if (
            !Number.isSafeInteger(job.expected) ||
            job.expected < 2 ||
            job.expected > 8 * 1024 * 1024
          ) {
            job.finish(new Error("Piper не создал корректное аудио."));
            return;
          }
          complete();
        }
      }
      current.stderr = current.stderr.slice(-4096); // Never log phonemes, text or paths.
    });
    return current;
  }
  function complete() {
    if (!job || job.expected === null || job.total < job.expected) return;
    if (job.total !== job.expected) {
      job.finish(new Error("Повреждённый аудиопоток Piper."));
      return;
    }
    job.finish(null, wavFromPCM(Buffer.concat(job.chunks)));
  }
  function stop(owner) {
    if (job && (!owner || job.owner === owner)) job.finish(null, null);
  }
  async function warm(rate = 1.25) {
    await prepare();
    if (!disposed && !job) ensureWorker(rate);
  }
  async function synthesize(owner, text, rate = 1.25) {
    if (
      typeof text !== "string" ||
      !text.trim() ||
      text.length > 2500 ||
      !Number.isFinite(rate) ||
      rate < 0.7 ||
      rate > 1.8
    )
      throw new Error("Некорректные параметры голоса.");
    if (disposed) throw new Error("Озвучка остановлена.");
    if (job) throw new Error("Голос уже занят.");
    return new Promise((resolve, reject) => {
      let done = false;
      const destroyed = () => stop(owner);
      const timer = setTimeout(
        () => finish(new Error("Локальная озвучка не завершилась вовремя.")),
        timeoutMs,
      );
      const finish = (error, audio) => {
        if (done) return;
        done = true;
        clearTimeout(timer);
        owner.removeListener("destroyed", destroyed);
        owner.removeListener("did-start-navigation", destroyed);
        job = null;
        if (!audio) killWorker();
        error ? reject(error) : resolve(audio);
      };
      job = { owner, finish, total: 0, expected: null, chunks: [] };
      owner.once("destroyed", destroyed);
      owner.once("did-start-navigation", destroyed);
      prepare().then(
        () => {
          if (done) return;
          try {
            ensureWorker(rate).child.stdin.write(
              text.replace(/[\r\n\0]+/g, " ") + "\n",
              "utf8",
            );
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
    warm,
    synthesize,
    stop,
    state: () => ({ ...state }),
    dispose() {
      disposed = true;
      download?.abort();
      stop();
      killWorker();
    },
  };
}
module.exports = { createLocalVoice, validFile, wavFromPCM };
