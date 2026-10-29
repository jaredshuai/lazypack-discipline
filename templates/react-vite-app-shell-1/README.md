# React + Vite App Shell 1 starter

这是 #72 首个可复现 UI 标准装配的起始源：**L2 App Shell + L1 基础控件**，不是 L3 完整业务页。页面保持维护者已认可的 Task catalog 外观（侧栏 + 面包屑页头 + 搜索/状态筛选 + 6 张任务卡片），数据全部为合成数据。

配方正文：[skills/lazypack-setup/recipes/react-vite-app-shell.md](../../skills/lazypack-setup/recipes/react-vite-app-shell.md)。

## 已验证环境

| 项 | 值 |
|---|---|
| OS | Windows 11 Pro |
| Node | 24.22.1 |
| npm | 11.19.1 |
| 包管理器 | npm（提交 `package-lock.json`，不要求 pnpm） |
| 浏览器复验 | Microsoft Edge headless（CDP） |

主要固定版本：React 19.2.8 / Vite 8.3.0 / TypeScript 6.0.2 / Tailwind CSS 4.3.3 / shadcn CLI 4.21.5 / @base-ui/react 1.9.0 / Vitest 5.0.5。完整清单见 `package.json`；传递依赖由 `package-lock.json` 固定。

## 冷安装与验证

在干净目录（或本目录首次检出）执行：

```bash
npm ci
npm run typecheck   # tsc -b --force
npm run lint        # oxlint .
npm run test        # vitest run
npm run build       # tsc -b && vite build
```

`npm run verify` 依次执行 typecheck、lint、test、build。四条命令的期望退出码都是 0；任一非零即停止，不换源、不降级依赖、不删除测试来换绿。

## 文件角色

| 路径 | 来源 | 说明 |
|---|---|---|
| `src/components/app-shell-1.tsx` | ShadcnStore App Shell 1 | 上游原样组合，仅作参照与升级对比；当前页面未直接渲染它 |
| `src/components/app-shell-1-sidebar.tsx` | ShadcnStore App Shell 1 | 侧栏；品牌与导航文案属演示内容，项目层替换 |
| `src/components/data/app-shell-1-nav.ts` | ShadcnStore App Shell 1 | 导航与演示用户 |
| `src/components/tasks-catalog.tsx` | 本配方新增 | 用 L1 控件装配 Task catalog；页面内容与 App Shell 1 解耦 |
| `src/components/data/tasks.ts` | 本配方新增 | 6 条合成任务 |
| `src/components/data/filter-tasks.ts` | 本配方新增 | 搜索与状态筛选的唯一实现 |
| `src/components/data/filter-tasks.test.ts` | 本配方新增 | 覆盖 id 搜索、搜索与状态交集、大小写/去空白、单独状态筛选 |
| `src/components/ui/*.tsx`, `src/hooks/use-mobile.ts` | shadcn/ui Base Nova | 生成的 L1 控件 |
| `NOTICE.md` | 本配方新增 | 免费 Block 与 shadcn/ui 的 MIT 来源与许可 |

## 明确未接线

- `New task` 与 `Open task` 是**占位按钮**：没有 onClick、没有路由、没有 API。
- 没有任务创建/详情流程、持久化、权限、桌面打包或 Windows 安装包验证。
- 侧栏导航是锚点占位，不是真实路由。
- 390×844 只在 Edge 的 CDP 视口模拟下验证过（无横向溢出）；真实移动设备与其他浏览器未验证。

## 复用层级

- L1：`Button`、`Card`、`Field`、`Input`、`Empty` 等基础控件。
- L2：App Shell 1 的侧栏、页头、内容区装配。
- L3：未交付。业务页面、数据源、事件与路由由项目层接线。

本目录只证明这条装配路径能冷安装、静态检查、跑测试和生产构建；不外推到其他 React 版本、其他 UI 风格、其他包管理器或 Windows 桌面运行时。

## 复验记录（2026-10-29）

在系统临时目录的独立副本中执行 `npm ci` 后：

| 命令 | 退出码 | 结果 |
|---|---|---|
| `npm ci` | 0 | 370 packages；未改写 lockfile |
| `npm run typecheck` | 0 | `tsc -b --force` 无输出 |
| `npm run lint` | 0 | 26 files，0 warning / 0 error |
| `npm run test` | 0 | 5/5 tests passed |
| `npm run build` | 0 | 2300 modules；JS 414.81 kB / CSS 72.63 kB |

冷安装副本与本目录的构建产物哈希一致：

```
index.html                 9578edf84d10538e62a09d4355fb55678fbad01e98e63b36a65c5bdf122ec9a7
assets/index-BZd97kC6.js   f59b2a18d0768fd2309392c5d1427687714d2b89f7fe1bd015e3019a51a8327c
assets/index-nBr7hMrt.css  c7ddb4035c356cb6513b9ad77f1ba0b548e3c486524f5bf87c17faef77023b20
```

Edge 156 headless（CDP）：1440×1000 与 390×844 视口均渲染 6 张卡片，`scrollWidth` 等于视口宽度；输入 `TASK-121` 后剩 1 张；再选 `Open` 后剩 0 张并显示空状态标题。

## 许可

免费 Block 与 shadcn/ui 均为 MIT。详见 [NOTICE.md](NOTICE.md)。本目录不包含付费 Block、私人业务素材或真实用户数据。
