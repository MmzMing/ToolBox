#!/usr/bin/env node
// 图片压缩工具的 WASM 编解码器准备脚本（predev/prebuild 自动执行）
// 1. @squoosh-kit 的浏览器产物（index.browser.mjs + wasm）拷到 public/codecs/<name>/
// 2. gifsicle（GIF 动画压缩）的 emscripten 产物从 vendor/gif 拷到 public/codecs/gif/ 与 public/wasm/
// 运行时由引擎通过 `import(/* @vite-ignore */ '/codecs/<name>/index.browser.mjs')` 动态加载
import { cpSync, existsSync, mkdirSync, rmSync } from 'node:fs'
import path from 'node:path'

const root = path.resolve(import.meta.dirname, '..')

const codecs = [
  {
    name: 'imagequant',
    assets: ['wasm/imagequant/imagequant.js', 'wasm/imagequant/imagequant.wasm'],
  },
  {
    name: 'oxipng',
    assets: ['wasm/oxipng/squoosh_oxipng.js', 'wasm/oxipng/squoosh_oxipng_bg.wasm'],
  },
  {
    name: 'avif',
    assets: ['wasm/avif-enc/avif_enc.js', 'wasm/avif-enc/avif_enc.wasm'],
  },
  {
    name: 'mozjpeg',
    assets: ['wasm/mozjpeg-enc/mozjpeg_enc.js', 'wasm/mozjpeg-enc/mozjpeg_enc.wasm'],
  },
]

function copyInto(from, to) {
  if (!existsSync(from)) {
    console.error(`✘ prepare-codecs: 缺少 ${path.relative(root, from)}（是否已 pnpm install？）`)
    process.exitCode = 1
    return false
  }
  mkdirSync(path.dirname(to), { recursive: true })
  cpSync(from, to)
  return true
}

let ok = true
for (const codec of codecs) {
  const source = path.join(root, `node_modules/@squoosh-kit/${codec.name}/dist`)
  const target = path.join(root, `public/codecs/${codec.name}`)
  rmSync(target, { recursive: true, force: true })
  mkdirSync(target, { recursive: true })
  ok =
    copyInto(path.join(source, 'index.browser.mjs'), path.join(target, 'index.browser.mjs')) && ok
  for (const asset of codec.assets) {
    ok = copyInto(path.join(source, asset), path.join(target, asset)) && ok
  }
}

// GIF：gifsicle wasm（vendor 内提交的二进制）
ok =
  copyInto(
    path.join(root, 'vendor/gif/GifWasmModule.js'),
    path.join(root, 'public/codecs/gif/index.browser.mjs'),
  ) && ok
ok = copyInto(path.join(root, 'vendor/gif/gif.wasm'), path.join(root, 'public/wasm/gif.wasm')) && ok

if (ok) {
  console.log(
    '✔ codecs prepared: public/codecs/{mozjpeg,oxipng,imagequant,avif,gif} + public/wasm/gif.wasm',
  )
}
