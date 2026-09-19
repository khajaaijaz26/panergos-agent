import panergosIconUrl from '../../src-tauri/icons/128x128@2x.png?url'
import { cn } from '../lib/utils'

export function BrandMark({ className, ...props }: React.ComponentProps<'span'>) {
  return (
    <span
      className={cn(
        'inline-flex size-14 shrink-0 items-center justify-center overflow-hidden rounded-xl bg-[#120b1f]',
        className
      )}
      {...props}
    >
      <img alt="" className="size-full object-contain" src={panergosIconUrl} />
    </span>
  )
}
