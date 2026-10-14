import {
  AlignLeft,
  AlertCircle,
  FoldVertical,
  FolderTree,
  MessageSquareOff,
  UnfoldVertical,
} from 'lucide-react'
import { useDeferredValue, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'

import { IoPair } from '@/components/io-pair'
import { JsonViewer } from '@/components/json-viewer'
import { MorphSelect } from '@/components/select/morph-select'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { canStripComments, stripComments } from '@/utils/code-comments'
import {
  convert,
  defaultTargetOf,
  languageOf,
  sourceFormats,
  targetFormatsOf,
  type ConvertStyle,
  type FormatId,
} from '@/utils/format-convert'
import { tryParseJson } from '@/utils/json-tree'

interface FormatSelectProps {
  id: string
  label: string
  value: FormatId
  formats: readonly FormatId[]
  onValueChange: (value: FormatId) => void
}

/** 卡片上方的格式选择器；选项文案走 common.formats，中英双语共用一份 */
function FormatSelect({ id, label, value, formats, onValueChange }: FormatSelectProps) {
  const { t } = useTranslation('common')
  const items = useMemo(
    () => formats.map((format) => ({ value: format, label: t(`formats.${format}`) })),
    [formats, t],
  )
  return (
    <div className="flex items-center gap-2">
      <Label htmlFor={id} className="text-muted-foreground shrink-0 text-xs">
        {label}
      </Label>
      <MorphSelect
        label={label}
        hideLabel
        triggerId={id}
        size="sm"
        className="min-w-32"
        items={items}
        value={value}
        onValueChange={(next) => onValueChange(next as FormatId)}
      />
    </div>
  )
}

/**
 * 格式工作台：合并了原来的「代码格式化」与「格式转换」。
 *
 * 左右卡片上方各一个格式下拉（右下拉只列该源格式能转出的格式），中间可拖拽分栏。
 * 动作条挂在**输出侧**表头，三个动作都不回写左侧文本框：折叠 / 展开切换输出形态，
 * 去注释是转换前的源预处理开关（只影响送去转换的那份文本）。转换实时进行，
 * 所以不需要「重新格式化」这种破坏源文本的动作。
 */
export default function FormatStudio() {
  const { t } = useTranslation('tools-development', { keyPrefix: 'format-studio' })
  const { t: tCommon } = useTranslation('common')

  const [from, setFrom] = useState<FormatId>('json')
  const [to, setTo] = useState<FormatId>('json')
  const [input, setInput] = useState('')
  const [style, setStyle] = useState<ConvertStyle>('pretty')
  const [stripSourceComments, setStripSourceComments] = useState(false)
  /** JSON 输出默认用树视图看，文本视图仍可切回来（复制与全屏始终是文本） */
  const [view, setView] = useState<'tree' | 'text'>('tree')

  const handleFromChange = (next: FormatId) => {
    setFrom(next)
    // 换了源格式，原来的目标可能不再可达，退回该源的默认目标
    setTo((current) => (targetFormatsOf(next).includes(current) ? current : defaultTargetOf(next)))
  }

  // 大文本转换会占用主线程，用 deferred 值让输入框始终保持可打字
  const deferredInput = useDeferredValue(input)

  /**
   * 去注释是「转换前」的源预处理开关，不是输出后置过滤：JSONC 这类带注释的源在
   * 解析阶段就会抛错，先转再过滤等于永远没有输出可过滤。开关只影响送去转换的那份
   * 文本，左侧文本框里的原文始终不动。
   */
  const canStrip = canStripComments(from)
  const stripActive = stripSourceComments && canStrip

  const prepared = useMemo(
    () => (stripActive ? stripComments(deferredInput, from) : deferredInput),
    [stripActive, deferredInput, from],
  )

  const { output, error } = useMemo(() => {
    try {
      return { output: convert(from, to, prepared, { style }), error: null as Error | null }
    } catch (err) {
      return { output: '', error: err instanceof Error ? err : new Error(String(err)) }
    }
  }, [from, to, prepared, style])

  const noOutput = output === ''

  /**
   * 树视图需要真的能解析成结构；输出不是合法 JSON（切到 YAML 等目标格式）时
   * jsonValue 为 undefined，动作条上的切换按钮也随之消失。
   */
  const jsonValue = useMemo(
    () => (to === 'json' && output !== '' ? tryParseJson(output) : undefined),
    [to, output],
  )
  const treeActive = jsonValue !== undefined && view === 'tree'

  const actions = (
    <div className="flex flex-wrap items-center gap-1.5" title={t('outputOnly')}>
      <Button
        variant={stripActive ? 'secondary' : 'ghost'}
        size="sm"
        className="gap-1.5"
        disabled={input === '' || !canStrip}
        aria-pressed={stripActive}
        title={canStrip ? t('stripCommentsHint') : t('noComments')}
        onClick={() => setStripSourceComments((on) => !on)}
      >
        <MessageSquareOff className="size-3.5" />
        {t('stripComments')}
      </Button>
      {jsonValue !== undefined && (
        <>
          <span className="bg-border h-4 w-px" aria-hidden="true" />
          <Button
            variant={treeActive ? 'secondary' : 'ghost'}
            size="sm"
            className="gap-1.5"
            aria-pressed={treeActive}
            title={t('viewToggle')}
            onClick={() => setView(treeActive ? 'text' : 'tree')}
          >
            {treeActive ? <FolderTree className="size-3.5" /> : <AlignLeft className="size-3.5" />}
            {t(treeActive ? 'treeView' : 'textView')}
          </Button>
        </>
      )}
      {/* 树模式下的展开折叠由查看器自己的工具栏负责，这里的两个动作只改文本形态 */}
      {!treeActive && (
        <>
          <span className="bg-border h-4 w-px" aria-hidden="true" />
          <Button
            variant={style === 'compact' ? 'secondary' : 'ghost'}
            size="sm"
            className="gap-1.5"
            disabled={noOutput}
            aria-pressed={style === 'compact'}
            title={t('outputOnly')}
            onClick={() => setStyle('compact')}
          >
            <FoldVertical className="size-3.5" />
            {t('collapseAll')}
          </Button>
          <Button
            variant={style === 'pretty' ? 'secondary' : 'ghost'}
            size="sm"
            className="gap-1.5"
            disabled={noOutput}
            aria-pressed={style === 'pretty'}
            title={t('outputOnly')}
            onClick={() => setStyle('pretty')}
          >
            <UnfoldVertical className="size-3.5" />
            {t('expandAll')}
          </Button>
        </>
      )}
    </div>
  )

  return (
    <div className="flex flex-col gap-3">
      {error && (
        <Alert variant="destructive">
          <AlertCircle />
          <AlertTitle>{tCommon('error')}</AlertTitle>
          <AlertDescription>{error.message}</AlertDescription>
        </Alert>
      )}

      <IoPair
        input={{
          value: input,
          placeholder: t('inputPlaceholder'),
          onValueChange: setInput,
          head: (
            <FormatSelect
              id="format-studio-from"
              label={tCommon('inputFormat')}
              value={from}
              formats={sourceFormats}
              onValueChange={handleFromChange}
            />
          ),
        }}
        output={{
          value: output,
          placeholder: t('outputPlaceholder'),
          language: languageOf(to),
          body:
            treeActive && jsonValue !== undefined ? (
              <JsonViewer
                data={jsonValue}
                maxHeight="100%"
                className="h-full min-h-0 rounded-none border-0"
              />
            ) : undefined,
          head: (
            <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-2">
              <FormatSelect
                id="format-studio-to"
                label={tCommon('outputFormat')}
                value={to}
                formats={targetFormatsOf(from)}
                onValueChange={setTo}
              />
              {actions}
            </div>
          ),
        }}
        fullscreenLabel={tCommon('fullscreen')}
      />
    </div>
  )
}
