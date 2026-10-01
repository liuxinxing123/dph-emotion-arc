# Changelog

本项目遵循语义化版本。数据文件只加字段不删字段；宿主 API 全部防御式调用。

## [0.2.0] — V1.1 能力升级（未发布）

### 新增

- **LLM 精判（BYOK）**：`detectorMode: lexicon | llm | auto`（默认 auto = LLM 优先 + 词典兜底）。走 Harness 默认模型路由（`llmProvider`/`llmModel` 可覆写），温度 0、`llmMaxTokens` 上限、`llmTimeoutMs` 4 秒超时防护；响应 JSON 容错解析（代码围栏/杂文本/越界钳制/缺字段）。审计日志新增 rule：`llm` / `llm-fallback`（实为 `lexicon-fallback`）/ `llm-error→neutral`。
- **SillyTavern 角色卡导入**：新工具 `emotion_card_import`——V2 PNG（tEXt:chara 内嵌）、V3 JSON、V2 JSON 三种格式，纯 JS 解析零依赖。导入后存 `persona/<id>.json` 并绑定当前会话，system prompt 上下文注入角色名与人格（人格感知策略）。
- **注入噪音调优**：`notifyMode: inject | context-only`；注入文案追加「本提示无需回复」；同档情绪去重（冷却 + 强度档位键）；识别任务按会话串行链防竞态。
- 示例角色卡：`samples/demo-card-v2.png`、`samples/demo-card-v3.json`（「苏晚晴」电台主播）。

### 变更

- `emotion_state` 返回值新增 `persona` 字段；HTTP `/state` 端点同步输出 persona。
- 状态文件新增字段 `persona`、`lastInjectedKey`（旧文件兼容，缺省回填）。
- 单测扩容至 29 用例（词典 11 + LLM 解析 7 + 角色卡 6 + personaId 5）；新增 `smoke-v11.mjs` 冷启动冒烟。

### 修复

- personaId 生成：非拉丁角色名（如中文）不再退化为全下划线 `___`，改为 `p-<sha1 前 8 位>` 稳定短哈希（显式 `personaId` 参数仍优先）。

## [0.1.0] — V1.0 首版（已实机验收）

### 新增

- 情绪识别 → 显式状态文件 → 对话策略映射闭环（词典识别 + 指数衰减状态机 + 换标签迟滞 + 策略注入 + system prompt 稳态上下文）
- 情绪记忆账本 `ledger/<sid>.jsonl`（conflict/reconciliation/soothe/breakthrough/preference/milestone）
- 三个感知防护：低置信回落中性 / 换标签强度迟滞 / audit 推断审计日志
- 工具 ×3：`emotion_state` / `emotion_state_set` / `emotion_ledger_append`
- Web UI：composer dock 情绪芯片 + 展开面板（主题 token 化样式）
- 只读 HTTP 端点 `/api/dph-emotion-arc/{state,ledger}`
- README 适配矩阵 + MIT License + 验收清单

### 修复

- 「不开心」中「开心」误计正向（否定前缀 lookbehind）
- 拉丁词 `emo` 命中 `emotion` 子串（字母边界）
