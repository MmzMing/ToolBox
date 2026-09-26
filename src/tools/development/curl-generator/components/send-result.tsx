import { Ban, Download, Send, X } from 'lucide-react'
import { useTranslation } from 'react-i18next'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import type { SendOutcome } from '../use-curl-sender'

interface SendResultProps {
  outcome: SendOutcome | null
  pending: boolean
  onSend: () => void
  onAbort: () => void
  onClose: () => void
}

/** 发送结果：状态、耗时、响应头与响应体，外加「与 curl 不一致之处」的如实说明 */
export function SendResult({ outcome, pending, onSend, onAbort, onClose }: SendResultProps) {
  const { t } = useTranslation('tools-development')
  const ns = (key: string) => t(`curl-generator.${key}`)

  return (
    <Card className="gap-0 p-0">
      <CardHeader className="flex flex-row items-center justify-between gap-2 border-b py-2">
        <CardTitle className="flex items-center gap-2 text-sm font-medium">
          {ns('sendTitle')}
          {outcome?.status !== undefined && (
            <Badge variant={outcome.ok ? 'secondary' : 'destructive'}>{outcome.status}</Badge>
          )}
          {outcome && <span className="text-muted-foreground text-xs">{outcome.ms} ms</span>}
        </CardTitle>
        <div className="flex items-center gap-1">
          {pending ? (
            <Button variant="outline" size="sm" className="h-7 gap-1.5" onClick={onAbort}>
              <Ban size={14} />
              {ns('abort')}
            </Button>
          ) : (
            <Button size="sm" className="h-7 gap-1.5" onClick={onSend}>
              <Send size={14} />
              {ns('send')}
            </Button>
          )}
          <Button
            variant="ghost"
            size="icon"
            className="size-7"
            onClick={onClose}
            aria-label={ns('close')}
          >
            <X size={14} />
          </Button>
        </div>
      </CardHeader>
      <CardContent className="flex flex-col gap-2 py-2">
        {outcome === null && (
          <p className="text-muted-foreground text-xs">
            {ns('sendEmpty')} · {ns('sendNotice')}
          </p>
        )}

        {outcome !== null && outcome.errorKey !== undefined && (
          <p className="text-xs leading-relaxed">
            {ns(`issues.${outcome.errorKey}`)}
            <span className="text-muted-foreground mt-1 block">{ns('corsNotice')}</span>
          </p>
        )}

        {outcome !== null && outcome.errorKey === undefined && (
          <>
            {outcome.skippedHeaders.length > 0 && (
              <p className="text-muted-foreground text-xs">
                {ns('skippedHeaders')}:{' '}
                <code className="font-mono">{outcome.skippedHeaders.join(', ')}</code>
              </p>
            )}
            {outcome.warnings.map((warning) => (
              <p key={warning} className="text-muted-foreground text-xs">
                {ns(`issues.${warning}`)}
              </p>
            ))}
            {outcome.headers.length > 0 && (
              <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-0.5 font-mono text-[11px]">
                {outcome.headers.map(([name, value]) => (
                  <div key={name} className="contents">
                    <dt className="text-muted-foreground">{name}</dt>
                    <dd className="break-all">{value}</dd>
                  </div>
                ))}
              </dl>
            )}
            {outcome.text !== undefined && (
              <pre className="bg-muted max-h-64 overflow-auto rounded p-2 font-mono text-[11px] leading-relaxed">
                {outcome.text}
                {outcome.truncated && `\n… ${ns('truncated')}`}
              </pre>
            )}
            {outcome.downloadUrl !== undefined && (
              <Button asChild variant="outline" size="sm" className="h-7 w-fit gap-1.5">
                <a href={outcome.downloadUrl} download={outcome.downloadName}>
                  <Download size={14} />
                  {ns('downloadBody')}
                  {outcome.byteSize !== undefined && ` · ${outcome.byteSize} B`}
                </a>
              </Button>
            )}
          </>
        )}
      </CardContent>
    </Card>
  )
}
