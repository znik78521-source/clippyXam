const { spawn: nodeSpawn } = require("node:child_process");
const path = require("node:path");
// Fixed local Windows recognizer. No transcript/user text is interpolated in commands.
const SCRIPT = String.raw`
$ErrorActionPreference='Stop'
[Console]::OutputEncoding = New-Object System.Text.UTF8Encoding($false)
$engine=$null
try {
  Add-Type -AssemblyName System.Speech
  $recognizer=[System.Speech.Recognition.SpeechRecognitionEngine]::InstalledRecognizers() | Where-Object { $_.Culture.Name -eq 'ru-RU' } | Select-Object -First 1
  if ($null -eq $recognizer) { @{error='no-language'} | ConvertTo-Json -Compress; exit }
  $engine=New-Object -TypeName System.Speech.Recognition.SpeechRecognitionEngine -ArgumentList $recognizer
  $grammar=New-Object System.Speech.Recognition.DictationGrammar
  $engine.LoadGrammar($grammar)
  $engine.SetInputToDefaultAudioDevice()
  $result=$engine.Recognize([TimeSpan]::FromSeconds(15))
  if ($null -eq $result) { @{text=''} | ConvertTo-Json -Compress }
  else { @{text=$result.Text} | ConvertTo-Json -Compress }
} catch { @{error='unavailable'} | ConvertTo-Json -Compress }
finally { if ($null -ne $engine) { $engine.Dispose() } }
`;
function createDictation({
  platform = process.platform,
  spawn = nodeSpawn,
  timeoutMs = 22000,
} = {}) {
  let job = null;
  function stop(owner) {
    if (job && (!owner || job.owner === owner)) job.finish(null, "");
  }
  function start(owner) {
    if (platform !== "win32")
      return Promise.reject(
        new Error("Нативный голосовой ввод доступен только в Windows."),
      );
    if (job) return Promise.reject(new Error("Микрофон уже используется."));
    return new Promise((resolve, reject) => {
      let child,
        timer,
        total = 0,
        done = false;
      const chunks = [];
      const destroy = () => stop(owner);
      const finish = (error, text = "") => {
        if (done) return;
        done = true;
        clearTimeout(timer);
        owner.removeListener("destroyed", destroy);
        owner.removeListener("did-start-navigation", destroy);
        job = null;
        child?.kill();
        error ? reject(error) : resolve(text);
      };
      job = { owner, finish };
      owner.once("destroyed", destroy);
      owner.once("did-start-navigation", destroy);
      try {
        child = spawn(
          path.join(
            process.env.SystemRoot || "C:\\Windows",
            "System32",
            "WindowsPowerShell",
            "v1.0",
            "powershell.exe",
          ),
          [
            "-NoLogo",
            "-NoProfile",
            "-NonInteractive",
            "-EncodedCommand",
            Buffer.from(SCRIPT, "utf16le").toString("base64"),
          ],
          { windowsHide: true, stdio: ["ignore", "pipe", "ignore"] },
        );
        timer = setTimeout(
          () => finish(new Error("Время голосового ввода истекло.")),
          timeoutMs,
        );
        child.stdout.on("data", (chunk) => {
          total += chunk.length;
          if (total > 65536) finish(new Error("Ошибка распознавания речи."));
          else chunks.push(Buffer.from(chunk));
        });
        child.once("error", () =>
          finish(
            new Error("Не удалось запустить системный распознаватель речи."),
          ),
        );
        child.once("close", () => {
          if (done) return;
          try {
            const result = JSON.parse(
              Buffer.concat(chunks)
                .toString("utf8")
                .replace(/^\uFEFF/, ""),
            );
            if (result.error)
              throw new Error(
                result.error === "no-language"
                  ? "Не найден совместимый русский ru-RU распознаватель System.Speech. Языковой пакет Windows не всегда содержит этот движок."
                  : "Проверь микрофон и разрешение для desktop-приложений в настройках Windows.",
              );
            if (typeof result.text !== "string")
              throw new Error("Некорректный ответ распознавателя.");
            finish(null, result.text.trim().slice(0, 2000));
          } catch (error) {
            finish(
              new Error(
                error instanceof SyntaxError
                  ? "Не удалось распознать речь."
                  : error.message,
              ),
            );
          }
        });
      } catch {
        finish(new Error("Не удалось открыть микрофон."));
      }
    });
  }
  return { start, stop };
}
module.exports = { createDictation };
