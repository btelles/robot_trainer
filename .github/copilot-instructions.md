<!-- Copilot / AI agent instructions for contributors to Robot Trainer -->
# Robot Trainer — Copilot instructions

This file gives focused, actionable guidance for AI coding agents working in this repository.

- **Big picture**: Electron app (main + preload + renderer) using Vite + React (TypeScript). The renderer owns the Drizzle DB and UI; the main process coordinates native integrations (serial ports, subprocesses, Python envs) and communicates with renderer via IPC exposed by `preload.ts`.

- **Key entry points**:
  - `src/main.ts` — Electron main process, many platform integrations and IPC handlers live here.
  - `src/preload.ts` — Safe contextBridge API. Use these methods instead of calling ipcRenderer directly in new renderer code.
  - `src/renderer.ts` / `src/app.tsx` — Bootstraps React and runs `migrate()` (drizzle migration) before rendering.
  - `src/db/*` — Drizzle schema, migrations and `configResource` used for persistent settings.
  - `src/lib/*` — Logic and helpers: `VideoManager.ts` (ffmpeg/python subprocess management + WebSocket streaming), `config_manager.ts`, `serial_devices.ts`, `python_scanner.ts`.

- **Important patterns / conventions**:
  - IPC pattern: main requests actions from renderer using events and expects replies. Examples: `request-load-system-settings` / `reply-load-system-settings`, `request-save-system-settings` / `reply-save-system-settings`, and `system-settings-changed` broadcasts. Use `window.electronAPI` helpers defined in `preload.ts` in renderer code.
  - The renderer is the single source of truth for settings via Drizzle (`configResource.getAll()` / `configResource.setAll()`). The main process expects the renderer to persist settings and does not fall back to writing `system-settings.json`.
  - Use `configResource` or `ConfigManager` for reading/updating settings; `ConfigManager` deep-merges defaults and writes via `configResource`.
  - Long-running native tasks 
     - (ffmpeg, python simulation) are managed in the main process via `VideoManager`
       - ffmpeg process spawns and streams binary frames to WebSocket clients.
       - Simulation process starts by using the a system Python installation with Anaconda or Miniconda that the user sets up when they first start the application.

- **Build / test / dev workflows** (explicit commands)
  - Install deps: `npm install` (and `uv sync` for python deps if used locally as in README).
  - Dev run: `npm run start` — runs drizzle generate, generates db assets and starts electron-forge dev.
  - Unit tests: `npm test` (vitest).
  - E2E/packaged tests: `npm run test:playwright` (runs `db:generate`, packages the app and executes Playwright tests — heavy operation).
  - Build python helper: `npm run build-python` (requires Python 3.10+ and pyinstaller installed).
  - Package / make installers: `npm run package` / `npm run make` (packaging runs `prepackage` which calls `build-python`).

- **When editing or adding IPC handlers**
  - Add handler in `src/main.ts` with `ipcMain.handle(...)` or `ipcMain.on(...)`.
  - Expose corresponding function in `src/preload.ts` via `contextBridge.exposeInMainWorld('electronAPI', { ... })`.
  - Call it from renderer via `window.electronAPI.<method>()`. For request/reply flows favor the existing event names to keep UI and main process behavior consistent.

- **Files to inspect for changes or to learn patterns**
  - Settings flow: `src/app.tsx`, `src/lib/config_manager.ts`, `src/db/resources.ts` (DB resource accessors), `src/db/schema.ts`.
  - Native integration: `src/main.ts`, `src/lib/serial_devices.ts`, `src/lib/python_scanner.ts`, `src/lib/VideoManager.ts`.
  - Build/packaging config: `forge.config.ts`, `vite.*.config.*`, `package.json` scripts.

- **Pitfalls and compatibility notes**
  - Native modules (e.g., `serialport`) require rebuild for Electron ABI changes — use `electron-rebuild` if bumping Electron.
  - Playwright tests package the app; expect slow runs and platform-specific flakiness.
  - Many main-process helpers prefer `conda`/Miniconda; main will look for `conda` in `systemSettings.condaRoot`, common locations, or PATH.

- **Quick examples**
  - Read system settings from renderer (renderer should call): `const cfg = await configResource.getAll(); window.electronAPI.replyLoadSystemSettings(cfg);`
  - Main asks renderer to save settings: `mainWindow.webContents.send('request-save-system-settings', settings)` and listens for `reply-save-system-settings`.