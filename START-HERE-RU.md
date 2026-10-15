# clippyXam — с чего начать

## Нужна программа, а не исходники

Открой [релиз 0.6.1](https://github.com/znik78521-source/clippyXam/releases/tag/v0.6.1-portable) и скачай **clippyXam-0.6.1-win-x64-portable.exe** из Assets. Это portable для Windows 10/11 x64: Node.js и установка не нужны. Подробная инструкция — [PORTABLE-RU.md](PORTABLE-RU.md).

Автоматические Source code ZIP/TAR на странице релиза — **не приложение**. Старые вручную подготовленные исходные ZIP удалены из рабочей ветки, чтобы не путать их с exe.

## Если работаешь с исходниками

Нужен Node.js 22.12+ с npm. Из доступной для записи папки:

```powershell
npm ci
npm run desktop:dev
```

Либо START-WINDOWS.cmd: устанавливает зависимости, запускает Vite и Electron. CHECK-WINDOWS.cmd выполняет проверки без упаковки. Эти два файла нужны только разработчику, пользователю portable они не требуются.

`npm run portable:win` на Windows готовит Piper и создаёт exe в `release/`. Для браузерных тестов: `npx playwright install chromium`, затем `npm run test:e2e`. Не публикуй папки профиля, ключи и личные переписки. Runtime/кэши/аудиопроверки в Git не добавляются.
