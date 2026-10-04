# 交付报告「用户体验与证据分层」规范 (report-layers.md)

本文件是交付报告与验收结论中「用户体验与证据分层」段落的唯一正文。它落实固定层 §7.5「交接只写亲自验证过的事实；未验证标未验证」在报告结构上的具体形态，不改写固定层条文。本规范源于两个已立项痛点：验收结论把测试编排前置条件混写为产品用户步骤（issue #32）；对标参考产品时只对照控制逻辑、未对照用户可见体验（issue #33）。

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

- reference_product: <参考产品名；无对标任务写 none>
- control_logic_status: <verified | partial | unverified | not-applicable>
- user_experience_status: <aligned | partial | different | unverified | not-applicable>
- product_user_step_count: <非负整数，必须等于下表 product_user_flow 行数>

### 步骤与交互点分层

| 步骤或事项 | 层标签 | 说明 | 证据 |
|---|---|---|---|
| <名称> | <四个层标签之一> | <一句话> | <命令、工件路径或 none> |

### 与参考产品的差异

| observed_difference | 影响 | 本轮范围 | 状态 |
|---|---|---|---|
| <差异描述> | <用户可见影响> | <in-scope / out-of-scope> | <resolved / open / accepted> |

- evidence: <可复核的命令、工件路径或 none>
- unverified_boundary: <未验证边界逐条列出；确无则写 none>
```

## 3. 字段与取值

### 3.1 层标签（「步骤或事项」行必填）

| 层标签 | 含义 | 规则 |
|---|---|---|
| `product_user_flow` | 产品用户流程中的真实步骤/交互点 | 计入 `product_user_step_count`；行文本不得出现测试编排、自动化脚本、前置条件、环境限制类词，否则按可疑错层判失败 |
| `operator_or_maintainer_flow` | 首次安装、发版、运维等维护者/操作者动作 | 不计入用户步骤，但属于真实人工操作 |
| `test_harness_prerequisite` | 测试编排、自动化工具自身的前置条件（如前台授权弹窗、夹具启动） | 严禁计入用户步骤，严禁写进用户体验结论 |
| `environment_limitation` | 环境或平台限制（系统版本、权限、未覆盖平台） | 严禁冒充产品交互 |

### 3.2 状态字段

- `control_logic_status`：`verified`（后端控制流已实测）/ `partial` / `unverified` / `not-applicable`。
- `user_experience_status`：`aligned`（与参考产品用户可见体验一致）/ `partial` / `different`（存在已确认差异）/ `unverified` / `not-applicable`。
- `control_logic_status: verified` 不蕴含 `user_experience_status: aligned`，两者分开判定、互不代替。

### 3.3 其余字段

- `reference_product`：对标任务的参考产品名；无对标任务写 `none`。`none` 时 `user_experience_status` 只能是 `unverified` 或 `not-applicable`；有参考产品时不得写 `not-applicable`。
- `observed_difference`：差异表行；`本轮范围` ∈ {`in-scope`, `out-of-scope`}，`状态` ∈ {`resolved`, `open`, `accepted`}。
- `product_user_step_count`：必须等于分层表中 `product_user_flow` 行数；测试编排前置条件与维护者操作不计入。
- `evidence`：可复核证据（命令、日志、工件路径）。`user_experience_status` 为 `aligned` / `partial` / `different` 时不得为 `none`；`aligned` 时不得仅含「仅静态」「未实跑」「未验证」类表述。
- `unverified_boundary`：本轮未覆盖范围，逐条写；确无写 `none`。占位开头（`待补充`、`未填写`、`todo`、`tbd`）按未填写判失败。
- `aligned` 的附加条件：`reference_product` 非 `none`、`evidence` 非 `none` 且非静态证据、不存在 `in-scope` 且未 `resolved` 的 `observed_difference`。

## 4. 校验器行为与状态词

- `check`：`format-pass`（0）/ `format-fail`（1）/ `not-run`（2，文件缺失）/ `exec-failed`（3，非法 UTF-8、参数错误等）。
- `init`：`created`（0）/ `exists-kept`（1，段落已存在，字节不重复追加）/ `not-run`（2，文件缺失；init 不代写报告正文）/ `exec-failed`（3）。
- 无分层段落时：报告含用户体验类声称词（同一行内未被否定词修饰的「用户体验/已对齐/全自动/零人工/人工操作/体验一致/参考产品/对标/交互点」等）判 `format-fail`；否则判 `format-pass`（校验器不判断报告是否需要该段落，这由 §1 规定并由人/流程执行）。
- 状态词不混淆：`format-fail` 不是 `未运行`；`unverified` 不是 `已对齐`；`exists-kept` 不是 `created`。

## 5. 示例

合规（#33 场景：控制逻辑已对齐、用户体验有差异、差异如实登记）：

```markdown
- reference_product: DSH Desktop
- control_logic_status: verified
- user_experience_status: different
- product_user_step_count: 1

### 步骤与交互点分层
| 步骤或事项 | 层标签 | 说明 | 证据 |
|---|---|---|---|
| 在 App 内点击「检查更新」 | product_user_flow | 用户触发更新的唯一入口 | gui_smoke 日志 |
| 运行安装器静默参数打包 | operator_or_maintainer_flow | 维护者发布动作 | build.ps1 |
| smoke 启动前点前台权限弹窗 | test_harness_prerequisite | Windows 前台锁下的编排闸门 | gui_smoke.mjs |
| 旧系统不支持任务栏角标 | environment_limitation | 系统限制非产品交互 | 现场记录 |

### 与参考产品的差异
| observed_difference | 影响 | 本轮范围 | 状态 |
|---|---|---|---|
| 安装向导仍需点 5 次 | 无法一键完成 | in-scope | open |
| 安装后需手动重启应用 | 多一次操作 | in-scope | resolved |

- evidence: node tools/gui_smoke.mjs 输出日志
- unverified_boundary: 真实低网速未测；macOS 未覆盖
```

反例（#32 场景，全部判 `format-fail`）：

- 把「smoke 启动前点前台权限弹窗」标为 `product_user_flow`：行文本含 `前台`/`弹窗` 与 smoke 词 → `suspicious-product-row`；且用户步骤数被虚增 → `product-step-count-mismatch`。
- `user_experience_status: aligned` 但 `reference_product: none` → `aligned-without-reference-product` / `reference-none-but-ux-aligned`。
- `user_experience_status: aligned` 但 `evidence: none` 或只有「仅静态检查」 → `aligned-without-evidence` / `aligned-with-static-only-evidence`。
- `user_experience_status: unverified` 但正文写「更新全自动完成」 → `ux-fact-claim-while-unverified`。
- 报告写「用户体验已对齐」但状态为 `different` → `ux-overclaim-outside-aligned-status`。
- `in-scope` 差异仍为 `open` 但状态写 `aligned` → `aligned-with-unresolved-in-scope-diffs`。

## 6. 边界（如实声明）

1. 本规范与校验器只做结构与词表层面的机器判定：错层标签、状态冲突、声称-状态不一致可拦；无法证明表格内容在语义上真实（行可以编造）。
2. 声称词与可疑词表是 lint 式启发式，否定语境已按「同句紧邻否定」豁免；仍可能误伤罕见措辞，误伤时按真实语意改写措辞或补层标签，不得为过检查而删去如实描述。
3. 校验器未接 hook/CI，是否纳入交付流程由项目层决定；本仓自身以手动运行收口。
4. 「需要分层段落」的触发由 §1 规定；校验器只在无声声称词时对缺段报告放行，不替人判断报告是否涉及用户体验。
5. 目标仓内派发的 `scripts/check_report_layers.mjs` 存在即保留不覆盖，本地副本与模板的版本差没有自动升级通道。
