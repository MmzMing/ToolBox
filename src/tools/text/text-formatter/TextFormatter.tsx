import { useCallback, useDeferredValue, useEffect, useMemo, useReducer, useRef } from 'react'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'
import { Download, Redo2, RotateCcw, Sparkles, Undo2 } from 'lucide-react'

import { IoPair } from '@/components/io-pair'
import { Button } from '@/components/ui/button'
import { RulePanel } from './RulePanel'
import { StatsBar } from './StatsBar'
import { analyzeText, formatterReducer, initialFormatterState } from './text-formatter.service'
import { applyRule, type TextRule } from './text-formatter.rules'

export default function TextFormatter() {
  const { t } = useTranslation('tools-text')
  const { t: tCommon } = useTranslation('common')

  const [state, dispatch] = useReducer(formatterReducer, '', initialFormatterState)
  // 输入框里可能存着还没上报的文本，点规则 / 下载前要读它
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const stateRef = useRef(state)

  // 事件回调里读「最新一次已提交的状态」：用 ref 而不是把 state 塞进依赖，
  // handlePick 的引用才能保持稳定，RulePanel 的 memo 才拦得住重渲染
  useEffect(() => {
    stateRef.current = state
  }, [state])

  // 统计要全量扫文本，用 deferred 值算，输入先画旧数字。
  // 链路为空时两卡是同一份文本（编辑即重置链），这里判等后共用一次扫描。
  const deferredBase = useDeferredValue(state.base)
  const deferredPresent = useDeferredValue(state.present)
  const [inputStats, outputStats] = useMemo(() => {
    const base = analyzeText(deferredBase)
    return deferredPresent === deferredBase ? [base, base] : [base, analyzeText(deferredPresent)]
  }, [deferredBase, deferredPresent])

  const handleInputChange = useCallback((value: string) => {
    dispatch({ type: 'edit', value })
  }, [])

  const handlePick = useCallback(
    (rule: TextRule) => {
      const snapshot = stateRef.current
      const live = textareaRef.current?.value
      // 输入框比状态新说明还有没上报的编辑：规则要先落到这份最新文本上，
      // 否则会把规则作用在旧结果上（「编辑即重置链」的语义也被绕过去了）
      const source = live !== undefined && live !== snapshot.base ? live : snapshot.present
      if (source === '') {
        toast.error(t('text-formatter.emptyInput'))
        return
      }
      const outcome = applyRule(rule, source)
      if (!outcome.ok) {
        toast.error(t('text-formatter.ruleFailed', { message: outcome.message }))
        return
      }
      if (source !== snapshot.present) {
        dispatch({ type: 'edit', value: source })
      }
      dispatch({ type: 'apply', value: outcome.value })
    },
    [t],
  )

  const handleDownload = useCallback(() => {
    const snapshot = stateRef.current
    const live = textareaRef.current?.value
    // 与 handlePick 同一套口径：有未上报的编辑就导出那份最新文本
    const content = live !== undefined && live !== snapshot.base ? live : snapshot.present
    const url = URL.createObjectURL(new Blob([content], { type: 'text/plain;charset=utf-8' }))
    const anchor = document.createElement('a')
    anchor.href = url
    anchor.download = 'text-formatter.txt'
    anchor.click()
    URL.revokeObjectURL(url)
  }, [])

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-2">
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={state.past.length === 0}
          onClick={() => dispatch({ type: 'undo' })}
        >
          <Undo2 />
          {t('text-formatter.toolbar.undo')}
        </Button>
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={state.future.length === 0}
          onClick={() => dispatch({ type: 'redo' })}
        >
          <Redo2 />
          {t('text-formatter.toolbar.redo')}
        </Button>
        <span className="bg-border mx-1 h-4 w-px" aria-hidden="true" />
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={state.present === state.base}
          onClick={() => dispatch({ type: 'commitToBase' })}
        >
          <Sparkles />
          {t('text-formatter.toolbar.commitToBase')}
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          disabled={state.present === state.base}
          onClick={() => dispatch({ type: 'reset' })}
        >
          <RotateCcw />
          {t('text-formatter.toolbar.reset')}
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          disabled={state.present === ''}
          onClick={handleDownload}
        >
          <Download />
          {t('text-formatter.toolbar.download')}
        </Button>
      </div>

      <IoPair
        input={{
          value: state.base,
          placeholder: t('text-formatter.inputPlaceholder'),
          onValueChange: handleInputChange,
          textareaRef,
          footer: (caret) => <StatsBar side="input" stats={inputStats} caret={caret} />,
        }}
        output={{
          value: state.present,
          placeholder: t('text-formatter.outputPlaceholder'),
          footer: <StatsBar side="output" stats={outputStats} />,
        }}
        fullscreenLabel={tCommon('fullscreen')}
        fullscreenFooter={(target) => {
          const side = target === 'output' ? outputStats : inputStats
          return tCommon('charsAndLines', { chars: side.chars, lines: side.lines })
        }}
      />

      <RulePanel onPick={handlePick} disabled={state.base === '' && state.present === ''} />
    </div>
  )
}
