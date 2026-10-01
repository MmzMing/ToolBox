import type { CSSProperties } from 'react'

import {
  activeGroups,
  droppedLineCount,
  formatCharcoal,
  formatMass,
  lineUnitLabel,
} from '../engine'
import type { BarbecuePlan } from '../types'

/**
 * 导出图恒为亮色：截图要发微信、要打印，暗色底既费墨又在聊天窗口里看不清。
 * 做法是在海报根上内联覆盖主题令牌 —— @theme inline 让 bg-card / text-muted-foreground
 * 这类工具类在使用处解析成 var(--xxx)，所以子树里全部跟着变亮，页面其余部分仍是用户的主题。
 * 值逐条抄自 index.css 的 :root，改主题令牌时这里要跟着改。
 */
const LIGHT_TOKENS = {
  '--background': 'oklch(1 0 0)',
  '--card': 'oklch(1 0 0)',
  '--card-foreground': 'oklch(0.145 0 0)',
  '--foreground': 'oklch(0.145 0 0)',
  '--muted': 'oklch(0.97 0 0)',
  '--muted-foreground': 'oklch(0.556 0 0)',
  '--border': 'oklch(0.922 0 0)',
  '--primary': 'oklch(0.63 0.15 156)',
  '--primary-foreground': 'oklch(0.985 0 0)',
  '--input': 'oklch(0.922 0 0)',
  '--ring': 'oklch(0.63 0.15 156 / 60%)',
} as CSSProperties

/**
 * 导出图：单列竖条，从上往下就是一张能直接带去菜市场的购物小票。
 * 刻意不做多栏 —— 手机上截图看的是长度而不是宽度，多栏会逼人横向放大。
 * 颜色一律走主题令牌，但由 LIGHT_TOKENS 在根上钉成亮色（见上）。
 * 行首不画勾选方框：勾选是屏上清单的交互，打印出来的清单上它是噪声。
 */
export function ShoppingPoster({
  plan,
  lang,
  generatedAt,
}: {
  plan: BarbecuePlan
  lang: 'zh' | 'en'
  generatedAt: string
}) {
  const { input, shopping } = plan
  const zh = lang === 'zh'
  const groups = activeGroups(plan)
  const dropped = droppedLineCount(plan)
  const items = groups.reduce((sum, group) => sum + group.lines.length, 0)
  // 无炭设备炭量为 0：小票上不印"木炭 0 g"，只留炉长
  const charcoalPart =
    shopping.charcoalGrams > 0
      ? zh
        ? `木炭 ${formatCharcoal(shopping.charcoalGrams, 'zh')} · `
        : `Charcoal ${formatCharcoal(shopping.charcoalGrams, 'en')} · `
      : ''

  return (
    <div style={LIGHT_TOKENS} className="bg-card text-foreground flex w-[520px] flex-col p-6">
      <header className="border-border flex flex-col gap-1 border-b pb-3">
        <h1 className="text-xl font-semibold">{zh ? '烧烤采购清单' : 'BBQ shopping list'}</h1>
        <p className="text-muted-foreground text-xs">
          {zh
            ? `${input.people} 人 · ${input.dishes.length} 道菜 · ${items} 项 · ${generatedAt}`
            : `${input.people} people · ${input.dishes.length} dishes · ${items} items · ${generatedAt}`}
          {dropped > 0 ? (zh ? ` · 另有 ${dropped} 项置 0 不买` : ` · ${dropped} set to 0`) : ''}
        </p>
      </header>

      <div className="flex flex-col">
        {groups.map((group) => (
          <section key={group.id} className="flex flex-col">
            <h2 className="bg-muted/60 text-muted-foreground mt-3 flex items-baseline justify-between gap-2 px-2 py-1 text-[11px] font-semibold tracking-wide">
              <span className="text-foreground">{group.label[lang]}</span>
              <span className="font-mono tabular-nums">{group.lines.length}</span>
            </h2>
            <ul className="flex flex-col">
              {group.lines.map((line) => (
                <li
                  key={line.ingredientId}
                  className="border-border flex items-baseline justify-between gap-3 border-b py-1.5 pr-1 pl-2 text-[13px] last:border-b-0"
                >
                  <span className="min-w-0 truncate">
                    {line.name[lang]}
                    {line.use ? (
                      <span className="text-muted-foreground text-[11px]"> · {line.use[lang]}</span>
                    ) : null}
                  </span>
                  <span className="shrink-0 font-mono tabular-nums">
                    {line.amount === null
                      ? zh
                        ? '—'
                        : 'n/a'
                      : `${line.amount} ${lineUnitLabel(line, lang)}`}
                  </span>
                </li>
              ))}
            </ul>
          </section>
        ))}
      </div>

      <footer className="border-foreground mt-4 flex items-end justify-between gap-4 border-t-2 pt-3">
        <div className="flex flex-col gap-0.5 text-[11px]">
          <span className="text-muted-foreground">
            {charcoalPart}
            {zh
              ? `建议炉长 ${plan.equipment.grill.lengthCm} cm`
              : `grate ${plan.equipment.grill.lengthCm} cm`}
          </span>
          <span className="text-muted-foreground">
            {zh ? '数量可回页面随时改，置 0 即不买' : 'Quantities stay editable on the page'}
          </span>
        </div>
        <span className="text-right font-mono text-sm tabular-nums">
          {formatMass(shopping.totalMeatGrams)} · {shopping.totalSkewers} {zh ? '串' : 'skewers'}
        </span>
      </footer>
    </div>
  )
}
