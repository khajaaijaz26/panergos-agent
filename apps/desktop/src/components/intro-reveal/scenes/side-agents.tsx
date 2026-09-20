import { INTRO_BEATS } from '../timeline'

import { EASE, JADE, JADE_FAINT } from './style'
import { decoded } from './text'

const EVERYWHERE_T = INTRO_BEATS.find(b => b.id === 'everywhere')!.t

interface SideAgentsProps {
  active: boolean
  side: 'left' | 'right'
  tick: number
}

export function SideAgents({ active, side, tick }: SideAgentsProps) {
  const sideCard = (title: string, line1: string, line2: string, offset: string, delayMs = 0, tilt = 0) => (
    <div
      className="w-full border-l border-white/12 py-3 pl-4 pr-2"
      style={{
        opacity: active ? 1 : 0,
        transform: active
          ? `translateZ(-90px) rotateY(${tilt}deg) translateY(0) scale(1)`
          : `translateZ(-90px) rotateY(${tilt}deg) translateY(${offset}) scale(0.94)`,
        transition: `opacity 760ms ${EASE} ${delayMs}ms, transform 760ms ${EASE} ${delayMs}ms`,
        willChange: 'transform, opacity'
      }}
    >
      <div
        className="mb-3 flex items-center gap-2 text-[0.72rem] uppercase tracking-[0.18em] text-white/50"
        style={{ fontFamily: 'var(--font-sans)' }}
      >
        <span
          className="inline-block size-1.5 rounded-full"
          style={{ animation: 'intro-dot 1.6s ease-in-out infinite', background: JADE }}
        />
        {title}
      </div>
      <div className="text-[0.95rem] leading-6 text-white/85">{line1}</div>
      <div
        className="mt-1 text-[0.85rem] leading-6"
        style={{ color: JADE_FAINT, fontFamily: "'JetBrains Mono', monospace" }}
      >
        {active ? decoded(line2, EVERYWHERE_T + delayMs + 500, tick, 700) : line2}
      </div>
    </div>
  )

  return side === 'left' ? (
    <div className="intro-side-stream flex min-w-0 flex-col gap-[8vh] self-start pt-[8vh]">
      <div style={{ animation: 'intro-float-a 5.2s ease-in-out infinite alternate' }}>
        {sideCard(
          'research stream',
          'Market, audience, and source map aligned',
          '↳ evidence trail ready',
          '26px',
          0,
          7
        )}
      </div>
      <div style={{ animation: 'intro-float-b 6.1s ease-in-out infinite alternate' }}>
        {sideCard(
          'build stream',
          'Site, assets, and release checks sequenced',
          '↳ verification lane ready',
          '38px',
          220,
          7
        )}
      </div>
    </div>
  ) : (
    <div className="intro-side-stream flex min-w-0 flex-col gap-[8vh] self-end pb-[8vh]">
      <div style={{ animation: 'intro-float-c 5.7s ease-in-out infinite alternate' }}>
        {sideCard(
          'campaign stream',
          'Creative, channels, and approvals synchronized',
          '↳ publish handoff ready',
          '34px',
          120,
          -7
        )}
      </div>
      <div style={{ animation: 'intro-float-a 6.6s ease-in-out infinite alternate' }}>
        {sideCard(
          'operations stream',
          'Owners, checkpoints, and next actions mapped',
          '↳ continuity preserved',
          '30px',
          340,
          -7
        )}
      </div>
    </div>
  )
}
