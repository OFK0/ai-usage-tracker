import { PROVIDER_IDS } from '@shared/app-info'
import { Progress } from '@/components/ui/progress'
import { Button } from '@/components/ui/button'

/**
 * Placeholder surface for the toolchain. Real provider cards, wired to live
 * usage data, arrive with the design system and provider milestones.
 */
export default function App(): React.JSX.Element {
  return (
    <main className="bg-background text-foreground flex min-h-screen flex-col gap-4 p-6">
      <header className="flex items-center justify-between">
        <h1 className="text-base font-semibold">LLM Usage Tracker</h1>
        <Button size="sm" variant="secondary">
          Refresh
        </Button>
      </header>

      <ul className="flex flex-col gap-3">
        {PROVIDER_IDS.map((id) => (
          <li key={id} className="bg-card border-border rounded-lg border p-3">
            <p className="mb-2 text-sm font-medium capitalize">{id}</p>
            <Progress value={0} aria-label={`${id} session usage`} />
          </li>
        ))}
      </ul>
    </main>
  )
}
