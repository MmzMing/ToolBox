# 随机密码生成器设计（并入密码强度分析工具）

日期：2026-09-27
范围：`src/tools/crypto/password-strength-analyser/` 新增随机密码生成能力，与现有强度分析双区联动。

## 1. 需求对齐结论

| 决策点     | 结论                                                                                                                    |
| ---------- | ----------------------------------------------------------------------------------------------------------------------- |
| 产品形态   | 并入「密码强度分析」页面，生成 → 立刻看强度 → 复制 的闭环；不新增路由                                                   |
| 功能档位   | 核心 + 策略合规（长度、四类字符、每类最小数量、前缀/后缀、排除易混淆、自定义排除集、批量）                              |
| 长度语义   | `length` 指**随机部分**长度，前缀后缀额外附加，不占用 `length`                                                          |
| 熵口径     | 主强度条仍按整串分析（不动现有算法）；生成区额外标注「随机部分有效熵」，固定串不计入                                    |
| 生成时机   | 手动点击生成，参数变化不自动重抽                                                                                        |
| 参数持久化 | 不持久化，全部留在组件 `useState`，刷新回默认值                                                                         |
| 代码分层   | 方案 B 三层分拆：`utils/random.ts`（共用随机源）→ `password-generator.service.ts`（纯逻辑）→ `GeneratorPanel.tsx`（UI） |

## 2. 业界选项调研对照

来自 Bitwarden、KeePassXC、1Password、pwgen 的能力清单，与本次取舍：

| 能力                 | 出处                                                 | 本次是否实现                                     |
| -------------------- | ---------------------------------------------------- | ------------------------------------------------ |
| 长度滑块 + 数字框    | 全部                                                 | ✅ 1–128，与 `TOKEN_LENGTH_RANGE` 对齐           |
| 四类字符开关         | 全部                                                 | ✅                                               |
| 每类「至少 N 个」    | Bitwarden 只对数字/符号开放；pwgen `-1` 至少一个数字 | ✅ 做成四类统一模型（比 Bitwarden 更规整）       |
| 排除易混淆字符       | Bitwarden「Avoid ambiguous」、pwgen `-B`             | ✅ 固定 `il1Lo0O` 一档                           |
| 自定义排除字符       | KeePassXC                                            | ✅ 文本框                                        |
| 前缀 / 后缀          | 1Password Password Pattern 的子集                    | ✅ 字面量拼接                                    |
| 批量生成             | 站内 `common:generateCount` 已有约定                 | ✅ 1–20                                          |
| 符号仅出现在中间     | pwgen `-n` / `-y`                                    | ❌ 需求方未提，收益低（YAGNI）                   |
| 助记口令（diceware） | Bitwarden / KeePassXC                                | ❌ 需内置 7776 词词表（约 60KB），与首屏体积冲突 |
| 可读/可发音模式      | 1Password                                            | ❌ 实现重，且与「策略合规」目标无关              |

## 3. 模块边界

```
src/utils/random.ts                                   [新增] randomInt + shuffle
src/test/utils/random.test.ts                         [新增]
src/tools/crypto/token-generator/
  └── token-generator.service.ts                      [改] 删私有 randomInt，改引 @/utils/random
src/tools/crypto/password-strength-analyser/
  ├── index.ts                                        [改] 追加生成类搜索关键词
  ├── password-generator.service.ts                   [新增] 纯生成逻辑
  ├── GeneratorParams.tsx                             [新增] 右侧参数卡片（受控）
  ├── GeneratedList.tsx                               [新增] 左侧结果列表（受控）
  └── PasswordStrengthAnalyser.tsx                    [改] 持有 options/results 状态，双栏布局
src/test/tools/crypto/password-strength-analyser/
  └── password-generator.service.test.ts              [新增]
src/modules/i18n/locales/{zh,en}/tools-crypto.json    [改] 新增 password-strength-analyser.gen.*
```

`randomInt` 上移 `src/utils/` 是 AGENTS.md §7 的强制要求（「某段逻辑被第二个工具需要时，先上移 utils 再引用，禁止复制一份」），不是可选优化。

## 4. service API

```ts
export const PASSWORD_LENGTH_RANGE = { min: 1, max: 128 } as const
export const PASSWORD_COUNT_RANGE = { min: 1, max: 20 } as const
export const AMBIGUOUS_CHARS = 'il1Lo0O'
export const CLASS_IDS = ['uppercase', 'lowercase', 'digits', 'symbols'] as const

export type PasswordClassId = (typeof CLASS_IDS)[number]

export type PasswordGeneratorOptions = {
  length: number
  prefix: string
  suffix: string
  classes: Record<PasswordClassId, { enabled: boolean; min: number }>
  excludeAmbiguous: boolean
  excludedChars: string
  count: number
}

export type GeneratedPassword = {
  /** prefix + 随机体 + suffix */
  value: string
  /** 仅随机部分，用于算有效熵 */
  randomBody: string
  /** 排除后实际字符池大小 */
  poolSize: number
  /** length * log2(poolSize)，固定串不计 */
  effectiveEntropyBits: number
}

export type ConstraintViolation =
  | 'emptyPool'
  | 'lengthOutOfRange'
  | 'countOutOfRange'
  | 'minExceedsLength'
  | 'sumOfMinsExceedsLength'

export function validateGeneratorOptions(options: PasswordGeneratorOptions): ConstraintViolation[]
export function generatePasswords(options: PasswordGeneratorOptions): GeneratedPassword[]
export const DEFAULT_GENERATOR_OPTIONS: PasswordGeneratorOptions
```

`validateGeneratorOptions` 供 UI 做即时提示与按钮禁用；`generatePasswords` 保留 `throw new Error(...)`（英文技术信息，AGENTS §7）作为最终防线，UI 层负责翻成文案。两者共用同一套判定，不允许逻辑分叉。

### 4.1 生成算法

1. 按启用的字符类构造各类池，逐类剔除 `AMBIGUOUS_CHARS`（若开关开）与 `excludedChars`（去重、区分大小写、按字符剔除）。
2. 全池 = 各类池之和；剔除后某启用类池变空 → 视为该类无贡献字符。
3. 校验：全池非空、`length` 在范围内、每个 `min` ≤ `length`、`Σmin` ≤ `length`。
4. 先按类「预留」：从各类池无放回? 有放回地取 `min` 个字符（取有放回即可，`min` 通常远小于池大小）。
5. 剩余 `length - Σmin` 位从全池均匀取。
6. 整体 `shuffle`（Fisher-Yates，无偏源）—— 否则「至少 1 个符号」会恒定出现在固定位置，是真实的强度泄露。
7. 拼 `prefix + 随机体 + suffix`，返回 `GeneratedPassword`。

`有效熵 = length * log2(poolSize)`，只用随机部分，因此 `poolSize` 会被排除规则缩小 —— 排除字符让熵下降这一点会被诚实展示，而不是偷偷发生。

## 5. UI 结构

双栏：左列是产出与反馈（生成结果 + 强度校验），右列是参数卡片。

```
┌ 左列 ──────────────────────────┐ ┌ 右列 20rem ──────────┐
│ 生成结果                        │ │ 随机密码生成          │
│ [gh-Xk3…!26] [复制] [用这条分析] │ │ 随机部分长度          │
│ [gh-9pQ…!26] [复制] [用这条分析] │ │ [slider ├──┤] [16]   │
│ ─────────────────────────────── │ │ 字符类型              │
│ 密码 [Input + 眼睛]              │ │ ☑ 大写 (A-Z)   [1]   │
│ 强度  极强                        │ │ ☑ 小写 (a-z)   [1]   │
│ ▰▰▰▰▱                             │ │ ☑ 数字 (0-9)   [1]   │
│ 长度 22 · 熵 144.54 · 破解 centuries │ │ ☐ 符号 (!@#$)  [0] │
│ ✓ 长度至少 12 个字符               │ │ 前缀 [gh-] 后缀[!26] │
│ ✓ 包含小写字母 …                   │ │ ▸ 高级选项           │
│ ⚠ 免责声明                        │ │ [        生成      ] │
└─────────────────────────────────┘ │ 最终 22 位 · 有效熵 95.27 │
                                    └────────────────────────┘
```

- 断点按 AGENTS §6 用 `xl`（1280）：`grid-cols-1 xl:grid-cols-[minmax(0,1fr)_20rem]`。窄屏用 `order-1/order-2` 把参数卡片提到前面，避免用户在空结果后面找控件。
- 常驻区放长度、四类字符、前缀后缀、生成按钮与有效熵摘要；`Collapsible` 折叠区只放批量数量、排除易混淆、额外排除字符 —— 对应「其他高级选项」的渐进披露。
- 生成后**第一条自动写入分析区**并自动切到明文显示，其余每条带一个 ghost icon 按钮手动载入。
- 开关关闭时该类的「至少 N」数字框强制置 0 并 disabled，避免出现「关闭却要求 3 个」的矛盾态。
- 约束提示用 `Alert variant="destructive"` 列出违反项；存在违反时「生成」按钮 `disabled`。
- 状态归属：`options / results / failed` 放在 `PasswordStrengthAnalyser`（最近公共父组件），`GeneratorParams` 与 `GeneratedList` 均为受控展示组件。
- 页面不自建滚动容器（app-shell 约定，唯一滚动容器是 `<main>`）。

## 6. 边界与错误处理

| 场景                                      | 行为                                                                                |
| ----------------------------------------- | ----------------------------------------------------------------------------------- |
| 四类全关                                  | `emptyPool`，提示「请至少选择一类字符」，按钮禁用                                   |
| 排除后池为空（如只开数字并排除 `0-9`）    | 同上 `emptyPool`                                                                    |
| `length` 手输越界 / 小数                  | 夹紧到 1–128（沿用 TokenGenerator 的夹紧写法），`generatePasswords` 仍会抛错兜底    |
| `Σmin > length`                           | `sumOfMinsExceedsLength`，明确提示需要多少位                                        |
| 前缀/后缀含符号或大写                     | 不参与校验、不计入最小数量（最小数量只看随机部分，偏保守但永远满足策略）            |
| 前缀/后缀含非 ASCII                       | 允许；因有效熵只算随机部分，不会因此虚高                                            |
| `navigator.crypto` 不可用（非安全上下文） | 与站内加密工具一致：`crypto.getRandomValues` 在所有目标浏览器可用，不做额外降级分支 |
| 批量结果重复                              | 不做去重（会引入偏置）；默认长度下概率可忽略                                        |

## 7. 测试计划

`src/test/utils/random.test.ts`

- `randomInt(1)` 恒为 0；`randomInt(max)` 大样本全部落在 `[0, max)`
- 大样本各桶频次不低于期望值的 80%（证明拒绝采样真的无偏）
- `shuffle` 返回新数组、不改原数组、元素多重集合与长度守恒

`password-generator.service.test.ts`

- 前缀后缀拼接正确，`randomBody` 长度恰为 `length`
- 每类 `min` 生效（200 次抽样全部满足）
- `min = 0` 时该类可完全不出现（不引入多余约束）
- `excludeAmbiguous` 后各类池恰好扣减掉 `AMBIGUOUS_CHARS` 中的对应字符
- `excludedChars` 自定义剔除且与 ambiguous 合并去重
- `effectiveEntropyBits = length * log2(poolSize)` 恒等式
- 边界：`length` 取 1 与 128 不抛错；`emptyPool`、`Σmin > length`、`min > length`、`count` 越界分别抛对应 `Error`
- 批量 `count` 条且长度一致；符号不恒定出现在末位（shuffle 生效）

`token-generator.service.test.ts` 现有用例必须全绿（本轮只改 import 来源）。

## 8. i18n

`tools-crypto` 命名空间，`password-strength-analyser.gen.*`，zh/en 双全：
`title`、`advanced`、`length`、`minCount`、`prefix`、`suffix`、`prefixPlaceholder`、`batch`、
`excludeAmbiguous`、`excludedChars`、`finalLength`、`effectiveEntropy`、`useForAnalysis`、
`errors.{emptyPool,lengthOutOfRange,countOutOfRange,minExceedsLength,sumOfMinsExceedsLength}`。
按钮文案复用 `common:generate`、`common:generateCount`，不重复造键。
