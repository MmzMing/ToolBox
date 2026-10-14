import { useId } from 'react'

import { MorphSelect } from '@/components/select/morph-select'
import { Label } from '@/components/ui/label'

import { fontSizeOptions } from '../constants'

const ITEMS = fontSizeOptions.map((size) => ({ value: String(size), label: `${size}px` }))

/** 字号选择：基础字号 / 主标题 / 副标题三处共用，左栏与 dock 浮层都要用 */
export function FontSizeSelect({
  label,
  value,
  onValueChange,
}: {
  label: string
  value: number | undefined
  onValueChange: (size: number) => void
}) {
  const id = useId()
  return (
    <div className="flex flex-col gap-2">
      <Label htmlFor={id} className="text-muted-foreground">
        {label}
      </Label>
      <MorphSelect
        label={label}
        hideLabel
        triggerId={id}
        className="w-full"
        items={ITEMS}
        value={String(value ?? '')}
        onValueChange={(next) => onValueChange(Number(next))}
      />
    </div>
  )
}
