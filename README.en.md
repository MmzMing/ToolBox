<div align="center">

# ToolBox

**A free, open-source toolbox for developers** — 48 tools that all run locally in the browser. Nothing is uploaded.

[中文](./README.md) · [English](./README.en.md)

![License MIT](https://img.shields.io/badge/license-MIT-0ea95e)
![release](https://img.shields.io/badge/release-v0.1.0-orange)
![tools](https://img.shields.io/badge/tools-48-brightgreen)
![built with React](https://img.shields.io/badge/built%20with-React%2019-61dafb)
![Vite](https://img.shields.io/badge/Vite-8-646cff)
![TypeScript](https://img.shields.io/badge/TypeScript-strict-3178c6)

[Live site](https://tool.mmzhiku.xyz) · [Quick start](#quick-start) · [Features](#features) · [Deployment](#deployment) · [Docs](docs/INDEX.md) · [Issues](https://github.com/MmzMing/ToolBox/issues)

</div>

---

## What this is

A pure-frontend developer toolbox, modelled on [it-tools](https://github.com/CorentinTh/it-tools):
hashing and encoding, UUID/token generation, QR codes, image compression, cron and chmod,
timestamps, regex and git cheatsheets, resume typesetting, and more.

No backend, no accounts, no analytics. The text you paste, the images you drop and the keys you
generate stay in browser memory and your own `localStorage`; the build output is a set of static
files you can host anywhere.

## Features

### Tools (8 categories / 48 tools)

| Category          | Count | Includes                                                           |
| ----------------- | ----- | ------------------------------------------------------------------ |
| Resume            | 1     | Resume studio (9 templates, page breaks, PDF export, folder sync)  |
| Crypto            | 10    | Hashing, AES/RSA, HMAC, bcrypt, UUID, ULID, tokens, password check |
| Web               | 11    | URL parser, HTML entities, UA parser, meta tags, Basic Auth, OTP   |
| Development       | 10    | Code formatter, encoder/decoder, converters, cron, chmod, colors   |
| Cheatsheets       | 4     | HTTP status codes, regex, git, photography                         |
| Images and videos | 3     | QR code converter, WiFi QR code, image compress & convert (WASM)   |
| Text              | 6     | Diff, statistics, case converter, emoji, lorem ipsum, ASCII art    |
| Life              | 3     | Chinese kinship terms, social insurance, unit converter            |

The full list lives in [docs/design/功能介绍文档.md](docs/design/功能介绍文档.md) (Chinese).

### Site features

- **`Ctrl + K` command palette**: fuzzy search via fuse.js, matching English keywords and aliases.
- **Favorites and recent tools**: kept in `localStorage`, versioned with a `migrate` fallback.
- **Bilingual (Chinese / English)**: i18next, first visit negotiated from the browser language,
  the choice is persisted.
- **Theming**: light / dark / system, semantic tokens only — no hard-coded colors.
- **Three responsive tiers**: phone `<768`, tablet `768–1279`, desktop `≥1280`, app-shell layout
  where the content area is the only scroll container.
- **SEO**: history routing, one URL per tool, `sitemap.xml` and `robots.txt` generated at build time.

### What leaves the browser

Exactly two features touch the network; everything else is local:

1. **IP lookup**: resolves your egress IP through a fallback chain of echo services (so one provider
   being unreachable doesn't break it) and looks up geolocation via `ipwho.is`.
2. **AI in the resume studio**: off by default. Enabling it shows a one-time notice about where data
   goes; you supply the provider's base URL and API key yourself, the browser talks to that provider
   directly with no proxy in between, and the key never leaves your machine.

## Quick start

Requirements: Node `>= 20.19` and pnpm 11 (`corepack enable` installs it).

```bash
pnpm install
pnpm dev            # http://localhost:5173
```

| Command            | Purpose                                           |
| ------------------ | ------------------------------------------------- |
| `pnpm dev`         | Dev server                                        |
| `pnpm build`       | Build `dist/` and generate `sitemap.xml`          |
| `pnpm preview`     | Preview the build locally                         |
| `pnpm test`        | Vitest unit tests (plus i18n duplicate-key check) |
| `pnpm lint`        | ESLint with `--max-warnings 0`                    |
| `pnpm typecheck`   | `tsc -b`                                          |
| `pnpm create:tool` | Scaffold a new tool (files + mirrored test dir)   |

To add a tool, create `src/tools/<category>/<tool-name>/` with `index.ts` (registration),
`<Name>.tsx` (UI) and `<tool-name>.service.ts` (pure logic), then register it in that category's
`index.ts`. User-facing copy goes through the `tools-<category>` i18n namespace.
Conventions are in [AGENTS.md](AGENTS.md); the reference implementation is `src/tools/crypto/hash-text/`.

## Deployment

```bash
pnpm build   # emits dist/
```

Two hard requirements:

1. **SPA fallback is mandatory.** The app uses history routing, so unmatched paths must serve
   `index.html` — otherwise deep links and refreshes return 404.
2. **`.js` / `.wasm` must be served with the right MIME.** The image codec workers `import()` WASM
   glue at runtime. Some hosts (Tencent EdgeOne Pages, stock Nginx `mime.types`) don't know `.mjs`
   and fall back to `application/octet-stream`, which the browser refuses to load as a module — so
   `scripts/prepare-codecs.mjs` rewrites every codec entry point to a `.js` extension before the build.

| Host                  | Build command | Output                  | SPA fallback                                          |
| --------------------- | ------------- | ----------------------- | ----------------------------------------------------- |
| Vercel                | `pnpm build`  | `dist`                  | `rewrites` in `vercel.json` (or the framework preset) |
| Netlify               | `pnpm build`  | `dist`                  | `[[redirects]] /* → /index.html` in `netlify.toml`    |
| Cloudflare Pages      | `pnpm build`  | `dist`                  | Enable the Single-page application toggle             |
| Docker + Nginx        | multi-stage   | `/usr/share/nginx/html` | `try_files $uri $uri/ /index.html`                    |
| Tencent EdgeOne Pages | `pnpm build`  | `dist`                  | Configured in the console; mind the MIME note above   |

The domain comes from `siteUrl` in [`src/config/site.ts`](src/config/site.ts)
(currently `https://tool.mmzhiku.xyz`), which is what `sitemap.xml` and `robots.txt` are generated
from; the `SITE_URL` environment variable only overrides it temporarily (preview deployments).
The Dockerfile, `nginx.conf`, per-platform configuration and the release checklist are in
[docs/deployment/部署方案.md](docs/deployment/部署方案.md) (Chinese).

## Documentation

- [docs/INDEX.md](docs/INDEX.md) — documentation index
- [docs/design/技术栈文档.md](docs/design/技术栈文档.md) — stack, dependency list, quality gates
- [docs/design/详细设计文档.md](docs/design/详细设计文档.md) — architecture, tool registry, state, i18n, SEO
- [AGENTS.md](AGENTS.md) — code conventions (for humans and AI agents alike)

## License

[MIT](./LICENSE) © 2026 mmzhiku
