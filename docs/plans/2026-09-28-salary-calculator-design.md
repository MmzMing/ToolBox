# 工资计算器（salary-calculator）设计

日期：2026-09-28 · 分类：求职（resume） · 合并来源：`life/social-insurance-calculator`（下线并迁入）

## 1. 目标与竞品缺口

用户意图不是「五险一金各交多少」，而是「他们报的这个税前，我月底卡里到底进多少、扣掉房租吃饭还能
攒多少」。现有 `social-insurance-calculator` 停在 `takeHome = 基数 − 个人五险一金`
（`social-insurance.service.ts:50` 注释自己写明「未计个税」），少掉的是决定性的两块：**个税累计预扣**
与**生活成本**。同样月薪 20000，专项附加扣除 3000/月 与否一年差几千，只算三险一金的结果和真实工资条
对不上，用户第一次核对就失去信任。

对标 https://bufancv.com/tools/salary 的功能拆解与落点：

| 竞品具备                       | 本项目做法                                          |
| ------------------------------ | --------------------------------------------------- |
| 五险一金 + 个税 + 年终奖一条龙 | 全量覆盖，算法用累计预扣法而非月度均摊              |
| 12 个月「累计预扣」明细表      | 覆盖，并额外给「适用税率」列，让跳档可视            |
| 真实可支配 = 到手 − 房租通勤   | 覆盖，另出「全年能存」「存钱率」                    |
| 城市下拉驱动基数与公积金比例   | 覆盖：18 城官方基数上下限 + 公积金默认比例 + 租金档 |
| 生活成本四项 + 恢复默认        | 覆盖，默认值按城市能级四档给                        |
| 专项附加扣除七项               | 覆盖，房贷/租金互斥、大病医疗按年                   |
| 保存图片导出                   | **不做**（离屏排版无法单测，色板要另维护一套）      |
| —                              | **反算**：期望到手 → 需谈税前，竞品没有             |

**刻意不做**：多城市并排对比、涨薪/通胀模拟、offer 总包口径、副业劳务报酬计税、家庭联合申报、
逐城逐项的「精准」租金表（口径不可靠，写死 72 个数字只会把错误具体化）。

## 2. 身份与文件结构

- 新目录 `src/tools/resume/salary-calculator/`，`name = path = salary-calculator`，
  `redirectFrom: ['social-insurance-calculator']`（`router.tsx:31-34` 自动生成 loader）。
  先例取舍：`key-generator` 设计稿主张未上线不留死配置，但 `docs/seo/README.md:28` 记录线上跑在
  EdgeOne 且 sitemap 已收录旧路径，成本仅一行，故配。
- `wide: true`（双栏工作台，默认 `max-w-6xl` 会把结果区挤窄）；`icon: Wallet`；
  `createdAt: '2026-09-28'`。
- 归入「求职」而非「生活」：算到手与改简历是同一个求职动作的两面，侧栏该分类当前只有 `resume`
  一个工具（`resume/index.ts:5`），并列后内链自然。

```
src/tools/resume/salary-calculator/
├── index.ts                        # defineTool
├── SalaryCalculator.tsx            # 双栏壳 + 状态提升 + 复制链接
├── salary-calculator.service.ts    # 纯函数，零 DOM/React
├── salary-data.ts                  # as const 数据表（税率/扣除标准/城市/能级/费率）
└── components/
    ├── IncomeSection.tsx           # 正算/反算切换、税前月薪、城市、社保基数、公积金基数与比例
    ├── EmploymentSection.tsx       # 首个发薪月份 + 年度内首次取得工资薪金开关
    ├── DeductionSection.tsx        # 七项专项附加扣除 + 个人养老金/税优险其他扣除
    ├── RateSection.tsx             # 折叠的高级费率面板（个人三项 + 定额 + 单位五项）
    ├── BonusSection.tsx            # 年终奖金额 + 三种计税方式 + 临界区间提示
    ├── LivingCostSection.tsx       # 房租/通勤/餐饮/其他 + 恢复默认
    ├── CostBreakdown.tsx           # 成本占比水平堆叠条
    └── MonthlyTable.tsx            # 逐月累计预扣明细表
src/test/tools/resume/salary-calculator/
└── salary-calculator.service.test.ts
```

删除 `src/tools/life/social-insurance-calculator/`（三件套）与
`src/test/tools/life/social-insurance-calculator/`；`life/index.ts` 去掉一行 import 与数组项。
`resume/index.ts` 注册两项，按变量名字母序 `resume` → `salaryCalculator`。
五险一金的个人/单位双栏对照能力**不丢**，作为结果区最后一块承接。

状态：不建 store（全项目仅 `markdown-editor` 用工具级 persist）。输入一律 `useState` 字符串，
`useMemo` 内 `try/catch` 兜底返 `null`（照 `SocialInsuranceCalculator.tsx:34-40`）。
参数分享复用 `src/utils/url-params.ts`：首屏 `pickUrlParams` 读一次、`urlWithParams` + `useCopy`
产出「复制链接」，与 `DnsLookup.tsx:83-84,164-171` 同构，零新增依赖。

## 3. 功能规格

**收入区**：税前月薪（默认 20000）；城市下拉（18 城 + 「其他城市」兜底，默认北京）；社保缴费基数
（默认月薪，按城市上下限封顶并提示触界方向）；**公积金缴存基数单列**（默认月薪，按公积金自己的
上下限封顶——公积金基数上限与社保不同源，广州 41697 对 27549）；公积金个人比例（城市上限约束，
上海基本公积金 7%）。顶部二选一开关：`正算 税前 → 到手` / `反算 到手 → 税前`，反算态下月薪输入框
换成「期望每月到手」，其余参数含义不变。

**在职月份区**：本年度首个发薪月份（1–12，默认 1）+ 开关「本年度首次取得工资薪金」。
后者按国家税务总局公告 2020 年第 13 号把累计减除费用改为 `5000 × 日历月份数`，年中入职者前几个月
税负明显更低，是跳槽人群的实用差异点。

**专项附加扣除区**（七项，全 0 默认）：子女教育（每孩 2000/月 × 孩数）、3 岁以下婴幼儿照护
（2000/月 × 孩数）、继续教育（学历 **400/月**，最长 48 个月；职业资格 3600/年，**二选一**）、
住房贷款利息 1000/月、住房租金（1500/1100/800，选城市自动带档）、赡养老人（独生 3000/月，
非独生填分摊额且 ≤1500）、大病医疗（**按年**，年度自付超 15000 部分，限额 80000）。
房贷利息与租金互斥：选一个另一个禁用并在 UI 说明原因。

**其他扣除区**：个人养老金（年限额 12000）与税优商业健康险（限额 2400），按年均摊到月参与
累计预扣；超过限额按限额计。参考站没有这两项，不填就会多算税。

**费率高级面板**（折叠，承接被删的旧工具）：个人养老/医疗/失业比例与定额大病医疗互助、
单位五项比例，全部可覆盖；默认值取城市预设（北京单位医疗 9.8%、南京个人大病 3 元等）。
调研报告明确：多地失业与工伤是「阶段性降费」文件，2026 年续期尚未公布，硬编码必错。

**年终奖区**：金额 + 方式（`自动选更省` | `单独计税` | `并入综合所得`）。默认「自动」，
结果显示实际采用的方式与被省下的金额，并在奖金落入「多发 1 元到手反而少」的临界区间时提示。
临界区间由税率表推导（`bonusTrapZones()`），不抄现成数字。

**生活成本区**：房租、通勤、餐饮、其他四项月度输入 + 「恢复城市默认」。默认值来自城市能级四档。

## 4. 数据表与 service 契约

`salary-data.ts`（全部 `as const`，禁 enum）：

- `TAX_BRACKETS` — 综合所得**年度**累计级距 7 档 + 速算扣除数
  （36000 / 144000 / 300000 / 420000 / 660000 / 960000，税率 3%→45%，速算扣除 0 / 2520 /
  16920 / 31920 / 52920 / 85920 / 181920）。累计预扣与年度汇算都用这张表，
  **不是**月度税率表；`MONTHLY_TAX_BRACKETS` 由它 **÷12 推导**（级距与速算扣除数同时除 12），
  年终奖单独计税按推导表找税率，已逐级与官方按月换算表核对一致。
- `BASIC_DEDUCTION_MONTHLY = 5000`
- `SPECIAL_DEDUCTIONS` — 国发〔2018〕41 号设定、国发〔2023〕13 号提标。
  注意 2023 年只提了「一老一小」（子女教育、婴幼儿 2000、赡养老人 3000），
  **继续教育未被提标，仍是 400/月**；把 3000 抄到继续教育上是这次调研纠正掉的一个真实错误。
- `OTHER_DEDUCTION_LIMITS` — 个人养老金 12000/年、税优健康险 2400/年
- `BONUS_SEPARATE_TAX_EXPIRY = '2027-12-31'` — 财政部 税务总局公告 2023 年第 30 号
  （<https://fgk.chinatax.gov.cn/zcfgk/c102416/c5211524/content.html>）
- `DEFAULT_EMPLOYEE_RATES` / `DEFAULT_EMPLOYER_RATES` / `FUND_RATE_RANGE` — 基准费率与 5%–12% 区间
- `CITY_PRESETS` — 18 城 + `other`，字段见类型定义：`{ id, livingCostTier, rentDeductTier?,
socialBaseMin?, socialBaseMax?, socialBasePeriod?, fundBaseMin?, fundBaseMax?,
fundRateDefault?, fundRateMax?, extraMedicalMonthly?, employerMedicalRate? }`。
  城市身份与市辖区户籍人口决定租金档（**100 万**为界，不是 300 万；与 GDP、房价无关）。
- `LIVING_COST_TIERS` — `tier1 | newTier1 | tier2 | other` 四档 × 四项月度默认值
- `cityPresetOf` / `livingCostDefaultsOf` / `fundDefaultsOfCity`，配合 service 的
  `defaultRatesOfCity`

`salary-calculator.service.ts` 导出（动词开头，输入输出可序列化）：

```ts
type CalcInput = { grossMonthly, cityId, socialBase?, fundBase?, fundRate, rates,
                   startMonth, firstSalaryInYear, deductions, other,
                   bonusAmount, bonusMode, living }
type CalcResult = { insurance, months: MonthlyRow[], year, livingTotal, monthlyDisposable,
                    annualSaving, savingRate, monthlyTakeHome{Average,First,Last} }

computeSalary(input): CalcResult
taxForCumulative(cumulativeTaxable): { rate, quickDeduction, tax }
bonusTaxSeparate(bonus): number
bonusTrapZones(): BonusTrapZone[]
bonusTrapZoneOf(bonus): BonusTrapZone | null
monthlySpecialDeduction(d): number
monthlyOtherDeduction(o): number
seriousIllnessDeduction(selfPaid): number
clampSocialBase(amount, city) / clampFundBase(amount, city): { base, clamped }
solveGrossForTargetTakeHome(target, input): { grossMonthly, bonusMode }
```

非法数值抛英文 `Error`（`non-negative`、`Invalid … rate`），UI 层负责翻译与降级。
`solveGrossForTargetTakeHome` 二分区间 `[0, 3_000_000]`、60 步、精度 0.5 元；单调性要求年终奖方式
固定，所以 `auto` 会按两种法定方式各求一次，取需要税前更低的解（并有单测锚定「解回喂正算落在目标
±0.5」的互逆性质）。

## 5. 计算口径与必须在 UI 承认的六件事

1. **累计预扣 ≠ 均摊**。`当月个税 = f(累计应纳税所得额) − 速算扣除 − 已前月已预扣累计`，
   导致年初到手高、年末跳档后到手低。因此大数字卡用**月均到手**并标注首末月区间，
   而非拿 1 月的数字冒充全年。
2. **输出措辞是「预扣税额」**，年度汇算清缴可能补退（多处取得收入、房贷与租金跨年度切换等），
   工具不预测汇算结果，免责区一句话说明。
3. **公积金双边进个人账户**，不是纯损失。主口径按「到手现金」算（个人部分照扣），
   另起一行显示「个人 + 单位合计 X 元/月进入你的公积金账户」。这是用户最容易觉得「算少了」的地方。
4. **大病医疗按年度计算**，月度预扣体现不了，只在年度汇总里作为额外减除，UI 标注「不影响月度」。
   结果区同时给出 `annualSalaryTaxPrepaid`（预扣）与 `annualSalaryTaxPayable`（应纳）两个数，
   差额即 `settlementRefund`，让「为什么工资条比计算器少扣/多扣」有据可对。
5. **公积金超额缴存要加回应税所得**（财税〔2006〕10 号）：可扣除额以「本人月均工资 × 比例」为限，
   基数超过月薪的那部分缴存额虽照样从实发里扣走，却不能税前扣除。`insurance.housingExcess`
   单列，UI 有超额时提示。多数计算器直接把这块漏掉，导致高公积金基数的人少算税。
6. **年中入职不是 12 个月**：明细表按首个发薪月排到 12 月，全年口径的月薪合计、五险一金、
   生活成本都按在职月份数计，`year.monthsWorked` 明写出来。若勾选「本年度首次取得工资薪金」，
   累计减除费用改按日历月份数（2020 年第 13 号），7 月入职首月即可扣 35000。

## 6. 输出与可视化

结果区自上而下，占据 PC 的**左**栏，控件栏在**右**（`xl:grid-cols-[minmax(0,1fr)_minmax(0,380px)]`）。
方向按站点惯例定：简历工坊把设置收在右侧 dock，工具主输出靠左。窄屏用 DOM 顺序 + `xl:order-*`
翻转——移动端与平板先看到控件再看到结果（首屏即可改数），PC 才把结果挪到左边。
卡片内的字段一律标签在上、说明在下（inline 的 label + hint + 小输入框在 340px 栏里会互相挤压，
是首版被退回的原因），并用 `md:grid-cols-2 xl:grid-cols-1` 让同一套字段在平板铺两列、在右侧窄栏收回单列。

1. 四张 `ResultCard`：月均到手（highlight）· 每月生活成本 · 真实可支配 · 存钱率。
2. 成本占比水平堆叠条：到手拆成房租/通勤/餐饮/其他/可存五段，`flex` + 百分比宽度 +
   语义令牌底色（`bg-primary`、`bg-muted` 等），不引入图表库。
3. 12 月累计预扣明细表：月份 · 累计应纳税所得额 · 适用税率 · 当月个税 · 五险一金 · 当月到手。
   次要点列 `hidden md:table-cell`，手机只留月份/税率/到手三列。
4. 年度汇总：全年税前、个人五险一金、公积金入账、全年预扣个税、年终奖采用方式、
   实际税率、到手率。
5. 个人/单位缴费对照矩阵（承接旧工具）。
6. 免责行：数据版本与生效期 + 「各地政策与年度调基有差异，以社保局/公积金中心公布为准」。

## 7. i18n 与文档同步

- `locales/{zh,en}/tools-resume.json`：删 `social-insurance-calculator` 块（zh/en 各 21 键），
  新增 `salary-calculator` 块（约 90 键）。中英文键集合必须严格相等，否则
  `src/test/modules/i18n/locale-parity.test.ts:40-50` 直接红。
- 组件内 `useTranslation('tools-resume', { keyPrefix: 'salary-calculator' })`。
- 标题就叫「工资计算器」/ `Salary Calculator`，功能范围交给 description 与关键词承载；术语统一
  Individual Income Tax (IIT) / social insurance / housing fund / year-end bonus。
- `keywords` 取旧工具全部 + 新增：`到手工资` `税后工资` `个税计算器` `社保计算器` `五险一金`
  `谈薪` `offer` `cost of living` `take-home pay`。
- 文档：`docs/design/功能介绍文档.md:104`（life 行改、resume 段补一行）、
  `docs/seo/SEO优化策略.md:697` 路径与关键词更新、`docs/INDEX.md` 与 README 工具数校正
  （life −1 / resume +1，总数不变）。
- `pnpm generate:sitemap` 重生成。

## 8. 测试与验收

`src/test/tools/resume/salary-calculator/salary-calculator.service.test.ts`：

- 级距边界：累计应纳税所得额恰为 36000 / 144000 时的税率与速算扣除归属。
- 累计预扣逐月跳档：月薪 20000 无专项扣除，断言前 N 月 3%、后续 10%，且 12 月个税合计
  与年度直接算法一致（这是「均摊 vs 预扣」口径的回归锚）。
- 年终奖三模式：构造单独计税明显更优与并入更优的两个 case，断言 `auto` 取低者并给出差额。
- 反算与正算互逆：`solveGrossForTargetTakeHome` 的结果回喂 `computeSalary`，
  月均到手落在目标 ±0.5。
- 基数封顶：`clampSocialBase` 超上限/低于下限的三种返回。
- 非法输入：负月薪、非数值比例、房贷利息与租金同时非零 → `toThrowError(/.../)`.
- 精度不变量：遍历结果所有金额字段断言 `toFixed(2)` 回环（照现有测试写法）。
- 门禁：`pnpm lint` + `pnpm typecheck` + `pnpm test`（含 i18n 重复键与 tool-seo 两个脚本）全绿，
  起 dev 在 375 / 900 / 1440 三断点实测双栏、明细表横向滚动与复制链接回填。
- 按 AGENTS.md §11，改动只留在工作区，不 `add` / `commit` / `push`。

## 9. 数据来源与已知缺口（已回填）

`CITY_PRESETS` 与 `LIVING_COST_TIERS` 已按调研报告回填，均为 2026-09 检索到的现行标准：

- 社保与公积金基数上下限：各市人社局 / 住房公积金管理中心 2026 年度通知，逐城带
  `socialBasePeriod`（如北京 2026-07、成都 2026-10、青岛 2026-08）；沿用旧年度的城市标旧起始月
  （广州、深圳、苏州、南京、郑州、东莞、佛山仍为 2025-07，杭州、武汉为 2025-01），
  UI 需把「沿用上一年度」这件事显示出来，而不是假装精确。
- 单位医疗费率、个人定额大病互助：仅收 A/B 级来源的城市（北京 3 元、南京 10 元、武汉 7 元、
  重庆 5 元；上海基本公积金 5%–7% 为唯一比例上限例外）。
- **已知缺口，UI 必须靠「费率可编辑 + 免责」兜住**：长沙 / 东莞 / 佛山的单位医疗费率未核实，
  回落基准 9%；上海补充公积金（1%–5%）与深圳医保一档/二档未建模；多地失业、工伤属阶段性降费文件，
  2026 年续期尚未公布。
- 生活成本四档默认值取「单身、合租或郊区整租」口径，锚在 2025 年统计局城镇居民人均消费支出
  （35869 元/年，注意这是含老人儿童的全体居民摊薄值，只能当下限校验）与 2026 年 50 城租金指数
  之间；**这是产品估算，不是官方数据**，UI 标「估算参考」且全部可覆盖。
- 市场上流传的「2026 年一老一小扣除再加 1000」未获权威文件支持，**不写进代码**。

## 10. 实施进度与顺序

| 步骤 | 内容                                                                                          | 状态 |
| ---- | --------------------------------------------------------------------------------------------- | ---- |
| P1   | `salary-data.ts` + 税率纯函数 + 单测                                                          | ✅   |
| P2   | `computeSalary` / 反算二分 / 基数封顶 + 单测（61 用例）                                       | ✅   |
| P7   | 城市与生活成本数据回填（原计划最后做，调研先回来就提前了）                                    | ✅   |
| P3   | `index.ts` + `SalaryCalculator.tsx` 双栏壳 + 结果卡                                           | ✅   |
| P4   | 八个输入/输出面板（含费率高级面板与其他扣除区）                                               | ✅   |
| P5   | 删除 `life/social-insurance-calculator`，改 `life/index.ts`、`resume/index.ts`，清 zh/en 键块 | ✅   |
| P6   | i18n 双语 155 键 → parity 通过 → sitemap（50 URL）→ README 与两份设计文档同步                 | ✅   |

浏览器实测（dev server + 页面脚本断言，非肉眼验收）：`/social-insurance-calculator` 客户端跳转到新页；
北京 20000 默认值 → 每月到手 14,657.3、生活成本 4,800、可支配 9,857.3、存钱率 67.3%，与手算逐级一致；
明细表第 4 月从 3% 跳到 10%、实发从 15,182.09 降到 14,447.30；反算 `?mode=reverse&t=15000` 解出需谈税前
20,491.33；年终奖 37,000 触发临界区间提示并给出「改为并入会多缴 2,106.4」；切英文无缺键、无 `NaN`。

实现过程中被浏览器实测抓出来的一个真错误：`rentTier` 初值原写 `'auto'`，会让住房租金专项附加扣除在
用户没有表达任何意图的情况下自动生效，北京默认到手因此虚高 150 元/月。已改为默认 `'0'`（不享受），
城市档位只作为可选项与提示。设计文档 §3「七项，全 0 默认」早就写明了这条，是实现时没照做。

`pnpm lint`、`pnpm typecheck`（本工具相关文件）、`pnpm test` 全绿。

实现顺序上的一个教训值得记：`CalcInput` 在 P3/P4 之前先定型是对的，但四项准确率扩展（基数分列、
费率可编辑、其他扣除、年中入职）越靠近 UI 阶段加越贵——`months` 从固定 12 行变成可变长度、
`insurance` 从单基数变双基数、`takeHome` 与「可税前扣除额」分离，都是在这一层才改干净的。
