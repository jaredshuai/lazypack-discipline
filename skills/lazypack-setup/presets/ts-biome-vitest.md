---
id: ts-biome-vitest
version: 0.1.0
name: "TypeScript (Biome + tsc + Vitest)"
description: "Standard TypeScript CLI / library / MCP quality gating preset using pnpm, Biome, tsc, and Vitest."
config_owner: tool-or-user
---

# TypeScript 质量门禁配方 (Biome + tsc + Vitest)

本文件是 `/lazypack-setup` 消费的 TypeScript/JavaScript 门禁配方数据卡（只读源）。声明推荐工具、标准命令字面量、依赖安装计划与验证边界。

- **ID**: `ts-biome-vitest`
- **Version**: `0.1.0`
- **Platform**: `generic`
- **适用场景**: Node.js ESM TypeScript 项目的质量门禁与工程化配置。
- **工具锁定与候选基线**:
  - **工具锁定**: Biome 负责 format 与 lint，禁止替换为 ESLint/Prettier（用户锁定）。
  - **实测候选基线**:
    - `pnpm` 12.3.4 (`packageManager`)
    - `@biomejs/biome` 2.5.12
    - `typescript` 6.0.3 (单一默认候选，解决 TSServer 协议及编辑器诊断退出问题)
    - `vitest` 5.0.0
    - `vite` 8.2.2 (peer 兼容)
    - `@types/node` (^24.0.0，与 Node 24 实测验证范围对齐；其他 Node 版本不声称支持验证)
  - *注：工具选择为用户锁定规则，精确版本号为经本票全量验证的推荐候选基线，不冒充用户锁定快照。*

---

## 1. 元数据与配置所有权 (Metadata & Ownership)

- **配方标识 (`id`)**：`ts-biome-vitest`
- **配方版本 (`version`)**：`0.1.0`
- **配置所有权 (`config_owner`)**：`tool-or-user`
- **零工具私有配置写入原则**：
  - 本配方坚决执行**零工具私有配置写入**：不强制创建或覆盖目标仓库中的 `biome.json`、`vitest.config.ts` 等外部工具私有配置文件；
  - 承重理由：官方已证实 Biome 与 Vitest 均提供完备的开箱即用默认配置及命令行选项；优先采用命令行参数与标准文件规范（如动态传递扫描路径与双 tsconfig 机制），避免因覆写用户私有配置文件引发项目设置冲突或配置覆盖遮蔽；
  - 工具所有私有配置留给项目开发者或工具官方初始化自行管理，setup 仅负责门禁接线、批量依赖声明与单包自安装防护配置。

---

## 2. 适用条件与支持矩阵 (Applicability & Support Matrix)

探测与支持判定遵循以下严格优先级（多语言仓与非 pnpm 管理器优先判定，禁止盲目强推）：

| 优先级 | 判定条件 | 分支类别 | 行为与处理原则 |
|---|---|---|---|
| **优先级 1** | 存在非 TS/JS 语言清单（如 `Cargo.toml`, `pyproject.toml`, `go.mod`） | 多语言项目 | **100% 保留其他语言现有门禁**；仅对 TS/JS 部分按后续优先级判定，严禁将其他语言有效命令降级为 `missing` |
| **优先级 2** | 存在非 pnpm 的已知 JS/TS 管理器（综合清单与配置，如 `yarn.lock`, `package-lock.json`, `bun.lockb`） | 受限分支 (`alternative-manager`) | **保留现有检查命令**；缺失项仅输出适配当前管理器的手动安装指引，**坚决不默认迁移至 pnpm**；证据冲突时受限报告 |
| **优先级 3** | 存在标准 `package.json`，系统 PATH 中存在 `pnpm`，且检测到 `tsconfig.json` 或 `.ts`/`.tsx` 源码 | **完全支持** | **提供完整配方推荐**：支持按项补缺、批量依赖声明与单包自安装防护接线 |
| **优先级 4** | 存在 `package.json` 及 TS 信号，但系统 PATH 中缺失 `pnpm` | 受限分支 (`pnpm-binary-missing`) | 报告 `pnpm 未安装`；提示用户手动安装 `pnpm`，**setup 绝不在全局静默下载或安装二进制**；已有命令原样保留 |
| **优先级 5** | 仅存在传统无编译 JS 清单（如纯 JS 工程且无 `tsconfig.json`） | 受限分支 (`unsupported-legacy-layout`) | 判定为传统纯 JS 布局；**保留已有门禁命令**，缺失项输出手动配置指引，不强行重构项目文件结构 |
| **优先级 6** | 目标目录为空目录、未初始化或无清单，且**用户显式选择/指定 TypeScript** | **新仓 TS 初始化分支** (`new-ts-project`) | **恢复明确选择 TS 的新仓分支**：绝对不因无清单直接退出，亦不自行猜测语言；**只有用户已明确选择 TS 才初始化**；若无源码/测试如实标记 `not-ready`；提供标准最小 TS ESM 工程脚手架（`type: module`、最小 package/scripts、双 tsconfig、CLI parseArgs、bin/files、可选 MCP、单包 pnpm-workspace 校验） |
| **未命中** | 目标目录不存在 TS 清单且用户未选择 TS | 未命中配方 (`uninitialized-ts-project`) | **退出本 TS 配方**；但**通用 `/lazypack-setup` 继续装配通用纪律**（如 `roles.md`、`ARTIFACTS.md` 等正常生成） |

> **关键约束与现有仓规则**：
> 1. 未命中配方适用条件（如非 TS 仓或缺失 `pnpm`）仅表示**不接入本门禁配方**，**绝对不阻止、不中断通用 setup 继续装配通用纪律文档**。
> 2. 缺少 TS 清单或缺 `pnpm` 绝不能作为关闭、改写或降级仓库中已有有效门禁的借口。
> 3. **只有用户已明确选择 TS 才初始化新仓**；严禁根据空目录自动猜测语言。
> 4. **既有文件按项补缺与冲突保护**：既有 `package.json`、`scripts`、`tsconfig.json`、`pnpm-workspace.yaml` 遵循按项补缺和整体确认原则；人工已有文件绝对保留，若发生配置或语义冲突必须暂停操作 (`PAUSE`) 由人工裁决；父级 workspace 绝不覆盖篡改。

---

## 3. 按门禁推荐与日常 Hook 命令字面量 (Gating Recommendations & Hook Literals)

针对用户采纳并接线的新配方槽位，必须使用以下经过官方文档核实与真实隔离验证的标准命令字面量。质量门禁必须保持只读检查语义，禁止在门禁中自动修改源码文件。格式化与 Lint 修复命令作为独立的日常辅助脚本，不进入 Pre-commit Hook：

| 门禁槽位 | 推荐工具 | 日常 Hook 最终命令字面量 (只读检查) | 独立修复命令 (`package.json` scripts) | 参数承重说明与只读边界 |
|---|---|---|---|---|
| **format** | `@biomejs/biome` | `pnpm run format` (内部调用 `biome format <paths>`) | `pnpm run format:fix` (内部调用 `biome format --write <paths>`) | 代码格式化。日常 Hook 严格执行纯只读检查，格式不符退出码非零，**绝对禁止在门禁中带 `--write`**。独立修复使用 `format:fix`。 |
| **lint** | `@biomejs/biome` | `pnpm run lint` (内部调用 `biome lint <paths>`) | `pnpm run lint:fix` (内部调用 `biome lint --write <paths>`) | 代码风格与静态检查。显式执行纯只读检查，返回非零退出码若存在代码违规。独立修复使用 `lint:fix`。 |
| **type** | `typescript` | `pnpm run type` (内部调用 `tsc --noEmit`) | 无 | 官方 TypeScript 类型检查器。附加 `--noEmit` 确保只进行静态语义类型检查，不产生输出文件，不污染工作区。 |
| **test** | `vitest` | `pnpm run test` (内部调用 `vitest run`) | `vitest` (watch 交互模式) | 极速单元与集成测试运行器。附加 `run` 参数指示单次非交互运行，杜绝默认 watch 模式挂起。零用例收集退出码详见第 5 节。 |
| **build** | `typescript` | `pnpm run build` (内部调用 `tsc -p tsconfig.build.json`) | 无 | 生产构建命令。使用独立的 `tsconfig.build.json` 配置，严格排除测试文件，输出干净的 `dist/` 生产产物。 |

### 3.1 动态路径扫描规则 (Dynamic Path Arguments)
- **探测规则**：检查仓库根目录下实际存在的代码与测试目录集合（`src`, `tests`, `test`, `lib`）；
- **动态合成参数**：仅将实际存在的目录作为参数传递给 Biome（例如若存在 `src` 与 `tests`，生成 `src tests`）；
- **命名绝对保真**：**坚决不将 `tests` 简写或篡改为 `test`**，确保路径与磁盘真实目录逐字符一致；
- 若不存在上述子目录（扁平单文件或根目录源码），指定当前包或相应合法入口，禁止虚构不存在的路径参数。

### 3.2 已有命令原样保留原则
- 若仓库在探测阶段已存在有效门禁命令（无论是原有 npm/yarn 脚本、其他 linter/formatter 还是现有自定义聚合脚本），**100% 原样保留既有命令字面量**；
- 绝不强行将仓库已有的命令替换为上述 pnpm 字面量；
- 对已有命令是否可安全执行基线另行判断；若环境或安全性未知，基线校验标为 `not-run`，严禁通过自动修改命令来规避风险。

---

## 4. 依赖安装、单包自安装防护与统一失败归因 (Installation & Attribution)

当用户在交互中确认采纳缺失门禁的推荐工具时，按以下规范执行安装、配置与归因：

### 4.1 单次批量安装命令与工具去重
- **依赖去重规则**：`@biomejs/biome` 同时覆盖 `format` 与 `lint` 两个门禁槽位，安装计划中必须去重，**严禁重复添加**；
- **全量采纳安装命令**：从单一候选基线生成精确批准命令：
  `pnpm add -D @biomejs/biome@2.5.12 typescript@6.0.3 vitest@5.0.0 vite@8.2.2 @types/node@^24.0.0`
  *说明：严禁执行无版本范围的裸 `pnpm add`，杜绝意外解析安装回 TS 7 等非兼容上游破坏版本；安装执行后在报告与记录中如实记录精确 resolved 版本。新仓 `package.json` 的 `packageManager` 字段必须显式声明为 `pnpm@12.3.4`。*
- **部分采纳安装命令**：仅安装确认采纳且缺失的工具（严格保持上述基线版本约束；例如仅采纳 format/lint 则执行 `pnpm add -D @biomejs/biome@2.5.12`；若已有 Biome 则执行 `pnpm add -D typescript@6.0.3 vitest@5.0.0 vite@8.2.2 @types/node@^24.0.0`），坚决不以无版本裸命令示例覆盖候选选择。

### 4.2 单包 `pnpm-workspace.yaml` 自安装防护规范
- **防护机制契约**：在单包工程根目录下生成 `pnpm-workspace.yaml`，内容明确包含：
  ```yaml
  verifyDepsBeforeRun: error
  ```
- **自安装防护作用**：此配置驱动 pnpm 12 在执行 `pnpm run` 前强制校验 `package.json` 与 `pnpm-lock.yaml` 的同步状态。若发生清单失配，pnpm 会在门禁脚本执行前直接抛出 `ERR_PNPM_VERIFY_DEPS_BEFORE_RUN` 阻断，彻底杜绝意外静默网络安装；
- **单包与 Monorepo 严格解耦声明**：
  * **单包自安装防护配置绝对不等同于授权 monorepo**！
  * `pnpm-workspace.yaml` 仅作为依赖完整性门禁约束文件；
  * 若上级目录已存在 workspace，或目标工程已包含自定义 `packages:` 字段，setup 严禁覆盖篡改，仅在整体计划中报告现状并在无冲突时安全提示用户补充 `verifyDepsBeforeRun: error`。

### 4.3 统一失败归因（非文件系统原子性）
- **客观事实**：包管理器执行依赖安装并非文件系统事务，命令执行失败（如网络中断、版本冲突、进程中断）时，目标磁盘上的 `package.json`、`pnpm-lock.yaml` 或 `node_modules/` 可能已发生部分写入或环境残留。**严禁宣称“自动完全回滚”或“完全未写入”**。
- **统一失败归因规则**：
  1. 若批量安装命令返回非零退出码：
     - **本次批准安装的全部缺失项统一归因为失败**；
     - 对应槽位门禁接线状态置为 `install-failed`；
     - 出处行统一记录为 `<state>=install-failed:<source>=preset:<reason>=install-error`；
  2. **既有项不受牵连**：仓库原本已有的门禁工具（`source=existing`）**绝不降级**，保持 `wired:existing:pre-existing`；
  3. **环境残留独立报告**：如实列出磁盘实际读回状态（$S_{\text{agent}}$）与可能存在的未决依赖文件，向用户说明需手动清理或排查，不执行激进的自动深度删除。

### 4.4 可调用核验前提
- 批量安装命令返回退出码 0 后，**还必须逐项执行可调用核验**：
  - `pnpm exec biome --version`
  - `pnpm exec tsc --version`
  - `pnpm exec vitest --version`
- 仅当核验命令返回退出码 0 时，对应槽位方可判定为 `wired`；若可调用核验失败，对应槽位判定为 `install-failed`；
- **可调用失败与门禁检查失败严格解耦**：工具无法调用是依赖安装/环境问题，不同于代码存在质量缺陷导致的门禁检查未通过。

---

## 5. 运行时行为、零测试处理与构建排除边界 (Runtime & Build Boundaries)

### 5.1 Vitest 零测试用例收集的权威处置与补充摘要
- **官方行为事实**：当 Vitest 正常完成测试文件扫描但在所指定范围内未发现任何匹配的测试文件或测试用例时，进程退出码为 1；
- **Hook 闭门防御逻辑**：Hook 脚本捕获非零退出码，阻断提交并诚实报告：
  - 接线状态：`test: wired`（保持接线，绝不改写为 missing 或 n/a）；
  - 实跑检查结果：`failed (ExitCode 1: no test files found)`；
  - 补充摘要：如实补充标明 `not-ready`（仅代表测试用例尚未编写，提示开发者补充测试）；
- **严禁掩盖**：**绝对严禁将 `not-ready` 作为正式 Hook 接线状态**（Hook 仅支持 `wired`, `missing`, `install-failed`, `n/a` 四种状态）；严禁因零用例将状态篡改为 `n/a`（`n/a` 仅适用于纯文档等非代码项目）。

### 5.2 新仓最小清单、双 tsconfig 与构建排除边界 (Scaffolding Manifest, Dual tsconfig & Build Boundaries)

当探测为空目录或用户明确选择初始化 TypeScript 新仓时（优先级 6），按以下规范装配基础配置文件：

#### 1. 最小 `package.json` 规范与 scripts 动态路径
```json
{
  "name": "<project-name>",
  "version": "0.1.0",
  "type": "module",
  "packageManager": "pnpm@12.3.4",
  "scripts": {
    "format": "biome format <paths>",
    "format:fix": "biome format --write <paths>",
    "lint": "biome lint <paths>",
    "lint:fix": "biome lint --write <paths>",
    "type": "tsc --noEmit",
    "test": "vitest run",
    "build": "tsc -p tsconfig.build.json"
  },
  "devDependencies": {
    "@biomejs/biome": "2.5.12",
    "@types/node": "^24.0.0",
    "typescript": "6.0.3",
    "vite": "8.2.2",
    "vitest": "5.0.0"
  }
}
```
- **scripts 路径保真与空仓规则**：
  * `scripts` 中的 `<paths>` 必须按仓库实际存在的目录动态替换（如 `src tests`、`src test` 或仅 `src`）；
  * **空仓绝不造假测试或传递不存在的目录参数**：空仓仅建立 `src` 时仅传递 `src`；若测试用例尚未编写，`test` 命令仍保持标准 `vitest run`，运行时由 Vitest 返回 exit code 1 并如实标注 `not-ready` 补充摘要，坚决不捏造虚假测试用例或虚假目录参数；
- **已存在文件/字段按项保护与确认**：
  * 既有 `package.json` 遵循按项补缺与整体确认原则；已有字段、依赖与自定义 scripts 100% 保持保留；
  * 若发生字段冲突必须触发暂停 (`PAUSE`) 由人工裁决；父级 workspace 绝不覆盖篡改；
- **零私有配置原则**：
  * 坚决不创建或注入 `biome.json`、`vitest.config.ts` 等外部工具私有配置文件，完全依托 CLI 参数与双 tsconfig 机制开箱即用；
- **CLI 与 MCP 规范复用**：
  * CLI 工具的 `bin`、`files` 声明、入口 `#!/usr/bin/env node` shebang、相对导入显式 `.js` 扩展名，以及可选 MCP 服务端配置，直接复用 §5.3 与 §5.4 既有规约说明，不在此处重复冗余描述。

#### 2. 双 tsconfig 机制与构建排除边界
- **问题现实**：在 TypeScript 工程中，开发与测试共享同一个项目环境，测试文件（如 `src/math.test.ts`、`src/__tests__/inner.test.ts`、`tests/sample.test.ts`）若被 `tsc` 默认编译，会导致 `dist/` 生产产物中残留测试文件或类型定义，污染生产分发；同时，若基础配置未包含测试目录，测试代码中的类型错误将被静态检查遗漏；
- **双 tsconfig 规范**：
  1. `tsconfig.json`：作为编辑器与类型检查门禁（`tsc --noEmit`）的基础配置，**必须同时包含项目实际存在的源码与测试目录**（如 `["src/**/*", "tests/**/*"]`、`["src/**/*", "test/**/*"]`，若测试在 `src/__tests__` 下则包含 `["src/**/*"]`），确保编辑器获得完整类型提示且类型检查门禁完整覆盖测试代码中的静态类型错误：
     ```json
     {
       "compilerOptions": {
         "target": "ES2022",
         "module": "NodeNext",
         "moduleResolution": "NodeNext",
         "types": ["node"],
         "strict": true,
         "noUncheckedIndexedAccess": true,
         "noEmit": true,
         "incremental": false,
         "skipLibCheck": true
       },
       "include": ["src/**/*", "tests/**/*"],
       "exclude": ["node_modules", "dist"]
     }
     ```
     *路径匹配说明：`include` 按工程实际探测到的源码与测试目录配置，默认脚手架包含 `["src/**/*", "tests/**/*"]`；若实际测试目录为 `test/`，则对应生成 `["src/**/*", "test/**/*"]`。*
  2. `tsconfig.build.json`：作为生产构建（`pnpm run build`）的专用配置，继承自 `tsconfig.json`，并显式设置：
     ```json
     {
       "extends": "./tsconfig.json",
       "compilerOptions": {
         "rootDir": "./src",
         "outDir": "./dist",
         "noEmit": false
       },
       "include": ["src/**/*"],
       "exclude": [
         "**/*.test.ts",
         "**/*.spec.ts",
         "**/__tests__/**",
         "tests/**",
         "test/**"
       ]
     }
     ```
- **构建前后收集验证与排除边界**：在构建验证中，对比构建前后的文件列表与测试用例收集数，确保构建产物目录 `dist/` 100% 仅包含生产代码，严格排除测试文件。构建边界说明：`exclude` 能够严格阻止构建器编译未被生产代码引用的测试文件；但若生产源码中直接 `import` 了测试文件，TypeScript 依赖图仍会编译被引用模块（生产 import 测试的排除边界）。构建前后 Vitest 测试收集数保持一致。

### 5.3 CLI 生产包最小边界 (Minimal CLI Package Boundary)
- **参数解析**：使用 Node 原生 `node:util parseArgs`（强类型检查），不默认引入 Commander、Yargs 等重型外部 CLI 库；
- **分发清单声明**：`package.json` 必须包含：
  - `"type": "module"`
  - `"files": ["dist"]`（严格限制打包内容，防止源码与配置泄漏入 tarball）
  - `"bin": { "<cli-name>": "./dist/cli.js" }`
- **纯 CLI 工具不提供库导出声明**：省略 `"exports"`，避免双模块或库类型污染；
- **CLI 入口规约**：入口文件头部添加 `#!/usr/bin/env node`；相对模块导入必须带有明确的 `.js` 扩展名；
- **生产消费隔离验证**：
  * 通过 `pnpm pack` 生成 tarball（`.tgz`）；
  * 核验 tarball 文件列表：仅包含 `dist/`、`package.json`、`README.md` 等必要生产文件，绝不包含 `src/`、`tests/`、`tsconfig*.json` 等开发源码；
  * 在完全隔离的独立消费者环境中通过 `pnpm add <tarball> --prod` 进行消费安装；
  * 证明生产消费者在 **0 devDependencies** 的环境下能够通过 bin shim 正常调用该 CLI 工具。

### 5.4 可选 MCP 服务支持 (Optional MCP Server Boundary)
- **可选能力声明**：当工程规划为 MCP 服务提供者时，可选引入 `@modelcontextprotocol/server@2.0.0` 与 `zod@^4.2.0`；
- **构建与调用**：MCP 服务源码（如 `src/server.ts`）经生产构建输出到 `dist/server.js`；
- **生产消费验证**：在独立的生产消费者环境中安装该产物，通过标准 stdio 协议启动服务进程，完成 JSON-RPC `initialize` 握手与 `tools/list` 查询，核验无 stdout 杂质日志污染后干净退出。

---

## 6. 出处规范与退出配方保护 (Provenance & Exit Protection)

### 6.1 出处注释行语法规范
当 Hook 包含本配方内容时，在托管块正文头部渲染严格标准化的出处注释行：

```sh
# lazypack:preset id=ts-biome-vitest version=0.1.0 format=<state>:<source>:<reason> lint=<state>:<source>:<reason> test=<state>:<source>:<reason> type=<state>:<source>:<reason>
```

- **键排序**：固定头部键 `id`, `version`，后接严格字母升序的四门禁键：`format` $\to$ `lint` $\to$ `test` $\to$ `type`；
- **字段字符集与格式约束**：
  - `id`：安全小写字母、数字与连字符，固定为 `ts-biome-vitest`；
  - `version`：固定数字点分版本 `0.1.0`；
  - `<state>`：`wired` \| `missing` \| `install-failed` \| `n/a`；
  - `<source>`：`preset` \| `existing` \| `none`；
  - `<reason>`：`recommended` \| `declined` \| `pre-existing` \| `no-tool` \| `install-error` \| `not-applicable`；
- **配方未采用时的省略规范**：若仓库全部工具为既有工具且未采用本配方（样例 C），**既省略 Hook input 中的 `preset`/`presetSrc`/`provenance`，也省略整个 `# lazypack:preset` 出处行**，不留任何空白占位行。

### 6.2 退出配方的生命周期预检与所有权保护
当用户需要退出配方或重置门禁时，执行严格生命周期预检：
1. **标记与指纹核验**：读取 `.githooks/pre-commit` 托管块并计算 `current_fp`；
2. **手改防御与版本/命令不匹配阻断**：
   - 若检测到 `[BROKEN]`（标记损坏）、`[DRIFT]`（用户手动修改了命令但未修改出处行，`current_fp !== header.fp`）或 `[CONFLICT]`；
   - **绝对禁止依据出处行自动删除或重置任何命令！**
   - **版本与命令不匹配防御**：若来源对应旧配方版本（如出处 `version` 与当前配方不一致），或者槽位命令字面量不匹配当前推荐串且无法确定安全逆向映射：
     - **整个自动退出分支必须立即停止**；
     - 完整保留现有命令、`# lazypack:preset` 出处行和配方 input 字段，向用户报告未解决项由人工裁决；
     - **坚决禁止无条件删除出处而残留无主命令**；
   - 立即终止自动退出，向用户展示当前内容与推荐模板的 2-way diff，由人工进行安全清理。
3. **安全清理范围与重算**：
   - 仅当 `current_fp === header.fp` 且来源有效可确定安全退出时，才允许自动清理；
   - **必须彻底清空配方命令字面量**：仅将 `<source>=preset` 且命令字面量严格匹配配方推荐串的槽位重置为 `missing`（清除对应的 pnpm 命令，绝不在删除出处的同时将 pnpm 命令无主遗留在脚本中）；
   - 从正文头部移除 `# lazypack:preset` 出处注释行，从 `input` 中移除配方字段（`preset`, `presetSrc`, `provenance`）；
   - **重新计算 Hook 托管块的 `inputDigest` 与 `fp`** 写回磁盘；
   - `<source>=existing` 的槽位及托管块外部的所有人工内容 **100% 保持保留**。
4. **整文件物理删除的三重严格条件与混合 Hook 保护**：
   - 整文件物理删除（`rm .githooks/pre-commit`）必须**同时满足三个严格条件**：
     ① **所有权可证明**：Hook 文件 100% 为 setup 全新创建；
     ② **无块外保留内容**：托管块外部完全无用户有效内容（无自定义 shebang、前置/后置逻辑或注释）；
     ③ **无任何 existing 或其他须保留槽位**：清理后所有门禁槽位均为 `missing` 或 `n/a`，没有任何保留的 `existing` 命令或其他活跃门禁；
   - **混合 Hook 保护**：若 Hook 中包含任何 `<source>=existing` 的槽位（或其他非配方保留命令），即使该 Hook 原本由 setup 新建且块外无内容，也**绝对严禁物理删除文件**！只能清理配方槽位与出处行，保留 existing 命令及其可调用入口并保持文件可执行权限。
5. **纪律文档与共享命令后续更新说明**：
   - 退出配方后，若全仓其他纪律文档（如 `CODING_STANDARDS.md`, `CLAUDE.md`, `AGENTS.md`）仍予保留，必须向用户明确说明：下次这些文档中共享命令（shared commands）或配置发生变动时，将按正常决策树走整体更新确认流程，不宣称全仓永久不变。
6. **退出后再次 setup 的行为规范**：
   - 配方退出后，本地环境中遗留的工具（如仍存在于 PATH 或 `node_modules/` 的 Biome、tsc 等）**不代表用户重新接受配方**；
   - 再次运行 setup 探测到这些工具时，将其报告为未接线的环境既有工具，绝不自动安装或自动接线回配方，必须经由用户显式选择才可重新接线。
