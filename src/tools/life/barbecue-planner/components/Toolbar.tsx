import { Check, Copy, ImageDown, ListChecks, RotateCcw, SlidersHorizontal } from 'lucide-react'
import { useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'

import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Switch } from '@/components/ui/switch'
import { TextareaCopyable } from '@/components/copyable/textarea-copyable'
import { useCopy } from '@/composable/use-copy'
import { downloadBlob } from '@/utils/download'

import {
  applyOverride,
  formatCharcoal,
  formatMass,
  nextCustomId,
  selectableLineIds,
  serializeShopping,
} from '../barbecue-planner.service'
import { elementToPng } from '../capture'
import { APPETITE_TIERS, DIET_TAGS, EQUIPMENT_MODES } from '../data/shared'
import { formatMinutes } from '../measure'
import type { BarbecuePlan, CustomItem, DietTag, PlannerInput, PurchaseGroupId } from '../types'
import { ShoppingSection } from './ShoppingSection'
import { ShoppingPoster } from './ShoppingPoster'

/** 人数下拉的取值范围与 normalizePlannerInput 的夹取区间一致 */
const PEOPLE_CHOICES = Array.from({ length: 20 }, (_, index) => index + 1)

/** 导出图按本地日期命名：存进手机相册后，"烧烤菜单" 比 barbecue-list-6 (1) 认得出来 */
function posterFileName(lang: 'zh' | 'en'): string {
  const now = new Date()
  const day = now.getDate().toString().padStart(2, '0')
  const date = `${now.getFullYear()}-${(now.getMonth() + 1).toString().padStart(2, '0')}-${day}`
  return lang === 'zh' ? `${date}的烧烤菜单.png` : `${date}-bbq-menu.png`
}

/** 标签在上、控件在下的紧凑字段，工具栏里一排摆开比右侧长栏省地方 */
function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex shrink-0 flex-col gap-1.5">
      <span className="text-muted-foreground text-[11px] leading-none font-medium">{label}</span>
      {children}
    </div>
  )
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <span className="flex items-baseline gap-1.5">
      <span className="text-muted-foreground text-[11px]">{label}</span>
      <span className="font-mono text-xs tabular-nums">{value}</span>
    </span>
  )
}

/**
 * 顶部工具栏。上带是设定，下带是结果概览与动作。
 * 采购清单收进对话框并做成可勾选的买菜清单；旁边「生成图片」把同一份清单
 * 渲染成 PNG，方便直接发给同行的人或存到手机相册。
 */
export function Toolbar({
  input,
  plan,
  lang,
  onChange,
  onReset,
}: {
  input: PlannerInput
  plan: BarbecuePlan | null
  lang: 'zh' | 'en'
  onChange: (patch: Partial<PlannerInput>) => void
  onReset: () => void
}) {
  const { t } = useTranslation('tools-life', { keyPrefix: 'barbecue-planner' })
  const { copy, isCopied } = useCopy()
  const [listOpen, setListOpen] = useState(false)
  const [checked, setChecked] = useState<Set<string>>(() => new Set())
  const [rendering, setRendering] = useState(false)
  const posterRef = useRef<HTMLDivElement>(null)

  const shoppingText = plan ? serializeShopping(plan, lang) : ''
  const dietOn = input.diets.length

  const toggleDiet = (id: DietTag) =>
    onChange({
      diets: input.diets.includes(id)
        ? input.diets.filter((item) => item !== id)
        : [...input.diets, id],
    })

  const toggleLine = (id: string) =>
    setChecked((previous) => {
      const next = new Set(previous)
      if (next.has(id)) {
        next.delete(id)
      } else {
        next.add(id)
      }
      return next
    })

  const toggleGroup = (ids: string[], select: boolean) =>
    setChecked((previous) => {
      const next = new Set(previous)
      for (const id of ids) {
        if (select) {
          next.add(id)
        } else {
          next.delete(id)
        }
      }
      return next
    })

  /** 改数量：null 表示撤回这一行的手动值，回到引擎默认量；0 表示这次不买 */
  const applyQty = (id: string, amount: number | null) =>
    onChange({ overrides: applyOverride(input.overrides, id, amount) })

  /** 自定义行的 id 在这里派生：表单里的 plan 快照可能已经过期，重新取一次才不会撞车 */
  const addCustom = (group: PurchaseGroupId, item: Omit<CustomItem, 'id' | 'group'>) =>
    onChange({ customs: [...input.customs, { ...item, id: nextCustomId(input.customs), group }] })

  /** 删一行要连它的 override 一起删：id 是 max+1 复用的，留下陈旧数量会让下一样捡去显示 */
  const removeCustom = (id: string) =>
    onChange({
      customs: input.customs.filter((item) => item.id !== id),
      overrides: applyOverride(input.overrides, id, null),
    })

  const reset = () => {
    setChecked(new Set())
    onReset()
  }

  /** 海报节点常驻离屏，截图时不需要再挂载一次 React 树 */
  const generateImage = async () => {
    const node = posterRef.current
    if (!node) {
      return
    }
    setRendering(true)
    try {
      const blob = await elementToPng(node)
      downloadBlob(blob, posterFileName(lang))
      toast.success(t('toast.imageDone'))
    } catch {
      toast.error(t('toast.imageFailed'))
    } finally {
      setRendering(false)
    }
  }

  const stamp = new Intl.DateTimeFormat(lang === 'zh' ? 'zh-CN' : 'en-GB', {
    month: 'numeric',
    day: 'numeric',
  }).format(new Date())

  return (
    <Card className="gap-0 overflow-hidden rounded-xl p-0">
      <div className="flex flex-wrap items-end gap-x-4 gap-y-3 p-3">
        <Field label={t('fields.people')}>
          <Select
            value={String(input.people)}
            onValueChange={(value) => onChange({ people: Number(value) })}
          >
            <SelectTrigger aria-label={t('fields.people')} className="w-24 text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {PEOPLE_CHOICES.map((n) => (
                <SelectItem key={n} value={String(n)} className="text-xs">
                  {t('fields.peopleValue', { n })}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Field>

        <Field label={t('fields.appetite')}>
          <Select
            value={input.appetite}
            onValueChange={(value) => onChange({ appetite: value as PlannerInput['appetite'] })}
          >
            <SelectTrigger aria-label={t('fields.appetite')} className="w-28 text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {APPETITE_TIERS.map((tier) => (
                <SelectItem key={tier.id} value={tier.id} className="text-xs">
                  {tier.name[lang]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Field>

        <Field label={t('fields.equipment')}>
          <Select
            value={input.equipmentMode}
            onValueChange={(value) =>
              onChange({ equipmentMode: value as PlannerInput['equipmentMode'] })
            }
          >
            <SelectTrigger aria-label={t('fields.equipment')} className="w-40 text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {EQUIPMENT_MODES.map((mode) => (
                <SelectItem key={mode.id} value={mode.id} className="text-xs">
                  {mode.name[lang]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Field>

        <Field label={t('fields.grillStart')}>
          <Input
            type="time"
            value={input.grillStart}
            onChange={(event) => onChange({ grillStart: event.target.value })}
            className="h-8 w-24 font-mono text-xs tabular-nums"
          />
        </Field>

        <Field label={t('fields.diet')}>
          <Popover>
            <PopoverTrigger asChild>
              <Button variant="outline" size="sm" className="h-8 gap-1.5 text-xs">
                <SlidersHorizontal className="size-3.5" />
                {dietOn > 0 ? t('diet.on', { n: dietOn }) : t('diet.none')}
              </Button>
            </PopoverTrigger>
            <PopoverContent align="start" className="w-56 gap-0 p-0">
              <ul className="flex flex-col divide-y">
                {DIET_TAGS.map((diet) => (
                  <li key={diet.id} className="flex items-center justify-between gap-3 px-3 py-2.5">
                    <Label htmlFor={`diet-${diet.id}`} className="text-xs font-normal">
                      {diet.name[lang]}
                    </Label>
                    <Switch
                      id={`diet-${diet.id}`}
                      size="sm"
                      checked={input.diets.includes(diet.id)}
                      onCheckedChange={() => toggleDiet(diet.id)}
                    />
                  </li>
                ))}
              </ul>
            </PopoverContent>
          </Popover>
        </Field>
      </div>

      <div className="bg-muted/40 border-t p-3">
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
          {plan ? (
            <>
              <Stat label={t('summary.picked')} value={String(input.dishes.length)} />
              <Stat label={t('summary.meat')} value={formatMass(plan.shopping.totalMeatGrams)} />
              <Stat label={t('summary.skewers')} value={String(plan.shopping.totalSkewers)} />
              {/* 无炭设备（燃气/空气炸锅/烤箱/煎锅）炭量为 0，这一格干脆不出现而不是写着 0 g */}
              {plan.shopping.charcoalGrams > 0 ? (
                <Stat
                  label={t('summary.charcoal')}
                  value={formatCharcoal(plan.shopping.charcoalGrams, lang)}
                />
              ) : null}
              <Stat label={t('summary.grill')} value={`${plan.equipment.grill.lengthCm} cm`} />
              <Stat
                label={t('summary.window')}
                value={formatMinutes(plan.equipment.batches.totalMin)}
              />
            </>
          ) : (
            <p className="text-muted-foreground text-xs">{t('toolbar.needDishes')}</p>
          )}

          <div className="ml-auto flex flex-wrap items-center gap-2">
            <Dialog
              open={plan !== null && listOpen}
              onOpenChange={(open) => setListOpen(plan ? open : false)}
            >
              <DialogTrigger asChild>
                <Button size="sm" variant="link" disabled={!plan} className="px-0">
                  <ListChecks className="size-3.5" />
                  {t('actions.openList')}
                  {plan ? (
                    <span className="font-mono text-xs tabular-nums">
                      {selectableLineIds(plan).length}
                    </span>
                  ) : null}
                </Button>
              </DialogTrigger>
              {plan ? (
                <DialogContent className="flex max-h-[85svh] flex-col gap-0 overflow-hidden p-0 sm:max-w-5xl">
                  <DialogHeader className="shrink-0 p-4">
                    <DialogTitle>{t('tabs.shopping')}</DialogTitle>
                  </DialogHeader>
                  {/* 滚动条只给内层 body，面板自己不滚：面板一旦自己 overflow-y-auto，
                      原生滚动条是方的，会压在 rounded-xl 的圆角上看着像凸出对话框 */}
                  <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto px-4 pb-4">
                    <div className="flex flex-wrap items-center gap-2">
                      <Button size="sm" variant="outline" onClick={() => void copy(shoppingText)}>
                        {isCopied(shoppingText) ? (
                          <Check className="size-4" />
                        ) : (
                          <Copy className="size-4" />
                        )}
                        {t('actions.copyList')}
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={generateImage}
                        disabled={rendering}
                      >
                        <ImageDown className="size-4" />
                        {rendering ? t('actions.rendering') : t('actions.generateImage')}
                      </Button>
                      {checked.size > 0 ? (
                        <Button
                          size="sm"
                          variant="ghost"
                          className="text-muted-foreground"
                          onClick={() => setChecked(new Set())}
                        >
                          {t('shop.clearChecks')}
                        </Button>
                      ) : null}
                    </div>

                    <ShoppingSection
                      plan={plan}
                      lang={lang}
                      checked={checked}
                      onToggle={toggleLine}
                      onToggleGroup={toggleGroup}
                      onQuantity={applyQty}
                      onResetAll={() => onChange({ overrides: {} })}
                      onAddCustom={addCustom}
                      onRemoveCustom={removeCustom}
                    />

                    <details className="border-border rounded-lg border p-3">
                      <summary className="text-muted-foreground cursor-pointer text-xs">
                        {t('shop.textVersion')}
                      </summary>
                      <TextareaCopyable
                        value={shoppingText}
                        rows={12}
                        className="mt-2"
                        hideCopyButton
                      />
                      <p className="text-muted-foreground mt-2 text-[11px] leading-relaxed">
                        {t('shop.textHint')}
                      </p>
                    </details>
                  </div>
                </DialogContent>
              ) : null}
            </Dialog>
            <Button
              size="sm"
              variant="ghost"
              onClick={reset}
              className="text-destructive hover:bg-destructive/10 hover:text-destructive"
            >
              <RotateCcw className="size-3.5" />
              {t('actions.reset')}
            </Button>
          </div>
        </div>
      </div>

      {plan ? (
        <div aria-hidden className="pointer-events-none fixed top-0 -left-[10000px] z-[-1]">
          <div ref={posterRef}>
            <ShoppingPoster plan={plan} lang={lang} generatedAt={stamp} />
          </div>
        </div>
      ) : null}
    </Card>
  )
}
