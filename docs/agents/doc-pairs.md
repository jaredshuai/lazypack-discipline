# 本仓文档关系声明（§7.2 第一批）

本文件是本仓文档关系声明的唯一正文。固定层只规定机器拦能判定的几条，具体对子由项目层定义（[DECISIONS.md §7.2](../DECISIONS.md)）。本清单按 [§2.4](../DECISIONS.md) 落在本仓，不升格为所有接入仓的强制表，也不要求其他仓手填同一批对子。

每条声明只在下面出现一次。四个字段用全角冒号，检查器只认这四个名字：

| 字段 | 写什么 |
|---|---|
| 来源 | 对照从哪一份内容读起 |
| 目标范围 | 这条规则覆盖哪些目标，以及明确不覆盖什么 |
| 检查方式 | 机器如何判定。做不到的部分留给开工/收尾记录，不在这里假装已经核对 |
| 处理权限 | 检查之后允许做什么。允许只读报告，还是允许在目标范围内同步；什么必须交回用户。用完整句子写，检查器只要求非空，不解析句子 |

检查器：`node scripts/check_doc_pairs.mjs`（Node 标准库，只读）。它读取 `## 声明` 下的 `### P…` 标题，核对这些编号与脚本里已实现的检查一一对应，并要求每条四个字段都有正文。判定算法仍在脚本中，脚本不复述字段正文。全过退出码 0；任一违规非零，并同时给出 JSON 与人类可读摘要。未接 hook、CI 或定时器。检查器在磁盘上存在、可手动运行，不等于门禁已生效。

未写进 `## 声明` 的关系不在检查器范围内。PASS 只表示已声明且本轮实际跑过的条目在其检查方式下未发现差异。

## 何时运行

开工和收尾是否把这些声明列入检查，只写在 [freshness-check.md](freshness-check.md)。增删声明或修改任一字段后，先改本文件，再改 `scripts/check_doc_pairs.mjs` 里对应的实现。六个编号都是 PASS，只表示这些机器检查未发现差异；FAIL 不是已核验。

## 声明

层列均为本仓项目层（§2.4）。机器判定只使用路径、哈希、正则与存在性，不做语义理解。

### P1 固定层正文与 setup 快照字节同源

- **来源**：`docs/DECISIONS.md` 的原始字节
- **目标范围**：`skills/lazypack-setup/references/DECISIONS.md` 这一份快照。不含其他副本，也不判断固定层条文本身是否正确
- **检查方式**：两文件原始字节 SHA-256 必须相等。只用哈希，不做语义比较
- **处理权限**：只读报告。字节不一致时记失败。本声明不授权改写固定层正文或快照；要同步快照须另有固定层变更授权

### P2 固定层 git blob 与模板来源内容标识

- **来源**：`docs/DECISIONS.md` 的 `git hash-object` 结果（工作区文件，40 位小写十六进制）
- **目标范围**：下列 5 个 Markdown 模板正文中的「来源内容标识」必须与该 blob 一致。`skills/lazypack-setup/templates/pre-commit.sh` 只要求存在 `src=DECISIONS.md@<SemVer>` 戳，不要求来源内容标识。`ideas-inbox.md` 无托管块，不在本条内
  - `skills/lazypack-setup/templates/ARTIFACTS.md`
  - `skills/lazypack-setup/templates/CODING_STANDARDS.md`
  - `skills/lazypack-setup/templates/RELEASE.md`
  - `skills/lazypack-setup/templates/resident-entry.md`
  - `skills/lazypack-setup/templates/roles.md`
- **检查方式**：每个模板恰好抽出与 blob 相同的 40 位标识。hook 模板只检查版本戳存在
- **处理权限**：只读报告。标识或版本戳对不上时记失败。本声明不授权改模板或固定层

### P3 固定层版本字符串四处一致

- **来源**：`docs/DECISIONS.md` 文首 `版本：x.y.z`
- **目标范围**：
  1. `skills/lazypack-setup/SKILL.md` frontmatter 中的 `fixed layer (x.y.z)`
  2. `README.md` 中的「当前版本为 x.y.z」
  3. P2 所列 5 个 Markdown 模板与 `pre-commit.sh` 的 `src=DECISIONS.md@x.y.z`
- **检查方式**：四处 SemVer 字符串必须相同
- **处理权限**：只读报告。版本字符串不一致时记失败。本声明不授权改版本号

### P4 登记册相对链接可解析

- **来源**：`docs/ARTIFACTS.md` 内的标准 Markdown 内联相对链接（`[text](url)` / 图片链接）
- **目标范围**：这些链接在磁盘上的目标。带协议的 URL（含 `http(s):`、`file:`、`mailto:`、`ftp:`）、纯锚点，以及反引号中的叙事路径，不在本条内
- **检查方式**：去掉围栏代码与行内反引号后再抽链。围栏按 CommonMark 同时识别反引号与波浪号：开闭必须同一字符，关闭围栏长度不少于开启围栏，关闭行除空白外不能再有内容。一种围栏里的另一种标记不算结束。相对路径去掉 fragment 后相对本文件解析。普通文件 `size > 0`；目录至少有一个条目
- **处理权限**：只读报告。目标缺失或为空时记失败。改链接须另有本轮对登记册的授权，不因本条自动改其他文件

### P5 入口文件相对链接可解析

- **来源**：`AGENTS.md` 与 `README.md` 内的标准 Markdown 内联相对链接
- **目标范围**：这两个入口文件里的相对链接目标。抽链时跳过的协议 URL、围栏和行内反引号与 P4 相同，那些内容不在本条内
- **检查方式**：抽链规则与 P4 相同。本条只要求目标存在，不额外要求非空
- **处理权限**：只读报告。目标缺失时记失败。不因本条自动改入口正文

### P8 交接文档 CLI 与实现集合一致

- **来源**：`docs/agents/handoff-verification.md` §2 声明的子命令与 flag
- **目标范围**：`scripts/handoff_manifest.js` 的 CLI 解析分支（`command ===` + `getOption` / `hasFlag`）。§2 以外的章节和脚本里的其他函数不在本条内
- **检查方式**：从 §2 下全部 `### 2.x` 小节动态抽出子命令，不写死 2.1 / 2.2 或命令名。命令名取标题中恰好一个反引号命令名；否则取编号后的第一个命令名标记。该小节内的 `--flag` 组成该命令的 flag 集合。与实现侧集合双向比对：子命令集合相等，且每个子命令的 flag 集合相等。多余或缺失任一侧即失败
- **处理权限**：只读报告。集合不一致时记失败。不因本条自动改交接文档或脚本
