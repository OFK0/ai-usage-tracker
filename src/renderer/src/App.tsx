import { X } from 'lucide-react'
import { PROVIDER_IDS } from '@shared/app-info'
import { Progress } from '@/components/ui/progress'
import { Button } from '@/components/ui/button'

/**
 * Shell of the widget. The provider rows are placeholders until the provider
 * engine lands; what is real here is the transparent, draggable surface.
 */
export default function App(): React.JSX.Element {
  return (
    <div className="h-screen w-screen p-2">
      <section className="bg-card/85 border-border flex h-full flex-col overflow-hidden rounded-xl border shadow-lg backdrop-blur-xl">
        <header className="drag-region border-border/60 flex items-center justify-between border-b px-3 py-2">
          <h1 className="text-sm font-semibold">LLM Usage Tracker</h1>
          <Button
            className="no-drag size-6"
            size="icon"
            variant="ghost"
            aria-label="Hide widget"
            onClick={() => window.api.widget.hide()}
          >
            <X className="size-3.5" />
          </Button>
        </header>

        <ul className="flex flex-col gap-3 overflow-y-auto p-3">
          {PROVIDER_IDS.map((id) => (
            <li key={id} className="flex flex-col gap-2">
              <div className="flex items-baseline justify-between">
                <span className="text-sm font-medium capitalize">{id}</span>
                <span className="text-muted-foreground text-xs">Not connected</span>
              </div>
              <Progress value={0} aria-label={`${id} session usage`} />
            </li>
          ))}
        </ul>
      </section>
    </div>
  )
}
