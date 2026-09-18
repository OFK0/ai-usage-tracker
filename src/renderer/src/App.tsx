import { useId, useRef } from 'react'
import { RotateCw, Settings, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { useNow, useUsage } from '@/features/usage/hooks'
import { ProviderCard } from '@/features/usage/provider-card'
import { useFitWindowToContent } from '@/lib/use-fit-window'
import { cn } from '@/lib/utils'

/** The tray icon's gauge, drawn in the accent gradient. */
function GaugeMark(): React.JSX.Element {
  const gradient = useId()

  return (
    <svg viewBox="0 0 16 16" className="size-4" aria-hidden>
      <defs>
        <linearGradient id={gradient} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" style={{ stopColor: 'var(--gradient-from)' }} />
          <stop offset="1" style={{ stopColor: 'var(--gradient-to)' }} />
        </linearGradient>
      </defs>
      <path
        d="M4.1 12.2A5.6 5.6 0 1 1 11.9 12.2"
        fill="none"
        stroke={`url(#${gradient})`}
        strokeWidth="2.6"
        strokeLinecap="round"
      />
    </svg>
  )
}

export default function App(): React.JSX.Element {
  const { snapshots, refreshing, refresh } = useUsage()
  const now = useNow()
  const shell = useRef<HTMLElement>(null)
  const scroller = useRef<HTMLDivElement>(null)
  const content = useRef<HTMLDivElement>(null)
  useFitWindowToContent(shell, scroller, content)

  return (
    <div className="flex h-screen w-screen flex-col p-2">
      {/* Takes its natural height, capped at the window, which main keeps sized to it. */}
      <section
        ref={shell}
        className="widget-surface bg-card/90 border-border flex max-h-full min-h-0 flex-col overflow-hidden rounded-xl border shadow-lg backdrop-blur-xl"
      >
        <header className="drag-region flex items-center justify-between px-3 pt-2.5 pb-2">
          <div className="flex items-center gap-2">
            <GaugeMark />
            <h1 className="text-[13px] font-semibold tracking-tight">LLM Usage</h1>
          </div>
          <div className="flex gap-0.5">
            <Button
              className="no-drag text-muted-foreground size-6"
              size="icon"
              variant="ghost"
              aria-label="Refresh usage"
              disabled={refreshing}
              onClick={() => void refresh()}
            >
              <RotateCw className={cn('size-3.5', refreshing && 'animate-spin')} />
            </Button>
            <Button
              className="no-drag text-muted-foreground size-6"
              size="icon"
              variant="ghost"
              aria-label="Open settings"
              onClick={() => window.api.settings.open()}
            >
              <Settings className="size-3.5" />
            </Button>
            <Button
              className="no-drag text-muted-foreground size-6"
              size="icon"
              variant="ghost"
              aria-label="Hide widget"
              onClick={() => window.api.widget.hide()}
            >
              <X className="size-3.5" />
            </Button>
          </div>
        </header>

        <div ref={scroller} className="border-border/60 min-h-0 overflow-y-auto border-t">
          <div ref={content} className="px-3 py-3">
            {snapshots === null ? (
              <p className="text-muted-foreground text-xs">Loading…</p>
            ) : snapshots.length === 0 ? (
              <p className="text-muted-foreground text-xs">No providers are enabled.</p>
            ) : (
              <ul className="divide-border/60 flex flex-col divide-y">
                {snapshots.map((snapshot) => (
                  <ProviderCard key={snapshot.providerId} snapshot={snapshot} now={now} />
                ))}
              </ul>
            )}
          </div>
        </div>
      </section>
    </div>
  )
}
