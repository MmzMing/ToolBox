import { ChevronDown, Download, Share2 } from 'lucide-react'
import { useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import {
  SHARE_LENGTH_WARN,
  decodeSharePayload,
  encodeSharePayload,
  payloadLooksSensitive,
} from '@/utils/share-codec'
import { useCurlHistoryStore } from '@/stores/curl-history.store'

import { HistoryCard } from './components/history-card'
import { ImportDialog } from './components/import-dialog'
import { OutputCard } from './components/output-card'
import { RequestEditor } from './components/request-editor'
import { SendResult } from './components/send-result'
import {
  buildCurl,
  createEmptyModel,
  normalizeModel,
  parseAny,
  validateModel,
  type Dialect,
  type HttpRequestModel,
  type Issue,
  type LineStyle,
} from './curl-generator.service'
import { PRESETS } from './presets'
import { useCurlSender } from './use-curl-sender'

/** 首屏若带分享链接进来就直接还原成表单，否则给一个空 GET */
function initialModel(): HttpRequestModel {
  return normalizeModel(decodeSharePayload(window.location.hash)) ?? createEmptyModel()
}

function summaryOf(model: HttpRequestModel): string {
  if (model.url === '') return model.method
  try {
    return `${model.method} ${new URL(model.url).host}`
  } catch {
    return `${model.method} ${model.url.slice(0, 28)}`
  }
}

export default function CurlGenerator() {
  const { t } = useTranslation('tools-development')
  const ns = (key: string) => t(`curl-generator.${key}`)

  const [model, setModel] = useState<HttpRequestModel>(initialModel)
  const [parseIssues, setParseIssues] = useState<Issue[]>([])
  const [showSend, setShowSend] = useState(false)

  const remember = useCurlHistoryStore((state) => state.remember)
  const sender = useCurlSender()

  const output = useMemo(() => buildCurl(model), [model])
  const issues = useMemo(() => [...parseIssues, ...validateModel(model)], [parseIssues, model])

  const patch = (next: Partial<HttpRequestModel>) => {
    setModel((previous) => ({ ...previous, ...next }))
    setParseIssues([])
  }

  const applyText = (text: string) => {
    if (text.trim() === '') return
    const result = parseAny(text, { dialect: model.dialect, lineStyle: model.lineStyle })
    setModel(result.model)
    setParseIssues(result.issues)
  }

  const share = () => {
    const payload = encodeSharePayload(model)
    // 地址栏同步一份，刷新即可复原；过长只提示，不静默截断
    window.history.replaceState(null, '', `#req=${payload}`)
    const url = `${window.location.origin}${window.location.pathname}#req=${payload}`
    if (url.length > SHARE_LENGTH_WARN) window.alert(ns('shareTooLong'))
    void navigator.clipboard.writeText(url)
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-1.5">
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="outline" size="sm" className="gap-1.5">
              {ns('presetMenu')}
              <ChevronDown size={13} />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start">
            {PRESETS.map((preset) => (
              <DropdownMenuItem
                key={preset.id}
                onSelect={() => {
                  setModel(preset.build())
                  setParseIssues([])
                }}
              >
                {ns(`presets.${preset.id}`)}
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>

        <ImportDialog
          onApply={applyText}
          trigger={
            <Button variant="outline" size="sm" className="gap-1.5">
              <Download size={13} />
              {ns('importButton')}
            </Button>
          }
        />

        <AlertDialog>
          <AlertDialogTrigger asChild>
            <Button variant="outline" size="sm" className="gap-1.5" disabled={model.url === ''}>
              <Share2 size={13} />
              {ns('share')}
            </Button>
          </AlertDialogTrigger>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>{ns('shareConfirmTitle')}</AlertDialogTitle>
              <AlertDialogDescription>{ns('shareConfirmBody')}</AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>{ns('shareCancel')}</AlertDialogCancel>
              <AlertDialogAction onClick={share}>{ns('shareCopy')}</AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>

        {payloadLooksSensitive(model) && (
          <span className="text-destructive ml-auto text-xs">{ns('shareSensitive')}</span>
        )}
      </div>

      <div className="grid items-start gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,38rem)]">
        <Card className="gap-0 p-0">
          <CardContent className="p-4">
            <RequestEditor
              model={model}
              patch={patch}
              pending={sender.pending}
              onSend={() => {
                setShowSend(true)
                void sender.send(model)
              }}
            />
          </CardContent>
        </Card>

        <div className="flex min-w-0 flex-col gap-3">
          <OutputCard
            model={model}
            command={output}
            issues={issues}
            dialect={model.dialect}
            lineStyle={model.lineStyle}
            onDialectChange={(dialect: Dialect) => patch({ dialect })}
            onLineStyleChange={(lineStyle: LineStyle) => patch({ lineStyle })}
            onRearrange={() => applyText(output)}
            onSave={() => remember(model, output, summaryOf(model))}
          />
          <HistoryCard
            onLoad={(restored) => {
              setModel({ ...restored, dialect: model.dialect, lineStyle: model.lineStyle })
              setParseIssues([])
            }}
          />
          {showSend && (
            <SendResult
              outcome={sender.outcome}
              pending={sender.pending}
              onSend={() => void sender.send(model)}
              onAbort={sender.abort}
              onClose={() => setShowSend(false)}
            />
          )}
        </div>
      </div>
    </div>
  )
}
