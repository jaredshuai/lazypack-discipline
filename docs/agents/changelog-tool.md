# CHANGELOG 工具判定口径

本文是 `skills/lazypack-setup/templates/changelog.mjs` 的**唯一判定口径正文**。setup 把该脚本原样复制到目标仓 `scripts/changelog.mjs`；目标仓以此文件为准判断其输出状态，脚本帮助文本不复述规则细节。

脚本为 Node 标准库实现（`node:fs`、`node:child_process` 等），零 npm 依赖，要求 Node ≥ 18。

## 1. 能力边界（先说不做什么）

- 它编译的是「提交历史 → 一个新版本区段」，**不是**自动 changelog 服务。没有常驻进程，没有 hook，没有 CI 接线；命令不执行就什么都不发生。
- `release` 只**追加**一个新版本区段并维护文件末尾的链接引用块；除严格形态的 `[Unreleased]` 链接行外，不删改任何既有行。
- `check` 只判定 §3 列出的**机器可判定结构子集**。结构合规**不等于**条目由提交真实生成——手写文件可以伪造同样结构，本工具无法分辨来源真伪。
- 未接 hook/CI。不是门禁。存在本脚本不等于任何检查已生效。
- 本工具按 Node/宿主 `fs.stat` 语义判定目标是否为普通文件（见 §2 的 `not-run` 口径）；Windows 保留设备名（如 `NUL`、`CON`）不在其可判定范围，同一写法的判定与写入结果随宿主而定。

## 2. 子命令、状态与退出码

```
node changelog.mjs init    [--cwd <dir>] [--path <file>]
node changelog.mjs check   [--cwd <dir>] [--path <file>]
node changelog.mjs release --version <x.y.z> [--cwd <dir>] [--path <file>]
       [--date YYYY-MM-DD] [--from <ref>] [--to <ref>] [--tag <tag>]
       [--repo-url <url>] [--dry-run]
```

`--cwd` 默认当前目录；`--path` 默认 `CHANGELOG.md`（相对 `--cwd` 解析）。

| 命令 | 0 | 1 | 2 | 3 |
|---|---|---|---|---|
| init | `created` 已写入骨架 | `exists-kept` 文件已存在，未改动 | `not-run`（`--cwd` 非目录或不存在，或目标路径已存在但不是普通文件） | `exec-failed`（目标 `stat` 失败；参数、写盘错误） |
| check | `format-pass` | `format-fail` 结构违规 | `not-run`（`--cwd` 非目录或不存在，或文件缺失/不是普通文件） | `exec-failed`（目标 `stat` 或读取失败；非 UTF-8） |
| release | `released` | `refused` 语义拒绝（见 §4） | `not-run`（`--cwd` 非目录或不存在；文件缺失/不是普通文件；不在 git 工作树） | `exec-failed`（目标 `stat` 或读取失败；参数、git 或写盘错误） |

三档失败的区分口径：

- `not-run`：检查/生成本身没有执行的条件（前置不满足），不是「不通过」也不是「报错」。`check`/`release` 遇目标缺失（`ENOENT`/`ENOTDIR`）或不是普通文件（如目录）落这一档；`init` 对缺失目标走创建（退出码 0），仅「不是普通文件」落这一档；`--cwd` 不存在或非目录三者同落。
- `refused`：读取成功、可以判断，但语义上拒绝执行（不会留下半成品）。
- `exec-failed`：执行中出错；写盘经临时文件 + rename + 写后读回，失败时不留半成品。目标路径的 `stat` 或读取本身失败（除 `ENOENT`/`ENOTDIR` 外，如符号链接环 `ELOOP`、无权限 `EACCES`、超出 `fs.readFileSync` 上限的文件过大）也落这一档，读不到内容即属执行出错，不是前置不满足。

所有输出末尾附 JSON 摘要与同一声明：`未接 hook/CI。不是门禁。结构合规不等于条目由提交真实生成。`

## 3. `check` 判定的结构子集

以下违规任一出现即 `format-fail`。解析前先做 CommonMark 围栏剥离（反引号与波浪号，同符开闭），与 `scripts/check_doc_pairs.mjs` 的围栏口径一致。

1. 首个非空行必须是 `# Changelog`（大小写不敏感）。
2. `## [Unreleased]` 区段必须存在且恰好一次；必须出现在任何版本区段之前（按文件顺序）。
3. 每个版本头是且仅是 `## [x.y.z] - YYYY-MM-DD`；日期必须是真实日历日期；版本号不重复；版本区段必须按 SemVer 严格递减排列。
4. 区段内的三级分组标题只允许 `Added` `Changed` `Deprecated` `Removed` `Fixed` `Security` 六个；同一区段内分组不重复；分组标题出现在任何 `##` 区段之外记违规。
5. 列表条目（`- ` 或 `* ` 开头）只允许出现在六分组之内；直接挂在 `##` 区段下或前言区的条目记违规。分组内的非条目正文行（如一句话说明）不判违规。
6. 版本区段以外的其他二级标题（`## ` 开头且非 `[...]` 形态）记违规。
7. 链接引用行（`[label]: <url>` 形态）：`[Unreleased]` 的目标必须是 `<base>/compare/<ref>...HEAD`；`[x.y.z]` 的目标必须含 `compare/`、`releases/tag/` 或 `tree/`。其他 label 不判定。

## 4. `release` 的输入、映射与保护

### 输入与提交来源

- `--version <x.y.z>` 必填；`--to <ref>` 默认 `HEAD`；`--from <ref>` 缺省时用 `git describe --tags --abbrev=0 <to>` 取最近 SemVer 形态标签，无匹配则取全部历史。
- 提交经 `git log <range>` 真实读取；sha 取真实短哈希。**工具不虚构版本、日期或提交来源**：`--date` 缺省为运行当日，反推历史版本的日期须由调用方显式给出。
- `--cwd` 不在 git 工作树内 → `not-run`；`--to`/`--from` 不可解析 → `exec-failed`。

### 提交 → 分组映射

| 提交 type | 去向 |
|---|---|
| `feat` | `Added` |
| `fix` | `Fixed` |
| `perf` `refactor` `revert` | `Changed` |
| `build` `ci` `docs` `chore` `test` | 不列入（内部提交，计数报告） |
| 不符合 Conventional Commits 头形 | 不列入（非约定式，计数报告） |
| 其余合法 type | 不列入（未映射，计数报告） |

`type!:` 或正文含 `BREAKING CHANGE:` / `BREAKING-CHANGE:` 的提交在条目前缀 `**BREAKING**`。条目形态为 `- **<scope>:** <描述> (<sha7>)`（无 scope 时省略 scope 段）。相同条目去重。

### 生成与保护行为

- 版本区段插入在 `[Unreleased]` 区段之后、下一个 `##` 标题（或尾部链接块）之前；`[Unreleased]` 下已有的人工条目**保留原位**，不搬入新版本区段。
- 链接引用块维护**仅在**链接行连续位于文件末尾时生效：`--tag` 且能确定仓库 base URL（`--repo-url` 或既有 `[Unreleased]` 链接推断）时，把 `[Unreleased]` 指向 `compare/<tag>...HEAD`，并为新版本追加 `compare/<prevTag>...<tag>` 或 `releases/tag/<tag>` 链接；链接行分散在正文中、或无法确定 base 时，一律不触碰并在 info 中说明。
- 拒绝条件（`refused`，不写盘）：文件未通过 §3 结构子集判定（先人工修复再发版）；目标版本已存在；新版本不大于现有最新版本；缺少 `[Unreleased]` 区段。
- 既有文件从不被 `init` 覆盖（`exists-kept`）；写盘一律临时文件 + rename + 写后读回核验；`--dry-run` 只打印拟写内容。
- 文件原有换行符（CRLF/LF）按原样保持；`init` 新建文件用 LF。
- 既有文件的 UTF-8 BOM 按原样保持：读取时从原始字节判定（`TextDecoder` 默认剥离 BOM，不能靠解码结果判断），写回时补回并在 info 记 `bom: 已保留原有 UTF-8 BOM`；原本无 BOM 的文件不会被加上 BOM。写后读回核验同时比对 BOM 有无发生变化。

## 5. setup 装配口径

`CHANGELOG.md` **不是受管产物**（无 `lazypack:` 标记），setup 对它的处理是「播种 + 保护」，不是托管渲染：

- **新仓 / 缺失**：setup 将 `templates/changelog.mjs` 复制为 `scripts/changelog.mjs`，随后执行 `node scripts/changelog.mjs init` 生成骨架；`init` 返回 `exists-kept` 即视为保留成功（幂等 NO-OP）。若当前环境无法运行 Node，setup 只在报告中如实记「未执行」并给出命令，不手工伪造骨架。
- **已有 `CHANGELOG.md`**：原位保留；`init` 返回 `exists-kept`、字节不变；在 `docs/ARTIFACTS.md` 按真实状态登记；`scripts/changelog.mjs` 已存在时不覆盖（本地副本优先，报告中注明）。
- **setup 之后**：版本区段的生成完全由 `release` 在发版时触发；setup 本身不生成任何版本区段，不把「文件存在」描述为「已由提交生成」。

## 6. 与本仓门禁的关系

`check` 未接入本仓 hook 或 CI（本仓 `pre-commit` 模板只有 format/lint/type/test 四个槽位，不含 changelog 槽位）。是否把 `changelog.mjs check` 接为目标仓的门禁，是该仓项目层的决定，固定层与本文件不预设。
