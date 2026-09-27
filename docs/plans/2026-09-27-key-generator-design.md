# 密钥工坊（key-generator）设计

日期：2026-09-27 · 分类：加密（crypto） · 合并来源：`hmac-generator` + `rsa-key-pair-generator` + `token-generator`
状态：**P0 已完成（`utils/bytes` `utils/asn1` `utils/pem` `utils/base64` + 35 用例全绿）**，§5 是 P0 的实测结论。

## 1. 目标与竞品缺口

把「生成一把能直接用的机密」这件事收敛到一个工具里：**一次生成 → 规范化中间表示 → 全格式矩阵输出**。
现有三个工具各做一半（`rsa-key-pair-generator` 只能出两种 PEM，`hmac-generator` 只能算签名不能生成密钥，
`token-generator` 与 HMAC 在「随机密钥」上语义重叠），三个 URL 分散了同一个搜索意图。

竞品扫描（browserling / the-x.cn / appcrypt / 10015.io / 各类 ssh-keygen 在线页）的真实短板，即本工具落点：

| 竞品短板                                         | 本工具做法                                                |
| ------------------------------------------------ | --------------------------------------------------------- |
| 单算法单格式（the-x.cn 只有 RSA + PKCS#1 + MD5） | 4 算法族 × 10+ 格式同屏输出，逐行复制                     |
| 只有桌面端 DevToys 做到「全格式」                | 纯浏览器、免安装、免登录，URL 可分享                      |
| 输出即终点，无任何正确性反馈                     | 生成后自动 sign/verify 往返自检，显示「密钥可用」         |
| 无导入通道                                       | 粘贴任意 PEM/JWK/OpenSSH 反解为全部格式 + 指纹 + 配对校验 |

## 2. 范围与非目标

**做**：HMAC 密钥与签名、RSA / ECDSA / Ed25519 密钥对、X25519（仅 WireGuard 预设）、对称密钥（AES/ChaCha20/IV/salt）、
随机令牌、格式互转与下载。

**刻意不做**（避开工作量与错误面，勿在实现时顺手加）：

- 口令加密私钥（PBES2 `ENCRYPTED PRIVATE KEY`、OpenSSH bcrypt-pbkdf）与 PuTTY `.ppk`（需 Blowfish/3DES + MAC 校验）。
- X.509 证书与 CSR 生成（只做「给出等价 openssl 命令」，不实现 ASN.1 证书编码）。
- DSA、secp256k1、sk- 安全密钥（实测 `ssh-keygen -t ecdsa-sk` 会弹硬件认证器 PIN 提示，纯前端不可能完成）。
- OpenSSL 遗留 `Proc-Type: 4,ENCRYPTED / DEK-Info` 头解析（需 MD5 派生 key/IV + 3DES，WebCrypto 没有）。
- 任何 localStorage 持久化、任何网络请求（密钥一旦被记住即成泄漏面）。

## 3. 数据模型：以 DER + JWK 为枢纽

```ts
type KeyAlgorithm = 'rsa' | 'ecdsa' | 'ed25519' | 'x25519'
type EcCurve = 'P-256' | 'P-384' | 'P-521'

interface CanonicalKey {
  algorithm: KeyAlgorithm
  bits?: number // rsa
  curve?: EcCurve
  pkcs8Der: Uint8Array // 私钥权威字节（所有私钥格式由它派生）
  spkiDer: Uint8Array
  privateJwk: JsonWebKey
  publicJwk: JsonWebKey
  /** ed25519/x25519 的 32 字节 seed 与公钥，SSH blob 与 JWK 都要用 */
  raw?: { seed: Uint8Array; publicKey: Uint8Array }
}
```

选 PKCS#8 DER 作为权威源的理由（已实测）：它的 `OCTET STRING privateKey` 内部字段**正好就是** PKCS#1 `RSAPrivateKey`
/ SEC1 `ECPrivateKey` 的 DER，因此「传统 PEM」只需剥壳不需要重编码；而 SSH blob 需要的 `n/e/d/iqmp/p/q`
与 ECDSA 的未压缩点，都能从同一份 DER 解出。派生关系单向、无环：

```
pkcs8Der ─┬─→ PKCS#8 PEM（label = PRIVATE KEY）
          ├─→ PKCS#1 PEM（RSA）/ SEC1 PEM（EC）＝ unwrap + 换 label
          ├─→ OpenSSH 私钥体（字符串/mpint 序列，见 §5.3）
          └─→ JWK（d/p/q… 与 DER 分量互验）
spkiDer  ─┬─→ PUBLIC KEY PEM
          ├─→ SSH 公钥行 = string(type) + string(blob) + comment，单行 base64
          └─→ 指纹 = base64(sha256(sshBlob)) 去掉尾部 '='（见 §5.4）
```

没有 `RsaUse` 字段：§5.1 的实测表明用途根本不进 DER。

## 4. 格式矩阵（每个 Tab 的输出目标）

| 格式                                                | RSA     | ECDSA           | Ed25519 | X25519 | 对称/令牌  |
| --------------------------------------------------- | ------- | --------------- | ------- | ------ | ---------- |
| PKCS#8 PEM（`PRIVATE KEY`）                         | ✓       | ✓               | ✓       | ✓      | —          |
| 传统 PEM（`RSA PRIVATE KEY` / `EC PRIVATE KEY`）    | ✓       | ✓               | n/a     | n/a    | —          |
| SPKI PEM（`PUBLIC KEY`）                            | ✓       | ✓               | ✓       | ✓      | —          |
| OpenSSH 公钥行 + 注释                               | ✓       | ✓               | ✓       | —      | —          |
| OpenSSH 私钥（`openssh-key-v1`，无口令）            | ✓       | ✓               | ✓       | —      | —          |
| JWK（私）/ JWKS（含 `kid`/`use`/`alg`）             | ✓ RS256 | ✓ ES256/384/512 | ✓ EdDSA | —      | —          |
| DER base64（裸，无 PEM 头）                         | ✓       | ✓               | ✓       | ✓      | ✓          |
| raw hex / base64 / base64url                        | ✓ 模数  | ✓ 坐标          | ✓ 32B   | ✓ 32B  | ✓ 主体输出 |
| SHA256 指纹 / MD5 指纹 / BubbleBabble               | ✓       | ✓               | ✓       | ✓      | —          |
| 代码片段：`.env` / JS / Java `byte[]` / Go `[]byte` | —       | —               | —       | —      | ✓          |

`n/a` 在 UI 上**置灰并注明原因**（「Ed25519 无 PKCS#1 传统格式」），不静默省略，避免被当成 bug。

## 5. P0 实测结论（node 24.20 WebCrypto + openssl 3.5.7 + ssh-keygen 交叉核对）

### 5.1 RSA 的「用途」根本不进 DER —— 原设计判断作废，工作量减少

原以为 `RSA-OAEP` 导出的 PKCS#8 会把 OAEP 参数写进 `AlgorithmIdentifier`，从而「给 RS256 用就是错的」。
实测**否定**：OAEP / RSASSA-PKCS1-v1_5 / RSA-PSS 三种 `generateKey` 导出的 PKCS#8 与 SPKI，
外层算法标识都固定是 `rsaEncryption` + `NULL`（`openssl asn1parse` 逐字节相同），
且同一份 PKCS#8 可交叉导入成签名私钥（签出 256B）、也能当 OAEP 私钥解密自己加密的密文。
**因此不需要 AlgorithmIdentifier 归一化重写器**。保留的是：现有工具用 `['encrypt','decrypt']` 生成
（`rsa-key-pair-generator.service.ts:26`），页内 CryptoKey 无法签名，所以自检必须**从导出的 DER 重新 importKey**。

### 5.2 私钥导入的 usages 只能给私钥侧

`importKey('pkcs8', …, ['sign','verify'])` 抛 `Unsupported key usage`，`['verify']` 单独给私钥同样抛错。
自检与导入解析的代码必须按公私钥分别只传 `['sign']` / `['decrypt']`（私钥）与 `['verify']` / `['encrypt']`（公钥）。

### 5.3 OpenSSH 私钥体：实测结构（原设计漏了一个长度字段，字段顺序也写反了）

```
"openssh-key-v1\0"                       15 字节 authmagic（含结尾 NUL）
string ciphername = "none" · string kdfname = "none" · string kdfoptions = ""
uint32 nkeys = 1 · string pubkey_blob
uint32 privkeylen                        ← 原设计漏掉；私有段总长，必须是 8 的倍数
  uint32 check1 · uint32 check2（相同随机值）
  string keytype
  <按下表>
  string comment
  padding 0..7 字节，值依次为 1,2,3,…（ed25519 实测为 0 字节，因为已经对齐）
```

| keytype               | 私有段字段顺序（实测自 ssh-keygen 产物）                                                            |
| --------------------- | --------------------------------------------------------------------------------------------------- |
| `ssh-rsa`             | mpint **n, e, d, iqmp, p, q**（用 `n === p*q`、`q·iqmp ≡ 1 mod p`、`e === 65537` 三条数学关系验证） |
| `ecdsa-sha2-nistpNNN` | string curve（`nistp256`）· string point（65B，首字节 `0x04`）· mpint d                             |
| `ssh-ed25519`         | string pub（32B）· string priv（**64B = seed‖pub**）                                                |

公钥行 blob 与私有段里重复出现的分量逐字节一致（已验证），指纹算法对同一 blob 复现出 `ssh-keygen -lf` 的结果。
mpint 是**有符号**大端整数：实测 2048 位模数写成 257 字节（补 `0x00`）、P-256 的 d 写成 33 字节 —— 与
`utils/asn1.ts` 的 `derIntegerContent` 规则同构，SSH 层直接复用。

### 5.4 指纹用标准 base64，不是 base64url

`ssh-keygen -lf` 输出含 `+` 与 `/`（例：`SHA256:EE2AJpO5+VhIufG1fgh4MxQYqZBX4VEOjXtNX7Ro/+Q`）。
若按原设计写成 base64url，指纹会与所有命令行工具对不上——属于「看起来能用、实际全错」那类 bug。

### 5.5 其余已核实事实

- Ed25519 / X25519 在 WebCrypto 可用（Chrome/Edge 137+、Firefox 129+、Safari 17+，约 88%），
  `pkcs8`/`spki`/`jwk` 三种导出都行，且 PKCS#8 前缀 `302e020100300506032b6570 04220420` 与 **RFC 8410 §10 完全一致**
  （已用它作为 `utils/asn1.ts` 的编码断言向量）；`pkcs8` 重导入再导出**逐字节相同**。
- ECDSA 三曲线实测尺寸：PKCS#8 138/185/241B，SPKI 91/120/158B，签名 64/96/132B（r‖s，各坐标定长左补零）。
- WebCrypto 导出的 Ed25519 JWK 带 `alg: "Ed25519"` 与 `key_ops`/`ext`，**JWKS 输出要归一成 `EdDSA`（RFC 8037）并剔除 `key_ops`/`ext`**；
  RSA JWK 会带 `alg: "RS256"`（由 hash 推出），同样按预设覆盖。
- RSA 生成耗时实测：2048 = 44ms，3072 = 94ms，4096 = 188ms → 不需要骨架屏，但必须有 loading 态与「生成中」禁用。
- **P0 期间在测试驱动下修掉一个真 bug**：OID 解码把首字节当成单值，而首 arc 自身也是 base-128（`2.999` 被解成 `2.56.55`）。

## 6. 引擎分层与文件改动

按 AGENTS.md §7 三件套 + §12 零依赖优先；跨工具可复用的字节/编码层上移 utils，密钥专属逻辑留在工具内。

```
src/utils/bytes.ts        [已完成] bytesToHex / hexToBytes（容忍冒号换行）/ concatBytes / bytesEqual
src/utils/asn1.ts         [已完成] DER TLV 读写：长短长度域、正整数符号补零、OID base-128、构造标签、parseDer 递归
src/utils/pem.ts          [已完成] toPem（64 列 + label 白名单防假头注入）/ pemToDer / looksLikePem
src/utils/base64.ts       [已完成] 补 bytesToBase64 / base64ToBytes / bytesToBase64Url / base64UrlToBytes
src/utils/random.ts       [并行会话已建] randomInt / shuffle → 追加 randomBytes(n) 作为统一熵源
src/tools/crypto/key-generator/
├── index.ts                            # defineTool + redirectFrom 三条旧路径
├── KeyGenerator.tsx                    # Tabs 容器（forceMount + data-[state=inactive]:hidden，照抄 encoder-decoder）
├── components/{KeyPairPanel,HmacPanel,SymmetricPanel,TokenPanel,FormatMatrix}.tsx   # P1 已建
├── keypair.service.ts                  # 生成 + 曲线/位数分派（RSA/ECDSA 走 WebCrypto，OKP 走 noble）
├── key-formats.service.ts              # CanonicalKey → §4 全部格式（纯函数，零 DOM）
├── key-components.service.ts           # PKCS#8 剥壳 → PKCS#1 / SEC1 / OKP 分量
├── ssh.service.ts                      # OpenSSH 公钥行与私钥文件读写（§5.3 结构）
├── fingerprint.service.ts              # SSH blob 构造 + SHA256/MD5 指纹
├── hmac.service.ts                     # 迁移 computeHmac/hmacAlgorithms + 新增 generateHmacSecret
├── token.service.ts                    # 迁移字符集逻辑，熵源改引 @/utils/random
├── symmetric.service.ts                # AES-128/192/256、ChaCha20 32B、IV/nonce/salt + 代码片段
├── key-parse.service.ts                # P3 待建：任意输入文本 → CanonicalKey
├── presets.ts                          # P2 待建：平台预设 → 算法参数 + 格式族 + 等价命令
└── selfcheck.service.ts                # P2 待建：sign/verify、encrypt/decrypt 往返（注意 §5.2 的 usages 规则）
src/test/tools/crypto/key-generator/    # 镜像上述 service，一行为一用例（§10）
```

删除：`src/tools/crypto/{hmac-generator,rsa-key-pair-generator,token-generator}/` 及对应 3 个测试文件；
`rsa-key-pair-generator.service.ts:11` 的私有 `toPem` 由 `utils/pem.ts` 取代。
并行会话已把 `token-generator.service.ts` 的 `randomInt` 上移到 `utils/random.ts`，迁移时**直接引用，不再复制一份**（AGENTS.md §7）。

## 7. 界面与交互

`wide: true`，左栏参数、右栏输出（`md:grid-cols-[20rem_minmax(0,1fr)]`，`<md` 单列）。P1 交付 4 个功能 Tab：

1. **密钥对**：算法分段控件（RSA/ECDSA/Ed25519/X25519）+ 位数/曲线 + SSH 注释与 JWK `kid`（后两者并排一行）。
   输出用**下拉**在 PEM / OpenSSH / JWK / 原始字节 四个格式族之间切换，理由有两条：
   全矩阵纵向铺开时一把 RSA 私钥光 PEM 就是 3 段几十行的块，页面被撑成十几屏；
   而第二排 Tab 与外层功能 Tab 视觉完全同构，两层同名控件叠在一起没人分得清自己在切什么。
2. **HMAC**：上「生成密钥」（16/32/48/64 字节，RFC 2104 提示：密钥应 ≥ 摘要长度且不必超过块长），下「用密钥签名消息」（保留旧能力）。
3. **对称密钥**：用途 + 输出进制，附带「同时生成 IV/nonce」与「盐值」开关，底部四语言代码片段。
4. **随机令牌**：旧 token-generator 迁移，长度滑杆上直接显示理论熵。
5. **导入解析（P3 待建）**：粘贴框 → 自动识别 PEM/JWK/OpenSSH/裸 base64 → 落到同一个 `FormatMatrix`。

私钥提示不再用大块 Alert，压成输出区顶部一行 `text-muted-foreground` + Lock 图标；
块输出最高 12 行，再长在里面滚，避免一段私钥把整页顶开。

预设条（`PresetsBar`，P2 待建）在密钥对 Tab 顶部，选中即同时设定算法参数、把对应格式族切过去并给出等价命令行：
GitHub/GitLab SSH（Ed25519 + `ssh-keygen -t ed25519 -C`）、JWT/OIDC（RSA-2048 或 Ed25519 + JWKS `kid`）、
Java/GCP（PKCS#8 + `openssl pkcs8 -topk8`）、Apple/旧 PHP（PKCS#1）、WireGuard（X25519 base64 + `wg genkey`）。
复制成功走 `sonner` toast；下载用 `src/utils/download.ts`，多格式打包用已在依赖里的 `jszip`。

响应式：`<768` 单列堆叠、输出行内 `break-all` + `min-w-0`（AGENTS.md §6 flex 滚动约束）；
按钮触控目标 ≥ 40px；顶栏/侧栏不动（app-shell 唯一滚动容器仍是 `<main>`）。

## 8. 自检、导入与安全红线

- **自检**：从导出的 DER 重新 `importKey` 后跑 `sign`→`verify`（Ed25519/ECDSA/RSA）或 `encrypt`→`decrypt`（RSA-OAEP），
  并把「公钥能否从私钥重新导出」作为一致性检查（`pkcs8` unwrap → 重算 SPKI → 与导出的逐字节比对）。
  失败时红色 badge + 技术原因，而不是静默展示可疑密钥。
- **导入**：只解析不联网、不写日志；识别出私钥时页面顶部常驻「这是私钥，别贴到别处」提示。
  RSA/EC/Ed25519 均验证「提供的公钥 == 由私钥推导的公钥」，不匹配时明示「这不是同一对」。
- **私钥永不进**：localStorage、URL hash/query、`console.log`、分析埋点、剪贴板以外的任何持久通道。
  批量下载只能用户主动点击触发。
- **熵源**：统一 `crypto.getRandomValues`，走 `utils/random.ts`（noble 的 `utils.randomBytes` 亦同源）；禁止 `Math.random`。

## 9. i18n / SEO / 路由迁移

- i18n：全部落在 `src/modules/i18n/locales/{zh,en}/tools-crypto.json` 的 `key-generator.*` 下
  （`title`/`description` + `tab-*` 扁平键 + 每个面板一个嵌套对象，与 `encoder-decoder` 同构）。
  **同时删除** `hmac-generator` / `rsa-key-pair-generator` / `token-generator` 三个孤儿键——CI 的
  `check-i18n-duplicate-keys.mjs` 与 `check-tool-seo-keys.mjs` 都不查孤儿键，不会报错，必须手工删。
  注意该文件同时被「随机密码生成器」那轮改动过（`password-strength-analyser.gen.*`），改前先读最新内容。
- 命名：目录名 = `name` = `path` 去斜杠 = `key-generator`（AGENTS.md §3）；中文显示名「密钥工坊」，
  英文标题走 `Key Generator` 这一高流量搜索词。
- `keywords` 必须并集三件旧工具的全部搜索词，再加 `ed25519`/`ecdsa`/`jwk`/`jwks`/`pem`/`ssh key`/`密钥对`/`指纹`
  （命令面板与侧栏模糊搜索只读 `keywords`）。
- **旧路径不保留入口**：项目仍在开发阶段、未上线，三条旧 URL 没有任何历史流量与权重，
  因此既不写应用内 `redirectFrom`，也不在 `netlify.toml` / `vercel.json` / `nginx.conf` 加 301——
  留了就是无人访问的死配置，还会误导后来者以为存在兼容承诺。真上线后若需迁移，再按
  `docs/seo/README.md:28` 的结论补真 301（应用内跳转不传权重）。
  sitemap 由 `scripts/generate-sitemap.mjs` 扫 `path` 自动生成，旧三条自然消失。
- 文档：更新 `docs/design/功能介绍文档.md` 的工具表（第 40 行附近的 RSA 条目）与分类小节。

## 10. 测试计划（Vitest）

**P0 已交付**（`src/test/utils/`，35 用例）：`asn1.test.ts` 用 RFC 8410 固定向量锁死 Ed25519/X25519 的
PKCS#8 与 SPKI 字节，用 openssl 实测的 P-256 PKCS#8（含 `0x81` 长长度域）验剥壳到 SEC1 与 `[1] BIT STRING` 公钥点；
覆盖长短长度形式、非最小长度与不定长拒绝、mpint 符号补零、OID 往返、畸形输入全部抛错。
`pem.test.ts` 覆盖 64 列换行、假头注入拒绝、CRLF、多块与类型校验。`bytes.test.ts` / `base64.test.ts` 覆盖往返与边界。

**P1 起待补**（`src/test/tools/crypto/key-generator/`）：

- `key-formats.test.ts`：固定 seed/DER fixture → 断言 §4 各格式**逐字节**等于 openssl/ssh-keygen 实测产物
  （fixture 头注释记录生成命令，便于复核）；边界：P-521 坐标前导零、RSA 4096、Ed25519 无 PKCS#1。
- `ssh.service.test.ts`：用 §5.3 的三条数学关系与真实 `sk_*` 产物断言 mpint 顺序、`privkeylen` 对齐、0 字节填充两种情况。
- `fingerprint.test.ts`：复现 `ssh-keygen -lf` 的 `SHA256:` 与 MD5 冒号分组，含 `+`/`/` 不转 url 的回归用例。
- `keypair.test.ts`：曲线/位数分派、WebCrypto 与 noble 同 seed 输出相等、非法位数 `rejects.toThrowError(/key size/i)`。
- `selfcheck.test.ts` / `key-parse.test.ts`：usages 规则（私钥只给 `sign`）、PEM/JWK/OpenSSH 往返 `parse(format(k)) ≡ k`、
  不配对密钥检出、口令加密私钥给出明确「不支持」错误。
- `hmac.service.ts` / `token.service.ts` / `symmetric.service.ts`：旧用例原样迁移不缩水，新增密钥生成分支补齐。

## 11. 分期

| 阶段 | 内容                                                            | 状态 / 产出判据                                                                        |
| ---- | --------------------------------------------------------------- | -------------------------------------------------------------------------------------- |
| P0   | `utils/{bytes,asn1,pem}` + `base64` 扩展 + §5 全部实测结论      | **已完成**：1833 tests / 96 files、`typecheck`、`lint --max-warnings 0`、prettier 全绿 |
| P1   | 密钥对 Tab + 全格式矩阵 + 指纹 + 三件旧工具迁移（4 个 Tab 齐）  | 全套门禁绿，旧工具目录与语言包已删                                                     |
| P2   | 预设条 + 自检 badge + 下载/zip + 安全提示                       | 每个预设粘贴到目标平台可用（手动验 GitHub/JWKS）                                       |
| P3   | 导入解析 Tab                                                    | 往返性质测试通过                                                                       |
| P4   | 文档/功能介绍更新 + i18n 孤儿键清理（旧路径 301 已取消，见 §9） | `docs/` 与线上 header 检查                                                             |

P0–P2 是这次合并的最小完整交付；P3/P4 可分批，但 §9 的 i18n 清理不能推到后面（否则语言包长期腐坏）。
原 §5.1 的「用途修正」已随实测结论作废，不再是必须项。

## 12. 依赖变更

新增 `@noble/curves`（或体积更小的 `@noble/ed25519`，P1 用实际 bundle 报告取小者）。理由：Ed25519/X25519 在 WebCrypto
覆盖约 88%（老 Safari/Firefox 需回退），且 WireGuard 场景需要从任意私钥标量推导公钥；纯 JS 回退换取全浏览器一致输出。
不引入 `node-forge`（体积与维护性均劣）、不引入 `jose`（只需要导出 JWK 结构，不需要 JWS 编解码）。
`crypto-js` 保留（HMAC 迁移沿用，避免行为变更）。

## 13. P1 实施记录（写代码时新发现的，全部有测试锁死）

1. **OpenSSH 的 PEM 换行是 70 列，openssl 是 64 列**。RFC 7468 不强制列宽，但要对齐真实产物就必须可选，
   于是 `toPem(label, der, columns = 64)`，`sshPrivateKeyFile` 传 70。锁死点：ed25519 fixture 逐字节相等。
2. **MD5 不在 WebCrypto 的支持列表里**（只有 SHA-1/256/384/512），MD5 指纹只能走已在依赖中的 crypto-js。
3. **两处 DER 解析陷阱**：SEC1 `ECPrivateKey.privateKey` 是 OCTET STRING 而不是 INTEGER；
   RSA 的 `AlgorithmIdentifier` 第二个成员是 NULL，必须先看 tag 再决定按 OID 解析，否则空内容直接抛错。
4. **同一把密钥两次导出 OpenSSH 私钥文件文本不同**（那对随机 check 字节），所以测试断言必须比解析结果，
   不能比字符串。为此 `sshPrivateKeyFile` 接受注入 check 才能对 ssh-keygen 产物做逐字节断言。
5. **Ed25519 / X25519 全部走 noble**（同 seed 与 WebCrypto 逐字节一致，已实测），
   WebCrypto 只负责 RSA / ECDSA——省掉整套特性检测与双路径一致性测试。
6. **随机令牌的字符池实测 88 个字符**（符号表只有 26 个，不是我以为的 32），
   熵值改为从 `tokenCharsetSize()` 推导，避免把常量抄进 UI 与测试两处。
7. **BubbleBabble 从格式矩阵里删掉**：本机 OpenSSH 已经移除 `-E bubblebabble`，没有权威对照就不 ship 输出。
8. 收尾已做：三件旧工具的孤儿 i18n 键（zh/en 各 3 块）删除；`docs/design/功能介绍文档.md` 的加密分类从
   10 个工具改为 8 个。旧路径的托管层 301 与应用内 `redirectFrom` 均已撤除——开发阶段没有历史流量，
   不留无人访问的死配置（理由记在 §9）。
