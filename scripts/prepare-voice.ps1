$ErrorActionPreference = 'Stop'
$root = Join-Path $PSScriptRoot '..\voice-engine'
New-Item -ItemType Directory -Force $root | Out-Null
$zip = Join-Path $root 'piper.zip'
Invoke-WebRequest 'https://github.com/rhasspy/piper/releases/download/2023.11.14-2/piper_windows_amd64.zip' -OutFile $zip
if ((Get-Item $zip).Length -ne 22477236) { throw 'Unexpected Piper archive size' }
Expand-Archive $zip -DestinationPath $root -Force
Remove-Item $zip
$exe = Get-ChildItem $root -Recurse -Filter piper.exe | Select-Object -First 1
if (-not $exe) { throw 'Piper executable missing' }
$engine = Split-Path $exe.FullName
# Package licenses and a source reference for the separately invoked engine.
Invoke-WebRequest 'https://raw.githubusercontent.com/rhasspy/piper/2023.11.14-2/LICENSE.md' -OutFile (Join-Path $engine 'PIPER-LICENSE.txt')
Invoke-WebRequest 'https://raw.githubusercontent.com/espeak-ng/espeak-ng/1.51/COPYING' -OutFile (Join-Path $engine 'ESPEAK-NG-COPYING.txt')
@'
Piper 2023.11.14-2: https://github.com/rhasspy/piper/tree/2023.11.14-2 (MIT)
Piper phonemize: https://github.com/rhasspy/piper-phonemize (MIT; eSpeak NG component GPLv3)
eSpeak NG sources/build instructions: https://github.com/espeak-ng/espeak-ng
ONNX Runtime: https://github.com/microsoft/onnxruntime (MIT)
Denis voice: https://huggingface.co/rhasspy/piper-voices/tree/c10ece1aade47bb51c153c893d14e5bf8e5b7117/ru/ru_RU/denis/medium
Voice repository MIT; model card identifies training dataset as CC0. No cloning of a user voice.
'@ | Set-Content -Encoding utf8 (Join-Path $engine 'SOURCES.txt')
$destination = Join-Path $root 'runtime'
if ($engine -ne $destination) { Copy-Item $engine $destination -Recurse -Force }
