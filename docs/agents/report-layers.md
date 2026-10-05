# 交付报告「用户体验与证据分层」规范 (report-layers.md)

本文件是交付报告与验收结论中「用户体验与证据分层」段落的唯一正文。它落实固定层 §7.5「交接只写亲自验证过的事实；未验证标未验证」在报告结构上的具体形态，不改写固定层条文。本规范源于两个已立项痛点：验收结论把测试编排前置条件混写为产品用户步骤（issue #32）；对标参考产品时只对照控制逻辑、未对照用户可见体验（issue #33）。本版为 v2：在 v1 结构之上补齐五个已复现的绕行缺口——产品步骤改标前置条件、维护者步骤混入产品步骤、中性措辞前置条件冒充产品步骤、unverified 状态写「已对齐」、`control_logic_status: verified` 无控制逻辑证据。

配套机器校验器：随包派发的 `scripts/check_report_layers.mjs`（本仓模板源在 `skills/lazypack-setup/templates/check_report_layers.mjs`）。结构合规不等于报告陈述在语义上真实；校验器未接 hook/CI，不是门禁。

## 1. 何时必须写分层段落

交付报告或验收结论满足以下任一条件时，必须包含本文 §2 的完整段落，且通过 `check` 为 `format-pass` 才能按「已交付」陈述：

1. 报告中出现「需要人工操作 / 点击 / 授权」类描述——每次出现都必须归入 §3 的某一类，不允许不带层标签；
2. 任务是「对标、吸收或复刻参考产品」的体验或流程——必须填写 `reference_product` 并对 `control_logic_status` 与 `user_experience_status` 分别判定；
3. 报告对用户体验下结论（含「全自动」「零人工」「一键完成」等措辞）。

只有静态检查（语法、类型、死链）证据时，不得生成「真实体验已通过」结论；`user_experience_status` 只能为 `unverified` 或 `not-applicable`，并在 `unverified_boundary` 写明缺什么。

## 2. 规范段落（唯一形态）

骨架由 `node scripts/check_report_layers.mjs init --file <report.md>` 在报告末尾追加；已存在时返回 `exists-kept` 不重复追加、不改写既有正文。播种后的骨架故意不能通过 `check`（`unverified_boundary` 为 `待补充`），填写完毕前不得当作已核验。

```markdown
## 用户体验与证据分层

- reference_product: <参考产品名 | none>
- control_logic_status: <verified | partial | unverified | not-applicable>
- user_experience_status: <aligned | partial | different | unverified | not-applicable>
- product_user_step_count: <非负整数>
- harness_paths: <逗号分隔的仓内相对路径或目录前缀（目录以 / 结尾） | none>
- maintainer_paths: <同上 | none>
- layer_review_status: <reviewed | not-reviewed>
- layer_review_basis: <审查人与审查依据 | none>
- control_evidence: <控制逻辑证据 | none>
- ux_evidence: <用户可见体验证据 | none>
- evidence: <其他证据索引 | none>
- unverified_boundary: <逐条 | none>

### 步骤与交互点分层

| 步骤或事项 | 层标签 | 路径 | 说明 | 来源 |
|---|---|---|---|---|

### 双方步骤对照

| 路径 | 一方 | 交互点数 | 步骤 | 来源 |
|---|---|---|---|---|

### 与参考产品的差异

| observed_difference | 影响 | 本轮范围 | 状态 |
|---|---|---|---|
```

十二个必填字段顺序即上表；`none` 是合法值不算缺失，占位开头（`待补充`、`未填写`、`todo`、`tbd`）按未填写判失败。旧版 4 列步骤表（`| 步骤或事项 | 层标签 | 说明 | 证据 |`）是非法格式，校验器以 `legacy-steps-table-format` 明确拒绝，不静默解析。校验器定位段落时跳过 ``` / ~~~ 围栏代码块内部的行：围栏内的 `## 用户体验与证据分层` 示例不计入段落，不触发 `duplicate-layer-section`，也不能代替真实填写。

## 3. 字段与取值

### 3.1 层标签（「步骤或事项」行必填）

| 层标签 | 含义 | 规则 |
|---|---|---|
| `product_user_flow` | 产品用户流程中的真实步骤/交互点 | 计入 `product_user_step_count`；「路径」列必填 `normal` 或 `exception`；行文本不得出现测试编排、自动化脚本、前置条件、环境限制类词，否则按可疑错层判失败；来源不得落在 `harness_paths` 或 `maintainer_paths` 内 |
| `operator_or_maintainer_flow` | 首次安装、发版、运维等维护者/操作者动作 | 不计入用户步骤，但属于真实人工操作；「路径」列填 `-`；至少一个来源须落在 `maintainer_paths` 内 |
| `test_harness_prerequisite` | 测试编排、自动化工具自身的前置条件（如前台授权弹窗、夹具启动） | 严禁计入用户步骤，严禁写进用户体验结论；「路径」列填 `-`；至少一个来源须落在 `harness_paths` 内 |
| `environment_limitation` | 环境或平台限制（系统版本、权限、未覆盖平台） | 严禁冒充产品交互；「路径」列填 `-`；来源允许 `none`，不做路径类判定 |

「路径」列含义：`normal` = 正常路径步骤，`exception` = 异常分支步骤；两者分开计数——`product_user_step_count` 是全部 `product_user_flow` 行数，而 `### 双方步骤对照` 中 `project` 一侧的交互点数按路径分开核对（`normal` 行对照正常路径的 product_user_flow 行数，`exception` 行对照异常分支行数）。非产品行一律填 `-`。

「来源」列：按 `;` 或 `；` 分隔的仓内相对路径，可带 `:行号`、`:行号-行号` 或 `#锚点` 后缀与说明文字（路径记号取第一个空白前的部分）。行号与锚点可组合（`src/x.js:12#anchor`）；先剥锚点再剥行号，两种后缀同时出现也正确解析。只允许 `environment_limitation` 行写 `none`；绝对路径与含 `..` 的写法判失败；每个路径记号必须相对 `--cwd` 真实存在。

### 3.2 双方步骤对照（「路径 | 一方 | 交互点数 | 步骤 | 来源」）

`一方` 取 `reference`（参考产品侧）或 `project`（本产品侧）；同一 `(路径, 一方)` 只允许一行。`交互点数` 为非负整数或 `unobserved`（未实际观察）。`project` 行来源按 §3.1 来源列规则校验且不允许 `none`，为整数时必须等于该路径下 `product_user_flow` 行数；`reference` 行来源可为任意非空文本，但交互点数为整数时不得为 `none` 或占位。`reference_product: none` 时不允许出现 `reference` 行。

### 3.3 状态字段

- `control_logic_status`：`verified`（后端控制流已实测）/ `partial` / `unverified` / `not-applicable`。
- `user_experience_status`：`aligned`（与参考产品用户可见体验一致）/ `partial` / `different`（存在已确认差异）/ `unverified` / `not-applicable`。
- `control_logic_status: verified` 不蕴含 `user_experience_status: aligned`，两者分开判定、互不代替。
- `layer_review_status`：`reviewed`（已按 §6 人工审查项逐条核过）/ `not-reviewed`。`reviewed` 时 `layer_review_basis` 必填（审查人与审查依据）。

### 3.4 路径类与其余字段

- `reference_product`：对标任务的参考产品名；无对标任务写 `none`。`none` 时 `user_experience_status` 只能是 `unverified` 或 `not-applicable`；有参考产品时不得写 `not-applicable`。
- `harness_paths` / `maintainer_paths`：逗号或中文逗号分隔的仓内相对路径；每个条目必须相对 `--cwd` 真实存在；以 `/` 结尾的项按目录前缀匹配，否则精确相等；写 `none` 表示本轮不声明该路径类。路径比较统一做 `\`→`/`、posix 规范化（去掉 `./` 段、合并连续 `/`）与大小写不敏感归一化，`./tools/x`、`.//tools/./x`、`Tools/x` 与 `tools/x` 视为同一路径；来源路径含空格不受支持（路径记号取第一个空白前部分）。**条目可带 `#锚点` 后缀**（如 `src/updater.js#harness`），此时存在性检查按去锚点的文件部分进行，归属判定要求来源与该条目命中**同一锚点**；不带锚点的条目按前缀/精确匹配，可命中任何锚点。这是同一文件跨层引用时的声明办法：带锚点的条目只约束该锚点，同文件的另一个锚点不受约束。同一文件同时承载多层内容时不能整体列入路径类，需按更细的文件或锚点划分，属人工审查。**锚点是否存在不校验**（机器只比较字符串相等），属 §6 人工审查项。声明不实按 §6 人工审查发现，不由机器担保。
- `observed_difference`：差异表行；`本轮范围` ∈ {`in-scope`, `out-of-scope`}，`状态` ∈ {`resolved`, `open`, `accepted`}。
- `product_user_step_count`：必须等于分层表中 `product_user_flow` 行数；测试编排前置条件与维护者操作不计入。
- `control_evidence`：控制逻辑证据（实跑命令、日志、工件）。`control_logic_status` 为 `verified`/`partial` 时必填；`verified` 时不得仅含「仅静态」「未实跑」「未验证」类表述。
- `ux_evidence`：用户可见体验证据（实击观察、录屏、双方对照结果）。`user_experience_status` 为 `aligned`/`partial`/`different` 时必填；与 `control_evidence` 空白归一后不得相同——控制逻辑证据不能冒充体验证据。
- `evidence`：其他证据索引；必填字段，`none` 合法，不再承担 aligned/partial/different 的证据判定。
- `unverified_boundary`：本轮未覆盖范围，逐条写；确无写 `none`。占位开头按未填写判失败。
- `aligned` 的附加条件：`reference_product` 非空、`ux_evidence` 非空且非静态、无 `in-scope` 且未 `resolved` 的差异、`layer_review_status: reviewed`、normal 路径双方均为整数交互点、任一路径一侧有整数另一侧也必须有整数、同路径双方整数相等。
- `partial`/`different` 且有参考产品时：normal 路径双方交互点数必须都是整数（reference 侧未观察时先标 `unverified`，不许写 `different`）。

## 4. 校验器行为、状态词与全部失败码

- `check`：`format-pass`（0）/ `format-fail`（1）/ `not-run`（2，文件缺失）/ `exec-failed`（3，非法 UTF-8、参数错误等）。
- `init`：`created`（0）/ `exists-kept`（1，段落已存在，字节不重复追加）/ `not-run`（2，文件缺失；init 不代写报告正文）/ `exec-failed`（3）。
- 无分层段落时：报告（剥离代码块、引用行、行内代码与成对引号后的文本）含用户体验类声称词判 `format-fail`（`missing-layer-section-with-ux-claims`）；否则判 `format-pass`（校验器不判断报告是否需要该段落，这由 §1 规定并由人/流程执行）。
- 状态词不混淆：`format-fail` 不是 `未运行`；`unverified` 不是 `已对齐`；`exists-kept` 不是 `created`。

`format-fail` 的 `reason` 由下列确定性失败码组成（分号分隔；`=` 后为违规实参）：

- 段落与小节：`duplicate-layer-section`、`missing-steps-subsection`、`missing-steps-table`、`missing-compare-subsection`、`missing-compare-table`、`missing-diffs-subsection`、`missing-diffs-table`、`legacy-steps-table-format`。
- 字段：`missing-or-unfilled-fields=`、`bad-control_logic_status=`、`bad-user_experience_status=`、`bad-layer_review_status=`、`bad-product_user_step_count=`。
- 步骤行：`bad-step-row=`、`bad-layer-tag=`、`bad-step-path=`、`non-product-row-has-path=`、`suspicious-product-row=`。
- 来源与路径类：`missing-source=`、`source-not-relative=`、`source-path-missing=`、`bad-path-class-entry=`、`path-class-entry-missing=`、`harness-row-source-outside-harness-paths=`、`maintainer-row-source-outside-maintainer-paths=`、`product-row-source-in-harness-paths=`、`product-row-source-in-maintainer-paths=`。
- 计数：`product-step-count-mismatch`。
- 对照表：`bad-compare-row=`、`bad-compare-path=`、`bad-compare-side=`、`bad-compare-count=`、`duplicate-compare-row=`、`reference-row-without-source=`、`project-count-mismatch`、`reference-none-but-reference-rows`。
- 差异行：`bad-diff-row=`、`bad-diff-scope=`、`bad-diff-state=`。
- 状态与证据：`control-verified-without-control-evidence`、`control-partial-without-control-evidence`、`control-verified-with-static-only-evidence`、`aligned-without-ux-evidence`、`partial-without-ux-evidence`、`different-without-ux-evidence`、`control-and-ux-evidence-identical`、`aligned-without-reference-product`、`aligned-with-static-only-evidence`、`aligned-with-unresolved-in-scope-diffs=`、`aligned-without-layer-review`、`aligned-without-two-sided-comparison`、`aligned-but-interaction-count-differs`、`partial-without-two-sided-comparison`、`different-without-two-sided-comparison`、`reference-none-but-ux-<状态>`、`reference-present-but-ux-not-applicable`、`layer-review-without-basis`。
- 声称扫描：`ux-overclaim-outside-aligned-status`、`ux-fact-claim-while-unverified`、`missing-layer-section-with-ux-claims`。

## 5. 示例

合规（DSH Desktop 对标场景：控制逻辑已实测、体验存在已确认差异、双方步骤对照已填；示例在围栏代码块内，校验器不计为段落）：

```markdown
## 用户体验与证据分层

- reference_product: DSH Desktop
- control_logic_status: verified
- user_experience_status: different
- product_user_step_count: 3
- harness_paths: tools/gui/
- maintainer_paths: tools/release/
- layer_review_status: reviewed
- layer_review_basis: 维护者逐行核对层标签、路径声明与来源，2026-10-04
- control_evidence: node tools/gui/gui_smoke.mjs 输出日志 exit 0；src/updater.js 只读核对
- ux_evidence: DSH Desktop 与本产品实击对照录屏 2026-10-04；双方步骤对照表
- evidence: tools/gui/gui_smoke.log
- unverified_boundary: 真实低网速未测；macOS 未覆盖

### 步骤与交互点分层

| 步骤或事项 | 层标签 | 路径 | 说明 | 来源 |
|---|---|---|---|---|
| 在 App 内点击「检查更新」 | product_user_flow | normal | 用户触发更新的唯一入口 | src/updater.js |
| 确认框选「是」 | product_user_flow | normal | 可选更新确认一次 | src/updater.js |
| 升级失败重试弹窗 | product_user_flow | exception | 仅异常分支出现 | src/updater.js |
| 运行安装器静默参数打包 | operator_or_maintainer_flow | - | 维护者发布动作 | tools/release/build.ps1 |
| smoke 启动前点前台权限弹窗 | test_harness_prerequisite | - | 编排闸门 | tools/gui/gui_smoke.mjs |
| 旧系统不支持任务栏角标 | environment_limitation | - | 系统限制非产品交互 | none |

### 双方步骤对照

| 路径 | 一方 | 交互点数 | 步骤 | 来源 |
|---|---|---|---|---|
| normal | reference | 2 | 点击检查更新；确认一次 | 实击观察记录 2026-10-03 |
| normal | project | 2 | 同上两步 | src/updater.js |
| exception | reference | unobserved | 本轮未触发异常分支 | none |
| exception | project | 1 | 失败重试弹窗 | src/updater.js |

### 与参考产品的差异

| observed_difference | 影响 | 本轮范围 | 状态 |
|---|---|---|---|
| 安装向导仍需点 5 次 | 无法一键完成 | in-scope | open |
| 安装后需手动重启应用 | 多一次操作 | in-scope | resolved |
```

反例（v1 已复现的五个绕行缺口，v2 全部判 `format-fail`）：

- 产品步骤改标前置条件：「在 App 内点击检查更新」标 `test_harness_prerequisite`、来源写 `src/updater.js` → `harness-row-source-outside-harness-paths`（harness 行来源不在 `harness_paths` 内）。
- 维护者发版标产品步骤：「维护者运行 build.ps1 打包」标 `product_user_flow`、来源 `tools/release/build.ps1` → `product-row-source-in-maintainer-paths`。
- 中性措辞前置条件标产品步骤：「启动时确认一次授权」标 `product_user_flow`、来源 `tools/gui/gui_smoke.mjs` → `product-row-source-in-harness-paths`（措辞中性时仍被来源归属拦下）。
- `user_experience_status: unverified` 但正文写「流程已对齐」 → `ux-fact-claim-while-unverified`（`已对齐` 已入 FACT_CLAIM 词表；仅当同一行在讲 `控制逻辑` 且不提 `体验` 时该次命中豁免）。
- `control_logic_status: verified` 但 `control_evidence: none` → `control-verified-without-control-evidence`；`verified` 且证据只有「仅静态检查」 → `control-verified-with-static-only-evidence`。

其余既有反例仍然拦截：`aligned` 但 `reference_product: none` → `aligned-without-reference-product` / `reference-none-but-ux-aligned`；`aligned` 但 `layer_review_status: not-reviewed` → `aligned-without-layer-review`；`aligned` 但 normal 路径任一方为 `unobserved` → `aligned-without-two-sided-comparison`；同路径双方交互点数不等 → `aligned-but-interaction-count-differs`；`in-scope` 差异仍为 `open` 但状态写 `aligned` → `aligned-with-unresolved-in-scope-diffs`。

## 6. 机器判定与人工审查分工

机器：R1–R9（§4 全部失败码对应的确定性判定）。人工（记录在 `layer_review_status` / `layer_review_basis`）：每行层标签是否符合事实；`harness_paths`/`maintainer_paths` 声明是否如实划分；来源文件是否真的支撑该行；参考产品一侧步骤是否亲自观察；自由文本（说明、差异描述）的语义；引用豁免是否被滥用（把自己的结论包进引号）。

| 分工 | 范围 | 依据 |
|---|---|---|
| 机器（`check` 确定性判定） | R1–R9：字段与枚举、小节与表结构、层标签词法、路径列、来源存在性与路径类归属、计数一致、对照表形状、状态-证据组合、声称词扫描 | §4 全部失败码；`format-pass` 只表示这些结构判定未发现违规 |
| 人工（`layer_review_status: reviewed` 时须在 `layer_review_basis` 写明） | 每行层标签是否符合事实 | 机器只查词法与路径归属，行可以编造 |
| 人工 | `harness_paths`/`maintainer_paths` 声明是否如实划分 | 路径存在不等于归类真实；带锚点的条目只按字符串比对，锚点是否存在不校验 |
| 人工 | 来源文件是否真的支撑该行 | 存在性通过不等于内容支撑结论 |
| 人工 | 参考产品一侧步骤是否亲自观察 | `reference` 行来源可为自由文本，机器不判真伪 |
| 人工 | 自由文本（说明、差异描述）的语义 | 机器不理解自然语言含义 |
| 人工 | 引用豁免是否被滥用（把自己的结论包进引号） | 成对引号内文本被剥离出声称扫描，可被故意利用 |

`aligned` 必须以 `layer_review_status: reviewed` 为前提（`aligned-without-layer-review`）：没有人工审查记录时，机器结构合规不足以支撑体验级结论。

## 7. 边界（如实声明）

1. 本规范与校验器只做结构与词表层面的机器判定：错层标签、路径类归属、状态-证据组合、声称-状态不一致可拦；无法证明表格内容在语义上真实（行可以编造）。
2. 声称词与可疑词表是 lint 式启发式，否定语境已按「同句紧邻否定」豁免；仍可能误伤罕见措辞，误伤时按真实语意改写措辞或补层标签，不得为过检查而删去如实描述。
3. 声称扫描前会剥离围栏代码块、`>` 引用行、行内代码与成对引号片段；引号豁免可被滥用——把自己的结论包进引号即可躲过扫描，该风险列入 §6 人工审查项。
4. `harness_paths`/`maintainer_paths` 是声明式划分：存在性与归属匹配由机器判定，声明本身是否如实需人工核实。
5. 来源路径存在不等于来源内容支撑该行结论；路径声明需人工核实后才算数。
6. 校验器未接 hook/CI，是否纳入交付流程由项目层决定；本仓自身以手动运行收口。
7. 「需要分层段落」的触发由 §1 规定；校验器只在无声声称词时对缺段报告放行，不替人判断报告是否涉及用户体验。
8. 目标仓内派发的 `scripts/check_report_layers.mjs` 存在即保留不覆盖，本地副本与模板的版本差没有自动升级通道；v1 格式段落在 v2 校验器下以 `legacy-steps-table-format` 拒绝，需按 §2 迁移。
