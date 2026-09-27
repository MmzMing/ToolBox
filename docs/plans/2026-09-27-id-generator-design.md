# 标识符工坊（id-generator）设计

日期：2026-09-27 · 分类：加密（crypto） · 合并来源：`uuid-generator` + `ulid-generator`

## 1. 目标与竞品缺口

把「要一个不会撞的 ID」收敛成一个入口：UUID / ULID 生成 + 反解校验。现状是两个工具各自做到极简
（`uuid-generator` 只有 v4 且批量上限 99，`ulid-generator` 手搓实现而项目里 `ulid@3` 早已安装并被
`ai-image-gen` 使用），两个 URL 分散同一个搜索意图。

竞品扫描（tools.top 的 guid / uuid 两页、extendsclass、ol-tools、spoold）的短板即本工具落点：

| 竞品短板                                         | 本工具做法                                          |
| ------------------------------------------------ | --------------------------------------------------- |
| 只有「版本 × 格式 × 批量」的排列组合             | 同一套生成能力 + 解析器，粘 ID 反解版本/变体/时间戳 |
| 输出永远一行一个，粘进代码还要手工加引号逗号     | 换行 / 逗号 / 加引号 / JSON 数组四种拼接            |
| 无批量校验与去重                                 | 多行粘贴逐行判定 + 有效数 / 无效数 / 重复数         |
| 版本列表凑数（tools.top 列 v1–v8，v2/v8 填不出） | 只提供有真实场景的 v1/v3/v4/v5/v6/v7/Nil + ULID     |

**刻意不做**：圆括号与注册表格式、前缀/后缀自定义、排序、NanoID/Snowflake、页内讲解长文与 FAQ
（只做工具，不做内容站）。

## 2. 身份与文件结构

- 新目录 `src/tools/crypto/id-generator/`，`name = path = id-generator`，
  `redirectFrom: ['uuid-generator', 'ulid-generator']`（router.tsx 自动生成重定向）。
- 单栏布局：面板参数与「输出格式 / 拼接方式」合并成一条 `flex-wrap` 工具栏，生成按钮挂在行尾，
  下方紧跟一行场景说明与只读 textarea 输出。`icon: Fingerprint`。
- 删除 `uuid-generator/`、`ulid-generator/` 两目录及对应旧测试；`crypto/index.ts` 两项换一项。
- ULID 改用 `ulid@3`（`ulid` / `monotonicFactory` / `decodeTime` / `ulidToUUID` / `uuidToULID`），
  手搓实现废弃；不新增任何依赖。

```
src/tools/crypto/id-generator/
├── index.ts / IdGenerator.tsx        # Tabs：uuid | ulid | parse，forceMount 保留各自结果
├── components/{UuidPanel,UlidPanel,ParsePanel,IdOutput}.tsx
├── id-format.service.ts              # 格式变体 + 拼接 + 批量收敛（三面板共用）
├── uuid.service.ts  ulid.service.ts  parse.service.ts
src/test/tools/crypto/id-generator/   # 四个 service 各一份测试
```

共享层只到「输出组件 + 纯函数」，两个生成面板各自的 `useState` 不抽 hook。

## 3. 功能规格

**UUID 面板**：版本 v4（默认）/ v7 / v6 / v1 / v5 / v3 / Nil；数量 1–1000；格式
小写标准 / 大写 / 无连字符 / `{大括号}` / `urn:uuid:`；拼接同上。类型专属参数按需显示：
v3/v5 = 命名空间（DNS/URL/OID/X500 预设或自定义）+ 名称；v1/v6/v7 = 可选基准毫秒时间戳。

**ULID 面板**：数量 1–1000、时间基准（当前 / 指定时刻）、单调开关（同毫秒随机段递增）、大小写、拼接。
ULID 定长 26 字符无连字符概念，故不提供 5 格式矩阵。

**解析面板**：接受带/无横线、大括号、URN、混合大小写、ULID。单行 → 类型、版本、变体、128bit
字段切分图、Hex/二进制/Base64URL 三视图、时间反解、ULID↔UUID 互转；多行 → 逐行表格 + 去重统计。

两个物理限制必须在 UI 承认：浏览器拿不到网卡 MAC，`uuid@14` 的 v1 只用随机 node id；
`uuid@14` 只导出 DNS/URL 命名空间，OID/X500 的标准值在 service 里写死。

## 4. service 契约

```ts
type IdFormat = 'canonical' | 'upper' | 'raw' | 'braces' | 'urn'
type IdJoin = 'newline' | 'comma' | 'quoted' | 'jsonArray'
applyFormat(value: string, format: IdFormat): string
joinIds(values: readonly string[], join: IdJoin): string

type UuidVersion = 'v1' | 'v3' | 'v4' | 'v5' | 'v6' | 'v7' | 'nil'
generateUuid(version: UuidVersion, options: UuidOptions): string
generateUuids(version: UuidVersion, options: UuidOptions, count: number): string[]
uuidVariantOf(uuid: string): 'rfc4122' | 'microsoft' | 'ncs' | 'reserved'

generateUlids(count: number, options: { timestamp?, monotonic }): string[]
parseUuid(value: string): ParseResult<ParsedUuid>
parseUlid(value: string): ParseResult<ParsedUlid>
identifyId(raw: string): 'uuid' | 'ulid' | 'unknown'
analyzeIds(rawText: string): BatchReport
```

生成类非法入参抛英文 `Error`；解析类**不抛**，返回 `{ ok: false, reason }`——解析器天生要吃垃圾输入。
数量越界统一在 service 内 clamp 到 [1, 1000]（与现有 uuid-generator 行为一致），写进测试锚定。
v1/v6/v7/ULID 批量时逐条 +1ms，保证时间有序语义在批量下依然成立。

## 5. 测试与验收

- 四个 service 各覆盖正常路径 + 空输入 + 非法边界；v3/v5 用 RFC 9562 附录已知向量断言可重现性；
  `decodeTime` 与自定时间戳 roundtrip；拼接函数逐条断言。
- 中英 key 集合由 `src/test/modules/i18n/locale-parity.test.ts` 强制对齐。
- `pnpm test`（含 i18n 重复键与 tool-seo 两个校验脚本）+ `pnpm lint` + `pnpm typecheck` 全绿，
  起 dev 实测三 Tab、1000 条不卡、中英无缺键。
- 按 AGENTS.md §11，改动只留在工作区，不 `add` / `commit`。
