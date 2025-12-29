# Robot Trainer

**Overview**

Robot Trainer is an Electron desktop application built with Vite + React (TypeScript) that integrates a bundled Python runtime for robot-related tooling. The project packages a small Python utility (built with PyInstaller) alongside the Electron app so native robot integrations can run as a standalone binary.

**Quick Links**
- **Repository root**: [package.json](package.json)
- **Main process / preload / renderer**: [src/main.ts](src/main.ts), [src/preload.ts](src/preload.ts), [src/renderer.ts](src/renderer.ts)
- **Bundled Python code**: [src/python](src/python)

**Development Requirements**
- Node.js (recommended v18+)
- Python 3.10+ (for building the bundled Python binary)
- [`uv`](https://docs.astral.sh/uv) or other Python package manager for Python dependencies.
- Platform-specific build tools when creating installers

**Quick Start (development)**

Install dependencies:

```bash
npm install
uv sync
```

Run the app in development (renderer served by Vite):

```bash
npm run start
```

Run Electron in headless/debug mode (useful for CI or debugging):

```bash
npm run browser
```

**Scripts**
- `npm run start` — Start Electron using electron-forge (development).
- `npm test` — Run unit tests via `vitest`.
- `npm run test:playwright` — Build/package and run Playwright tests (integration).
- `npm run build-python` — Build the Python helper into a single executable using PyInstaller (runs in `src/python`).
- `npm run package` — Create a packaged app (runs `prepackage` first to build Python).
- `npm run make` — Produce OS installers using electron-forge makers.

**Project Structure (high level)**

- `src/` — Application source
  - `main.ts` — Electron main process entry
  - `preload.ts` — Preload script exposing safe APIs
  - `renderer.tsx` / `app.tsx` — React renderer
  - `ui/` — Reusable UI components
  - `views/` — App views
  - `lib/` — Core logic, device integration, tests
  - `python/` — Python helper script and PyInstaller config
- `forge.config.ts` — electron-forge config (extra resource includes built Python binary)
- `vite.*.config.*` — Vite configs for main, preload, renderer
- `package.json` — Scripts and dependencies

**Building & Packaging**

Before packaging, build the Python binary (this is also run automatically by the `prepackage` script):

```bash
npm run build-python
# This runs pyinstaller inside src/python and produces dist/robot_trainer_py
```

Then package the Electron app (example):

```bash
npm run package
# or
npm run make
```

Note: `forge.config.ts` includes `extraResource: ['src/python/dist']` so the packaged app can find the Python executable at runtime.

**Testing**

- Unit tests: `npm test` (uses `vitest`, configured in `vitest.config.ts` to include `src/**/*.test.ts`).
- Integration / E2E: `npm run test:playwright` — packages the app and runs Playwright tests defined in `src/tests`.

**Development Notes**

- The `vite.main.config.ts` marks `serialport` as external to avoid bundling native bindings into the renderer/main bundle.
- Electron version and native module compatibility can be sensitive; if you change Electron, rebuild native modules (e.g., `electron-rebuild`) as needed.
- The renderer uses React + Tailwind; Vite config for the renderer is in `vite.renderer.config.mts`.

**Where to look for robot integrations**
- `src/lib/robot.ts` and `src/lib/serial_devices.ts` contain core device and serial port logic.
- Mock modules and tests are in `src/robot_sdk/testing/mock_modules` and `src/lib/test_fixtures.ts` respectively.

**License & Author**
- Author: Bernie Telles <btelles@gmail.com>
- License: MIT
