import { useEffect } from 'react'

/** A short confirmation in the words of the action (Toast in the Design System). */
export function Toast({ message, onClose }: { message: string | null; onClose: () => void }) {
  useEffect(() => {
    if (!message) return
    const t = setTimeout(onClose, 6000)
    return () => clearTimeout(t)
  }, [message, onClose])

  // a polite live region, not role=status: that role marks loading skeletons in this app
  return (
    <div
      aria-live="polite"
      className="pointer-events-none fixed inset-x-4 bottom-4 z-50 flex justify-end md:inset-x-auto md:right-6 md:bottom-6"
    >
      {message ? (
        <div className="toast-in pointer-events-auto flex max-w-[420px] items-center gap-3 rounded-lg bg-toast-ground py-3 pr-3.5 pl-4 text-body text-surface-page shadow-toast">
          <svg
            width="18"
            height="18"
            viewBox="0 0 18 18"
            fill="none"
            aria-hidden="true"
            className="shrink-0 text-toast-icon"
          >
            <path
              d="m4 9.5 3.2 3L14 5.5"
              stroke="currentColor"
              strokeWidth="1.8"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
          <span>{message}</span>
          <button
            type="button"
            onClick={onClose}
            className="ml-auto min-h-8 rounded-sm bg-surface-page/12 px-2.5 text-small text-surface-page hover:bg-surface-page/20"
          >
            Close
          </button>
        </div>
      ) : null}
    </div>
  )
}
