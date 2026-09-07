<!-- lazypack:start block=release-discipline src=DECISIONS.md@0.2.0 gen=__GEN__ input=__INPUT__ fp=__FP__ -->
# 发版与提交纪律 (RELEASE)

> 派生自 lazypack-discipline 固定层 DECISIONS.md@0.2.0（依据 lazypack-setup 内置快照编译，来源内容标识: 2b38b1b0543489226eda5e3bd2bf411c58c1c331；离线事实源查阅 lazypack-setup/references/DECISIONS.md）§5。

## 1. 提交与版本规则（固定段）

### 1.1 提交头 (Conventional Commits 1.0.0)
- 格式：`type(scope)!: 描述`
- 允许的 8 个 Angular type：`build`, `ci`, `docs`, `feat`, `fix`, `perf`, `refactor`, `test`，加上 `chore`, `revert`。
- 破坏性改动使用 `!` 或正文注明 `BREAKING CHANGE`。
- 脚注使用 `Closes #n` 或 `Fixes #n` 关联票据。

### 1.2 提交正文 (Google CL 规范)
- 第一行独立说清「改了什么」。
- 正文说清「为什么做此改动」、有哪些未做完或折衷之处、关联的 Issue / Bug 号。

### 1.3 版本号映射 (SemVer 2.0.0)
- `!` 或 `BREAKING CHANGE` -> Major 升级 (`vX.0.0`)
- `feat` -> Minor 升级 (`v0.X.0`)
- `fix` / `perf` -> Patch 升级 (`v0.0.X`)
- 其他 type 不触发版本发版。
- 每次发版必须在 Git 打对应版本标签（如 `v1.2.0`）。
- 变更记录遵循 Keep a Changelog 1.1.0 格式，由提交历史自动编译生成，禁止手写篡改。

## 2. 平台打包与发布段（项目层薄草稿）

> [!WARNING]
> 以下平台打包与上传配置为项目层薄草稿，尚未经过实操自动化验证（标记为未验证）。执行打包前请人工复核。

### 平台操作指引 (__PLATFORM_NAME__)
- **依赖安装**：执行标准包管理器安装命令（如 `npm install` / `pnpm install` / `uv sync`）。
- **门禁验证**：执行提交前 Hook 或全套门禁（格式、lint、类型、测试）。
- **打包构筑**：执行项目构建命令。
- **发布/上传**：
  - 微信小程序：通过微信开发者工具 CLI 或图形界面上传代码并提交审核。
  - 鸿蒙 DevEco：通过 DevEco Studio 构建 App/Hap 包并签名发布。
  - npm / 独立库：人工执行预发包检查后发布。
<!-- lazypack:end block=release-discipline -->
