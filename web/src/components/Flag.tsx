/** Status flags always pair an icon and a label with the colour, so colour never works alone. */

const STYLES = {
  critical: { icon: '●', className: 'bg-[#fbe9e9] text-[#9e2a2a] ring-[#d03b3b]/30' },
  warning: { icon: '▲', className: 'bg-[#fff4dc] text-[#7a5200] ring-[#fab219]/40' },
  good: { icon: '✓', className: 'bg-[#e6f5e6] text-[#0a6b0a] ring-[#0ca30c]/30' },
  neutral: { icon: '–', className: 'bg-slate-100 text-slate-600 ring-slate-300' },
} as const

export function Flag({ kind, label }: { kind: keyof typeof STYLES; label: string }) {
  const s = STYLES[kind]
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium ring-1 ring-inset ${s.className}`}
    >
      <span aria-hidden="true">{s.icon}</span>
      {label}
    </span>
  )
}
