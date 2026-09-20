import { fontSizeOptions } from '../constants'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'

/** 字号选择：基础字号 / 主标题 / 副标题三处共用，左栏与 dock 浮层都要用 */
export function FontSizeSelect({
  value,
  onValueChange,
}: {
  value: number | undefined
  onValueChange: (size: number) => void
}) {
  return (
    <Select value={String(value ?? '')} onValueChange={(next) => onValueChange(Number(next))}>
      <SelectTrigger className="border-input bg-background">
        <SelectValue />
      </SelectTrigger>
      <SelectContent position="popper" align="start">
        {fontSizeOptions.map((size) => (
          <SelectItem key={size} value={String(size)}>
            {size}px
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  )
}
