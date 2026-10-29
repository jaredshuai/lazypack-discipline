---
id: react-vite-app-shell
version: 1.0.0
name: "React Vite App Shell 1 (ShadcnStore free block)"
description: "L2 application shell plus L1 shadcn primitives for product-style React clients, pinned to verified versions and shipped with a synthetic task catalog page."
config_owner: project
ui_layers: "L2 + L1"
verified_on: "2026-10-29"
---

# React + Vite App Shell 1 配方

本文件是 `/lazypack-setup` 按需消费的 UI 装配配方数据卡（只读源）。它只声明一条标准路径：用 ShadcnStore 免费 App Shell 1 加 shadcn Base Nova 基础控件，装出产品型 Web 客户端的外壳与一个示例列表页。

- **ID**: `react-vite-app-shell`
- **Version**: `1.0.0`
- **来源起始副本**: [templates/react-vite-app-shell-1/](../../../templates/react-vite-app-shell-1/)
- **入口**: setup 在 `SKILL.md` §3.B 的配方推荐中按需列出本卡；不读本卡时不产生任何写入。

本卡只证明一条已声明的装配路径。它不承诺所有 React 项目、其他 UI 体系、其他包管理器或 Windows 桌面打包都能用同一份代码。

---

## 1. 复用层级

| 层级 | 本配方提供 | 说明 |
|---|---|---|
| L1 | `Button` `Card` `Field` `Input` `Empty` `Breadcrumb` `Sidebar` 等 Base Nova 控件 | shadcn CLI 生成结果，保留上游结构 |
| L2 | App Shell 1 的侧栏、页头、内容区装配 | ShadcnStore 免费 Block，文件结构与导航数据保持原样 |
| L3 | **不提供** | 业务页面、路由、数据源、权限、持久化由项目层接线 |

示例页 `tasks-catalog.tsx` 是用 L1 控件自行装配的演示，不是可复用的 L3 成品页。不得把本配方描述为“完整任务管理页面”。

---

## 2. 适用条件

按顺序判定，命中第一条即停：

| 优先级 | 条件 | 行为 |
|---|---|---|
| 1 | 新建或空的前端目录；目标是文件/任务/消息/设置型 Web 客户端；可用 Node 24 与 npm | **完全支持**：复制 `templates/react-vite-app-shell-1/` 作为起始副本 |
| 2 | 已有 React 19 + Vite 8 + Tailwind 4 + `components.json` 的 `style` 为 `base-nova` | **受限支持**：只加 App Shell 1 与示例页；已有 `src/components/ui/*` 一律保留，不覆盖 |
| 3 | 同一仓库已有 Ant Design / ProComponents、其他 shadcn style、Next.js、Vue、非 npm 包管理器，或 Node 主版本不是 24 | **退出**：说明冲突项，不混装、不迁移、不换源 |
| 4 | 只需要静态营销页或没有列表/表单的产品官网 | **退出**：本配方解决的是应用外壳与列表页，不是落地页 |

优先级 2 是本卡声明的装配路径，本轮没有在真实存量仓实跑；已验证的只有起始副本整装（见 §11）。

上述条件之外的需求属于扩展，按 [VISION.md](../../../docs/VISION.md) 的判定顺序交回维护者，不自行扩大支持范围。

---

## 3. 固定版本与来源证据

起始副本的 `package.json` 用精确版本，传递依赖由 `package-lock.json` 固定；不使用 `^` 范围。

| 组件 | 版本 |
|---|---|
| React / React DOM | 19.2.8 |
| Vite | 8.3.0 |
| TypeScript | 6.0.2 |
| Tailwind CSS / @tailwindcss/vite | 4.3.3 |
| shadcn CLI | 4.21.5 |
| @base-ui/react | 1.9.0 |
| lucide-react | 1.57.0 |
| oxlint | 1.81.0 |
| Vitest | 5.0.5 |

来源与哈希：

- App Shell 1 注册表载荷：`https://shadcnstore.com/r/app-shell-1.json`，2026-10-29 取回，SHA-256 `5722f6d51d9cf023dde01fd6519c5f1244a20a80b256b642a59fb80fd5494949`。
- 基础控件：`https://ui.shadcn.com/r/styles/base-nova/*.json`，经 `shadcn@4.21.5` 落盘。
- 起始副本内 `SHA256SUMS` 记录 App Shell 1 三个文件、16 个 `src/components/ui/*.tsx` 与 `package-lock.json` 的 SHA-256；复制后先核对，再决定是否采用。

---

## 4. 许可

- App Shell 1 属 ShadcnStore **Free Blocks**：[App Shells 目录页](https://shadcnstore.com/blocks/application/app-shells) 标其为 Free（App Shell 2–5 为 Pro，未复制），并按 [License](https://shadcnstore.com/license) 的 “Free Blocks (MIT License)” 条款使用。该条款要求随附版权与许可声明；起始副本的 `NOTICE.md` 已附带 MIT 正文与来源。
- **不复制任何付费 Block**、付费模板或需要购买才能取得的源码。[Licensing](https://shadcnstore.com/docs/licensing) 对购买资源设再分发限制；无法确认许可的素材一律不进入本仓。
- 示例任务（6 条）、用户名、邮箱均为合成数据。起始副本不含私人业务源码、真实用户数据、截图或浏览器 Profile。

---

## 5. 装配步骤

setup 执行时必须按顺序完成，任一步失败即停：

1. **探测**：读目标仓 `package.json`、`components.json`、`tailwindcss` 版本与 Node 主版本；列出起始副本中每个目标路径是否已存在。
2. **差异预览**：给出将新增的文件清单；对已存在的目标文件输出 2-way diff 并停下，不覆盖、不合并、不改名绕过。
3. **确认**：用户整体确认后，只复制预览过的文件。任一目标已存在且未获逐项确认时，该文件保持原样。
4. **安装**：在新的起始副本目录执行 `npm ci`（起始副本自带 lockfile）。目标项目已有自己的 lockfile 时，不改写它，也不拿本卡 lockfile 覆盖；先说明新增依赖，再由项目按自身门禁安装。
5. **复验**：依次运行下节命令。日志留在目标项目或临时目录，不写回本仓。
6. **可选渲染检查**：需要确认视觉或窄屏行为时，构建后用本机 Edge/Chromium 打开 `dist/index.html` 做渲染与搜索/筛选检查；这不是门禁，也不替代人工审美验收。

复制命令示例（仅在预览与确认之后执行）：

```bash
cp -r <lazypack-discipline>/templates/react-vite-app-shell-1/. <target>/
```

起始副本自带 `node_modules/`、`dist/` 的忽略规则；不要把这两者复制进目标仓或本仓。

---

## 6. 复验命令与期望退出码

在目标目录（Windows 11 + Node 24 + npm）执行：

| 命令 | 期望退出码 | 说明 |
|---|---|---|
| `npm ci` | 0 | 从提交的 lockfile 冷安装；不使用 `npm install` 改写版本 |
| `npm run typecheck` | 0 | `tsc -b --force` |
| `npm run lint` | 0 | `oxlint .`，0 warning 0 error |
| `npm run test` | 0 | `vitest run`，覆盖搜索、状态筛选及其交集 |
| `npm run build` | 0 | `tsc -b && vite build` |

`npm run verify` 串行执行后四项。任一非零即视为本配方在该目标未通过：报告命令与日志，不通过改测试、放宽 lint、删除类型检查或换 registry 来换绿。

---

## 7. 升级与差异

- 升级来源是注册表载荷，不是“最新版本”自动跟随。重新取回 `app-shell-1.json` 后先算 SHA-256：
  - 与 `5722f6d5…4949` 相同：文件应逐字节一致，不需要改动。
  - 不同：对新旧载荷与生成结果做 2-way diff，列出声明的版本变化、文件变化和新增依赖，由用户决定是否采用；采用后在本卡提升 `version` 并记录新哈希。
- 已被项目修改过的 `app-shell-1*.tsx` 不回写、不覆盖；只报告差异并保留项目版本。
- 禁止自动切换 registry、自动升级 shadcn CLI 或 Tailwind 主版本、自动改写全局主题变量。

---

## 8. 失败退出边界

| 场景 | 行为 |
|---|---|
| Node 主版本不是 24 | 停止，报告实际版本；不改用其他 Node 版本试跑 |
| 目标 `components.json` 的 style 不是 `base-nova` | 停止，说明混用风险；不静默改用当前 style |
| 目标已有 `src/components/app-shell-1*.tsx` 且内容不同 | 停止，给 diff；不覆盖 |
| `npm ci` 非零（网络、lockfile 不一致、脚本限制） | 停止，附原始错误；不删锁、不换源 |
| typecheck / lint / test / build 任一非零 | 停止，附命令与日志；不修测试换取通过 |
| 视觉或窄屏检查不通过 | 记录实际尺寸与溢出元素；不修改全局主题或视觉基线来“修好” |

---

## 9. 与质量门禁、包管理器的关系

- TypeScript 质量门禁的政策正文是 [presets/ts-biome-vitest.md](../presets/ts-biome-vitest.md)。本配方**不复述、不重写** format / lint / type / test 规则，也不把起始副本的脚本当作目标项目的门禁政策。
- 目标项目已有 `oxlint`、Biome 或其他已接线的 lint/type/test 命令时，逐字沿用；本配方不新增第二个 linter，不替换现有命令。
- 不把 npm 项目迁到 pnpm；不创建 `pnpm-workspace.yaml`；不改已有 lockfile 来源。
- 不修改目标项目的全局主题、设计 token 或既有视觉基线。起始副本的主题只是被认可示例的初始值。

---

## 10. 占位与未接线（必须如实转述）

- `New task` 与 `Open task` 是无回调的占位按钮，没有 onClick、路由或 API。
- 侧栏导航是锚点占位，不是真实路由。
- 没有任务创建/详情流程、数据持久化、权限、Windows 桌面外壳或安装包验证。
- 搜索与状态筛选只作用于内存中的 6 条合成任务，不查询后端。

AI 不得把这些占位描述为已接线，也不得据此宣称 API、桌面运行层或完整任务管理已验证。

---

## 11. 已验证范围

2026-10-29 在 Windows 11 Pro / Node 24.22.1 / npm 11.19.1 上，对起始副本执行：

- `npm ci`、`npm run typecheck`、`npm run lint`、`npm run test`（5/5）、`npm run build`：全部退出码 0。
- Microsoft Edge 156 headless（CDP）渲染：1440×1000 与 390×844 视口均渲染 6 张卡片，`scrollWidth` 等于视口宽度（无横向溢出）；输入 `TASK-121` 后剩 1 张；再选 `Open` 后剩 0 张并显示空状态。

未验证范围：

- 真实移动设备、其他浏览器（Firefox/Safari）、其他 Node 主版本。
- Windows 桌面运行时（Tauri/Electron/pywebview）与安装包。
- 真实业务数据、API、路由、权限。
- 其他 shadcn style、其他组件库、其他包管理器。

---

## 12. 非目标

本配方不建自有 Design System、Registry、拖拽编辑器或 MCP Server；不引入新的 UI 框架；不改固定层条文；不采购或分发付费 Block。
