import type { ComponentProps } from 'react'

import panergosIconUrl from '../../../../assets/icon.png?url'

interface BrandCloseProps extends ComponentProps<'div'> {}

export function BrandClose({ ref }: BrandCloseProps) {
  return (
    <div
      className="pointer-events-none absolute inset-0 flex items-end gap-[3vmin] px-[8vw] pb-[12vh] opacity-0"
      ref={ref}
      style={{ willChange: 'transform, opacity' }}
    >
      <img alt="" className="h-[18vmin] w-auto rounded-[3vmin] object-contain" src={panergosIconUrl} />
      <div className="flex min-w-0 flex-col items-start gap-[1.6vmin] border-l border-white/20 pl-[3vmin]">
        <h1
          className="text-[8.6vmin] leading-none uppercase text-white/95"
          style={{
            fontFamily: 'var(--font-sans)',
            fontWeight: 700,
            letterSpacing: '0.06em',
            textShadow: '0 2px 24px rgba(0,0,0,0.45)'
          }}
        >
          Panergos Agent
        </h1>
        <p
          className="text-[2vmin] uppercase tracking-[0.42em] text-white/50"
          style={{ fontFamily: 'var(--font-sans)' }}
        >
          Relay context. Direct work. Keep continuity.
        </p>
      </div>
    </div>
  )
}
