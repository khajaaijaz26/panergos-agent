import { BrandMark } from '../components/brand-mark'
import { HackeryButton } from '../components/hackery-button'
import { startInstall } from '../store'

export default function Welcome() {
  return (
    <div className="panergos-fade-in flex h-full flex-col px-10 py-9">
      <div className="flex items-start gap-4">
        <BrandMark className="size-12" />
        <div className="min-w-0">
          <p className="mb-2 text-xs font-semibold uppercase tracking-[0.22em] text-primary">Panergos setup</p>
          <h1 className="max-w-xl text-4xl font-semibold leading-tight tracking-[-0.035em] text-foreground">
            Work without losing the thread.
          </h1>
        </div>
      </div>

      <div className="mt-auto grid gap-6 border-t border-(--stroke-eclipse) pt-6 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-end">
        <div className="max-w-xl">
          <p className="text-base leading-relaxed text-foreground/85">Set up the complete Panergos workspace.</p>
          <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
            We&rsquo;ll install the runtime, connect the desktop, and verify the local environment. This usually takes
            a few minutes.
          </p>
        </div>
        <HackeryButton label="Begin setup" onClick={() => void startInstall()} />
      </div>
    </div>
  )
}
