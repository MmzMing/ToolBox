import { useTranslation } from 'react-i18next'

import { Badge } from '@/components/ui/badge'
import { Card } from '@/components/ui/card'
import {
  HEAT_LEVELS,
  HEAT_ZONE_TABLE,
  HOME_REPLICA,
  INGREDIENT_BY_ID,
  SMOKER_REFERENCE,
  WOODS_TO_AVOID,
  WOOD_TYPES,
  YAKITORI_COAL_BEDS,
} from '../data/index'
import { formatCharcoal, formatMass } from '../engine'
import { formatMinutes, formatSpan, isNum } from '../measure'
import type { BarbecuePlan, CuisineId, HeatLevel } from '../types'

const HEAT_LEVELS_ORDER: HeatLevel[] = ['strong', 'medium', 'gentle']
const COAL_BED_LEVELS = ['low', 'medium', 'high'] as const

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline justify-between gap-3 py-1">
      <span className="text-muted-foreground min-w-0 text-xs">{label}</span>
      <span className="shrink-0 text-right font-mono text-xs tabular-nums">{value}</span>
    </div>
  )
}

/** 已选菜品涉及哪些菜系，决定要不要展开烧鸟 / 美式专属段落 */
function selectedCuisines(plan: BarbecuePlan): Set<CuisineId> {
  const found = new Set<CuisineId>()
  for (const id of plan.input.dishes) {
    const cuisine = INGREDIENT_BY_ID[id]?.cuisine
    if (cuisine) {
      found.add(cuisine)
    }
  }
  return found
}

/** 炉长、炭量、批次产能、炭种对比、木材与家用复刻参数。 */
export function EquipmentSection({ plan, lang }: { plan: BarbecuePlan; lang: 'zh' | 'en' }) {
  const { t } = useTranslation('tools-life', { keyPrefix: 'barbecue-planner' })
  const { grill, batches, charcoalOptions } = plan.equipment
  const cuisines = selectedCuisines(plan)

  return (
    <div className="flex flex-col gap-3">
      <div className="grid gap-3 md:grid-cols-2">
        <Card className="rounded-xl p-4">
          <h4 className="text-sm font-semibold">{t('equipment.grillTitle')}</h4>
          <div className="divide-border mt-2 flex flex-col divide-y">
            <Row label={t('equipment.suggestedGrate')} value={`${grill.lengthCm} cm`} />
            <Row
              label={t('equipment.ratedFor')}
              value={`${grill.people.min}–${grill.people.max}`}
            />
            <Row
              label={t('equipment.perBatch')}
              value={`${batches.capacity} ${t('equipment.skewerUnit')}`}
            />
            <Row label={t('equipment.totalSkewers')} value={String(batches.totalSkewers)} />
            <Row label={t('equipment.batches')} value={String(batches.batchCount)} />
            <Row label={t('equipment.perBatchTime')} value={formatMinutes(batches.perBatchMin)} />
            <Row label={t('equipment.window')} value={formatMinutes(batches.totalMin)} />
            {/* 不用炭的设备炭量是 0，这行不出现 —— 燃气炉上没有"木炭 0 g"可读 */}
            {plan.shopping.charcoalGrams > 0 ? (
              <Row
                label={t('equipment.charcoal')}
                value={formatCharcoal(plan.shopping.charcoalGrams, lang)}
              />
            ) : null}
          </div>
          {isNum(grill.batchSkewers) && grill.batchSkewers.confidence === 'derived' ? (
            <p className="text-muted-foreground mt-2 text-xs leading-relaxed">
              {t('equipment.batchNote')}
            </p>
          ) : null}
        </Card>

        <Card className="rounded-xl p-4">
          <h4 className="text-sm font-semibold">{t('equipment.heatZones')}</h4>
          <div className="divide-border mt-2 flex flex-col divide-y">
            {HEAT_LEVELS_ORDER.map((level) => {
              const zone = HEAT_ZONE_TABLE.find((item) => item.level === level)
              if (!zone) {
                return null
              }
              return (
                <Row
                  key={level}
                  label={`${HEAT_LEVELS[level][lang]} · ${zone.handSeconds}s ${t('equipment.handTest')}`}
                  value={`${zone.tempC.min}–${zone.tempC.max} ℃`}
                />
              )
            })}
          </div>
          <p className="text-muted-foreground mt-2 text-xs leading-relaxed">
            {t('equipment.heatNote')}
          </p>
        </Card>
      </div>

      <Card className="rounded-xl p-4">
        <h4 className="text-sm font-semibold">{t('equipment.charcoalTitle')}</h4>
        <div className="mt-3 grid gap-3 sm:grid-cols-2 2xl:grid-cols-4">
          {charcoalOptions.map((charcoal) => (
            <div
              key={charcoal.id}
              className="border-border flex flex-col gap-1 rounded-lg border p-3"
            >
              <div className="flex items-center justify-between gap-2">
                <span className="text-sm font-semibold">{charcoal.name[lang]}</span>
                <Badge variant="outline" className="font-mono text-[10px]">
                  {'$'.repeat(charcoal.priceTier)}
                </Badge>
              </div>
              <span className="text-muted-foreground font-mono text-xs">
                {isNum(charcoal.burnHours)
                  ? formatSpan(charcoal.burnHours.min, charcoal.burnHours.max, 'h')
                  : '—'}
              </span>
              <p className="text-xs leading-relaxed">{charcoal.flavor[lang]}</p>
              <p className="text-muted-foreground text-xs leading-relaxed">
                {charcoal.bestFor[lang]}
              </p>
            </div>
          ))}
        </div>
      </Card>

      {cuisines.has('jp') ? (
        <Card className="rounded-xl p-4">
          <h4 className="text-sm font-semibold">{t('equipment.yakitoriTitle')}</h4>
          <div className="divide-border mt-2 flex flex-col divide-y">
            {COAL_BED_LEVELS.map((level) => (
              <Row
                key={level}
                label={`${t('equipment.coalBed')} · ${level}`}
                value={
                  isNum(YAKITORI_COAL_BEDS[level])
                    ? `${YAKITORI_COAL_BEDS[level].min}–${YAKITORI_COAL_BEDS[level].max} ℃`
                    : '—'
                }
              />
            ))}
            <Row
              label={t('equipment.distance')}
              value={
                isNum(YAKITORI_COAL_BEDS.distanceCm)
                  ? `${YAKITORI_COAL_BEDS.distanceCm.min}–${YAKITORI_COAL_BEDS.distanceCm.max} cm`
                  : '—'
              }
            />
            {HOME_REPLICA.map((item) => (
              <Row key={item.id} label={item.label[lang]} value={item.value[lang]} />
            ))}
          </div>
        </Card>
      ) : null}

      {cuisines.has('us') ? (
        <Card className="rounded-xl p-4">
          <h4 className="text-sm font-semibold">{t('equipment.smokerTitle')}</h4>
          <div className="divide-border mt-2 flex flex-col divide-y">
            {SMOKER_REFERENCE.map((item) => (
              <Row key={item.id} label={item.label[lang]} value={item.value[lang]} />
            ))}
          </div>
          <div className="mt-3 flex flex-col gap-1">
            {WOOD_TYPES.map((wood) => (
              <p key={wood.id} className="text-xs leading-relaxed">
                <span className="font-semibold">{wood.name[lang]}</span>
                <span className="text-muted-foreground"> — {wood.trait[lang]}</span>
              </p>
            ))}
            <p className="text-destructive mt-1 text-xs font-semibold">{WOODS_TO_AVOID[lang]}</p>
          </div>
        </Card>
      ) : null}
    </div>
  )
}

/** 出成率与人均熟肉口径，单独说明以免读者把生重当熟重吃。 */
export function YieldNote({ plan }: { plan: BarbecuePlan }) {
  const { t } = useTranslation('tools-life', { keyPrefix: 'barbecue-planner' })
  if (!selectedCuisines(plan).has('us')) {
    return null
  }
  return (
    <Card className="rounded-xl p-4">
      <p className="text-sm leading-relaxed">{t('equipment.yieldBody')}</p>
      <p className="text-muted-foreground mt-1 font-mono text-xs">
        {t('equipment.yieldTotal')}: {formatMass(plan.shopping.totalMeatGrams)}
      </p>
    </Card>
  )
}
