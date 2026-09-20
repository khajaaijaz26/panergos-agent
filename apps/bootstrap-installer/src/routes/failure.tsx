import { useStore } from '@nanostores/react'
import { FileText, RefreshCw } from 'lucide-react'

import { BrandMark } from '../components/brand-mark'
import { Button } from '../components/button'
import {
  $logPath,
  $mode,
  type BootstrapStateModel,
  openLogDir,
  startInstall,
  startUpdate
} from '../store'

interface FailureProps {
  bootstrap: BootstrapStateModel
}

export default function Failure({ bootstrap }: FailureProps) {
  const logPath = useStore($logPath)
  const mode = useStore($mode)
  const isUpdate = mode === 'update'
  const title = isUpdate ? 'Update didn\u2019t finish' : 'Install didn\u2019t finish'

  return (
    <div className="panergos-fade-in flex h-full flex-col px-10 py-9">
      <div className="flex items-start gap-4">
        <BrandMark className="size-12" />
        <div className="min-w-0">
          <p className="mb-2 text-xs font-semibold uppercase tracking-[0.22em] text-destructive">Setup interrupted</p>
          <h1 className="text-4xl font-semibold leading-tight tracking-[-0.035em] text-foreground">{title}</h1>
          <p className="mt-3 max-w-xl text-sm leading-relaxed text-muted-foreground">
            {bootstrap.error ??
              (isUpdate
                ? 'Something went wrong during the update.'
                : 'Something went wrong during installation.')}
          </p>
        </div>
      </div>

      <div className="mt-auto flex flex-wrap items-end justify-between gap-6 border-t border-(--stroke-eclipse) pt-6">
        <div>
          <p className="text-sm text-muted-foreground">Work without losing the thread.</p>
          {logPath && (
            <p className="mt-2 max-w-lg text-xs text-muted-foreground/70">
              Log: <code className="font-mono">{logPath}</code>
            </p>
          )}
        </div>
        <div className="flex items-center gap-3">
          <Button className="gap-1.5" onClick={() => void (isUpdate ? startUpdate() : startInstall())}>
            <RefreshCw />
            {isUpdate ? 'Retry update' : 'Retry install'}
          </Button>
          <Button className="gap-1.5" onClick={() => void openLogDir()} variant="text">
            <FileText />
            Open logs
          </Button>
        </div>
      </div>
    </div>
  )
}
