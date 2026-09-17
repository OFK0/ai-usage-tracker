# LLM Usage Tracker

A small desktop widget that shows how much of your LLM coding allowance is left, for
Claude Code, Codex and GitHub Copilot, without opening a CLI or an IDE panel.

## Why it reads local files instead of asking for API keys

Subscription limits (Claude Max, ChatGPT Plus, Copilot) are not exposed through the
pay-as-you-go API keys. Those keys only report API spend. The session and weekly
windows come from the credentials the official CLIs already store on your machine:

| Provider | Source                                                                                                    |
| -------- | --------------------------------------------------------------------------------------------------------- |
| Claude   | OAuth token from `~/.claude/.credentials.json`, falling back to the session logs in `~/.claude/projects/` |
| Codex    | Access token from `~/.codex/auth.json`, falling back to `~/.codex/sessions/`                              |
| Copilot  | `gh auth token`, the editor token, or a personal access token you supply                                  |

An API key is optional and only adds a spend card.

Tokens are read but never written, never logged, and never sent anywhere except the
provider they belong to. Any key you type into settings is encrypted with the OS
keychain through Electron's `safeStorage`.

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
