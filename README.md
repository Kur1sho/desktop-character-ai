# Desktop Companion

A local-first animated desktop companion for Windows, by Kur1sho.

Characters live on your taskbar, pop up when summoned, and (in later phases) talk with real personalities, dance to your music, play games with you, and do safe tasks you approve. Your data stays on your PC.

![Placeholder Robotico](docs/robotico-placeholder.png)

## What works so far

- A transparent, always-on-top overlay that covers the screen but lets clicks through everywhere except the character
- The character stands on top of the taskbar and pops up out of it with a little bounce and a wave
- A placeholder **Robotico** built from simple shapes until the real model is ready
- Load any **VRM** model (VRoid Studio, Blender) from the tray menu, or drop one in `assets/characters/` to load it on start
- Idle life: breathing, blinking, and the head follows your mouse
- Drag the character left and right along the taskbar
- Double-click the character, or click the tray icon, to summon it again
- **Talk to it**: click the character (or press Ctrl+Shift+Space) and type. It answers in a speech bubble, in character, with matching facial expressions
- Two personalities: **Robotico** (deadpan robot) and **Suzu** (tsundere, placeholder name)
- Choose the AI in Settings (tray menu): local **Ollama** (free, private), or your own key for **Claude**, **OpenAI**, **OpenRouter** or **Gemini**
- Keys are encrypted with Windows' own protection and never shown again; chat history is stored only on your PC, with a button to wipe it

## Running it on Windows

1. Install [Node.js LTS](https://nodejs.org) and [Git](https://git-scm.com)
2. Open a terminal (PowerShell) and run:

   ```powershell
   git clone https://github.com/Kur1sho/desktop-character-ai.git
   cd desktop-character-ai
   npm install
   npm run dev
   ```

   If PowerShell says scripts are disabled, run `Set-ExecutionPolicy -Scope CurrentUser RemoteSigned` once first.

3. Robotico appears above your taskbar near the right. The teal dot in the system tray has the menu (Summon, Load VRM character, Quit).

## Free local AI (optional)

1. Install [Ollama](https://ollama.com)
2. In PowerShell: `ollama pull gemma3:4b`
3. That's it: Ollama is the default provider, so just click the character and type

## Scripts

| Command | What it does |
| --- | --- |
| `npm run dev` | Runs the app with live reload |
| `npm run build` | Builds into `out/` |
| `npm start` | Runs the built app |
| `npm test` | Runs the unit tests |
| `npm run typecheck` | Checks types |

## Project layout

```
src/main/       Electron main process: overlay window, tray, click-through
src/preload/    The safe bridge between the window and the main process
src/renderer/   The 3D scene and characters (three.js + three-vrm)
src/shared/     Code used by both sides (layout maths, message names)
tests/          Unit tests
assets/         Character models (VRM files are git-ignored by default)
```

## Licence

Copyright Kur1sho. All rights reserved. The action layer will be published separately under an open-source licence.
