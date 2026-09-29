import { useEffect } from 'react'

import { serializeJsonLd, type JsonLd } from './schema'

type JsonLdProps = { data: JsonLd | JsonLd[] }

/**
 * JSON-LD 数据块。React 19 只提升带 src 的 script，因此它留在使用处（body 内），
 * Google 与结构化数据校验器都接受 body 内的 JSON-LD。
 * type="application/ld+json" 属于非执行类型的数据块，不受部署层 CSP script-src 约束。
 *
 * 挂载时移除预渲染静态壳留下的 `script[data-seo-static]`：那份是给不执行 JS 的爬虫的，
 * 留着就会和这份同 URL 双份声明，且静态壳固定是中文，切到英文后两者内容互相矛盾。
 */
export function JsonLd({ data }: JsonLdProps) {
  useEffect(() => {
    document.querySelector('script[data-seo-static]')?.remove()
  }, [])

  return (
    <script
      type="application/ld+json"
      dangerouslySetInnerHTML={{ __html: serializeJsonLd(data) }}
    />
  )
}
