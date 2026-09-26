import { describe, expect, it } from 'vitest'

import { absoluteUrl, siteConfig } from '@/config/site'
import {
  breadcrumbSchema,
  organizationSchema,
  serializeJsonLd,
  siteGraph,
  toolSchema,
  webSiteSchema,
} from '@/modules/seo/schema'

describe('absoluteUrl', () => {
  it('keeps the trailing slash only for the root', () => {
    expect(absoluteUrl('/')).toBe(`${siteConfig.siteUrl}/`)
    expect(absoluteUrl('/hash-text')).toBe(`${siteConfig.siteUrl}/hash-text`)
  })

  it('normalizes a missing or extra leading and trailing slash', () => {
    expect(absoluteUrl('hash-text/')).toBe(`${siteConfig.siteUrl}/hash-text`)
    expect(absoluteUrl('/hash-text//')).toBe(`${siteConfig.siteUrl}/hash-text`)
  })
})

describe('toolSchema', () => {
  it('describes a tool as a free WebApplication on its canonical url', () => {
    expect(toolSchema({ title: '文本哈希', description: '算 MD5', path: '/hash-text' })).toEqual({
      '@type': 'WebApplication',
      name: '文本哈希',
      url: `${siteConfig.siteUrl}/hash-text`,
      description: '算 MD5',
      applicationCategory: 'UtilitiesApplication',
      browserType: 'Web Browser',
      operatingSystem: 'All',
      isPartOf: { '@id': `${siteConfig.siteUrl}/#website` },
      offers: { '@type': 'Offer', price: '0', priceCurrency: 'CNY' },
    })
  })
})

describe('breadcrumbSchema', () => {
  it('numbers list items from 1 in trail order', () => {
    const crumbs = [
      { name: 'Home', url: 'https://x.dev/' },
      { name: '加密', url: 'https://x.dev/#crypto' },
      { name: '文本哈希', url: 'https://x.dev/hash-text' },
    ]
    const schema = breadcrumbSchema(crumbs)
    const items = schema.itemListElement as { position: number; name: string }[]
    expect(schema['@type']).toBe('BreadcrumbList')
    expect(items.map((i) => i.position)).toEqual([1, 2, 3])
    expect(items[2]).toMatchObject({ name: '文本哈希' })
  })

  it('emits an empty itemListElement for no crumbs', () => {
    expect(breadcrumbSchema([]).itemListElement).toEqual([])
  })
})

describe('site entities', () => {
  it('links WebSite to its publisher Organization by @id', () => {
    expect(webSiteSchema().publisher).toEqual({ '@id': `${siteConfig.siteUrl}/#organization` })
    expect(organizationSchema()['@id']).toBe(`${siteConfig.siteUrl}/#organization`)
  })

  it('omits SearchAction because local search has no submittable URL', () => {
    expect(webSiteSchema()).not.toHaveProperty('potentialAction')
  })

  it('exposes both site entities in the graph', () => {
    expect(siteGraph().map((node) => node['@type'])).toEqual(['WebSite', 'Organization'])
  })
})

describe('serializeJsonLd', () => {
  it('escapes angle brackets so copy cannot close the script element', () => {
    const html = serializeJsonLd(toolSchema({ title: '</script><img onerror=1>', ...emptyTool }))
    expect(html).not.toContain('</')
    expect(JSON.parse(html).name).toBe('</script><img onerror=1>')
  })

  it('serializes an array graph as-is', () => {
    expect(JSON.parse(serializeJsonLd(siteGraph()))).toHaveLength(2)
  })
})

const emptyTool = { description: 'd', path: '/x' }
