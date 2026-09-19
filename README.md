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
