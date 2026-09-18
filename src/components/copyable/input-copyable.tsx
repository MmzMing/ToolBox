import { Check, Copy } from 'lucide-react'
import type { ComponentProps } from 'react'

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { useCopy } from '@/composable/use-copy'
import { cn } from '@/lib/utils'

interface InputCopyableProps extends Omit<ComponentProps<'input'>, 'value' | 'onChange'> {
  value: string
  onValueChange?: (value: string) => void
}

/** 带复制按钮的单行输入框（it-tools InputCopyable 的 shadcn 版） */
export function InputCopyable({ value, onValueChange, className, ...props }: InputCopyableProps) {
  const { copy, isCopied } = useCopy()

  return (
    <div className="relative flex items-center">
      <Input
        value={value}
        onChange={(event) => onValueChange?.(event.target.value)}
        className={cn('pr-9', className)}
        {...props}
      />
      <Button
        type="button"
        variant="ghost"
        size="icon-sm"
        className="absolute right-1"
        aria-label="copy"
        onClick={() => void copy(value)}
      >
        {isCopied(value) ? <Check className="text-primary" /> : <Copy />}
      </Button>
    </div>
  )
}
