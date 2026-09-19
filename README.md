# AI Usage Tracker

A small desktop widget that shows how much of your LLM coding allowance is left, for
Claude Code, Codex and GitHub Copilot, without opening a CLI or an IDE panel.

## Where the numbers come from

Nothing is read until you connect a provider in Settings. Each provider has a
connect switch, off by default, and the widget points you there until it's on.

Subscription limits (Claude Pro/Max, ChatGPT Plus, Copilot) aren't exposed
through pay-as-you-go API keys, which only report API spend. The session and
weekly windows come from the sign-in the official CLI already keeps on your
machine, so that's what connecting allows the app to read:

| Provider | What connecting reads                                                                                            |
| -------- | ---------------------------------------------------------------------------------------------------------------- |
| Claude   | Claude Code's sign-in (the macOS keychain, or `~/.claude/.credentials.json`), and its session logs as a fallback |
| Copilot  | The GitHub CLI's sign-in (`gh auth token`), or else the Copilot extension's (`github-copilot/apps.json`)         |

Codex follows the same rule when it lands. For Copilot you can also paste a
GitHub token in Settings; it's used instead of those sign-ins and works without
the connect switch, since you gave it to the app yourself.

Pasting a long-lived token instead doesn't work for Claude: `claude setup-token`
only grants the `user:inference` scope, and the usage endpoint needs
`user:profile`.

The sign-in is read but never written, never logged, and only ever sent to the
provider it belongs to. The optional Anthropic Admin API key in Settings adds your
API spend. Keys and tokens entered in Settings are encrypted with the OS keychain
through Electron's `safeStorage`.

## Launch at login

Settings → General → Launch at login.

- Windows and macOS: a login item through Electron. On Windows it's a value
  under `HKCU\Software\Microsoft\Windows\CurrentVersion\Run`, and switching
  it off in Task Manager shows up as off in the app too.
- Linux: `~/.config/autostart/ai-usage-tracker.desktop` (or under
  `$XDG_CONFIG_HOME`). Inside an AppImage it points at the AppImage file.
- macOS only runs login items reliably for signed and notarized apps, so an
  unsigned build may not start at login.
- In development it registers Electron plus the project folder, which starts
  the last build in `out/`.

## Staying on top

With Always on top on, the widget floats above other windows but keeps out of
the way of fullscreen apps:

- Windows: the app asks Windows once a second whether something is fullscreen
  (`SHQueryUserNotificationState`, through [koffi](https://koffi.dev)), hides
  the widget while it is, and brings it back afterwards without taking focus.
  It goes by what Windows reports, so it applies whichever display the
  fullscreen app is on, and a game Windows doesn't count as fullscreen leaves
  the widget where it is.
- macOS: the widget is on every desktop except fullscreen Spaces.
- Linux: window managers differ too much to tell reliably, so the widget just
  stays on top.

## Requirements

- Node.js 20 or newer
- npm 10 or newer

## Development

```bash
npm install
npm run dev
```

## Scripts

| Script              | Purpose                              |
| ------------------- | ------------------------------------ |
| `npm run dev`       | Start the app with hot reload        |
| `npm run build`     | Typecheck and build for production   |
| `npm run lint`      | Run ESLint                           |
| `npm run format`    | Format with Prettier                 |
| `npm run typecheck` | Typecheck main, preload and renderer |
| `npm run test`      | Run the test suite                   |
| `npm run test:e2e`  | Build, then smoke test the real app  |

## Installers

```bash
npm run dist:win     # NSIS installer, x64 and arm64
npm run dist:mac     # dmg and zip, x64 and arm64 (on macOS)
npm run dist:linux   # AppImage and deb (on Linux)
```

Output goes to `release/<version>/`. The app icon is generated into
`build/icon.png` by `npm run generate:icons`, and electron-builder derives the
`.ico`, `.icns` and Linux sizes from it.

Pushing a `v*` tag that matches the version in `package.json` builds all of
them on GitHub Actions and attaches them to a draft release, to publish by
hand once it's checked. Changes to the packaging setup get the same build on
their pull request, without the release.

v1 isn't code signed, so the first launch asks for a click-through:

- Windows: SmartScreen says it protected your PC. Choose More info, then
  Run anyway.
- macOS: the app is signed ad hoc only, so Gatekeeper won't open it from a
  double-click. Right-click it and choose Open, or run
  `xattr -dr com.apple.quarantine "/Applications/AI Usage Tracker.app"`.

## Tray icons

The tray icons are drawn procedurally by `scripts/generate-tray-icons.mjs`, which
writes raw RGBA and encodes PNG with `node:zlib`, so no image tooling is needed.
Run `npm run generate:icons` after changing the shape or the accent colour.

## Git hooks

Husky runs three hooks:

- `commit-msg` validates the Conventional Commits format with commitlint
- `pre-commit` runs lint-staged (ESLint then Prettier on staged files)
- `pre-push` runs the typecheck and the test suite

## Tech stack

Electron, electron-vite, React, TypeScript, Tailwind CSS v4, shadcn/ui, Vitest.

## License

MIT
