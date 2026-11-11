# 单元契约与验证矩阵

本文说明 `skills/lazypack-setup/` 里的单元契约（`*.unit.json`）怎么写、校验器查什么、证据怎么收，以及验证矩阵怎么生成。字段定义来自 #110 的裁定，证据的 `platform` 字段和收录规则是 #111 实现时补的；两处与本文不一致时以本文和校验器为准。

矩阵在 [`skills/lazypack-setup/references/unit-matrix.md`](../../skills/lazypack-setup/references/unit-matrix.md)，由脚本生成，不手改。

## 契约放在哪里

| 位置 | 单元 | `kind` | `card` |
|---|---|---|---|
| `lazypack-core.unit.json`（skill 根目录） | 不属于任何配方的通用纪律产物：`templates/` 下的全部文件 | `core` | `SKILL.md` |
| `presets/<名字>.unit.json` | 同目录的质量门禁配方卡片 `<名字>.md` | `preset` | `<名字>.md` |
| `recipes/<名字>.unit.json` | 同目录的按需配方卡片 `<名字>.md` | `recipe` | `<名字>.md` |

契约只能放在这三处。`kind` 和 `card` 由位置决定，写错即失败。

## 字段

全部字段必填，不允许出现表里没有的字段。

| 字段 | 取值 | 含义 |
|---|---|---|
| `schema` | `lazypack-unit/1` | 契约格式版本 |
| `id` | 小写短横线写法 | `preset`、`recipe` 与卡片 frontmatter 的 `id` 相同；`core` 固定为 `lazypack-core` |
| `version` | `x.y.z` | `preset`、`recipe` 与卡片 frontmatter 的 `version` 相同；`core` 与 `references/DECISIONS.md` 的版本行相同 |
| `kind` | `core` / `preset` / `recipe` | 见上表 |
| `card` | 相对契约所在目录的路径 | 卡片文件 |
| `applies_when` | 探测数组，`core` 为空 | 适用的必要条件，全部为真才可能适用。只允许四种探测，见下 |
| `provides` | 非空的标签数组 | 提供的门禁槽（`format`、`lint`、`type`、`test`）或能力标签 |
| `files` | 数组，可为空 | 每项 `{source, target, mode, managed}`：`source` 相对 skill 根目录，`target` 相对目标仓根目录，`mode` 是 `"0644"` 或 `"0755"`，`managed` 表示写入时是否带托管块 |
| `verify` | 非空数组 | 每项 `{command, expect_exit, cwd}`：`command` 非空，`cwd` 是 `target-root` 或 `files[].target` 里出现的某个目录 |
| `evidence` | 数组，可为空 | 每项 `{kind, platform, environment, date, unit_version, scope, source}`，见「证据」一节 |
| `rules` | 非空数组 | 口径所在的章节，写成 `<文件> §<章节号>`，文件相对契约所在目录 |

`applies_when` 的四种探测：

- `{"probe": "path-exists", "path": "pyproject.toml"}`
- `{"probe": "path-absent", "path": "poetry.lock"}`
- `{"probe": "command-exists", "command": "uv"}`
- `{"probe": "json-field", "path": "package.json", "field": "devDependencies.vitest", "exists": true}`

契约只放可判定的事实。优先级、受限分支怎么处理、报告怎么措辞，都留在卡片正文，契约用 `rules` 指过去，不抄一份。

## 校验器查什么

`node skills/lazypack-setup/scripts/unit_contracts.mjs check` 检查下面五类，`package_manifest.mjs check` 把它作为第六项 `units` 一并运行：

1. 字段：齐全、类型和取值合法、没有多余字段。
2. 引用：`card`、每个 `files[].source`、`rules` 指向的文件都在包内；`rules` 的章节号在该文件里恰好对应一个二级或三级标题。更深的标题常在小节内从 1 重新编号，不参与；代码围栏里的不算。
3. 版本：`id`、`version` 与卡片 frontmatter 或固定层版本逐字相同。
4. 覆盖：`presets/`、`recipes/` 下每张卡片都有契约；`templates/`、`assets/` 下每个文件都被某份契约的 `files[].source` 引用；`lazypack-core.unit.json` 存在。
5. 矩阵：提交的 `references/unit-matrix.md` 与按当前契约生成的内容一致。

回归测试是 `scripts/test_unit_contracts.mjs`，随 `tests.yml` 运行。

## 证据

### 字段

| 字段 | 取值 |
|---|---|
| `kind` | `host-acceptance`（真实环境里的验收）或 `fixture-test`（自动测试在本仓夹具上运行） |
| `platform` | `linux` / `windows` / `macos`，决定这条证据落在矩阵的哪一列 |
| `environment` | 一行文字，写到能复现的程度：系统版本、运行时版本、AI 宿主 |
| `date` | `YYYY-MM-DD`，验收或测试实际运行的日期 |
| `unit_version` | 当时被验的单元版本。与契约当前的 `version` 不同时，矩阵格子标「旧版」 |
| `scope` | 一行文字，写清证明了什么、没证明什么 |
| `source` | 公开出处的链接，见下 |

矩阵的列是操作系统，不是 AI 宿主。现有记录的差别主要在系统上，宿主写在 `environment` 里。

### 收录规则

一条记录同时满足下面三条才能写进契约：

1. **已经发生。** 不为了让矩阵好看补写没有发生过的验收。
2. **实跑过这个单元。** 至少实跑过该单元 `verify` 里的一条命令，或实跑过该单元 `files` 里的文件：运行其中的脚本，或走过复制、写入路径。只读了代码、只跑了别的单元的测试，都不算。
3. **有公开出处。** `source` 只接受三种链接：GitHub issue 评论（`…/issues/<n>#issuecomment-<id>`）、PR 评论（`…/pull/<n>#issuecomment-<id>` 或 `…#discussion_r<id>`）、Actions 运行或作业（`…/actions/runs/<id>` 或 `…/actions/runs/<id>/job/<id>`）。本机文件路径、没有评论锚点的 issue 链接都不接受。

总体失败的验收不作为证据。部分通过的验收可以收，`scope` 里写明通过的是哪一部分。

校验器只检查链接的写法，不联网核对链接能不能打开、内容是否支持 `scope` 的说法。这两点靠评审时人工点开核对。

### 怎么加一条证据

1. 在对应的 `*.unit.json` 的 `evidence` 里加一项。
2. 在 `skills/lazypack-setup/` 下依次运行 `node scripts/unit_contracts.mjs matrix` 和 `node scripts/package_manifest.mjs generate`。
3. 运行 `node scripts/package_manifest.mjs check`，再提交契约、矩阵和 `MANIFEST.json`。

改卡片版本、增删 `templates/` 或 `assets/` 下的文件时也按这三步走：先改契约，再重新生成。

## 已知局限

- **`applies_when` 只是必要条件的子集。** 四种探测表达不了的条件没有进契约，例如 App Shell 要求 Node 主版本为 24、TypeScript 配方要求「有 `tsconfig.json` 或有 `.ts` 源码」。是否适用以卡片正文为准，契约里的条件全部为真不等于适用。
- **App Shell 的 `target` 相对的是配方 §2 说的「新建或空的前端目录」。** 这个目录可能就是目标仓根，也可能是它的子目录。其余单元的 `target` 都相对目标仓根。
- **`core` 的版本取固定层版本。** `templates/` 下的文件没有自己的版本号，改了模板而固定层版本没变时，契约版本不会变，旧证据也不会被标成「旧版」。
- **校验器不运行 `verify` 里的命令。** 它只保证命令非空、退出码和目录写法合法。命令能不能跑，由证据说明。
- **Hook 出处行与契约的一致是间接保证的。** 校验器保证契约的 `id`、`version` 与卡片 frontmatter 相同；出处行由卡片 frontmatter 写出，净室安装测试整行核对。校验器本身不读任何 Hook。
- **`provides` 的标签没有登记表。** 校验器只查写法和不重复，不查标签是否为已知的槽位或能力名。

## 没有收进矩阵的历史记录

#111 回填证据时核对过下面这些记录，都没有收：

| 记录 | 没收的原因 |
|---|---|
| #19（`check_commit_msg.mjs` 支持显式规则文件参数） | 验的是本仓的提交信息检查器，不对应任何单元 |
| #27（安全审查试点） | 验的是交付流程，不对应任何单元 |
| README 写的「AGY / Windows 限定沙箱验证」（文档迁移引擎） | 原始记录是本机文件，没有公开出处；文档迁移引擎在 `scripts/` 下，也不是单元 |
| #85（2026-10-17 真实项目安装验收） | 总体判定为失败 |
| PR #88 里的失败验收 | 判定为失败 |
| PR #103 里 App Shell 1.0.0 的验收评论（2026-10-29） | 回填时没有逐条核对内容，不写；该单元已有 1.0.1 的两条记录 |
| 净室安装测试之于两个门禁配方 | 测试把配方的命令写进了 Hook，但不安装依赖、不运行门禁命令，没有实跑配方的 `verify`。它算 `lazypack-core` 的夹具测试，不算配方的 |

两个门禁配方因此在矩阵里三列都是「未验证」。这表示没有可公开核对的记录，不表示它们不能用。
