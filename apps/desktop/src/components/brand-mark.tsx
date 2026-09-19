import { cn } from '@/lib/utils'

import panergosIconUrl from '../../assets/icon.png?url'

export function BrandMark({ className, ...props }: React.ComponentProps<'span'>) {
  return (
    <span
      className={cn(
        'inline-flex size-14 shrink-0 items-center justify-center overflow-hidden rounded-md bg-slate-950',
        className
      )}
      {...props}
    >
      <img alt="" className="size-full object-contain" src={panergosIconUrl} />
    </span>
  )
}
