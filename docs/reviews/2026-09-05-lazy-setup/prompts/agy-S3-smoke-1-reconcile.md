# S3-SMOKE-1：报告证据校正

在原 agy 试用会话继续，仅核对现场并新建校正报告。产品、fixture、旧预览、旧 result.md、baseline/post-run/audit JSON 及脚本全部只读。不要重跑 setup、hook 或旧脚本，不修改产品、不重新确认、不执行 Git 写操作或清理。

源仓库：<REPO_ROOT>
旧报告：<TEMP_DIR>/lazypack-discipline-handoff/smoke-1\result.md
现场：../../../../.scratch\lazypack-setup-s3-smoke-1\

唯一新报告：
<TEMP_DIR>/lazypack-discipline-handoff/smoke-1-reconcile\result.md

可创建必要父目录。目标已存在则报告不覆盖、不自选后缀。主持人将直接读取，不要求维护者复制正文。

## 必须纠正

1. 旧报告文件大小/SHA 与实际文件和 post-run1.json 不符。主持人只读实算发现所有现场 happy 文件与 post-run1.json 一致，但旧报告五份产物数据错误：
   - .githooks/pre-commit：实际 2042 B；旧报告 2007 B。
   - CLAUDE.md：实际 1719 B；旧报告 1269 B。
   - CODING_STANDARDS.md：实际 1727 B；旧报告 955 B。
   - RELEASE.md：实际 2234 B；旧报告 1391 B。
   - docs/agents/roles.md：实际 2411 B；旧报告 1521 B。
   不要只照抄以上数字。使用实际二进制内容重新计算长度和完整 SHA-256，与基线、post-run1 和旧报告逐项对照，解释旧报告差异；不能凭模型手填摘要。无法知道差异来源则明确未知。

2. byte-audit-report.json 的 sourceRepoSafety.passed 为 false，trackedModified 为 README.md、docs/DECISIONS.md。旧报告却写 C09 PASS。主持人在试用前已反复观察到这两个文件的未提交修改；当前 dirty 不证明本次试用造成污染。区分：
   - 旧检查把“主仓不干净”混同“本轮发生改动”，判据不成立；不能把 false 隐藏。
   - 没有对应试用前完整内容基线时，不能反向断言主仓所有文件绝对未变。已有产品 blob 前后对照能证明的范围如实限定。
   - 不改历史 JSON 把 false 变 true；校正报告给出处置说明。

3. second-run.js 用脚本计算状态，其中 currentPlatform='generic'、currentSrc='DECISIONS.md@0.2.0' 是字面常量；其结果不足以证明平台选择完全从项目反推，也不证明独立跨会话 LLM 重跑。旧报告“物理清除内存”“100% 幂等”等表述必须收窄。
   只读核对 render-plan.js、do-write.js、second-run.js、write-result.js：哪些是哈希/写文件工具，哪些代替了产品的探测/决策？报告真实使用方式，不笼统说全是 agent 无辅助运行。
   当前文件和 post-run1 一致证明的是两个观察点内容一致；没有执行记录不能证明期间绝无写入。不要把文件一致扩成未证的历史行为。

4. 确认记录包含首次询问与改交接后再次出示预览，但实际用户只批准一次。写准确次数：配置问题数、确认请求次数、实际确认次数分别记录，不因目标是“一次确认”而删掉已有交互。

## 输出

标题：S3-SMOKE-1 证据校正报告。
- 结论分项：生成/人工保护/实际 Git 调用/同会话脚本辅助核验/独立跨会话，每项通过、证据不足或未执行。
- 原报告错误到校正证据的映射，保留旧结论及纠正原因。
- 当前文件实际字节数、完整 SHA-256、baseline/post-run 对照；不手工编造值。
- 产品文件 blob 与已复审版本核对；对原主仓 dirty 状态做正确归因。
- 明确尚未验证的多模型、POSIX、真实安装和平台发布，不新增产品范围。
- 建议下一步：证据可用于有限范围文档收尾，或仍有某个确切阻断；不要重复跑一轮大测试来凑通过。

无论校正是否支持通过，都不要改已有报告或产品。允许只读文件/小型内存哈希计算、只读 Git 检查，不调用无关 MCP、不创建后台服务或子代理。
保存新报告后仅回复“完成”和绝对路径，主持人会直接读取。
