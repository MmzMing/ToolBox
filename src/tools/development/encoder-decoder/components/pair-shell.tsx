import { AlertCircle } from 'lucide-react'
import type { ReactNode } from 'react'
import { useTranslation } from 'react-i18next'

import { IoPair, type IoPairInput, type IoPairOutput } from '@/components/io-pair'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group'

/** 编解码方向：编码（文本 → 表示形式）或解码（表示形式 → 文本） */
export type Direction = 'encode' | 'decode'

export interface SegmentedOption<T extends string> {
  value: T
  label: string
}

interface SegmentedProps<T extends string> {
  label: string
  value: T
  options: readonly SegmentedOption<T>[]
  onChange: (value: T) => void
}

/** 一组互斥切换（方向 / 表示形式），统一落在输出侧表头右边 */
export function Segmented<T extends string>({
  label,
  value,
  options,
  onChange,
}: SegmentedProps<T>) {
  return (
    <div className="flex items-center gap-2">
      <span className="text-muted-foreground shrink-0 text-xs">{label}</span>
      <ToggleGroup
        type="single"
        size="sm"
        value={value}
        onValueChange={(next) => {
          if (next !== '') {
            onChange(next as T)
          }
        }}
      >
        {options.map((option) => (
          <ToggleGroupItem key={option.value} value={option.value}>
            {option.label}
          </ToggleGroupItem>
        ))}
      </ToggleGroup>
    </div>
  )
}

/** 「编码 / 解码」切换：决定哪一侧是原文、哪一侧是表示形式 */
export function DirectionToggle({
  value,
  onChange,
}: {
  value: Direction
  onChange: (value: Direction) => void
}) {
  const { t } = useTranslation('tools-development', { keyPrefix: 'encoder-decoder.shared' })
  return (
    <Segmented
      label={t('direction')}
      value={value}
      onChange={onChange}
      options={[
        { value: 'encode', label: t('encode') },
        { value: 'decode', label: t('decode') },
      ]}
    />
  )
}

interface EncodePairProps {
  input: IoPairInput
  output: IoPairOutput
  /** 页签级方向切换，固定落在操作栏最左 */
  direction: { value: Direction; onChange: (value: Direction) => void }
  /** 方向之后的其余切换（表示形式 / 编码模式） */
  controls?: ReactNode
  error?: string | null
}

/**
 * 编解码页签共用外壳：操作栏 + 错误提示 + 「左输入右输出」工作台。
 *
 * 原来 Base64 两侧都可编辑、互相联动，URL / Unicode / 二进制各自再开子页签或堆叠
 * 四五个文本框；收进这个外壳后只剩一个输入框一个输出框，方向与形式统一放在页签
 * 下方的操作栏里，卡片表头只留格式标注与粘贴 / 复制 / 全屏，行号与状态条也
 * 与其它工作台一致。
 */
export function EncodePair({ input, output, direction, controls, error }: EncodePairProps) {
  const { t: tCommon } = useTranslation('common')

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
        <DirectionToggle value={direction.value} onChange={direction.onChange} />
        {controls}
      </div>
      {error && (
        <Alert variant="destructive">
          <AlertCircle />
          <AlertTitle>{tCommon('error')}</AlertTitle>
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}
      <IoPair input={input} output={output} fullscreenLabel={tCommon('fullscreen')} />
    </div>
  )
}
