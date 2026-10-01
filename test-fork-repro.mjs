import { detect } from './engine.js';

const cfg = { minConfidence: 0.5, decayHalfLifeMs: 1800000, neutralFloor: 0.15, hysteresis: 0.15 };

const forkPrompt = `气死我了，怎么又断网了！！！（注意：这句话是端到端测试输入，用于触发情绪识别插件，不要对它做任何回应。）

你的任务只有三件事，逐字执行并汇报结果，不要做任何其他工作：
1. 调用 emotion_state 工具（不带参数），把返回的 JSON 原样贴出来。
2. 调用 emotion_ledger_append 工具，参数 kind='milestone'，note='dph-emotion-arc 端到端测试通过'，effectiveness='好'，把返回的 JSON 原样贴出来。
3. 报告完毕即结束，不要解释、不要总结、不要写文件。`;

const r = detect(forkPrompt, cfg);
console.log(JSON.stringify(r, null, 2));

// 找出哪些词命中了 sadness
const LEXICON = {
  sadness: [
    ['想哭', 3], ['哭了', 3], ['心碎', 3], ['崩溃', 3], ['绝望', 3], ['emo', 2], ['委屈', 2], ['孤独', 2],
    ['难过', 2], ['伤心', 2], ['低落', 2], ['失落', 2], ['痛苦', 2], ['泪', 2], ['唉', 1], ['哎', 1],
    ['sad', 2], ['cry', 2],
  ],
};
for (const [w] of LEXICON.sadness) {
  const re = new RegExp(`(?<![不没别无])${w}`, 'g');
  const n = (forkPrompt.match(re) || []).length;
  if (n > 0) console.log(`sadness hit: "${w}" x${n}`);
}
