# 第三方来源与许可

本目录包含两个来源的 UI 代码。两者都是公开组件，不含付费 Block、私人业务源码或真实用户数据。

## 1. ShadcnStore App Shell 1（免费 Block，MIT）

- 来源：`https://shadcnstore.com/r/app-shell-1.json`，2026-10-29 取回。
- 注册表载荷 SHA-256：`5722f6d51d9cf023dde01fd6519c5f1244a20a80b256b642a59fb80fd5494949`
- 许可依据：ShadcnStore 的 [License](https://shadcnstore.com/license) 将 Free Blocks 单列为 MIT（“Free Blocks (MIT License)”）；[App Shells 目录页](https://shadcnstore.com/blocks/application/app-shells) 将 App Shell 1 标为 **Free**（App Shell 2–5 标为 Pro，未复制）。同一页面的付费资源条款不适用于本目录；本目录没有复制任何付费 Block。
- 上游载荷没有提供单独的版权行。ShadcnStore 的 MIT 条款要求随附版权声明，此处按权利人名称记为 `Copyright (c) ShadcnStore`；如需更精确的版权行，应由维护者在采用当日向厂商书面确认，不在此处臆造。
- 取回后由 shadcn CLI 改写为项目别名（`@/components/...`）并落在下列文件；这些文件保留原结构，不随业务修改：
  - `src/components/app-shell-1.tsx`
  - `src/components/app-shell-1-sidebar.tsx`
  - `src/components/data/app-shell-1-nav.ts`

## 2. shadcn/ui 基础组件（Base Nova 样式，MIT）

- 来源：`https://ui.shadcn.com/r/styles/base-nova/*.json`，经 `shadcn@4.21.5` 落盘。
- 许可：shadcn/ui 以 MIT 发布，版权归其上游作者；本目录只保留生成结果，未修改上游许可声明。
- 文件：`src/components/ui/*.tsx`、`src/hooks/use-mobile.ts`。

## 3. MIT 许可正文

```text
MIT License

Copyright (c) ShadcnStore (free blocks)

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
```
