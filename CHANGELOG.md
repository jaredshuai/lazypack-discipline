# Changelog

本文件遵循 Keep a Changelog 1.1.0 格式；版本区段由提交历史编译生成，不手写条目。

生成：`node skills/lazypack-setup/templates/changelog.mjs release --version <x.y.z>`（发版时执行）。校验：`node skills/lazypack-setup/templates/changelog.mjs check`。播种：`node skills/lazypack-setup/templates/changelog.mjs init`（文件缺失时执行一次，由 setup 或人工触发）。

## [Unreleased]

## [0.4.0] - 2026-09-22

### Added

- **BREAKING** **discipline:** revise §5.7 release-tag semantics per maintainer ruling (4e971c6)
- **scripts:** record git blob ids and classify newline drift (a6dd717)
- **scripts:** add a read-only checker for commit subject lines (78b0b31)
- **scripts:** add a read-only checker for the first doc pairs (8e43bfd)
- **lazypack-setup:** add controlled document routing helpers (658ef79)
- **lazypack-setup:** add Python and TypeScript gate presets (91ae63d)
- **lazypack-setup:** add project interview retention policies (30ae296)
- **handoff:** generate and verify artifact manifests from one source (766efee)
- **harvest:** add session feedback skill with guarded local ledger (04c0a02)
- **setup:** add lazypack-setup skill and sanitized multi-AI review records (7c0c03f)

### Changed

- **docs:** relocate handoff-verification to docs/agents (06121a4)

### Fixed

- **lazypack-setup:** align the RELEASE seed wording with upgrade (6617d53)
- **scripts:** classify a BOM-only handoff diff on its own (9e017d8)
- **scripts:** compare every handoff subcommand and skip tilde fences (53e1eca)
- **lazypack-setup:** skip file URLs and code-span links in scans (5ed6487)
- **skills:** cite the harvest skill and align exclusion rules (3f7b604)
- **lazypack-setup:** spell out local trial builds vs tagged releases (be04ce2)
- **lazypack-setup:** keep project packaging notes outside the managed RELEASE block (71e564a)

[Unreleased]: https://github.com/jaredshuai/lazypack-discipline/compare/v0.4.0...HEAD
[0.4.0]: https://github.com/jaredshuai/lazypack-discipline/releases/tag/v0.4.0
