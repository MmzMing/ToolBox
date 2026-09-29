import { useTranslation } from 'react-i18next'
import { Link } from 'react-router'

import { JsonLd } from '@/modules/seo/json-ld'
import { faqSchema } from '@/modules/seo/schema'
import { getToolByPath } from '@/tools'
import type { Tool } from '@/tools/define-tool'

type ToolSeoCopy = {
  intro?: string
  steps?: string[]
  faq?: { q: string; a: string }[]
  /** 相关工具的名字（= 路由去斜杠），由 check-tool-seo-keys 校验存在性 */
  related?: string[]
}

/**
 * 工具页的检索内容层：导语 / 如何使用 / 常见问题 / 相关工具。
 * 文案放各工具的 `tools-<分类>.json` 的 `<name>.seo` 下，没配就整块不渲染，
 * 因此可以按流量逐个补齐而不必一次铺满。
 * 同一份文案也会被 scripts/prerender-shells.mjs 写进静态壳，两侧共用一个来源。
 */
export function ToolSeoContent({ tool }: { tool: Tool }) {
  const ns = `tools-${tool.category}`
  const { t, i18n } = useTranslation(ns)
  const { t: tCommon } = useTranslation('common')

  // exists 走的是 i18next 默认命名空间，不显式传 ns 会永远查不到（整块静默不渲染）
  const seoKey = `${tool.name}.seo`
  if (!i18n.exists(seoKey, { ns })) {
    return null
  }
  const seo = t(seoKey, { returnObjects: true }) as ToolSeoCopy
  const steps = seo.steps ?? []
  const faq = seo.faq ?? []
  const related = (seo.related ?? [])
    .map((name) => getToolByPath(`/${name}`))
    .filter((item): item is Tool => item !== undefined && item.name !== tool.name)

  if (!seo.intro && steps.length === 0 && faq.length === 0 && related.length === 0) {
    return null
  }

  return (
    <section className="mt-12 flex flex-col gap-8">
      {seo.intro ? (
        <p className="text-muted-foreground text-sm leading-relaxed">{seo.intro}</p>
      ) : null}

      {steps.length > 0 ? (
        <div>
          <h2 className="text-base font-semibold">{tCommon('seoHowTo')}</h2>
          <ol className="text-muted-foreground mt-3 list-decimal space-y-2 pl-5 text-sm leading-relaxed">
            {steps.map((step) => (
              <li key={step}>{step}</li>
            ))}
          </ol>
        </div>
      ) : null}

      {faq.length > 0 ? (
        <div>
          <h2 className="text-base font-semibold">{tCommon('seoFaq')}</h2>
          <dl className="mt-3 flex flex-col gap-4">
            {faq.map((item) => (
              <div key={item.q}>
                <dt className="text-sm font-medium">{item.q}</dt>
                <dd className="text-muted-foreground mt-1 text-sm leading-relaxed">{item.a}</dd>
              </div>
            ))}
          </dl>
          <JsonLd data={faqSchema(faq.map((item) => ({ question: item.q, answer: item.a })))} />
        </div>
      ) : null}

      {related.length > 0 ? (
        <nav aria-label={tCommon('seoRelated')}>
          <h2 className="text-base font-semibold">{tCommon('seoRelated')}</h2>
          <ul className="mt-3 flex flex-wrap gap-2">
            {related.map((item) => (
              <li key={item.name}>
                <Link
                  to={item.path}
                  className="border-border bg-muted/40 hover:bg-muted text-muted-foreground hover:text-foreground rounded-md border px-3 py-1.5 text-sm transition-colors"
                >
                  {t(`${item.name}.title`, { ns: `tools-${item.category}` })}
                </Link>
              </li>
            ))}
          </ul>
        </nav>
      ) : null}
    </section>
  )
}
