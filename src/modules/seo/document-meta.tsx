interface DocumentMetaProps {
  title: string
  description: string
  keywords?: string[]
}

/**
 * 文档级 SEO 元信息。React 19 原生支持 <title>/<meta> 提升到 <head>，
 * 无需 helmet 类库；SPA 的运行时 meta 配合构建期 sitemap.xml（见 scripts）。
 */
export function DocumentMeta({ title, description, keywords }: DocumentMetaProps) {
  return (
    <>
      <title>{title}</title>
      <meta name="description" content={description} />
      {keywords && keywords.length > 0 && <meta name="keywords" content={keywords.join(', ')} />}
      <meta property="og:title" content={title} />
      <meta property="og:description" content={description} />
    </>
  )
}
