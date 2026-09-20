import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { Input } from '@/components/ui/input'
import { cn } from '@/lib/utils'
import { useMemo, useState } from 'react'
import { HexColorPicker } from 'react-colorful'

import { Button } from '@/components/ui/button'

type ColorPickerProps = Omit<
  React.ComponentProps<typeof Button>,
  'value' | 'onChange' | 'onBlur'
> & {
  value: string
  onChange: (value: string) => void
  onBlur?: () => void
}

/**
 * 十六进制取色器（触发器即当前色）。
 *
 * 放在工具目录而不是 `components/ui/`：那个目录是 shadcn CLI 生成的，
 * 而 react-colorful 是本工具专属的依赖。
 */
export function ColorPicker({
  value,
  onChange,
  className,
  style,
  children,
  ...props
}: ColorPickerProps) {
  const [open, setOpen] = useState(false)
  const parsedValue = useMemo(() => value || '#FFFFFF', [value])

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          {...props}
          type="button"
          className={cn(
            'cursor-pointer overflow-hidden rounded-lg border-2 p-0 transition-all hover:scale-105',
            className,
          )}
          style={{ backgroundColor: parsedValue, ...style }}
          onClick={() => setOpen(true)}
        >
          {children ?? <span className="sr-only">Pick a color</span>}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-auto p-3">
        <HexColorPicker color={parsedValue} onChange={onChange} />
        <div className="mt-3 flex items-center gap-2">
          <span className="text-muted-foreground text-sm">#</span>
          <Input
            maxLength={7}
            value={parsedValue.replace('#', '')}
            className="h-8"
            onChange={(event) => {
              const raw = event.currentTarget.value
              onChange(raw.startsWith('#') ? raw : `#${raw}`)
            }}
          />
        </div>
      </PopoverContent>
    </Popover>
  )
}
