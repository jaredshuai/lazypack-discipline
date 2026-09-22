# 本仓文档对子（§7.2 第一批）

本文件是本仓「改了 X 却没动 Y」对子清单的唯一正文。固定层只规定机器拦能判定的几条、具体对子由项目层定义（[DECISIONS.md §7.2](../DECISIONS.md)）。本清单按 [§2.4](../DECISIONS.md) 落在本仓，不升格为所有接入仓的强制表。

检查器：`node scripts/check_doc_pairs.mjs`（Node 标准库，只读）。全过退出码 0；任一违规非零，并同时给出 JSON 与人类可读摘要。未接 hook、CI 或定时器。检查器在磁盘上存在、可手动运行，不等于门禁已生效。

脚本头部只放指向本文件的指针，不复述下列定义。

## 何时运行

1. 改动固定层正文、模板来源戳、登记册链接、入口指针或交接 CLI 后，在仓库根运行上述命令。
2. 六条均为 PASS 即完成；FAIL 时按输出中的来源与差异处理，不把失败记成已核验。
3. 增删对子或改判定方法时先改本文件，再改脚本。

## 对子

层列均为本仓项目层（§2.4）。机器判定只使用路径、哈希、正则与存在性，不做语义理解。

### P1 固定层正文与 setup 快照字节同源

- **X**：`docs/DECISIONS.md`
- **Y**：`skills/lazypack-setup/references/DECISIONS.md`
- **判定**：两文件原始字节 SHA-256 必须相等。

### P2 固定层 git blob 与模板来源内容标识

- **X**：`docs/DECISIONS.md` 的 `git hash-object` 结果（工作区文件，40 位小写十六进制）
- **Y**：下列 5 个 Markdown 模板正文中的「来源内容标识」必须与该 blob 一致：
  - `skills/lazypack-setup/templates/ARTIFACTS.md`
  - `skills/lazypack-setup/templates/CODING_STANDARDS.md`
  - `skills/lazypack-setup/templates/RELEASE.md`
  - `skills/lazypack-setup/templates/resident-entry.md`
  - `skills/lazypack-setup/templates/roles.md`
- **判定**：每个模板恰好抽出与 blob 相同的 40 位标识。`skills/lazypack-setup/templates/pre-commit.sh` 只要求存在 `src=DECISIONS.md@<SemVer>` 戳，不要求来源内容标识。`ideas-inbox.md` 无托管块、不在本对子内。

### P3 固定层版本字符串四处一致

- **X**：`docs/DECISIONS.md` 文首 `版本：x.y.z`
- **Y**：
  1. `skills/lazypack-setup/SKILL.md` frontmatter 中的 `fixed layer (x.y.z)`
  2. `README.md` 中的「当前版本为 x.y.z」
  3. P2 所列 5 个 Markdown 模板与 `pre-commit.sh` 的 `src=DECISIONS.md@x.y.z`
- **判定**：四处 SemVer 字符串必须相同。

### P4 登记册相对链接可解析

- **X**：`docs/ARTIFACTS.md` 内的标准 Markdown 内联相对链接（`[text](url)` / 图片链接）
- **Y**：链接目标在磁盘上存在且非空
- **判定**：去掉围栏代码与行内反引号后再抽链。围栏按 CommonMark 同时识别反引号与波浪号：开闭必须同一字符，关闭围栏长度不少于开启围栏，关闭行除空白外不能再有内容。一种围栏里的另一种标记不算结束。跳过带协议的 URL（含 `http(s):`、`file:`、`mailto:`、`ftp:`）与纯锚点。相对路径去掉 fragment 后相对本文件解析。普通文件 `size > 0`；目录至少有一个条目。反引号中的叙事路径不是链接，不检查。

### P5 入口文件相对链接可解析

- **X**：`AGENTS.md` 与 `README.md` 内的标准 Markdown 内联相对链接
- **Y**：链接目标存在
- **判定**：抽链规则与 P4 相同（同样跳过协议 URL、两种围栏与行内反引号）。本条只要求目标存在，不额外要求非空。

### P8 交接文档 CLI 与实现集合一致

- **X**：`docs/agents/handoff-verification.md` §2 声明的子命令与 flag
- **Y**：`scripts/handoff_manifest.js` 的 CLI 解析分支（`command ===` + `getOption` / `hasFlag`）
- **判定**：从 §2 下全部 `### 2.x` 小节动态抽出子命令，不写死 2.1 / 2.2 或命令名。命令名取标题中恰好一个反引号命令名；否则取编号后的第一个命令名标记。该小节内的 `--flag` 组成该命令的 flag 集合。与实现侧集合双向比对：子命令集合相等，且每个子命令的 flag 集合相等。多余或缺失任一侧即 FAIL。
