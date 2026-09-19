import type { ProviderId } from '@shared/app-info'
import { ClaudeLogo, CodexLogo, CopilotLogo } from './provider-logos'

const LOGOS: Record<ProviderId, (props: { className?: string }) => React.JSX.Element> = {
  claude: ClaudeLogo,
  codex: CodexLogo,
  copilot: CopilotLogo
}

/** The provider's logo on a small tile, wherever the provider is named. */
export function ProviderMark({ provider }: { provider: ProviderId }): React.JSX.Element {
  const Logo = LOGOS[provider]
  return (
    <span
      aria-hidden
      data-provider={provider}
      className="bg-muted ring-border text-foreground grid size-6 shrink-0 place-items-center rounded-md ring-1"
    >
      <Logo className="size-4" />
    </span>
  )
}
