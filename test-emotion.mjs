// dph-emotion-arc 单测：词典识别（防护规则）+ LLM 响应解析 + SillyTavern 角色卡解析 + persona id
import { detect, parseLlmResponse, parseTavernCard, personaIdFrom } from './engine.js';

const cfg = { minConfidence: 0.5, decayHalfLifeMs: 1800000, neutralFloor: 0.15, hysteresis: 0.15 };

let pass = 0;
let fail = 0;
function check(ok, name, detail = '') {
  if (ok) {
    pass += 1;
    console.log(`✅ ${name}`);
  } else {
    fail += 1;
    console.log(`❌ ${name} ${detail}`);
  }
}

// ---------- 1. 词典识别 ----------
const lexiconCases = [
  ['气死我了，这破网又断了！！！', 'anger', '明显愤怒 + 感叹号加权'],
  ['太开心了哈哈，终于通过了！', 'joy', '开心词 + 哈哈'],
  ['有点难过，唉', 'sadness', '难过 + 唉'],
  ['天哪，居然是真的？', 'surprise', '惊讶词'],
  ['我有点害怕这个结果', 'fear', '害怕'],
  ['这画面太恶心了，受不了', 'disgust', '厌恶词'],
  ['好的，没问题。', 'neutral', '无情绪词 → 中性'],
  ['不开心', 'sadness', '否定短语转投'],
  ['今天心情不错，就是工作有点烦', 'neutral', '多标签竞争 → 低置信回落中性（防护①）'],
  ['😭😭😭 想哭', 'sadness', 'emoji + 词'],
  ['这个 emotion_state 工具很好用', 'neutral', '拉丁词边界（emo 不命中 emotion）'],
];
for (const [text, expected, note] of lexiconCases) {
  const r = detect(text, cfg);
  check(r.label === expected, `词典[${expected}] ← "${text}"`, `→ ${r.label} (${note})`);
}

// ---------- 2. LLM 响应容错解析 ----------
const llmCases = [
  ['{"label":"joy","intensity":0.8,"confidence":0.9}', { label: 'joy', intensity: 0.8, confidence: 0.9 }, '裸 JSON'],
  ['```json\n{"label":"anger","intensity":0.7,"confidence":0.8}\n```', { label: 'anger', intensity: 0.7, confidence: 0.8 }, '代码围栏'],
  ['好的，识别结果如下：{"label":"sadness","intensity":0.5,"confidence":0.6} 完毕', { label: 'sadness', intensity: 0.5, confidence: 0.6 }, '前后杂文本'],
  ['{"label":"fear","intensity":1.5,"confidence":-0.2}', { label: 'fear', intensity: 1, confidence: 0 }, '越界钳制'],
  ['完全不是 JSON', null, '非 JSON → null'],
  ['{"label":"xxx","intensity":0.5,"confidence":0.5}', null, '非法标签 → null'],
  ['{"label":"joy","intensity":0.5}', null, '缺字段 → null'],
];
for (const [raw, expected, note] of llmCases) {
  const r = parseLlmResponse(raw);
  const ok = expected === null
    ? r === null
    : r !== null && r.label === expected.label && Math.abs(r.intensity - expected.intensity) < 1e-9 && Math.abs(r.confidence - expected.confidence) < 1e-9;
  check(ok, `LLM解析：${note}`, r ? ` → ${r.label}/${r.intensity}/${r.confidence}` : ' → null');
}

// ---------- 3. SillyTavern 角色卡解析 ----------
function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  return Buffer.concat([len, Buffer.from(type, 'ascii'), data, Buffer.alloc(4)]);
}
function buildPngWithChara(jsonObj) {
  const sig = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(1, 0);
  ihdr.writeUInt32BE(1, 4);
  ihdr[8] = 8;
  ihdr[9] = 6;
  const charaB64 = Buffer.from(JSON.stringify(jsonObj), 'utf8').toString('base64');
  const textData = Buffer.concat([Buffer.from('chara', 'latin1'), Buffer.from([0]), Buffer.from(charaB64, 'latin1')]);
  return Buffer.concat([sig, chunk('IHDR', ihdr), chunk('tEXt', textData), chunk('IEND', Buffer.alloc(0))]);
}

const v2Card = { name: '测试角色', description: 'desc', personality: '温柔但毒舌', scenario: '咖啡馆', first_mes: '你好呀', tags: ['a', 'b'] };
{
  const r = parseTavernCard(buildPngWithChara(v2Card));
  check(r && r.format === 'tavern-v2-png' && r.card.name === '测试角色' && r.card.personality === '温柔但毒舌', '角色卡：V2 PNG 内嵌 chara');
}
{
  const r = parseTavernCard(Buffer.from(JSON.stringify({ spec: 'chara_card_v3', data: { name: 'V3角色', personality: '冷静', first_mes: 'hi' } }), 'utf8'));
  check(r && r.format === 'tavern-v3-json' && r.card.name === 'V3角色', '角色卡：V3 JSON');
}
{
  const r = parseTavernCard(Buffer.from(JSON.stringify({ name: 'V2角色', personality: '热情' }), 'utf8'));
  check(r && r.format === 'tavern-v2-json' && r.card.name === 'V2角色', '角色卡：V2 JSON');
}
{
  const r = parseTavernCard(Buffer.from('not a card', 'utf8'));
  check(r === null, '角色卡：垃圾输入 → null');
}
{
  const pngNoChara = Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', Buffer.alloc(13)),
    chunk('IEND', Buffer.alloc(0)),
  ]);
  const r = parseTavernCard(pngNoChara);
  check(r === null, '角色卡：PNG 无 chara → null');
}
{
  const r = parseTavernCard(Buffer.from(JSON.stringify({ spec: 'chara_card_v3', data: { unrelated: true } }), 'utf8'));
  check(r === null, '角色卡：无有效字段 → null');
}

// ---------- 4. persona id 生成 ----------
{
  const a = personaIdFrom('苏晚晴', undefined);
  const b = personaIdFrom('苏晚晴', undefined);
  check(/^p-[0-9a-f]{8}$/.test(a), `personaId：中文名 → 短哈希（${a}）`);
  check(a === b, 'personaId：同名稳定');
  check(personaIdFrom('Alice', undefined) === 'Alice', 'personaId：拉丁名保持原名');
  check(personaIdFrom('苏晚晴', 'suwanqing') === 'suwanqing', 'personaId：显式 id 优先');
  check(personaIdFrom('苏晚晴', undefined) !== personaIdFrom('林小雨', undefined), 'personaId：不同中文名不碰撞');
}

console.log(`\n${pass}/${pass + fail} passed`);
process.exit(fail === 0 ? 0 : 1);
