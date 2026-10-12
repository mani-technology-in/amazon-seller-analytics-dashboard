/**
 * A short state label (Flag in the Design System). Problems get a pill with an icon and words,
 * so attention never depends on colour alone; a normal state is plain quiet text.
 */

const PILL = {
  critical: { icon: '●', className: 'bg-critical-soft text-critical' },
  warning: { icon: '▲', className: 'bg-warning-soft text-warning' },
} as const

export function Flag({
  kind,
  label,
}: {
  kind: keyof typeof PILL | 'good' | 'neutral'
  label: string
}) {
  if (kind === 'good' || kind === 'neutral') {
    return <span className="text-caption text-ink-3">{label}</span>
  }
  const s = PILL[kind]
  return (
    <span
      className={`inline-flex h-6 items-center gap-1 rounded-pill px-2.5 text-caption font-semibold ${s.className}`}
    >
      <span aria-hidden="true">{s.icon}</span>
      {label}
    </span>
  )
}
