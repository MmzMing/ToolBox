import { createReadStream, existsSync, statSync } from 'node:fs'
import path from 'node:path'

import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { defineConfig, type Plugin } from 'vitest/config'
import type { IncomingMessage, ServerResponse } from 'node:http'

/**
 * dev 中间件：先行响应 /codecs 与 /wasm 的静态请求。
 * 这些 WASM 产物放在 public 下供引擎在 Worker 内动态 import，
 * 但 Vite 会拦截「从源码 import public 目录文件」并报错——此中间件绕开该限制
 * （生产构建不受影响：public 目录整体拷贝进 dist）。
 */
const servePublicCodecs = {
  name: 'serve-public-codecs',
  apply: 'serve' as const,
  configureServer(server) {
    const handler = (req: IncomingMessage, res: ServerResponse, next: (err?: unknown) => void) => {
      const url = (req.url ?? '').split('?')[0]
      if (!url.startsWith('/codecs/') && !url.startsWith('/wasm/')) {
        next()
        return
      }
      const publicDir = path.resolve(import.meta.dirname, './public')
      const filePath = path.normalize(path.join(publicDir, url))
      if (
        !filePath.startsWith(publicDir) ||
        !existsSync(filePath) ||
        !statSync(filePath).isFile()
      ) {
        next()
        return
      }
      const ext = path.extname(filePath)
      const mime =
        ext === '.mjs' || ext === '.js'
          ? 'text/javascript; charset=utf-8'
          : ext === '.wasm'
            ? 'application/wasm'
            : 'application/octet-stream'
      res.setHeader('Content-Type', mime)
      res.setHeader('Cache-Control', 'no-cache')
      createReadStream(filePath).pipe(res)
    }
    // unshift 到栈顶：Vite 会给动态 import 注入 ?import 查询并交给 transform 中间件
    // （其对 public 目录文件直接报错），必须抢在其之前响应
    server.middlewares.stack.unshift({ route: '', handle: handler })
  },
} satisfies Plugin

export default defineConfig({
  plugins: [react(), tailwindcss(), servePublicCodecs],
  resolve: {
    alias: {
      '@': path.resolve(import.meta.dirname, './src'),
    },
  },
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts', 'src/**/*.test.tsx'],
    globals: false,
  },
})
