import { AlertTriangle, Check, CircleCheck, Copy, History, Wand2 } from 'lucide-react'
import hljs from 'highlight.js/lib/common'
import { useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'

import { TextareaCopyable } from '@/components/copyable/textarea-copyable'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group'
import { useCopy } from '@/composable/use-copy'
import { CODE_TARGETS, generateCode, type CodeTargetId } from '../code-targets'
import type { Issue } from '../curl-generator.service'
import type { Dialect, HttpRequestModel, LineStyle } from '../request-model'

const DIALECTS: readonly Dialect[] = ['bash', 'cmd', 'powershell']
const LANGUAGE_OF: Record<Dialect, string> = { bash: 'bash', cmd: 'dos', powershell: 'powershell' }
const CURL_TARGET = 'curl'
type OutputTarget = typeof CURL_TARGET | CodeTargetId

const FIELD_LABEL: Record<string, string> = {
  url: 'cols.url',
  method: 'cols.method',
  headers: 'tabs.headers',
  body: 'tabs.body',
  auth: 'tabs.auth',
  query: 'tabs.params',
  output: 'flags.output',
}

/**
 * 不预留高度：rows 只是最小值，容器跟着内容长。
 * 按行数估算永远差横向滚动条那约 15px 的厚度——不是留死白，就是挤出纵向滚动。
 */
const FIT_CONTENT_ROWS = 1

interface OutputCardProps {
  model: HttpRequestModel
  command: string
  issues: readonly Issue[]
  dialect: Dialect
  lineStyle: LineStyle
  onDialectChange: (dialect: Dialect) => void
  onLineStyleChange: (style: LineStyle) => void
  onRearrange: () => void
  onSave: () => void
}

/**
 * 输出卡：cURL 命令与 5 种语言代码共用一个面板。
 * 调试开关（-i / -v / -k 等）只在左栏「高级设置」出现一次，这里不再重复一遍入口。
 */
export function OutputCard({
  model,
  command,
  issues,
  dialect,
  lineStyle,
  onDialectChange,
  onLineStyleChange,
  onRearrange,
  onSave,
}: OutputCardProps) {
  const { t } = useTranslation('tools-development')
  const ns = (key: string) => t(`curl-generator.${key}`)
  const { copy, isCopied } = useCopy()
  const [target, setTarget] = useState<OutputTarget>(CURL_TARGET)

  const code = useMemo(
    () => (target === CURL_TARGET ? command : generateCode(target, model)),
    [target, command, model],
  )
  const errors = issues.filter((issue) => issue.level === 'error')
  const warnings = issues.filter((issue) => issue.level === 'warn')
  const language =
    target === CURL_TARGET
      ? hljs.getLanguage(LANGUAGE_OF[dialect])
        ? LANGUAGE_OF[dialect]
        : undefined
      : target
  const empty = code === ''

  return (
    <Card className="gap-0 p-0">
      <CardHeader className="flex flex-row items-center justify-between gap-2 border-b py-2">
        <CardTitle className="text-sm font-medium">{ns('resultTitle')}</CardTitle>
        <div className="flex items-center gap-1">
          <Button
            variant="ghost"
            size="sm"
            className="h-7 gap-1.5 text-xs"
            onClick={onSave}
            disabled={command === ''}
          >
            <History size={13} />
            {ns('saveToHistory')}
          </Button>
          <Button
            size="sm"
            className="h-7 gap-1.5 text-xs"
            onClick={() => void copy(code)}
            disabled={empty}
          >
            {isCopied(code) ? <Check size={13} /> : <Copy size={13} />}
            {t('common:copy')}
          </Button>
        </div>
      </CardHeader>

      <div className="flex flex-col gap-2 px-4 pt-3">
        <Tabs value={target} onValueChange={(value) => setTarget(value as OutputTarget)}>
          <TabsList className="h-8 flex-wrap">
            <TabsTrigger value={CURL_TARGET}>{ns('outputTitle')}</TabsTrigger>
            {CODE_TARGETS.map((item) => (
              <TabsTrigger key={item.id} value={item.id}>
                {item.label}
              </TabsTrigger>
            ))}
          </TabsList>
        </Tabs>

        {target === CURL_TARGET && (
          <div className="flex flex-wrap items-center gap-2">
            <ToggleGroup
              type="single"
              variant="outline"
              size="sm"
              value={dialect}
              onValueChange={(next) => next && onDialectChange(next as Dialect)}
              className="gap-1"
            >
              {DIALECTS.map((item) => (
                <ToggleGroupItem key={item} value={item} className="h-6 px-2 text-[11px]">
                  {ns(`dialects.${item}`)}
                </ToggleGroupItem>
              ))}
            </ToggleGroup>
            <ToggleGroup
              type="single"
              variant="outline"
              size="sm"
              value={lineStyle}
              onValueChange={(next) => next && onLineStyleChange(next as LineStyle)}
              className="gap-1"
            >
              <ToggleGroupItem value="multiline" className="h-6 px-2 text-[11px]">
                {ns('lineStyles.multiline')}
              </ToggleGroupItem>
              <ToggleGroupItem value="single" className="h-6 px-2 text-[11px]">
                {ns('lineStyles.single')}
              </ToggleGroupItem>
            </ToggleGroup>
            <Button
              variant="ghost"
              size="sm"
              className="ml-auto h-6 gap-1.5 text-[11px]"
              onClick={onRearrange}
              disabled={command === ''}
            >
              <Wand2 size={12} />
              {ns('rearrange')}
            </Button>
          </div>
        )}
      </div>

      <CardContent className="p-0 pt-2">
        {empty ? (
          <p className="text-muted-foreground px-4 py-6 text-center text-xs">
            {ns(target === CURL_TARGET ? 'outputPlaceholder' : 'exportPlaceholder')}
          </p>
        ) : (
          <TextareaCopyable
            value={code}
            rows={FIT_CONTENT_ROWS}
            highlight
            language={language}
            hideCopyButton
            showLineNumbers
            className="min-h-0 rounded-none border-0 font-mono text-xs"
          />
        )}
      </CardContent>

      <div className="flex flex-col gap-1.5 border-t px-4 py-2.5">
        <span className="text-muted-foreground flex items-center gap-2 text-xs font-medium">
          {ns('issuesTitle')}
          {errors.length > 0 && (
            <Badge variant="destructive" className="h-4 px-1 text-[10px]">
              {errors.length}
            </Badge>
          )}
          {warnings.length > 0 && (
            <Badge variant="secondary" className="h-4 px-1 text-[10px]">
              {warnings.length}
            </Badge>
          )}
        </span>
        {issues.length === 0 ? (
          <p className="text-muted-foreground flex items-center gap-1.5 text-xs">
            <CircleCheck size={13} className="text-primary" />
            {ns('issuesNone')}
          </p>
        ) : (
          <ul className="flex flex-col gap-1">
            {[...errors, ...warnings].map((issue, index) => (
              <li key={`${issue.key}-${index}`} className="flex items-start gap-1.5 text-xs">
                <AlertTriangle
                  size={13}
                  className={
                    issue.level === 'error'
                      ? 'text-destructive mt-0.5 shrink-0'
                      : 'mt-0.5 shrink-0 text-amber-500'
                  }
                />
                <span className="leading-relaxed">
                  {ns(`issues.${issue.key}`)}
                  {issue.detail && (
                    <code className="text-muted-foreground ml-1 font-mono text-[11px] break-all">
                      {issue.detail}
                    </code>
                  )}
                  {issue.field && (
                    <span className="text-muted-foreground ml-1">
                      · {ns(FIELD_LABEL[issue.field] ?? issue.field)}
                    </span>
                  )}
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </Card>
  )
}
