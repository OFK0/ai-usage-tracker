# AI Usage Tracker

A small desktop widget that shows how much of your AI coding allowance is left,
for Claude Code, Codex and GitHub Copilot, without opening a CLI or an IDE panel.

## What it shows

For each provider you connect:

- **Claude**: the 5 hour session and the weekly limits, per model where your
  plan has them, and extra usage credits if they're on.
- **Codex**: the 5 hour and the weekly limits.
- **Copilot**: the monthly chat, code completion and premium request quotas,
  with the raw count ("26 of 2,000"). A quota your plan doesn't include shows as
  "Not in plan", never as used up.
- **Antigravity**: the 5 hour and weekly limits of each model group (Gemini,
  and Claude and GPT), while Antigravity is running.

Each limit has a bar that turns amber and then red as it fills, and a countdown
to when it resets. The plan (Pro, Plus, Free…) shows next to the name. When a
provider can't be reached, the last numbers stay on screen, greyed out, with how
old they are. With an Admin API key, Claude and Codex also show API spend for
today and this month.

The widget lives in the tray. Click the tray icon to show or hide it; right-click
for Refresh, Settings and Quit.

## Install

Installers are on the [Releases](https://github.com/OFK0/ai-usage-tracker/releases)
page: NSIS for Windows (x64, arm64), dmg or zip for macOS (Intel, Apple silicon),
AppImage or deb for Linux. To build them yourself, see [Development](#development).

The app isn't code signed yet, so the first launch asks for a click-through:

- **Windows**: SmartScreen says it protected your PC. Choose More info, then
  Run anyway.
- **macOS**: the app is signed ad hoc only, so Gatekeeper won't open it from a
  double-click. Right-click it and choose Open, or run
  `xattr -dr com.apple.quarantine "/Applications/AI Usage Tracker.app"`.

## Connecting providers

Nothing is read until you connect a provider in Settings. Each one has a connect
switch, off by default, and the widget points you there until it's on.

Subscription limits (Claude Pro/Max, ChatGPT Plus/Pro, Copilot) aren't available
through API keys, which only know about pay-as-you-go spend. The limits come from
the sign-in each official tool already keeps on your machine, and that's what the
connect switch lets the app read. So first sign in to the tool itself:
`claude`, `codex`, or `gh auth login` for Copilot.

| Provider    | The connect switch reads                                                                                                           | Optional field in Settings | What that adds                              |
| ----------- | ---------------------------------------------------------------------------------------------------------------------------------- | -------------------------- | ------------------------------------------- |
| Claude      | Claude Code's sign-in: the macOS keychain, or `~/.claude/.credentials.json` (`$CLAUDE_CONFIG_DIR`). Its session logs as a fallback | Anthropic Admin API key    | API spend, from Anthropic's cost report     |
| Codex       | Codex CLI's sign-in: `~/.codex/auth.json` (`$CODEX_HOME`). Its session logs as a fallback                                          | OpenAI Admin API key       | API spend, from OpenAI's organization costs |
| Copilot     | The GitHub CLI's sign-in (`gh auth token`), or else the Copilot editor extension's (`github-copilot/apps.json`)                    | GitHub token               | Used instead of those sign-ins              |
| Antigravity | Antigravity's own language server on 127.0.0.1, found from its process while it runs                                               | None                       |                                             |

### The optional fields

- **Admin API keys** are only for API spend. You don't need one for your plan's
  limits. They're organization keys, so only an organization admin can create
  them: in the [Anthropic Console](https://console.anthropic.com/settings/admin-keys)
  (`sk-ant-admin…`) or the [OpenAI dashboard](https://platform.openai.com/settings/organization/admin-keys)
  (`sk-admin-…`). A regular API key won't work there. Spend is counted in UTC
  days and refreshed every 15 minutes at most, since the reports lag behind
  anyway. It shows even while the provider isn't connected, since you gave the
  key to the app yourself.
- **GitHub token**: used for Copilot instead of the GitHub CLI's or the
  editor's sign-in, and it works without the connect switch. The one
  `gh auth token` prints works.
- There's no token field for Claude's limits: `claude setup-token` only grants
  the `user:inference` scope, and the usage endpoint needs `user:profile`.

Test connection, under each provider, checks it straight away instead of at
the next refresh. Hover the status line for the technical reason when something
is wrong.

### What happens to your data

- Sign-ins are read, never written, never logged, and only ever sent to the
  provider they belong to. Refresh tokens are left alone: each tool renews its
  own sign-in when you use it, and until then the widget asks you to open it.
- Keys and tokens typed into Settings are encrypted with the OS keychain
  through Electron's `safeStorage` (DPAPI on Windows, the Keychain on macOS,
  libsecret on Linux). On Linux without a keyring they can't be saved at all
  rather than be stored weakly. The settings window only ever gets back the
  last four characters.
- Antigravity is only ever talked to on 127.0.0.1. The app finds its language
  server's process, reads the token that server was started with from its
  command line, and asks it for the quotas. Nothing about it leaves this
  computer. Its backend has been seen reporting 100% left whatever the use, so
  treat a suspiciously full quota with care.
- Turning a connect switch off drops what was read from that tool.
- Settings live in `%APPDATA%\AI Usage Tracker` on Windows,
  `~/Library/Application Support/AI Usage Tracker` on macOS and
  `~/.config/AI Usage Tracker` on Linux.

## How often it refreshes

Every minute while the widget is showing, which you can change from 30 seconds
to 30 minutes. While it's hidden, at most every 5 minutes. It also checks again
right after a limit resets. When a provider fails it backs off, up to 30 minutes,
and when a provider rate limits it, it waits as long as asked.

## Settings

- **General**: language, launch at login.
- **Appearance**: theme (system, light or dark), accent colour, reduce motion.
- **Widget**: always on top, opacity (fully opaque while the pointer is over
  it), refresh interval.
- **Providers**: show in widget, connect, the optional field, test connection.

The app is in English, Turkish, French, German, Italian, Russian and Arabic,
with a right-to-left layout for Arabic. It follows the system language unless
you pick one.

### Launch at login

- Windows and macOS: a login item through Electron. On Windows it's a value
  under `HKCU\Software\Microsoft\Windows\CurrentVersion\Run`, and switching it
  off in Task Manager shows up as off in the app too.
- Linux: `~/.config/autostart/ai-usage-tracker.desktop` (or under
  `$XDG_CONFIG_HOME`). Inside an AppImage it points at the AppImage file.
- macOS only runs login items reliably for signed and notarized apps, so an
  unsigned build may not start at login.

### Staying on top

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

## Development

Needs Node.js 20 or newer and npm 10 or newer.

```bash
npm install
npm run dev
```

| Script                   | Purpose                                    |
| ------------------------ | ------------------------------------------ |
| `npm run dev`            | Start the app with hot reload              |
| `npm run build`          | Typecheck and build for production         |
| `npm run lint`           | Run ESLint                                 |
| `npm run format`         | Format with Prettier                       |
| `npm run typecheck`      | Typecheck main, preload and renderer       |
| `npm run test`           | Run the unit and component tests           |
| `npm run test:e2e`       | Build, then smoke test the real app        |
| `npm run dist:win`       | NSIS installers, x64 and arm64             |
| `npm run dist:mac`       | dmg and zip, x64 and arm64 (on macOS)      |
| `npm run dist:linux`     | AppImage and deb (on Linux)                |
| `npm run generate:icons` | Redraw the tray icons and `build/icon.png` |

In development, launch at login registers Electron plus the project folder,
which starts the last build in `out/`.

### Releases

Installers go to `release/<version>/`. Pushing a `v*` tag that matches the
version in `package.json` builds all of them on GitHub Actions and attaches them
to a draft release, to publish by hand once it's checked. The release notes come
from `docs/releases/<tag>.md`, written before tagging, or GitHub generates them
if there's no such file. Changes to the packaging setup get the same build on
their pull request, without the release.

If a release run fails after the tag is pushed, run the Release workflow by hand
with that tag. It builds the tagged code with the current workflow and fills in
the draft the failed run left behind.

### Icons

The SVG sources for the app icon and the tray glyph are in [`design/`](design/),
with the numbers behind them. The tray icons and `build/icon.png` are drawn from
the same numbers by `scripts/generate-tray-icons.mjs` and
`scripts/generate-app-icon.mjs`, which write raw RGBA and encode PNG with
`node:zlib`, so no image tooling is needed. electron-builder derives the `.ico`,
`.icns` and Linux sizes from `build/icon.png`.

### Git hooks

- `commit-msg` checks the Conventional Commits format with commitlint
- `pre-commit` runs lint-staged (ESLint, then Prettier, on staged files)
- `pre-push` runs the typecheck and the tests

### Tech stack

Electron, electron-vite, React, TypeScript, Tailwind CSS v4, shadcn/ui, Motion,
i18next, koffi, Vitest, Playwright, electron-builder.

## License

MIT

The provider logos come from [Lobe Icons](https://github.com/lobehub/lobe-icons)
(MIT). Claude, Codex and GitHub Copilot are trademarks of Anthropic, OpenAI and
GitHub; their logos are only used to show whose limits a card is about.
