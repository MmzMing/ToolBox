# 域名解析查询（dns-lookup）设计

日期：2026-09-27 · 分类：Web · 路由：`/dns-lookup`
状态：设计已确认，待实现。

## 1. 目标与竞品缺口

单域名一次查全 9 类记录，并把「列记录」升级为「给结论」。参照站
[tools.top/domain-resolver.html](https://tools.top/domain-resolver.html) 支持
A/AAAA/CNAME/MX/TXT/NS/SOA/SRV，但**不显示 TTL、不解析记录内容、不能选解析源**，
只是把 DoH 的 `data` 原样贴出来。

竞品扫描（dnschecker / mxtoolbox / nslookup.io / viewdns / 站长工具 / itdog / 阿里云拨测）
的共同卖点是「全球多节点 + 按运营商选节点」，这依赖自建探测网络；而它们的记录明细页
普遍缺少可执行的诊断结论。本工具的落点在两者之间：

| 竞品短板                               | 本工具做法                                            |
| -------------------------------------- | ----------------------------------------------------- |
| 参照站无 TTL、无优先级/权重列          | 全类型 TTL + MX priority + SRV weight/port + CAA flag |
| 「无记录」与「查询失败」混为一谈       | 四态区分：records / empty / nxdomain / failed         |
| 只列记录，不告诉你配错了               | 6 条硬规则体检，附命中记录原文与 RFC 依据             |
| 单源视角，看不出缓存不一致             | 多公共 DNS 源并排对比，value 集合差异整行高亮         |
| 全球节点地图（我们做不到，也不假装做） | 明确不做，见 §2                                       |

## 2. 范围与非目标

**做**：9 类记录查询、SOA/CAA/SRV/MX/TXT 内容解析、CNAME 链还原、多源对比、
6 条体检规则、URL 携带 `?domain=` 可分享、中文域名 punycode 互转、逐值复制。

**刻意不做**（无后端不可能，或需付费 API，实现时不要顺手加）：

- 全球节点传播地图、按地域/运营商选探测节点。浏览器无法控制出口网络，任何
  「多区域」呈现都是假的。
- ICP 备案查询。MIIT 无开放 API，第三方接口无 CORS 且随时失效，最多给官方外链。
- WHOIS / RDAP 注册与到期信息、A 记录 IP 归属地（属 L3，本期不引入新外部依赖）。
- 批量多域名（9 类 × M 域名 × 源数的请求量不可控，且体检结论会互相干扰）。
- `type=255 (ANY)`：被 RFC 8482 禁止，阿里 DoH 实测返回 `RFC8482` 错误记录。
- PTR 反查（需独立的 ip→in-addr.arpa 输入模式）、HTTPS(65)/TLSA(52)/DNSKEY(48)。

## 3. 数据源：实测结论决定源列表

浏览器直连 DoH JSON 是唯一可行路线（AGENTS §12 禁止后端）。本机（国内网络）实测：

| 端点                                    | 状态 | ACAO 头 | 结论                     |
| --------------------------------------- | ---- | ------- | ------------------------ |
| `https://dns.alidns.com/resolve`        | 200  | `*`     | **默认源**               |
| `https://223.5.5.5` `https://223.6.6.6` | 200  | `*`     | 阿里备用源               |
| `https://doh.pub/resolve`（DNSPod）     | 200  | **无**  | 浏览器 CORS 不可用，排除 |
| `https://doh.360.cn/resolve`            | 200  | **无**  | 排除                     |
| `https://cloudflare-dns.com/dns-query`  | 超时 | `*`     | 境外可用，列为可选源     |
| `https://dns.google/resolve`            | 超时 | `*`     | 境外可用，列为可选源     |

9 类并发打阿里：全部 200，单请求 90–180ms，连发无限流。`type` 用数字码，
Cloudflare 需带 `accept: application/dns-json` 请求头（带上对阿里/Google 无害，统一带）。

响应形状三家一致（`Status/Question/Answer[]/Authority[]`），但两处差异必须兼容：
`Question` 阿里是对象、doh.pub 是数组；`Answer[].data` 里 `name` 一律带尾点。

状态语义（实测）：

- `Status:0` + 无 `Answer` + `Authority` 含 SOA → 该类型**确实无记录**（empty）
- `Status:3` → **NXDOMAIN**，域名不存在
- `Status:2 / 5`、`TC:true`、HTTP 非 200、fetch 抛错 → **failed**，与「无记录」严格分开

## 4. 数据模型

```ts
type RecordTypeKey = 'A' | 'AAAA' | 'CNAME' | 'MX' | 'TXT' | 'NS' | 'SOA' | 'SRV' | 'CAA'

type DnsRecord = {
  name: string // 去尾点
  ttl: number
  value: string // 规范化后的可复制值（TXT 已去引号并拼接分片）
  priority?: number // MX / SRV
  weight?: number // SRV
  port?: number // SRV
  flag?: number // CAA
  tag?: string // CAA
  target?: string // SRV/CAA 的目标字段
  soa?: { mname; rname; serial; refresh; retry; expire; minimum }
}

type TypeResult =
  | { kind: 'records'; type: RecordTypeKey; records: DnsRecord[] }
  | { kind: 'empty'; type: RecordTypeKey }
  | { kind: 'nxdomain'; type: RecordTypeKey }
  | { kind: 'failed'; type: RecordTypeKey; reason: string }

type LookupResult = { sourceId: string; domain: string; types: TypeResult[] }
```

`dns-lookup.service.ts` 导出（全部纯函数，零 DOM）：

- `RECORD_TYPES` / `DNS_SOURCES`：`as const` 数组，含数字码与端点。
- `normalizeDomain(raw)` → `{ domain, unicodeDomain?, isIdn, error }`：去协议/路径/端口/尾点，
  中文域名用 `new URL('http://' + host).hostname` 转 punycode（零依赖），校验至少一个点与合法字符。
- `parseRecordData(type, data)` → `DnsRecord` 的字段解析，按类型分派到
  `parseSoa` / `parseCaa` / `parseSrv` / `parseMx` / `parseTxt`（各自单独导出、单独测）。
- `lookupDomain(source, domain)` → `Promise<TypeResult[]>`，内部 `Promise.allSettled` 并发 9 个 GET。
- `followCnameChain(records)`：`type=A` 的 Answer 会混入中间 CNAME，按 `name` 串成链。
- `compareSources(results)` → 差异行。**只比 value 集合，忽略 TTL**（各源缓存时机不同，
  比 TTL 必然全红，等于没有信息）。
- `diagnose(domain, typesByRecord)` → `Finding[]`。
- `formatTtl(seconds)` → `3600 → 1h`，原始值由 UI 放 tooltip。

## 5. 体检规则（实现后的最终集）

| 级别  | 规则                                                         | 依据            |
| ----- | ------------------------------------------------------------ | --------------- |
| error | CNAME 与**同名**的 A/MX/TXT 共存（根域 @ 挂 CNAME 即此情形） | RFC 1034 §3.6.2 |
| error | MX 指向的主机名查不到 A/AAAA（额外发一轮查询）               | 实际投递会失败  |
| warn  | 同一主机存在多条 `v=spf1`                                    | RFC 7208        |
| warn  | SPF 的 `include/a/mx/ptr/exists` 引发查询超 10 次            | RFC 7208 §4.6   |
| warn  | 无 A 无 AAAA 且无 CNAME                                      | —               |
| warn  | 9 个类型全部为空                                             | —               |
| info  | CAA 缺失 / 列出被允许的签发方                                | RFC 8659        |

每条 `Finding = { key, level, evidence }`，UI 渲染成卡片：结论 + 命中的记录原文 + RFC 编号。
文案统一带「仅供参考」，规则以数组追加，新增一条不影响既有编号。

**浏览器实测后从设计稿改掉的两条**（都是误报，别改回去）：

- 原设计「NS 或 SOA 缺失 → 域名未委派」。`www.baidu.com`、`_dmarc.x` 这类主机名本来就没有
  NS/SOA，只有区根才有，而区根需要 PSL 才能判定。改为「9 个类型全空」这条确定性规则。
- 原设计「CNAME 与 A 共存」按类型存在性判断。实测 `www.baidu.com` 的 A 记录 owner 是 CNAME
  目标 `www.a.shifen.com`，与查询名不同，不构成冲突。必须按 owner name 相同才判定。
- 「无 A/AAAA」加了前置条件：存在 CNAME 时不报（别名本来就靠目标拿地址）。

## 6. UI 结构

```
输入卡  一行：Input + 查询 + 源 Select + 「多源对比」Switch（+ 对比源 Select）
        networkNote 放在按钮之前（沿用 ip-lookup：数据流向点之前可见）
概览块  域名（IDN 时并列 punycode 与中文形态）· 源徽标 · 记录计数 · 复制链接 · 复制全部
        别名链在此说明一次，不在每个类型标题行里重复
记录表  一张统一表格：类型（rowSpan 分组）| 主机记录 | TTL | 记录值
        记录值按 DNS 控制台记法并回优先级/权重/标志（`10 mail.x`、`0 issue "x.com"`），
        不设逐类型切换的附加列；长值换行显示而非省略（SPF/TXT 要能读全）
        SOA 是单条七字段记录，单独一张小卡，不塞进表格撑成七列
摘要行  无记录 / 不存在的类型压成一行 chips，失败类型带原因
体检区  Finding 卡片，error/warn/info 三档，证据用等宽小字
对比区  开关打开时出现：行=类型，列=源，value 集合不一致的整行标红
```

初版按类型分组、每组一张表，实测暴露三个问题：表头重复多遍、记录值列被撑到最右与
TTL 之间留大片空白、CNAME 链与类型说明挤在同一行标题里。改为单表 + rowSpan 分组后，
TTL 紧跟主机记录、记录值放末列吸收剩余宽度，空白消失。

复用 `components/ui/table.tsx`、`components/copyable/span-copyable.tsx`、`badge`、`alert`、`select`、
`switch`。单表而非 tab：体检规则需要跨类型数据，tab 会让用户看不到全局。
状态全部留在组件 `useState`，不进 store（AGENTS §8）。

## 7. 错误处理

- 输入非法：`normalizeDomain` 返回 error，UI 直接提示，不发请求。
- 单类型失败：该类型标 failed 并给「重试此类型」，不影响其余 8 类。
- 全类型失败（源不可达，如国内打 Cloudflare）：整卡提示「该源在当前网络不可达」，
  并建议切回阿里源，不抛未捕获异常。
- 域名整体 NXDOMAIN：只渲染一次结论，不再逐类型铺 9 个空态。
- `TC:true`：提示响应被截断，建议改用单类型查询。

## 8. 测试与验收

`src/test/tools/web/dns-lookup/dns-lookup.service.test.ts`，`vi.stubGlobal('fetch', ...)` 桩，
覆盖：`normalizeDomain`（URL 粘贴 / IDN / 尾点 / 非法）、5 个 `parseXxx`（含 TXT 多分片、
SOA 七字段、CAA 带引号 value）、四态判定（用 §3 实测的真实响应体做 fixture）、
`compareSources`（TTL 不同不算差异）、`diagnose` 6 条规则各一条命中 + 一条不命中、`formatTtl`。

验收：`pnpm test && pnpm lint && pnpm typecheck` 全绿；dev server 实查 `github.com`、
`example.com`、中文域名、不存在的域名，四种形态逐一目视确认；移动端断点（<768）表格可横向滚动。

## 9. 文件清单

```
src/tools/web/dns-lookup/index.ts                       新增
src/tools/web/dns-lookup/DnsLookup.tsx                  新增
src/tools/web/dns-lookup/dns-lookup.service.ts          新增
src/test/tools/web/dns-lookup/dns-lookup.service.test.ts 新增
src/tools/web/index.ts                                  追加注册（唯一允许的既有文件改动）
src/modules/i18n/locales/{zh,en}/tools-web.json         新增 dns-lookup 段
docs/design/功能介绍文档.md                              工具表追加一行
```
