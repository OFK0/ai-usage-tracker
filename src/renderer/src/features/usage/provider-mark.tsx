/** The provider's initial on the accent gradient, used wherever the provider is named. */
export function ProviderMark({ name }: { name: string }): React.JSX.Element {
  return (
    <span
      aria-hidden
      className="accent-gradient text-primary-foreground grid size-6 shrink-0 place-items-center rounded-md text-xs font-bold shadow-sm"
    >
      {name.charAt(0)}
    </span>
  )
}
