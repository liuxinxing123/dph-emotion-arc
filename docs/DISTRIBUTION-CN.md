# 分发投递清单（dph-emotion-arc）

> 编制：2026-10-01；更新：2026-10-01（dsh.so 提交方式已一手核实）。

## 状态分类

### A. 已完成（无需网络/GitHub）
- [x] 本地 git 仓库 + 4 次提交（0.2.0 完整源码/文档/样例/人设包）
- [x] 发布文案 5 变体（docs/RELEASE-CN.md）
- [x] 获客实验计划（docs/ACQUISITION-CN.md）+ 定价方案 v1（docs/PRICING-CN.md）
- [x] 付费级人设包样品（samples/persona-pack-suwanqing）
- [x] GitHub 推送手册（docs/GITHUB-PUSH-CN.md）+ awesome 条目草稿（docs/AWESOME-ENTRY-CN.md）

### B. dsh.so 收录方式（✅ 已核实，一手：https://www.dsh.so/submit/）

**流程**：粘贴公开仓库 URL → 站内 checker 校验格式并跑安全扫描 → 通过后点 Submit，以 issue 形式进入后端 → 维护者合入 registry。支持 **GitHub / Gitee / GitLab** 公开仓库（Gitee 是国内可选方案）。列表初始为「Declared」兼容性，元数据自动同步。

**验收标准六条逐条对照（我们的仓库）**：

| dsh.so 要求 | 我们现状 |
|---|---|
| ① DSH 兼容信号（package.json `dsh` 字段 / cordis manifest / dsh.plugin.* / topic `dsh-plugin`） | ✅ package.json 已有 `dsh.bundle.patch` 字段；建仓后建议再加 topic `dsh-plugin`（可被自动索引） |
| ② README 含安装说明 | ✅ README 有配置与安装章节 |
| ③ 开源许可证带 SPDX 标识 | ✅ MIT（package.json license: MIT） |
| ④ 仓库名 slug 合规（`^[a-z0-9]+(-[a-z0-9]+)*$`） | ✅ `dph-emotion-arc` |
| ⑤ 可扫描源码（JS/TS 等） | ✅ engine.js / client.js / samples |
| ⑥ 安全扫描无阻断项（硬编码密钥/外传端点/破坏性操作/挖矿） | ⚠️ 建仓后先自查：无密钥、无外传（HTTP 仅回环只读）、无破坏性操作——预期通过，提交时验证 |

### C. 需要账号（用户已选择暂缓，待用户意愿）
- [ ] 创建公开仓库（GitHub 或 **Gitee**，dsh.so 均支持）→ 推送（操作手册：docs/GITHUB-PUSH-CN.md）
- [ ] 仓库加 topic `dsh-plugin`（dsh.so 自动索引）
- [ ] dsh.so /submit/ 粘贴仓库 URL → 过检 → Submit
- [ ] awesome-deepseek-harness（libukai）PR 收录（条目草稿：docs/AWESOME-ENTRY-CN.md；CONTRIBUTING 原文未抓到——GitHub 页面正文被截断，投 PR 前再看一眼）
- [ ] GitHub/Gitee Releases 打 v0.2.0 tag
- [ ] dsh-hub.cc / plugin.dshx.dev / alldsh.com 开放提交情况：未核实（待补）

### D. 待补（网络依赖）
- [ ] 语C 资产市场实价重扫（淘宝/小红书/Fiverr）→ 校准 PRICING-CN.md
- [ ] awesome CONTRIBUTING 原文核实

## 执行顺序（用户拍板 C 类后）

1. 建仓推送 + topic + tag（用户 3 分钟，手册就绪）
2. dsh.so 提交（粘贴 URL 即可，材料全齐）
3. awesome PR（条目草稿就绪）
4. 小红书首发篇（挂仓库/市场页链接）
