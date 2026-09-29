import { useEffect, useState, type ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'
import { ExternalLink, Eye, EyeOff, Loader2 } from 'lucide-react'

import { aiErrorKey } from '@/components/ai/error-copy'
import { useModelList } from '@/components/ai/use-model-list'
import { useModelTest } from '@/components/ai/use-model-test'
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
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Separator } from '@/components/ui/separator'
import { Switch } from '@/components/ui/switch'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { cn } from '@/lib/utils'
import {
  AI_PROVIDERS,
  AI_PROVIDER_DEFINITIONS,
  IMAGE_MODEL_CATALOG,
  isValidBaseUrl,
  type AIModelProfile,
  type AIProvider,
} from '@/modules/ai/providers'
import { useAIConfigStore } from '@/modules/ai/store'

import { apiReady, apiSignature } from '../ai-image-gen.service'
import { useAiImageGenStore, type ApiConfig } from '../store'
import { SkillPicker } from './SkillPicker'

const MANUAL = '__manual__'

type AiImageSettingsDialogProps = { open: boolean; onOpenChange: (open: boolean) => void }

/** 生图、识图、润色各一套独立 API：一个 tab 填一套，key/地址/模型互不牵连 */
export function AiImageSettingsDialog({ open, onOpenChange }: AiImageSettingsDialogProps) {
  const { t } = useTranslation('tools-images')
  const enabled = useAIConfigStore((state) => state.enabled)
  const consentSeen = useAIConfigStore((state) => state.consentSeen)
  const setEnabled = useAIConfigStore((state) => state.setEnabled)
  const markConsentSeen = useAIConfigStore((state) => state.markConsentSeen)
  const genApi = useAiImageGenStore((state) => state.genApi)
  const visionApi = useAiImageGenStore((state) => state.visionApi)
  const polishApi = useAiImageGenStore((state) => state.polishApi)
  const polishUsesVision = useAiImageGenStore((state) => state.polishUsesVision)
  const visionSkillId = useAiImageGenStore((state) => state.visionSkillId)
  const modelLists = useAiImageGenStore((state) => state.modelLists)
  const setGenApi = useAiImageGenStore((state) => state.setGenApi)
  const setVisionApi = useAiImageGenStore((state) => state.setVisionApi)
  const setPolishApi = useAiImageGenStore((state) => state.setPolishApi)
  const setPolishUsesVision = useAiImageGenStore((state) => state.setPolishUsesVision)
  const setVisionSkillId = useAiImageGenStore((state) => state.setVisionSkillId)
  const tested = useAiImageGenStore((state) => state.tested)
  const setModelList = useAiImageGenStore((state) => state.setModelList)
  const setTested = useAiImageGenStore((state) => state.setTested)

  const [showKey, setShowKey] = useState(false)
  const [consentOpen, setConsentOpen] = useState(false)
  const genList = useModelList()

  const handleGenFetch = async () => {
    try {
      const models = await genList.load({
        protocol: AI_PROVIDER_DEFINITIONS[genApi.provider].protocol,
        apiKey: genApi.apiKey.trim(),
        baseUrl: genApi.baseUrl.trim(),
      })
      if (models) {
        setModelList(genApi.provider, models)
        setTested('gen', apiSignature(genApi))
        toast.success(t('ai-image-gen.settings.fetchOk', { count: models.length }))
      }
    } catch (error) {
      toast.error(t(aiErrorKey(error)))
    }
  }

  const genReady = apiReady(genApi, enabled, tested.gen)
  const visionReady = apiReady(visionApi, enabled, tested.vision)
  // 润色默认蹭识图那套凭证与测试结果，关掉开关才用自己的 polishApi
  const polishReady = apiReady(
    polishUsesVision ? visionApi : polishApi,
    enabled,
    polishUsesVision ? tested.vision : tested.polish,
  )

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-xl">
        <DialogHeader>
          <DialogTitle className="flex items-center justify-between gap-4 pr-8">
            {t('ai-image-gen.settings.title')}
            <Switch
              checked={enabled}
              aria-label={t('ai-image-gen.settings.enable')}
              onCheckedChange={(next) => {
                if (next && !consentSeen) {
                  setConsentOpen(true)
                  return
                }
                setEnabled(next)
              }}
            />
          </DialogTitle>
        </DialogHeader>

        <Tabs defaultValue="gen">
          <TabsList className="w-full">
            <TabsTrigger value="gen" className="gap-1.5">
              <ReadyDot ready={genReady} />
              {t('ai-image-gen.settings.genApi')}
            </TabsTrigger>
            <TabsTrigger value="vision" className="gap-1.5">
              <ReadyDot ready={visionReady} />
              {t('ai-image-gen.settings.visionApi')}
            </TabsTrigger>
            <TabsTrigger value="polish" className="gap-1.5">
              <ReadyDot ready={polishReady} />
              {t('ai-image-gen.settings.polishApi')}
            </TabsTrigger>
          </TabsList>

          <TabsContent value="gen" className="pt-1">
            <ApiSection
              api={genApi}
              onApiChange={setGenApi}
              modelLabel={t('ai-image-gen.settings.imageModel')}
              modelOptions={[
                ...new Set([
                  ...IMAGE_MODEL_CATALOG[genApi.provider === 'gemini' ? 'gemini' : 'openai'],
                  ...(modelLists[genApi.provider] ?? []),
                ]),
              ]}
              providerSlot={
                <ProviderSegment
                  value={genApi.provider}
                  onChange={(provider) => setGenApi({ provider })}
                />
              }
              showKey={showKey}
              onToggleKey={() => setShowKey(!showKey)}
              actions={
                <Button
                  variant="outline"
                  size="sm"
                  className="gap-1 text-xs"
                  disabled={
                    genList.fetching || !genApi.apiKey.trim() || !isValidBaseUrl(genApi.baseUrl)
                  }
                  onClick={() => void handleGenFetch()}
                >
                  {genList.fetching && <Loader2 className="size-3.5 animate-spin" />}
                  {t('ai-image-gen.settings.fetchModels')}
                </Button>
              }
            />
          </TabsContent>

          <TabsContent value="vision" className="space-y-3 pt-1">
            <ChatApiSection
              slot="vision"
              api={visionApi}
              onApiChange={setVisionApi}
              showKey={showKey}
              onToggleKey={() => setShowKey(!showKey)}
            />
            <Separator className="my-3" />
            <div className="space-y-2">
              <p className="text-sm font-medium">{t('ai-image-gen.settings.visionSkill')}</p>
              <p className="text-muted-foreground text-xs">
                {t('ai-image-gen.settings.visionSkillHint')}
              </p>
              <SkillPicker skillId={visionSkillId} onSkillIdChange={setVisionSkillId} />
            </div>
          </TabsContent>

          <TabsContent value="polish" className="space-y-3 pt-1">
            <div className="flex items-center gap-2">
              <Switch
                checked={polishUsesVision}
                aria-label={t('ai-image-gen.settings.polishUseVision')}
                onCheckedChange={setPolishUsesVision}
              />
              <Label className="text-xs">{t('ai-image-gen.settings.polishUseVision')}</Label>
            </div>
            <p className="text-muted-foreground text-xs">
              {t('ai-image-gen.settings.polishUseVisionHint')}
            </p>
            <p className="text-muted-foreground text-xs">
              {polishUsesVision
                ? t('ai-image-gen.settings.polishUsesVisionNow', {
                    model: visionApi.model || t('ai-image-gen.settings.unassigned'),
                  })
                : t('ai-image-gen.settings.polishOwnModelNow')}
            </p>
            {polishUsesVision ? null : (
              <>
                <Separator />
                <ChatApiSection
                  slot="polish"
                  api={polishApi}
                  onApiChange={setPolishApi}
                  showKey={showKey}
                  onToggleKey={() => setShowKey(!showKey)}
                />
              </>
            )}
          </TabsContent>
        </Tabs>
      </DialogContent>

      <AlertDialog open={consentOpen} onOpenChange={setConsentOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t('ai-image-gen.settings.consentTitle')}</AlertDialogTitle>
            <AlertDialogDescription>
              {t('ai-image-gen.settings.consentBody')}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t('ai-image-gen.toolbar.cancel')}</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                markConsentSeen()
                setEnabled(true)
              }}
            >
              {t('ai-image-gen.settings.consentAccept')}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Dialog>
  )
}

function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex items-center gap-3">
      <Label className="text-muted-foreground w-20 shrink-0 text-xs">{label}</Label>
      <div className="flex min-w-0 flex-1 items-center gap-2">{children}</div>
    </div>
  )
}

/** tab 标签上的红/绿点：与右侧 dock 那颗同源，绿 = 配置齐且连接测过 */
function ReadyDot({ ready }: { ready: boolean }) {
  return (
    <span
      aria-hidden
      className={cn('size-1.5 shrink-0 rounded-full', ready ? 'bg-primary' : 'bg-destructive')}
    />
  )
}

function KeyInput({
  api,
  onApiChange,
  showKey,
}: {
  api: ApiConfig
  onApiChange: (patch: Partial<ApiConfig>) => void
  showKey: boolean
}) {
  return (
    <Input
      type={showKey ? 'text' : 'password'}
      value={api.apiKey}
      placeholder="sk-…"
      autoComplete="off"
      spellCheck={false}
      className="h-9 flex-1 text-xs"
      onChange={(event) => onApiChange({ apiKey: event.target.value })}
    />
  )
}

function ApiSection({
  api,
  onApiChange,
  modelLabel,
  modelOptions,
  providerSlot,
  showKey,
  onToggleKey,
  actions,
}: {
  api: ApiConfig
  onApiChange: (patch: Partial<ApiConfig>) => void
  modelLabel: string
  modelOptions: string[]
  providerSlot: ReactNode
  showKey: boolean
  onToggleKey: () => void
  actions?: ReactNode
}) {
  const { t } = useTranslation('tools-images')
  const preset = AI_PROVIDER_DEFINITIONS[api.provider]
  return (
    <div className="space-y-3">
      <Row label={t('ai-image-gen.settings.provider')}>{providerSlot}</Row>
      <Row label="API Key">
        <KeyInput api={api} onApiChange={onApiChange} showKey={showKey} />
        <Button
          variant="ghost"
          size="icon"
          className="size-9 shrink-0"
          aria-label={
            showKey ? t('ai-image-gen.settings.hideKey') : t('ai-image-gen.settings.showKey')
          }
          onClick={onToggleKey}
        >
          {showKey ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
        </Button>
        <a
          href={preset.keyUrl}
          target="_blank"
          rel="noreferrer"
          className="text-muted-foreground hover:text-foreground inline-flex shrink-0 items-center gap-1 text-xs"
        >
          {t('ai-image-gen.settings.keyLink')}
          <ExternalLink className="size-3" />
        </a>
      </Row>
      <Row label={t('ai-image-gen.settings.baseUrl')}>
        <Input
          value={api.baseUrl}
          spellCheck={false}
          className="h-9 flex-1 text-xs"
          onChange={(event) => onApiChange({ baseUrl: event.target.value })}
        />
      </Row>
      <Row label={modelLabel}>
        <ModelPick
          value={api.model}
          options={modelOptions}
          onChange={(model) => onApiChange({ model })}
        />
      </Row>
      {actions && <div className="flex gap-2 pl-[92px]">{actions}</div>}
    </div>
  )
}

function ProviderSegment({
  value,
  onChange,
}: {
  value: AIProvider
  onChange: (provider: 'openai' | 'gemini') => void
}) {
  return (
    <div className="flex w-full rounded-lg border p-0.5">
      {(['openai', 'gemini'] as const).map((item) => (
        <button
          key={item}
          type="button"
          onClick={() => onChange(item)}
          className={
            value === item
              ? 'bg-secondary flex-1 rounded-md px-3 py-1.5 text-sm'
              : 'text-muted-foreground hover:text-foreground flex-1 rounded-md px-3 py-1.5 text-sm'
          }
        >
          {AI_PROVIDER_DEFINITIONS[item].name}
        </button>
      ))}
    </div>
  )
}

/** 识图与润色同构：都是「一套 chat 凭证 + 一个模型」，只差 tested 的槽位键与模型标签 */
function ChatApiSection({
  slot,
  ...section
}: {
  slot: 'vision' | 'polish'
  api: ApiConfig
  onApiChange: (patch: Partial<ApiConfig>) => void
  showKey: boolean
  onToggleKey: () => void
}) {
  const { t } = useTranslation('tools-images')
  const { api, onApiChange } = section
  const modelLists = useAiImageGenStore((state) => state.modelLists)
  const setModelList = useAiImageGenStore((state) => state.setModelList)
  const setTested = useAiImageGenStore((state) => state.setTested)
  const { fetching, load } = useModelList()
  const { state: testState, test: runTest } = useModelTest()

  const signature = apiSignature(api)
  useEffect(() => {
    if (testState.status === 'ok') {
      setTested(slot, signature)
    }
  }, [testState.status, signature, setTested, slot])

  const handleFetch = async () => {
    try {
      const models = await load({
        protocol: AI_PROVIDER_DEFINITIONS[api.provider].protocol,
        apiKey: api.apiKey.trim(),
        baseUrl: api.baseUrl.trim(),
      })
      if (models) {
        setModelList(api.provider, models)
        toast.success(t('ai-image-gen.settings.fetchOk', { count: models.length }))
      }
    } catch (error) {
      toast.error(t(aiErrorKey(error)))
    }
  }

  const handleTest = () => {
    if (!api.model) {
      return
    }
    const profile: AIModelProfile = {
      id: `${slot}-api-test`,
      name: api.model,
      provider: api.provider,
      protocol: AI_PROVIDER_DEFINITIONS[api.provider].protocol,
      apiKey: api.apiKey,
      model: api.model,
      baseUrl: api.baseUrl,
      supportsPdf: true,
    }
    void runTest(profile)
  }

  return (
    <ApiSection
      {...section}
      modelLabel={t(
        slot === 'vision'
          ? 'ai-image-gen.settings.visionModel'
          : 'ai-image-gen.settings.polishModel',
      )}
      modelOptions={modelLists[api.provider] ?? []}
      providerSlot={
        <Select
          value={api.provider}
          onValueChange={(provider) => onApiChange({ provider: provider as AIProvider })}
        >
          <SelectTrigger className="h-9 w-full text-xs">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {AI_PROVIDERS.map((provider) => (
              <SelectItem key={provider} value={provider}>
                {AI_PROVIDER_DEFINITIONS[provider].name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      }
      actions={
        <>
          <Button
            variant="outline"
            size="sm"
            className="gap-1 text-xs"
            disabled={fetching || !api.apiKey.trim() || !isValidBaseUrl(api.baseUrl)}
            onClick={() => void handleFetch()}
          >
            {fetching && <Loader2 className="size-3.5 animate-spin" />}
            {t('ai-image-gen.settings.fetchModels')}
          </Button>
          <Button
            variant="outline"
            size="sm"
            className="gap-1 text-xs"
            disabled={!api.model || testState.status === 'running'}
            onClick={handleTest}
          >
            {testState.status === 'running' && <Loader2 className="size-3.5 animate-spin" />}
            {t('ai-image-gen.settings.test')}
          </Button>
          {testState.status !== 'idle' && testState.message && (
            <span
              className={
                testState.status === 'ok'
                  ? 'text-primary self-center text-xs'
                  : 'text-destructive self-center text-xs'
              }
            >
              {testState.message}
            </span>
          )}
        </>
      }
    />
  )
}

function ModelPick({
  value,
  options,
  onChange,
}: {
  value: string
  options: string[]
  onChange: (model: string) => void
}) {
  const { t } = useTranslation('tools-images')
  const [manual, setManual] = useState(false)
  const displayOptions = value && !options.includes(value) ? [value, ...options] : options

  if (manual) {
    return (
      <Input
        autoFocus
        value={value}
        className="h-9 flex-1 text-xs"
        spellCheck={false}
        placeholder={t('ai-image-gen.settings.modelPlaceholder')}
        onChange={(event) => onChange(event.target.value)}
        onBlur={() => setManual(false)}
      />
    )
  }

  return (
    <Select
      value={value || '__none__'}
      onValueChange={(next) => {
        if (next === MANUAL) {
          setManual(true)
          return
        }
        onChange(next === '__none__' ? '' : next)
      }}
    >
      <SelectTrigger className="h-9 w-full min-w-0 text-xs">
        <SelectValue placeholder={t('ai-image-gen.settings.unassigned')} />
      </SelectTrigger>
      <SelectContent>
        {!value && (
          <SelectItem value="__none__">{t('ai-image-gen.settings.unassigned')}</SelectItem>
        )}
        {displayOptions.map((model) => (
          <SelectItem key={model} value={model}>
            {model}
          </SelectItem>
        ))}
        <SelectItem value={MANUAL}>{t('ai-image-gen.settings.manual')}</SelectItem>
      </SelectContent>
    </Select>
  )
}
