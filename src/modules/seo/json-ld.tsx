import { serializeJsonLd, type JsonLd } from './schema'

type JsonLdProps = { data: JsonLd | JsonLd[] }

/**
 * JSON-LD 数据块。React 19 只提升带 src 的 script，因此它留在使用处（body 内），
 * Google 与结构化数据校验器都接受 body 内的 JSON-LD。
 * type="application/ld+json" 属于非执行类型的数据块，不受部署层 CSP script-src 约束。
 */
export function JsonLd({ data }: JsonLdProps) {
  return (
    <script
      type="application/ld+json"
      dangerouslySetInnerHTML={{ __html: serializeJsonLd(data) }}
    />
  )
}
