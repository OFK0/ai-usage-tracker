import { PROVIDER_IDS } from '@shared/app-info'

export default function App(): React.JSX.Element {
  return (
    <main className="bg-surface text-ink flex min-h-screen flex-col gap-4 p-6">
      <h1 className="text-lg font-semibold">LLM Usage Tracker</h1>
      <p className="text-sm opacity-70">
        Toolchain is up. Provider cards arrive in a later milestone.
      </p>
      <ul className="flex flex-col gap-2">
        {PROVIDER_IDS.map((id) => (
          <li key={id} className="bg-surface-muted rounded-lg px-3 py-2 text-sm capitalize">
            {id}
          </li>
        ))}
      </ul>
    </main>
  )
}
