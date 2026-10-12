import * as Switch from '@radix-ui/react-switch'
import { setReduceMotion, useReduceMotion } from '../app/motion'

/** "Reduce motion" in the page header (NFR-14). The label is part of the switch's own button. */
export function ReduceMotionSwitch() {
  const on = useReduceMotion()
  return (
    <Switch.Root
      checked={on}
      onCheckedChange={setReduceMotion}
      className="group inline-flex min-h-8 cursor-pointer items-center gap-2 text-small text-ink-2"
    >
      <span
        aria-hidden="true"
        className="relative h-5 w-[34px] shrink-0 rounded-pill bg-switch-off group-data-[state=checked]:bg-accent-strong"
      >
        <Switch.Thumb className="absolute top-0.5 left-0.5 size-4 rounded-pill bg-surface-page shadow-raised transition-transform duration-(--duration-ui) ease-out data-[state=checked]:translate-x-3.5" />
      </span>
      Reduce motion
    </Switch.Root>
  )
}
