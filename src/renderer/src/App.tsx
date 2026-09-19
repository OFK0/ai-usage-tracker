import { useEffect, useId, useRef, useState } from 'react'
import { RotateCw, Settings, X } from 'lucide-react'
import { AnimatePresence, motion, useAnimate } from 'motion/react'
import { Button } from '@/components/ui/button'
import { useSettings } from '@/features/settings/hooks'
import { useNow, useUsage } from '@/features/usage/hooks'
import { ProviderCard } from '@/features/usage/provider-card'
import { useFitWindowToContent } from '@/lib/use-fit-window'
import { cn } from '@/lib/utils'
import { useStillMotion } from '@/theme/motion'

/** Counts how many times the window has been brought into view, starting at 1. */
function useOpenCount(): number {
  const [count, setCount] = useState(1)

  useEffect(() => {
    // Hiding the window hides the page too, so this fires on every open from the tray.
    const onVisibility = (): void => {
      if (document.visibilityState === 'visible') setCount((current) => current + 1)
    }
    document.addEventListener('visibilitychange', onVisibility)
    return () => document.removeEventListener('visibilitychange', onVisibility)
  }, [])

  return count
}

/** The tray icon's gauge, drawn in the accent gradient. It sweeps in each time the widget opens. */
function GaugeMark({ sweep }: { sweep: number }): React.JSX.Element {
  const gradient = useId()
  const still = useStillMotion()

  return (
    <svg viewBox="0 0 16 16" className="size-4" aria-hidden>
      <defs>
        <linearGradient id={gradient} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" style={{ stopColor: 'var(--gradient-from)' }} />
          <stop offset="1" style={{ stopColor: 'var(--gradient-to)' }} />
        </linearGradient>
      </defs>
      <motion.path
        key={sweep}
        d="M4.1 12.2A5.6 5.6 0 1 1 11.9 12.2"
        fill="none"
        stroke={`url(#${gradient})`}
        strokeWidth="2.6"
        strokeLinecap="round"
        initial={{ pathLength: still ? 1 : 0 }}
        animate={{ pathLength: 1 }}
        transition={{ duration: 0.7, ease: 'easeOut', delay: 0.1 }}
      />
    </svg>
  )
}

/** Placeholder rows while the first reading is on its way. */
function LoadingRows(): React.JSX.Element {
  return (
    <div role="status" aria-label="Loading usage" className="flex flex-col gap-3">
      <div className="flex items-center gap-2.5">
        <div className="skeleton size-6 rounded-md" />
        <div className="skeleton h-3 w-24" />
      </div>
      <div className="flex flex-col gap-2 ps-8.5">
        <div className="skeleton h-1.5 w-full" />
        <div className="skeleton h-1.5 w-2/3" />
      </div>
    </div>
  )
}

export default function App(): React.JSX.Element {
  const { snapshots, refreshing, refresh } = useUsage()
  const { settings } = useSettings()
  const now = useNow()
  const still = useStillMotion()
  const openCount = useOpenCount()
  const [shell, animate] = useAnimate<HTMLElement>()
  const scroller = useRef<HTMLDivElement>(null)
  const content = useRef<HTMLDivElement>(null)
  useFitWindowToContent(shell, scroller, content)

  // Springs open like a popover whenever the widget comes into view.
  useEffect(() => {
    if (!shell.current) return
    void animate(
      shell.current,
      still ? { opacity: [0, 1] } : { opacity: [0, 1], scale: [0.96, 1], y: [-6, 0] },
      still ? { duration: 0.15 } : { type: 'spring', stiffness: 420, damping: 30 }
    )
  }, [openCount, animate, shell, still])

  // Placeholders only until there is something real to show; a provider still
  // loading next to one that has answered gets its own "Loading…" line instead.
  const loading =
    snapshots === null ||
    (snapshots.length > 0 && snapshots.every((snapshot) => snapshot.status === 'loading'))

  return (
    // Translucent at rest if the user asked for it, fully opaque while the
    // pointer is over it so it's readable the moment you look at it closely.
    <div
      className="flex h-screen w-screen flex-col p-2 opacity-(--widget-opacity) transition-opacity duration-300 hover:opacity-100"
      style={{ '--widget-opacity': settings?.opacity ?? 1 } as React.CSSProperties}
    >
      {/* Takes its natural height, capped at the window, which main keeps sized to it. */}
      <section
        ref={shell}
        className="widget-surface bg-card/90 border-border flex max-h-full min-h-0 origin-top flex-col overflow-hidden rounded-xl border shadow-lg backdrop-blur-xl"
      >
        <header className="drag-region flex items-center justify-between px-3 pt-2.5 pb-2">
          <div className="flex items-center gap-2">
            <GaugeMark sweep={openCount} />
            <h1 className="text-[13px] font-semibold tracking-tight">AI Usage</h1>
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
            {loading ? (
              <LoadingRows />
            ) : snapshots.length === 0 ? (
              <p className="text-muted-foreground text-xs">No providers are enabled.</p>
            ) : (
              <ul className="divide-border/60 flex flex-col divide-y">
                <AnimatePresence initial>
                  {snapshots.map((snapshot, index) => (
                    <ProviderCard
                      key={snapshot.providerId}
                      snapshot={snapshot}
                      now={now}
                      index={index}
                    />
                  ))}
                </AnimatePresence>
              </ul>
            )}
          </div>
        </div>
      </section>
    </div>
  )
}
