import { useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'
import { Check, Download, ExternalLink, Eye, EyeOff, Loader2, Sparkles } from 'lucide-react'

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { Badge } from '@/components/ui/badge'
import { Button, buttonVariants } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectSeparator,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Switch } from '@/components/ui/switch'
import { cn } from '@/lib/utils'

import {
  AI_PROVIDERS,
  AI_PROVIDER_DEFINITIONS,
  isValidBaseUrl,
  resolveSlot,
  type AIProvider,
  type ProviderCredentials,
} from '../../../ai/providers'
import { useAIConfigStore } from '../../../ai/store'
import { useAIDialogStore } from './useAIGate'
import { ProviderMark } from './ProviderMark'
import { useModelList } from './useModelList'
import { useModelTest } from './useModelTest'
import { aiErrorKey } from './error-copy'

const DIRECT_BADGE: Record<string, { key: string; className: string }> = {
  reachable: { key: 'resume.ai.direct.reachable', className: 'text-primary border-primary/40' },
  blocked: { key: 'resume.ai.direct.blocked', className: 'text-destructive border-destructive/40' },
  unknown: { key: 'resume.ai.direct.unknown', className: 'text-muted-foreground' },
}

const NONE = '__none__'
const MANUAL = '__manual__'

/** 标签在左、下拉在右的一行；列表拉不到时可切到手输 */
function ModelSlotRow({
  id,
  label,
  models,
  value,
  onChange,
}: {
  id: string
  label: string
  models: string[]
  value: string | null
  onChange: (model: string | null) => void
}) {
  const { t } = useTranslation('tools-resume')
  const [manual, setManual] = useState(false)

  // 手输过或从旧版本迁移来的模型名不在列表里，也要能显示成当前选中项
  const options = useMemo(
    () => (value && !models.includes(value) ? [value, ...models] : models),
    [models, value],
  )

  return (
    <div className="flex flex-col gap-1.5 sm:flex-row sm:items-center sm:gap-3">
      <Label htmlFor={id} className="shrink-0 sm:w-40">
        {label}
      </Label>
      {manual ? (
        <div className="flex min-w-0 flex-1 items-center gap-2">
          <Input
            id={id}
            value={value ?? ''}
            spellCheck={false}
            autoComplete="off"
            placeholder={t('resume.ai.config.modelPlaceholder')}
            onChange={(event) => onChange(event.target.value || null)}
          />
          <Button
            type="button"
            size="xs"
            variant="ghost"
            className={options.length ? 'shrink-0' : 'hidden'}
            onClick={() => setManual(false)}
          >
            {t('resume.ai.config.fromList')}
          </Button>
        </div>
      ) : (
        <Select
          value={value ?? NONE}
          onValueChange={(next) => {
            if (next === MANUAL) {
              setManual(true)
              return
            }
            onChange(next === NONE ? null : next)
          }}
        >
          <SelectTrigger id={id} className="min-w-0 flex-1">
            <SelectValue />
          </SelectTrigger>
          <SelectContent position="popper" align="start">
            <SelectItem value={NONE}>{t('resume.ai.config.unassigned')}</SelectItem>
            {options.map((model) => (
              <SelectItem key={model} value={model}>
                {model}
              </SelectItem>
            ))}
            <SelectSeparator />
            <SelectItem value={MANUAL}>{t('resume.ai.config.manual')}</SelectItem>
          </SelectContent>
        </Select>
      )}
    </div>
  )
}

/** 模型区：右上角拉列表 / 测连通，下面两行分别绑定文本与视觉任务槽 */
function ModelSection({
  provider,
  credentials,
}: {
  provider: AIProvider
  credentials: ProviderCredentials
}) {
  const { t } = useTranslation('tools-resume')
  const modelList = useAIConfigStore((state) => state.modelLists[provider])
  const picks = useAIConfigStore((state) => state.picks[provider])
  const setModelList = useAIConfigStore((state) => state.setModelList)
  const setPick = useAIConfigStore((state) => state.setPick)
  const { state: test, test: runTest } = useModelTest()
  const { fetching, load } = useModelList()

  const models = useMemo(() => modelList ?? [], [modelList])
  const usable = !!credentials.apiKey.trim() && isValidBaseUrl(credentials.baseUrl)
  // 连通性自检只要求「发得出去、答得回来」，视觉模型由 useModelTest 内部按能力分流
  const testTarget = useMemo(() => {
    const model = picks.text || picks.pdf
    return model ? resolveSlot({ provider, model }, credentials, 'text') : null
  }, [credentials, picks.pdf, picks.text, provider])

  const handleFetch = async () => {
    const list = await load({
      protocol: AI_PROVIDER_DEFINITIONS[provider].protocol,
      apiKey: credentials.apiKey.trim(),
      baseUrl: credentials.baseUrl,
    })
    if (!list) {
      return
    }
    setModelList(provider, list)
    toast.success(
      list.length
        ? t('resume.ai.config.fetchOk', { count: list.length })
        : t('resume.ai.config.fetchEmpty'),
    )
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center justify-between gap-2">
        <Label>{t('resume.ai.config.models')}</Label>
        <div className="flex items-center gap-2">
          <Button
            type="button"
            size="xs"
            variant="outline"
            disabled={!usable || fetching}
            onClick={() => void handleFetch().catch((error) => toast.error(t(aiErrorKey(error))))}
          >
            {fetching ? (
              <Loader2 className="size-4 animate-spin" />
            ) : (
              <Download className="size-4" />
            )}
            {t('resume.ai.config.fetchModels')}
          </Button>
          <Button
            type="button"
            size="xs"
            variant="outline"
            disabled={!testTarget || test.status === 'running'}
            onClick={() => testTarget && void runTest(testTarget)}
          >
            {test.status === 'running' && <Loader2 className="size-4 animate-spin" />}
            {t('resume.ai.test.button')}
          </Button>
        </div>
      </div>

      {test.status !== 'idle' && test.message && (
        <p
          role="status"
          className={cn(
            'text-xs',
            test.status === 'ok' && 'text-primary',
            test.status === 'failed' && 'text-destructive',
          )}
        >
          {test.message}
        </p>
      )}

      <ModelSlotRow
        id="ai-text-model"
        label={t('resume.ai.config.textModel')}
        models={models}
        value={picks.text}
        onChange={(model) => setPick(provider, 'text', model)}
      />
      <ModelSlotRow
        id="ai-pdf-model"
        label={t('resume.ai.config.pdfModel')}
        models={models}
        value={picks.pdf}
        onChange={(model) => setPick(provider, 'pdf', model)}
      />

      <p className="text-muted-foreground text-xs">
        {models.length
          ? t('resume.ai.config.textHint')
          : t('resume.ai.config.listEmpty', { name: AI_PROVIDER_DEFINITIONS[provider].name })}
      </p>
    </div>
  )
}

/** AI 服务商与模型配置弹窗 */
export function AIConfigDialog() {
  const { t } = useTranslation('tools-resume')
  const open = useAIDialogStore((state) => state.configOpen)
  const setOpen = useAIDialogStore((state) => state.setConfigOpen)

  const credentials = useAIConfigStore((state) => state.credentials)
  const picks = useAIConfigStore((state) => state.picks)
  const activeProvider = useAIConfigStore((state) => state.activeProvider)
  const enabled = useAIConfigStore((state) => state.enabled)
  const setEnabled = useAIConfigStore((state) => state.setEnabled)
  const setActiveProvider = useAIConfigStore((state) => state.setActiveProvider)
  const markConsentSeen = useAIConfigStore((state) => state.markConsentSeen)
  const setProviderApiKey = useAIConfigStore((state) => state.setProviderApiKey)
  const setProviderBaseUrl = useAIConfigStore((state) => state.setProviderBaseUrl)

  const [provider, setProvider] = useState<AIProvider>(
    () => useAIConfigStore.getState().activeProvider,
  )
  const [revealKey, setRevealKey] = useState(false)
  const [consentOpen, setConsentOpen] = useState(false)

  /** 首次开启要先过一次数据流向确认；关闭则直接生效 */
  const toggleEnabled = (next: boolean) => {
    if (!next) {
      setEnabled(false)
      return
    }
    if (useAIConfigStore.getState().consentSeen) {
      setEnabled(true)
      return
    }
    setConsentOpen(true)
  }

  const current = credentials[provider]
  const definition = AI_PROVIDER_DEFINITIONS[provider]
  const badge = DIRECT_BADGE[definition.browserDirect]
  /** 厂商算「已配置」：填了 key，且至少选了一个型号的槽 */
  const isReady = (item: AIProvider) =>
    !!credentials[item].apiKey.trim() && !!(picks[item].text || picks[item].pdf)
  const configured = AI_PROVIDERS.filter(isReady).length
  /** 「使用厂商」只列填过 key 的，外加当前生效那家（哪怕 key 被清空也要能显示出来） */
  const usableProviders = AI_PROVIDERS.filter(
    (item) => !!credentials[item].apiKey.trim() || item === activeProvider,
  )

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent className="flex max-h-[88svh] flex-col gap-0 overflow-hidden p-0 sm:max-w-4xl">
        <div className="border-border shrink-0 border-b px-5 py-4">
          <DialogHeader className="pr-8">
            <DialogTitle className="flex items-center gap-2">
              {t('resume.ai.config.title')}
              <Badge variant="outline">
                {t('resume.ai.config.connected', { count: configured, total: AI_PROVIDERS.length })}
              </Badge>
            </DialogTitle>
            <DialogDescription>{t('resume.ai.config.notice')}</DialogDescription>
          </DialogHeader>

          <div className="border-border mt-3 flex flex-wrap items-center justify-between gap-3 rounded-lg border p-3">
            <div className="min-w-0">
              <Label htmlFor="ai-enabled" className="flex cursor-pointer items-center gap-1.5">
                <Sparkles className="text-muted-foreground size-4" />
                {t('resume.ai.entry')}
              </Label>
              <p className="text-muted-foreground mt-0.5 text-xs">{t('resume.ai.entryHint')}</p>
            </div>
            <div className="flex shrink-0 items-center gap-2">
              <Label htmlFor="ai-active-provider" className="text-muted-foreground text-xs">
                {t('resume.ai.config.useProvider')}
              </Label>
              <Select
                value={activeProvider}
                onValueChange={(next) => setActiveProvider(next as AIProvider)}
                disabled={usableProviders.length === 0}
              >
                <SelectTrigger id="ai-active-provider" size="sm" className="w-32">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent position="popper" align="end">
                  {usableProviders.map((item) => (
                    <SelectItem key={item} value={item}>
                      {AI_PROVIDER_DEFINITIONS[item].name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Switch id="ai-enabled" checked={enabled} onCheckedChange={toggleEnabled} />
            </div>
          </div>
        </div>

        <div className="flex min-h-0 flex-1 flex-col overflow-y-auto sm:flex-row sm:overflow-hidden">
          <div className="border-border shrink-0 p-3 sm:w-60 sm:overflow-y-auto sm:border-r">
            <p className="px-2 pt-1 pb-1 text-sm font-medium">{t('resume.ai.config.pickTitle')}</p>
            <p className="text-muted-foreground px-2 pb-2 text-xs">
              {t('resume.ai.config.pickHint')}
            </p>
            <div className="flex flex-col gap-1">
              {AI_PROVIDERS.map((item) => {
                const ready = isReady(item)
                const editing = item === provider
                const used = item === activeProvider
                return (
                  <button
                    key={item}
                    type="button"
                    aria-current={editing}
                    onClick={() => setProvider(item)}
                    className={cn(
                      'hover:bg-accent/60 focus-visible:ring-ring/50 flex w-full items-center gap-2.5 rounded-lg border border-transparent p-2 text-left outline-none focus-visible:ring-2',
                      editing && 'border-border bg-accent',
                    )}
                  >
                    <ProviderMark provider={item} />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-medium">
                        {AI_PROVIDER_DEFINITIONS[item].name}
                      </span>
                      <span
                        className={cn(
                          'mt-0.5 flex items-center gap-1.5 text-xs',
                          ready ? 'text-primary' : 'text-muted-foreground',
                        )}
                      >
                        <span
                          className={cn(
                            'size-1.5 rounded-full',
                            ready ? 'bg-primary' : 'bg-muted-foreground/40',
                          )}
                        />
                        {t(ready ? 'resume.ai.config.ready' : 'resume.ai.config.incomplete')}
                        {used && <span>· {t('resume.ai.config.active')}</span>}
                      </span>
                    </span>
                    {editing && <Check className="text-muted-foreground size-4 shrink-0" />}
                  </button>
                )
              })}
            </div>
          </div>

          <div className="min-w-0 flex-1 p-5 sm:overflow-y-auto">
            <div className="flex flex-col gap-4">
              <div className="flex flex-col gap-2">
                <div className="flex items-center justify-between gap-2">
                  <Label htmlFor="ai-api-key" className="flex items-center gap-2">
                    API Key
                    <span className={cn('text-xs', badge.className)}>{t(badge.key)}</span>
                  </Label>
                  <a
                    href={definition.keyUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className={cn(
                      buttonVariants({ variant: 'ghost', size: 'xs' }),
                      'text-muted-foreground gap-1',
                    )}
                  >
                    {t('resume.ai.config.getKey')}
                    <ExternalLink className="size-3" />
                  </a>
                </div>
                <div className="flex items-center gap-2">
                  <Input
                    id="ai-api-key"
                    type={revealKey ? 'text' : 'password'}
                    value={current.apiKey}
                    autoComplete="off"
                    spellCheck={false}
                    placeholder={t('resume.ai.config.keyPlaceholder')}
                    onChange={(event) => setProviderApiKey(provider, event.target.value)}
                  />
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon-sm"
                    aria-label={t(
                      revealKey ? 'resume.ai.config.hideKey' : 'resume.ai.config.showKey',
                    )}
                    onClick={() => setRevealKey((prev) => !prev)}
                  >
                    {revealKey ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
                  </Button>
                </div>
              </div>

              <div className="flex flex-col gap-2">
                <Label htmlFor="ai-base-url">{t('resume.ai.config.baseUrl')}</Label>
                <Input
                  id="ai-base-url"
                  value={current.baseUrl}
                  spellCheck={false}
                  onChange={(event) => setProviderBaseUrl(provider, event.target.value)}
                  aria-invalid={!isValidBaseUrl(current.baseUrl)}
                />
                <p className="text-muted-foreground text-xs">{t('resume.ai.config.baseUrlHint')}</p>
              </div>

              {/* 凭证一改就重挂模型区：旧的检测结论与在飞请求随之作废 */}
              <ModelSection
                key={`${provider}:${current.apiKey}:${current.baseUrl}`}
                provider={provider}
                credentials={current}
              />
            </div>
          </div>
        </div>
      </DialogContent>

      <AlertDialog open={consentOpen} onOpenChange={setConsentOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t('resume.ai.consent.title')}</AlertDialogTitle>
            <AlertDialogDescription>{t('resume.ai.consent.body')}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t('resume.confirm.cancel')}</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                markConsentSeen()
                setEnabled(true)
                setConsentOpen(false)
              }}
            >
              {t('resume.ai.consent.accept')}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Dialog>
  )
}
