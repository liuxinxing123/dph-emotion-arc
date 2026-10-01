# 验收清单（重启后 2 分钟跑完）

前提：已重启 Harness（完全关闭并重新打开 Web GUI），插件管理页中 `dph-emotion-arc` 显示为已启用且无错误标记。

## 1. 引擎上线（本会话直接测）

在任意会话发送：

> 气死我了，这破网又断了！！！

预期：
- 输入框下方「情绪弧线」芯片：😠 愤怒 + 强度条 ≥3 格；点开可见「触发语："气死我了，这破网又断了！！！…"」
- Agent 回复带共情策略（先共情、不说教）

## 2. 工具闭环（让 Agent 执行）

> 调用 emotion_state 工具，把结果汇报给我

预期返回：`current: "anger"`（或已随时间衰减）、`labelZh: "愤怒"`、history 含一条 `neutral → anger`。

再让 Agent 执行：

> 调用 emotion_ledger_append，kind='milestone'，note='验收通过'

预期：`ok: true`，账本尾部出现该条。

## 3. 手动校准（可选）

> 调用 emotion_state_set，label='joy'，intensity=0.6，reason='验收测试'

预期：状态变 joy，`trigger` 为 `manual: 验收测试`；再次 emotion_state 确认。

## 4. 数据落盘

`C:\Users\Admin\.dsh\emotion-arc\` 下应有：
- `state/<sessionId>.json` —— 情绪状态（含 version 字段）
- `ledger/<sessionId>.jsonl` —— 账本
- `audit/<sessionId>.jsonl` —— 推断审计日志（含 rule: lexicon / manual / low-confidence→neutral）

## 5. 单元回归（源码目录）

```powershell
node "C:\Users\Admin\Desktop\素材\dph-emotion-arc\test-emotion.mjs"   # 期望 24/24
```

全部通过即 MVP-1 V1 验收完成。

---

# V1.1 验收（重启后追加，约 3 分钟）

## 6. LLM 精判（BYOK，audit 可查）

前提：默认模型已配置可用。发送一条**词典识别不出但人类能懂**的句子，例如：

> 这破事搞得我浑身没劲，感觉什么都不想干了

然后让 Agent 执行 `emotion_state`：
- 预期 `current` 为 sadness 或 neutral（LLM 判断），且 `C:\Users\Admin\.dsh\emotion-arc\audit\<sessionId>.jsonl` 最新一条 `rule` 为 `llm`（或超时/失败时为 `lexicon-fallback`——两者都算通过，兜底机制正确）。
- 拔掉网络/改 detectorMode=lexicon 对照：rule 应全为 `lexicon`。

## 7. 角色卡导入（SillyTavern V2 PNG / V3 JSON）

示例卡已备好（`samples/`：`demo-card-v3.json`、`demo-card-v2.png`）。让 Agent 执行：

> 调用 emotion_card_import，path='C:\Users\Admin\Desktop\素材\dph-emotion-arc\samples\demo-card-v3.json'

预期返回 `format: "tavern-v3-json"`、`name: "苏晚晴"`、人格预览非空。再执行：

> 调用 emotion_state

预期返回含 `persona: { name: "苏晚晴", ... }`。随后任意发一条情绪化消息（如「今天好累啊…」），Agent 的回复与上下文应带有角色卡人格色彩（电台主播式共情）。

V2 PNG 同理可测：`emotion_card_import` 指向 `demo-card-v2.png`。

## 8. 注入调优

- 观察：显著情绪变化时出现一次注入通知（含「无需回复」字样），同档情绪不重复注入（5 秒冷却 + 同档去重）。
- 若嫌吵：`cordis.patch.yml` 改 `notifyMode: context-only` 后重启，仅保留稳态上下文。

V1.1 全部通过即升级验收完成。
