import { ArrowRight, Check, Copy, RotateCcw, Undo2 } from 'lucide-react'
import { type ComponentProps, useState } from 'react'
import { useTranslation } from 'react-i18next'

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { KinshipTree } from './components/KinshipTree'
import { buildQuickButtons, calculateKinship, KINSHIP_EXAMPLES, type Sex } from './kinship.service'

type Direction = 'i-call' | 'ta-call'

/** 中国亲戚关系计算：点选或输入称谓链，算出准确叫法，并以辈分树展示推导过程 */
export default function ChineseKinshipCalculator() {
  const { t } = useTranslation('tools-life', { keyPrefix: 'chinese-kinship-calculator' })
  const [sex, setSex] = useState<Sex>(1)
  const [direction, setDirection] = useState<Direction>('i-call')
  const [text, setText] = useState('')
  const [isCopied, setIsCopied] = useState(false)

  const labels = text.split('的').filter(Boolean)
  const buttons = buildQuickButtons(sex)
  const reverse = direction === 'ta-call'
  const output = calculateKinship({ text, sex, reverse })
  const resultLabel = output.terms[0] ?? ''

  const handleAdd = (label: string) => setText((prev) => (prev ? `${prev}的${label}` : label))
  const handleUndo = () => setText((prev) => prev.split('的').slice(0, -1).join('的'))
  const handleChange = (value: string) =>
    setText(
      value
        .split('的')
        .map((part) => part.trim())
        .filter(Boolean)
        .join('的'),
    )
  const handleExample = (example: string) => setText(example)
  const handleCopy = async () => {
    if (output.terms.length === 0) return
    try {
      await navigator.clipboard.writeText(output.terms.join('、'))
      setIsCopied(true)
      window.setTimeout(() => setIsCopied(false), 1500)
    } catch {
      // 剪贴板不可用时静默忽略
    }
  }

  return (
    <div className="flex flex-col gap-4">
      {/* 性别与查询方向 */}
      <div className="flex flex-wrap items-center gap-x-6 gap-y-3">
        <Segmented
          label={t('meIs')}
          value={String(sex)}
          onValueChange={(value) => setSex(Number(value) as Sex)}
          options={[
            { value: '1', label: t('male') },
            { value: '0', label: t('female') },
          ]}
        />
        <Segmented
          label={t('queryLabel')}
          value={direction}
          onValueChange={(value) => setDirection(value as Direction)}
          options={[
            { value: 'i-call', label: t('directionICall') },
            { value: 'ta-call', label: t('directionTaCall') },
          ]}
        />
      </div>

      {/* 关系链输入：可点选，也可直接输入 */}
      <div className="border-input bg-card flex min-h-14 items-center gap-3 rounded-xl border py-3 pr-2 pl-4">
        <span className="text-primary shrink-0 font-medium">{t('chainPrefix')}</span>
        <Input
          value={text}
          onChange={(event) => handleChange(event.target.value)}
          placeholder={t('chainEmpty')}
          className="h-8 flex-1 border-0 bg-transparent px-1 text-base font-medium focus-visible:ring-0 md:text-sm"
          aria-label={t('chainPrefix')}
        />
        <IconButton label={t('undo')} disabled={labels.length === 0} onClick={handleUndo}>
          <Undo2 size={16} />
        </IconButton>
        <IconButton label={t('clear')} disabled={labels.length === 0} onClick={() => setText('')}>
          <RotateCcw size={16} />
        </IconButton>
      </div>

      {/* 快捷称谓九键 */}
      <div className="grid grid-cols-5 gap-2">
        {buttons.map((button) => (
          <Button key={button.sign} variant="outline" onClick={() => handleAdd(button.label)}>
            {button.label}
          </Button>
        ))}
      </div>

      {/* 计算结果 */}
      <div className="bg-primary/5 relative flex flex-col items-center gap-2 rounded-xl border p-8">
        <IconButton
          label={isCopied ? t('copied') : t('copy')}
          disabled={output.terms.length === 0}
          className="absolute top-2 right-2"
          onClick={handleCopy}
        >
          {isCopied ? <Check size={16} /> : <Copy size={16} />}
        </IconButton>
        <span className="text-muted-foreground text-xs">{t('resultTitle')}</span>
        {labels.length === 0 ? (
          <p className="text-muted-foreground py-2 text-sm">{t('resultEmpty')}</p>
        ) : output.terms.length === 0 ? (
          <p className="text-muted-foreground py-2 text-sm">{t('resultInvalid')}</p>
        ) : (
          <div className="flex flex-wrap justify-center gap-x-3 gap-y-1">
            {output.terms.map((term) => (
              <span key={term} className="text-primary text-3xl font-bold">
                {term}
              </span>
            ))}
          </div>
        )}
        <span className="text-muted-foreground text-xs">
          {reverse ? t('subtitleTaCall') : t('subtitleICall')}
        </span>
        {output.chains.length > 0 && (
          <div className="text-muted-foreground mt-1 flex flex-wrap items-center justify-center gap-x-2 gap-y-1 text-xs">
            <span>{t('chainLookupTitle')}</span>
            {output.chains.slice(0, 3).map((chain) => (
              <span key={chain} className="text-foreground bg-background rounded-md px-2 py-0.5">
                {chain}
              </span>
            ))}
          </div>
        )}
      </div>

      {/* 辈分关系树 */}
      <div className="flex flex-col gap-2">
        <span className="text-sm font-medium">{t('treeTitle')}</span>
        <KinshipTree
          path={output.path}
          resultLabel={resultLabel}
          resultCount={output.terms.length}
        />
        <p className="text-muted-foreground flex items-center justify-center gap-1.5 text-xs">
          {labels.length === 0 ? (
            t('treeEmpty')
          ) : (
            <>
              {t('treeMe')}
              <ArrowRight size={12} />
              {t('treeOther')}
              {t('treeLegend')}
            </>
          )}
        </p>
      </div>

      {/* 快速示例 */}
      <div className="flex flex-col gap-2">
        <span className="text-muted-foreground text-xs">{t('examplesTitle')}</span>
        <div className="flex flex-wrap gap-2">
          {KINSHIP_EXAMPLES.map((example) => (
            <Button
              key={example}
              variant="outline"
              size="sm"
              onClick={() => handleExample(example)}
            >
              {example}
            </Button>
          ))}
        </div>
      </div>
    </div>
  )
}

type SegmentedOption = { value: string; label: string }

function Segmented({
  label,
  value,
  onValueChange,
  options,
}: {
  label: string
  value: string
  onValueChange: (value: string) => void
  options: [SegmentedOption, SegmentedOption]
}) {
  return (
    <div className="flex items-center gap-2">
      <span className="text-sm font-medium">{label}</span>
      <ToggleGroup
        type="single"
        value={value}
        onValueChange={(next) => next && onValueChange(next)}
        spacing={1}
        className="bg-muted rounded-lg p-[3px]"
        aria-label={label}
      >
        {options.map((option) => (
          <ToggleGroupItem
            key={option.value}
            value={option.value}
            className="data-[state=on]:bg-background rounded-md data-[state=on]:shadow-sm"
          >
            {option.label}
          </ToggleGroupItem>
        ))}
      </ToggleGroup>
    </div>
  )
}

/** 卡片内的图标按钮，带 aria-label 与悬浮提示 */
function IconButton({ label, ...props }: ComponentProps<typeof Button> & { label: string }) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button variant="ghost" size="icon-sm" aria-label={label} {...props} />
      </TooltipTrigger>
      <TooltipContent side="bottom">{label}</TooltipContent>
    </Tooltip>
  )
}
