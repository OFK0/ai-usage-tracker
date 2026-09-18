import { RotateCw, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { useNow, useUsage } from '@/features/usage/hooks'
import { ProviderCard } from '@/features/usage/provider-card'
import { cn } from '@/lib/utils'

export default function App(): React.JSX.Element {
  const { snapshots, refreshing, refresh } = useUsage()
  const now = useNow()

  return (
    <div className="h-screen w-screen p-2">
      <section className="bg-card/85 border-border flex h-full flex-col overflow-hidden rounded-xl border shadow-lg backdrop-blur-xl">
        <header className="drag-region border-border/60 flex items-center justify-between border-b px-3 py-2">
          <h1 className="text-sm font-semibold">LLM Usage Tracker</h1>
          <div className="flex gap-0.5">
            <Button
              className="no-drag size-6"
              size="icon"
              variant="ghost"
              aria-label="Refresh usage"
              disabled={refreshing}
              onClick={() => void refresh()}
            >
              <RotateCw className={cn('size-3.5', refreshing && 'animate-spin')} />
            </Button>
            <Button
              className="no-drag size-6"
              size="icon"
              variant="ghost"
              aria-label="Hide widget"
              onClick={() => window.api.widget.hide()}
            >
              <X className="size-3.5" />
            </Button>
          </div>
        </header>

        <div className="overflow-y-auto p-3">
          {snapshots === null ? (
            <p className="text-muted-foreground text-xs">Loading…</p>
          ) : snapshots.length === 0 ? (
            <p className="text-muted-foreground text-xs">No providers are enabled.</p>
          ) : (
            <ul className="flex flex-col gap-4">
              {snapshots.map((snapshot) => (
                <ProviderCard key={snapshot.providerId} snapshot={snapshot} now={now} />
              ))}
            </ul>
          )}
        </div>
      </section>
    </div>
  )
}
