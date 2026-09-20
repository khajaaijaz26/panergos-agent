import { AlertCircle } from 'lucide-react'
import { useState } from 'react'

import { BrandMark } from '../components/brand-mark'
import { HackeryButton } from '../components/hackery-button'
import { launchPanergosDesktop } from '../store'

export default function Success() {
  const [error, setError] = useState<string | null>(null)
  const [launching, setLaunching] = useState(false)

  async function handleLaunch() {
    setError(null)
    setLaunching(true)

    try {
      await launchPanergosDesktop()
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e)
      setError(msg)
      setLaunching(false)
    }
  }

  return (
    <div className="panergos-fade-in flex h-full flex-col px-10 py-9">
      <div className="flex items-start gap-4">
        <BrandMark className="size-12" />
        <div className="min-w-0">
          <p className="mb-2 text-xs font-semibold uppercase tracking-[0.22em] text-primary">Setup complete</p>
          <h1 className="text-4xl font-semibold leading-tight tracking-[-0.035em] text-foreground">
            Your workspace is ready.
          </h1>
          <p className="mt-3 text-base text-muted-foreground">Work without losing the thread.</p>
        </div>
      </div>

      <div className="mt-auto grid gap-6 border-t border-(--stroke-eclipse) pt-6 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-end">
        <div className="max-w-xl">
          <p className="text-sm leading-relaxed text-muted-foreground">
            Launch now, or return any time with{' '}
            <code className="font-mono text-sm text-foreground/80">panergos desktop</code>.
          </p>
          {error && (
            <div className="mt-4 flex items-start gap-2 text-sm" role="alert">
              <AlertCircle className="mt-0.5 shrink-0 text-destructive" size={16} />
              <div className="min-w-0">
                <div className="font-medium text-destructive">Couldn&rsquo;t launch the desktop app</div>
                <div className="mt-0.5 text-muted-foreground">{error}</div>
              </div>
            </div>
          )}
        </div>
        <HackeryButton
          disabled={launching}
          label={launching ? 'Launching' : 'Open Panergos'}
          loading={launching}
          onClick={() => void handleLaunch()}
        />
      </div>
    </div>
  )
}
