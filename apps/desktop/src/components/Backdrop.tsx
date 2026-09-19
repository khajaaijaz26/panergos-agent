import { useStore } from '@nanostores/react'

import { $backdrop } from '@/store/backdrop'

export function Backdrop() {
  const on = useStore($backdrop)

  if (!on) {
    return null
  }

  return (
    <div
      aria-hidden
      className="pointer-events-none absolute inset-0 z-2 opacity-[0.08]"
      style={{
        backgroundImage:
          'radial-gradient(circle at 18% 22%, #ff6b5e 0 1px, transparent 2px), radial-gradient(circle at 78% 64%, #2ee6a6 0 1px, transparent 2px), linear-gradient(135deg, transparent 48%, #f7c453 49% 50%, transparent 51%)',
        backgroundSize: '38px 38px, 54px 54px, 160px 160px'
      }}
    />
  )
}
