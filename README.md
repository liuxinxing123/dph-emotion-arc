# 情绪弧线导演 · dph-emotion-arc

> **定位**：编剧向的「情绪叙事工具」（合规白名单方向），不是持续情感陪伴。
> 依据调研《情绪交互 Agent 与 DPH 插件可行性调研报告》（2026-10-01）：插件生态中「情绪识别 → 状态 → 策略」闭环、情绪记忆账本、跨版本适配矩阵——三件事均无人做过（7 个占位仓库合计 40★，4 个九天内死亡）。本插件补齐这三件。

## 一句话

**文本情绪识别 → 显式情绪状态文件（`emotion-state.json`）→ 对话策略映射 + 关系型记忆账本 + 角色卡人格感知**。识别双引擎：确定性词典（零成本、可审计、永远兜底）+ LLM 精判（BYOK、按 `detectorMode` 组合）；状态是跨会话持久化的显式文件（对齐报告第 07 章「离散标签 + 状态文件承载」架构），策略以注入提示形式映射到 Agent 行为。

## 架构（管线式，非端到端）

```
用户消息
  │  agent/inbox/claimed（scoped 事件）
  ▼
识别双引擎（detectorMode）
  ├─ llm：LLM 精判（4s 超时防护，温度 0，JSON 容错解析）
  └─ lexicon：词典 + 否定短语 + emoji + 感叹号加权（兜底）
  │  防护① 低置信度 → 回落中性
  ▼
情绪状态机（强度 + 指数衰减半衰期 30min + 换标签迟滞防抖）
  │  防护③ 推断审计日志 audit/<sid>.jsonl（rule: llm/lexicon/lexicon-fallback/manual）
  ▼
  ├─ 显著变化 → agent.inject() 策略提示（共情/倾听/降不确定…；notifyMode 可关）
  ├─ systemPrompt.context() 每步注入当前状态 + 角色卡人格（稳态感知）
  └─ 持久化 state/<sid>.json（跨会话延续）
记忆账本 ledger/<sid>.jsonl ← Agent 工具 emotion_ledger_append（冲突/和解/安抚…）
角色卡 persona/<id>.json ← Agent 工具 emotion_card_import（SillyTavern V2 PNG / V3 JSON）
```

三个感知错误防护（报告第 07 章）：① 低置信度回落中性；② 标签切换需超过强度迟滞；③ 推断日志供审计。

## 能力面（三件套）

| 空位（调研 §06） | 本插件实现 |
|---|---|
| 情绪识别 → 状态 → 策略闭环 | 双引擎识别（LLM 精判 + 词典兜底）+ `emotion-state` 状态文件 + 策略映射注入 + system prompt 上下文 |
| 情绪记忆账本（关系型记忆） | `ledger/<sid>.jsonl`：conflict / reconciliation / soothe / breakthrough / preference / milestone，跨会话保留，反哺角色弧光 |
| 跨版本存活 | 见下方适配矩阵；所有外部 API 均做防御性读取，宿主 API 缺失时跳过而非崩溃 |
| （V1.1）角色资产接入 | SillyTavern V2/V3 角色卡导入 → persona 档案 → 人格感知策略（对齐「一份资产多生态分发」） |

## 工具（Agent 可用）

- `emotion_state` —— 读当前状态（标签/强度/置信/触发语/历史/账本尾/角色卡）
- `emotion_state_set` —— 手动校准（写入审计日志 rule=manual）
- `emotion_ledger_append` —— 追加关系型记忆
- `emotion_card_import` —— 导入 SillyTavern 角色卡（V2 PNG / V3 JSON / V2 JSON）并绑定当前会话

## UI

Composer 下方的「情绪弧线」芯片：当前情绪（颜色点 + emoji + 名称 + 强度条 + 相对时间），点击展开状态面板（触发语 / 变化历史 / 账本尾）。数据经只读 HTTP 端点获取，写操作仅经 Agent 工具。

## 数据文件（可导出、可迁移）

```
<dataDir>/state/<sessionId>.json   情绪状态（version 字段 + 历史 + persona 绑定）
<dataDir>/ledger/<sessionId>.jsonl 情绪记忆账本
<dataDir>/audit/<sessionId>.jsonl  推断审计日志（可追溯）
<dataDir>/persona/<personaId>.json 角色卡 persona 档案（V1.1）
```

默认 `dataDir = dshHomePath('emotion-arc')`，可在 `cordis.patch.yml` 中覆写。

## 适配矩阵（Compatibility Matrix）

| 组件 | 版本 | 状态 |
|---|---|---|
| DeepSeek Harness（dsh） | 0.1.7 – 0.2.x（Developer Preview） | ✅ 基于 0.2.x API 面编写 |
| 依赖的宿主 API | `agent/inbox/claimed` · `agent.inject` · `agent/created`/`agent/disposed`（scoped, global:true）· `systemPrompt.context` · `tools.register` · `webServer.register` | 均有 `0.1.7+` 先例；全部防御式调用 |
| 客户端 API | `window.__ModuleLoader__` · `ctx.slots.inject/register` · `conversation.composer.dock`（标准 prop `sessionId`）· 主题 token `--dsw-alias-*` | ✅ |
| 浏览器 | 现代 Chromium / WebView（fetch + React 18） | ✅ |

**维护纪律**（对齐调研 §06「8 天 5 个 release」的教训）：

1. 本插件不 import 任何 `@deepseek-ai/*` 包（bundle 自包含），降低破坏性变更面；
2. 宿主 API 变更时优先「跳过功能」而非抛错——插件卸载/失效绝不影响会话；
3. 每次 dsh 发布后跑一遍 `emotion_state` 工具 + 芯片刷新冒烟测试，README 同步更新适配矩阵；
4. 数据文件格式带 `version` 字段，迁移时只加字段不删字段。

**开发循环（本机迭代须知）**：

- Host 侧代码（`engine.js`）修改后，**需重启 Harness 才生效**（Node ESM 按 URL 缓存模块，进程内无法热换）；
- Client 侧（`client.js`）修改后刷新页面即可；
- 禁用/启用插件时请间隔 ≥10 秒（cordis 纤维释放是异步的，快速切换会让路由卡死，届时只能重启恢复）；
- 单测：`node test-emotion.mjs`（24 用例：词典 + LLM 解析 + 角色卡解析），`node test-fork-repro.mjs`（回归用例）。

## 配置（cordis.patch.yml）

```yaml
config:
  enabled: true
  dataDir: !!js dshHomePath('emotion-arc')
  decayHalfLifeMs: 1800000   # 情绪半衰期 30min
  neutralFloor: 0.15         # 低于此强度回落中性
  minConfidence: 0.5         # 防护①阈值
  hysteresis: 0.15           # 防护②换标签迟滞
  injectThreshold: 0.25      # 触发策略注入的强度变化阈值
  injectCooldownMs: 5000     # 注入冷却
  notifyOnShift: true        # 情绪显著变化时注入通知
  notifyMode: inject         # inject=注入+上下文；context-only=仅稳态上下文（最安静）
  detectorMode: auto         # lexicon=零成本词典；llm=纯 LLM；auto=LLM 优先+词典兜底
  llmTimeoutMs: 4000         # LLM 精判超时（超时走兜底）
  llmMaxTokens: 120          # 精判输出上限
  # llmProvider / llmModel   # 可选：指定精判模型；缺省用 Harness 默认模型（BYOK）
  historyLimit: 20           # 历史保留条数
```

## Roadmap（对齐调研 MVP-1 双轨）

- ✅ V1.0 闭环 + 账本 + 适配矩阵（已实机验收）
- ✅ V1.1 LLM 精判（BYOK）+ SillyTavern V2/V3 角色卡导入 + 注入调优（本轮）
- V2 语音情绪识别（emotion2vec+ 本地 SER）+ 情感 TTS（CosyVoice / fish-speech）
- 插件外收入：语 C 人设包 / 角色卡定制（付费心智已被「语擦师」经济验证）——**插件本身免费，是作品集与获客器**

## 合规声明

本插件为**情绪叙事工具**，不提供拟人化人格的持续情感互动（《人工智能拟人化互动服务管理暂行办法》三要件不触发）：状态文件为显式工程数据，策略映射为写作方法论，不含「虚拟伴侣」功能。仅限研究与创作辅助，不构成任何医疗/心理服务。
