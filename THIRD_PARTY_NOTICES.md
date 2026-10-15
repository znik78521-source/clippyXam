# Third-party notices

## ClippyJS

Source: https://github.com/pi0/clippyjs
Package: `clippyjs@0.1.0`

The application extracts original sprite sheets and animation data for Clippy, Rover and Merlin from this package. Binary resources are generated locally during dev/build and not duplicated in this repository's source history.

Upstream licence:

> Copyright (c) 2012 Fireplace, Inc - 2017 Pooya Parsa
>
> Permission is hereby granted, free of charge, to any person obtaining a copy of this software and associated documentation files (the "Software"), to deal in the Software without restriction, including without limitation the rights to use, copy, modify, merge, publish, distribute, sublicense, and/or sell copies of the Software, and to permit persons to whom the Software is furnished to do so, subject to the following conditions:
>
> The above copyright notice and this permission notice shall be included in all copies or substantial portions of the Software.
>
> THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.
>
> THE ABOVE LICENSE IS FOR THE CODE (JAVASCRIPT AND CSS) IN CLIPPY.JS ONLY.
> All Microsoft agents, including agent names, the Clippy brand and all resources are the property of Microsoft and their respective owners.

**The MIT code licence is not a licence to the Microsoft character artwork or brands.** This fan prototype is not affiliated with or endorsed by Microsoft. Resource licensing must be reviewed before public or commercial distribution. No rights to the original character artwork are asserted by this project.

The middle-finger SVG overlay, CSS departure/peek transitions, favicon, tray icon and desktop icons are newly authored for this prototype. They are not original Microsoft Agent animations. Speech uses browser/OS voices or an explicitly enabled OpenAI TTS service with a separate user key. Cloud voices are AI-generated, not original character voices. Provider terms and charges apply; no provider audio is bundled.

## Other packages

- React and React DOM — MIT, Meta Platforms, Inc. and affiliates.
- Lucide icons — ISC, Lucide Contributors. See the licence distributed in `lucide-react`.
- Electron — MIT, Electron contributors. Includes Chromium/Node.js with their own notices; see the runtime distribution licences.
- Vite — MIT, Evan You and contributors.
- TypeScript — Apache-2.0, Microsoft Corporation.
- Playwright — Apache-2.0, Microsoft Corporation.

Full package licences remain available with the dependencies in `node_modules`. Runtime code and artwork have separate licensing considerations as described above.


## Piper / русский голос Denis (0.4.0)

Piper 2023.11.14-2 вызывается отдельным процессом из portable, без установки в Windows. Код Piper — MIT (Michael Hansen); https://github.com/rhasspy/piper/tree/2023.11.14-2 . Поставляемый runtime содержит собственные библиотеки и eSpeak NG (GPLv3); лицензия eSpeak NG и ссылки на исходники добавляются рядом с runtime при сборке. Исходники компонентов: https://github.com/rhasspy/piper-phonemize и https://github.com/espeak-ng/espeak-ng ; ONNX Runtime — MIT, https://github.com/microsoft/onnxruntime . Не объявляем все сторонние компоненты лицензированными под MIT.

Голос ru_RU-denis-medium скачивается с публичного https://huggingface.co/rhasspy/piper-voices/ по закреплённой ревизии c10ece1aade47bb51c153c893d14e5bf8e5b7117. Репозиторий указывает MIT, MODEL_CARD данного голоса указывает датасет CC0: https://github.com/OHF-Voice/voice-datasets . Модель 63 201 294 байта проверяется по SHA-256 15fab56e11a097858ee115545d0f697fc2a316c41a291a5362349fb870411b0a; config и MODEL_CARD — по Git blob hashes. Текст пользователя не передаётся на сервер скачивания. Голос не является оригинальным голосом персонажей Microsoft или клоном пользователя.

## New Clippy artwork (0.9)

`public/authored/clippy` contains new AI-generated reference-based drawings, not copied animation frames from ClippyJS. The character design remains associated with its original rights holder; the project does not claim official Microsoft provenance or exclusive rights to that design. Runtime uses these drawings with procedural local deformation and an independently implemented inertia model. `manifest.json` records file hashes. Original Agent artwork is retained separately for Rover/Merlin and explicit legacy mode.
