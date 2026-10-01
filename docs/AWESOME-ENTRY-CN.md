# awesome 收录条目（最终版，待推送后执行 PR）

> 目标仓库：libukai/awesome-deepseek-harness（README 已本地留档 memory/_awesome_readme.md，无 CONTRIBUTING.md 文件）
> 插入位置：`## 精选插件` → `### 上下文、会话与输入`（README 第 206-224 行区段末尾）
> 格式依据：该节现有条目风格（一句话中文描述 + 许可证/版本/兼容性/测试与 CI/风险成熟度标注）

## 最终条目文本

```
- [dph-emotion-arc](https://github.com/liuxinxing123/dph-emotion-arc)：情绪弧线导演——文本情绪识别（LLM 精判 BYOK + 词典兜底）→ 显式情绪状态文件（半衰期衰减、换标签迟滞、推断审计日志）→ 对话策略映射，附情绪记忆账本（冲突/和解/安抚）与 SillyTavern V2/V3 角色卡导入（人格感知）；MIT、npm `0.2.0`、29 例单测与冷启动冒烟，声明兼容 DSH `0.1.7`-`0.2.x` 并已在真实 Harness 会话完成全链路实机验收；定位为编剧向叙事工具（合规白名单，非陪伴）。
```

## PR 执行计划（Token 到位后）

1. `POST /repos/libukai/awesome-deepseek-harness/forks`（用你的 Token fork）
2. `GET /repos/liuxinxing123/awesome-deepseek-harness/contents/README.md` → 下载
3. 在「上下文、会话与输入」节末尾插入条目 → base64 提交（`PUT .../contents/README.md`）
4. `POST /repos/libukai/awesome-deepseek-harness/pulls`（跨仓库 PR）
