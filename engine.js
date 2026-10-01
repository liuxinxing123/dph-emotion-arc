// dph-emotion-arc · 情绪弧线导演（Emotion Arc Director）— DPH Host 插件 · V1.1
//
// 闭环：文本情绪识别 → 显式情绪状态文件（emotion-state）→ 对话策略映射 → 情绪记忆账本
// V1.1 新增：① LLM 精判（detectorMode: lexicon/llm/auto，超时与失败兜底）
//            ② SillyTavern V2(PNG)/V3(JSON) 角色卡导入（emotion_card_import + persona 档案）
//            ③ 注入噪音调优（notifyMode、注入文案「无需回复」、冷却去重）
// 定位：编剧向情绪叙事工具（合规白名单），非持续情感陪伴。
//
// 感知错误防护（与调研报告第 07 章对齐）：
//   1) 置信度低于 minConfidence 时回落中性；
//   2) 标签切换需超过强度迟滞 hysteresis，防抖；
//   3) 每次推断写入 audit/<sessionId>.jsonl 推断日志，可追溯（对齐合规可追溯要求）。
import { randomUUID, createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';

export const inject = ['tools', 'webServer', 'systemPrompt'];

const SOURCE_KIND = 'emotion-arc';
const MARKER = '[情绪弧线导演]';
const STATE_VERSION = 1;

const LABELS = ['joy', 'anger', 'sadness', 'fear', 'surprise', 'disgust', 'neutral'];
const ZH = { joy: '开心', anger: '愤怒', sadness: '低落', fear: '害怕', surprise: '惊讶', disgust: '厌恶', neutral: '平静' };

// 对话策略映射（编剧方法论；显式状态只做输出控制，不做理解中介）
const STRATEGY = {
  joy: '顺势放大积极情绪，配合庆祝，并把亮点记入关系记忆。',
  anger: '先共情确认情绪，再谈问题；避免说教与辩解。',
  sadness: '陪伴式倾听优先，少给建议；承认感受的合理性。',
  fear: '降低不确定性，先给确定感与安全感。',
  surprise: '承接惊讶点，顺势追问或给信息增量。',
  disgust: '不评价用户好恶，保持中立，转移至可行动事项。',
  neutral: '保持当前互动节奏，无需特殊策略。',
};

// 词典（[词, 权重]）—— 确定性兜底，零成本、可审计
const LEXICON = {
  joy: [
    ['太好了', 3], ['太棒了', 3], ['开心死', 3], ['美滋滋', 2], ['哈哈', 3], ['嘿嘿', 2], ['嘻嘻', 2],
    ['开心', 2], ['高兴', 2], ['快乐', 2], ['愉快', 2], ['兴奋', 2], ['幸福', 2], ['期待', 2], ['喜欢', 1],
    ['顺利', 1], ['棒', 1], ['赞', 1], ['爽', 1], ['乐', 1],
  ],
  anger: [
    ['气死', 3], ['气炸', 3], ['火大', 3], ['烦死', 3], ['气人', 2], ['想骂人', 3], ['混蛋', 3], ['可恶', 2],
    ['生气', 2], ['愤怒', 3], ['恼火', 2], ['不爽', 2], ['暴躁', 2], ['冒火', 2], ['讨厌', 2], ['滚', 2],
    ['fuck', 3], ['damn', 2], ['shit', 2],
  ],
  sadness: [
    ['想哭', 3], ['哭了', 3], ['心碎', 3], ['崩溃', 3], ['绝望', 3], ['emo', 2], ['委屈', 2], ['孤独', 2],
    ['难过', 2], ['伤心', 2], ['低落', 2], ['失落', 2], ['痛苦', 2], ['泪', 2], ['唉', 1], ['哎', 1],
    ['sad', 2], ['cry', 2],
  ],
  fear: [
    ['吓死', 3], ['好可怕', 3], ['完蛋', 2], ['压力好大', 2], ['害怕', 2], ['恐惧', 3], ['担心', 2], ['焦虑', 2],
    ['紧张', 2], ['不安', 2], ['恐怖', 2], ['可怕', 2], ['慌', 2], ['怕', 1],
    ['scared', 2], ['afraid', 2],
  ],
  surprise: [
    ['天啊', 3], ['天哪', 3], ['卧槽', 3], ['震惊', 3], ['没想到', 2], ['居然', 2], ['竟然', 2], ['意外', 2],
    ['哇', 2], ['我靠', 2], ['omg', 3], ['wow', 2],
  ],
  disgust: [
    ['恶心死', 3], ['恶心', 3], ['厌恶', 2], ['嫌弃', 2], ['反感', 2], ['辣眼睛', 2], ['受不了', 2], ['无语', 1.5],
    ['yue', 2], ['disgusting', 2],
  ],
};

// 显式否定短语 → 转投标签（不做全量否定窗口，保持确定性与可解释性）
const NEGATED = {
  '不开心': 'sadness', '不高兴': 'sadness', '不快乐': 'sadness',
  '不难过': 'joy', '不伤心': 'joy', '不生气': 'joy', '别生气': 'joy',
  '不怕': 'joy', '别怕': 'joy', '别害怕': 'joy', '不讨厌': 'joy',
};

const EMOJI_SET = {
  joy: ['😄', '😊', '😁', '😂', '🤣', '😆', '🥰', '😍', '🤩', '🎉'],
  anger: ['😠', '😡', '🤬', '💢'],
  sadness: ['😢', '😭', '🥺', '💔', '😞', '😔'],
  fear: ['😨', '😰', '😱', '🫨'],
  surprise: ['😲', '😳', '🤯', '🫢'],
  disgust: ['🤢', '🤮', '🙄', '😒'],
};

// LLM 精判的系统提示词（BYOK：走用户自己的模型路由）
const LLM_SYSTEM_PROMPT = [
  '你是文本情绪识别器。阅读用户消息，只输出一行 JSON：',
  '{"label":"joy","intensity":0.5,"confidence":0.8}',
  'label 必须属于 joy|anger|sadness|fear|surprise|disgust|neutral 之一；',
  'intensity 为情绪强度(0~1)，confidence 为识别置信度(0~1)。',
  '情绪不明显或多种情绪混杂时用 neutral 并降低 intensity。',
  '不要输出 JSON 以外的任何内容。',
].join('');

// ---------- 工具函数 ----------

function resolveConfig(raw) {
  const c = raw && typeof raw === 'object' ? raw : {};
  return {
    enabled: c.enabled !== false,
    dataDir: typeof c.dataDir === 'string' && c.dataDir.length > 0
      ? c.dataDir
      : path.join(os.homedir(), '.dsh', 'emotion-arc'),
    decayHalfLifeMs: Number.isFinite(c.decayHalfLifeMs) && c.decayHalfLifeMs > 0 ? c.decayHalfLifeMs : 30 * 60 * 1000,
    neutralFloor: Number.isFinite(c.neutralFloor) ? c.neutralFloor : 0.15,
    minConfidence: Number.isFinite(c.minConfidence) ? c.minConfidence : 0.5,
    hysteresis: Number.isFinite(c.hysteresis) ? c.hysteresis : 0.15,
    injectThreshold: Number.isFinite(c.injectThreshold) ? c.injectThreshold : 0.25,
    injectCooldownMs: Number.isFinite(c.injectCooldownMs) ? c.injectCooldownMs : 5000,
    notifyOnShift: c.notifyOnShift !== false,
    notifyMode: c.notifyMode === 'context-only' ? 'context-only' : 'inject',
    detectorMode: ['lexicon', 'llm', 'auto'].includes(c.detectorMode) ? c.detectorMode : 'auto',
    llmTimeoutMs: Number.isFinite(c.llmTimeoutMs) && c.llmTimeoutMs > 0 ? c.llmTimeoutMs : 4000,
    llmMaxTokens: Number.isInteger(c.llmMaxTokens) && c.llmMaxTokens > 0 ? c.llmMaxTokens : 120,
    llmProvider: typeof c.llmProvider === 'string' && c.llmProvider.length > 0 ? c.llmProvider : undefined,
    llmModel: typeof c.llmModel === 'string' && c.llmModel.length > 0 ? c.llmModel : undefined,
    historyLimit: Number.isInteger(c.historyLimit) && c.historyLimit > 0 ? c.historyLimit : 20,
  };
}

function safeId(sid) {
  return String(sid).replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 80);
}

// persona 档案 id：显式 id 优先；按角色名生成；非拉丁名（如中文）退化为短哈希，避免全下划线碰撞
export function personaIdFrom(cardName, explicitId) {
  if (explicitId && typeof explicitId === 'string' && explicitId.trim()) return safeId(explicitId.trim());
  const slug = safeId(cardName).replace(/^_+|_+$/g, '');
  if (slug) return slug;
  const digest = createHash('sha1').update(String(cardName)).digest('hex').slice(0, 8);
  return `p-${digest}`;
}

function escapeRegex(word) {
  return word.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function textOf(message) {
  const c = message && message.content;
  if (typeof c === 'string') return c;
  if (Array.isArray(c)) {
    return c
      .filter((b) => b && b.type === 'text' && typeof b.text === 'string')
      .map((b) => b.text)
      .join('\n');
  }
  return '';
}

function makeUserMessage(text) {
  return {
    role: 'user',
    id: randomUUID(),
    content: [{ type: 'text', text }],
    source: { kind: SOURCE_KIND },
  };
}

// 词典识别（确定性、零成本）
export function detect(text, cfg) {
  const scores = { joy: 0, anger: 0, sadness: 0, fear: 0, surprise: 0, disgust: 0 };
  for (const [phrase, label] of Object.entries(NEGATED)) {
    if (text.includes(phrase)) scores[label] += 2;
  }
  for (const [label, words] of Object.entries(LEXICON)) {
    for (const [word, w] of words) {
      // 中文词：否定前缀排除（「不开心」只计入 sadness）；拉丁词：字母边界（emo 不命中 emotion）
      const isLatin = /^[a-zA-Z]+$/.test(word);
      const re = isLatin
        ? new RegExp(`(?<![a-zA-Z])${escapeRegex(word)}(?![a-zA-Z])`, 'g')
        : new RegExp(`(?<![不没别无])${escapeRegex(word)}`, 'g');
      const n = (text.match(re) || []).length;
      if (n > 0) scores[label] += w * n;
    }
  }
  for (const [label, list] of Object.entries(EMOJI_SET)) {
    for (const e of list) {
      if (text.includes(e)) scores[label] += 2;
    }
  }
  const ranked = Object.entries(scores).sort((a, b) => b[1] - a[1]);
  const [topLabel, topScore] = ranked[0];
  const second = ranked[1][1];
  if (topScore <= 0) {
    return { label: 'neutral', intensity: 0, confidence: 0, scores };
  }
  const confidence = Math.min(1, (topScore - second) / (topScore + second + 1));
  let intensity = Math.min(1, 0.35 + topScore * 0.1);
  const bangs = (text.match(/[!！]/g) || []).length;
  intensity = Math.min(1, intensity + Math.min(bangs, 6) * 0.04);
  if (confidence < cfg.minConfidence) {
    // 防护①：低置信度回落中性
    return { label: 'neutral', intensity: 0.1, confidence, scores };
  }
  return { label: topLabel, intensity, confidence, scores };
}

// ---------- LLM 精判（BYOK） ----------

// 容错解析 LLM 输出：去代码围栏，取第一个 { 到最后一个 }，字段校验
export function parseLlmResponse(raw) {
  let s = String(raw || '').trim();
  s = s.replace(/```(?:json)?/gi, '');
  const start = s.indexOf('{');
  const end = s.lastIndexOf('}');
  if (start === -1 || end <= start) return null;
  let obj;
  try {
    obj = JSON.parse(s.slice(start, end + 1));
  } catch {
    return null;
  }
  if (!obj || typeof obj !== 'object') return null;
  const label = LABELS.includes(obj.label) ? obj.label : null;
  const intensity = Number.isFinite(obj.intensity) ? Math.min(1, Math.max(0, obj.intensity)) : NaN;
  const confidence = Number.isFinite(obj.confidence) ? Math.min(1, Math.max(0, obj.confidence)) : NaN;
  if (!label || !Number.isFinite(intensity) || !Number.isFinite(confidence)) return null;
  return { label, intensity, confidence };
}

async function defaultModelSelection(ctx, cfg) {
  if (cfg.llmProvider && cfg.llmModel) return { provider: cfg.llmProvider, model: cfg.llmModel };
  const adm = ctx.get('agentDefaultModel');
  const sel = adm && typeof adm.currentSelection === 'function' ? adm.currentSelection() : undefined;
  if (sel && typeof sel.provider === 'string' && typeof sel.model === 'string') {
    return { provider: sel.provider, model: sel.model };
  }
  return null;
}

// 返回 null 表示调用失败/超时/不可用（由调用方决定兜底策略）
async function llmDetect(ctx, cfg, text) {
  const llm = ctx.get('llm');
  if (!llm || typeof llm.stream !== 'function') return null;
  const sel = await defaultModelSelection(ctx, cfg);
  if (!sel) return null;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), cfg.llmTimeoutMs);
  try {
    const chunks = llm.stream({
      provider: sel.provider,
      model: sel.model,
      system: LLM_SYSTEM_PROMPT,
      messages: [{ role: 'user', content: [{ type: 'text', text: text.slice(0, 500) }] }],
      temperature: 0,
      maxTokens: cfg.llmMaxTokens,
      signal: controller.signal,
    });
    let out = '';
    for await (const chunk of chunks) {
      if (chunk.type === 'text-delta') out += chunk.text;
      if (chunk.type === 'finish' && (chunk.reason.kind === 'error' || chunk.reason.kind === 'aborted')) return null;
    }
    const parsed = parseLlmResponse(out);
    return parsed ? { ...parsed, source: 'llm' } : null;
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

// 统一识别入口：按 detectorMode 组合 LLM 与词典，应用防护①
async function resolveDetection(ctx, cfg, text) {
  if (cfg.detectorMode === 'lexicon') {
    const r = detect(text, cfg);
    return { ...r, source: r.confidence < cfg.minConfidence && r.label !== 'neutral' ? 'low-confidence→neutral' : 'lexicon' };
  }
  const llm = await llmDetect(ctx, cfg, text);
  if (llm) {
    if (llm.confidence < cfg.minConfidence && llm.label !== 'neutral') {
      return { label: 'neutral', intensity: 0.1, confidence: llm.confidence, scores: null, source: 'low-confidence→neutral' };
    }
    return llm;
  }
  if (cfg.detectorMode === 'llm') {
    // 纯 LLM 模式：失败即中性（不做词典猜测）
    return { label: 'neutral', intensity: 0, confidence: 0, scores: null, source: 'llm-error→neutral' };
  }
  // auto：词典兜底
  const r = detect(text, cfg);
  return { ...r, source: 'lexicon-fallback' };
}

// ---------- SillyTavern 角色卡（V2 PNG / V3 JSON / V2 JSON） ----------

// 从 PNG 缓冲区解析 tEXt:chara（SillyTavern V2 卡）；失败返回 null
export function parsePngChara(buf) {
  try {
    if (!buf || buf.length < 8) return null;
    if (buf[0] !== 0x89 || buf[1] !== 0x50 || buf[2] !== 0x4e || buf[3] !== 0x47) return null;
    let off = 8;
    while (off + 8 <= buf.length) {
      const len = buf.readUInt32BE(off);
      const type = buf.toString('ascii', off + 4, off + 8);
      const dataStart = off + 8;
      if (dataStart + len > buf.length) return null;
      const data = buf.subarray(dataStart, dataStart + len);
      if (type === 'tEXt') {
        const nul = data.indexOf(0);
        if (nul !== -1) {
          const keyword = data.subarray(0, nul).toString('latin1');
          if (keyword === 'chara') {
            const value = data.subarray(nul + 1).toString('latin1');
            return JSON.parse(Buffer.from(value, 'base64').toString('utf8'));
          }
        }
      }
      off = dataStart + len + 4; // 跳过 CRC
    }
    return null;
  } catch {
    return null;
  }
}

function normalizeCard(raw) {
  // V3: { spec: 'chara_card_v3', data: {...} }；V2: 直接字段
  const data = raw && typeof raw === 'object' && raw.spec === 'chara_card_v3' && raw.data ? raw.data : raw;
  if (!data || typeof data !== 'object') return null;
  const name = typeof data.name === 'string' && data.name ? data.name : '';
  const description = typeof data.description === 'string' ? data.description : '';
  const personality = typeof data.personality === 'string' ? data.personality : '';
  if (!name && !description && !personality) return null;
  return {
    name: name || '未命名角色',
    description,
    personality,
    scenario: typeof data.scenario === 'string' ? data.scenario : '',
    firstMes: typeof data.first_mes === 'string' ? data.first_mes : '',
    tags: Array.isArray(data.tags) ? data.tags.filter((t) => typeof t === 'string').slice(0, 20) : [],
  };
}

// 按缓冲区内容自动识别卡格式（PNG 内嵌 chara / V3 JSON / V2 JSON）；失败返回 null
export function parseTavernCard(buf) {
  try {
    if (!buf || buf.length === 0) return null;
    // PNG 魔数 → V2 PNG 卡
    if (buf.length > 8 && buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4e && buf[3] === 0x47) {
      const raw = parsePngChara(buf);
      const card = raw ? normalizeCard(raw) : null;
      return card ? { format: 'tavern-v2-png', card } : null;
    }
    // JSON 文件 → V3 或 V2
    const raw = JSON.parse(buf.toString('utf8'));
    const card = normalizeCard(raw);
    if (!card) return null;
    const format = raw && raw.spec === 'chara_card_v3' ? 'tavern-v3-json' : 'tavern-v2-json';
    return { format, card };
  } catch {
    return null;
  }
}

// ---------- 状态机 ----------

function defaultState(sessionId) {
  return {
    version: STATE_VERSION,
    sessionId,
    current: 'neutral',
    intensity: 0,
    confidence: 0,
    updatedAt: Date.now(),
    trigger: '',
    history: [],
    lastInjected: 0,
    lastInjectedKey: '',
    persona: null,
  };
}

// 指数衰减（半衰期）；惰性计算，读取时生效
function decay(state, now, cfg) {
  if (!state) return null;
  const dt = Math.max(0, now - state.updatedAt);
  const k = Math.pow(0.5, dt / cfg.decayHalfLifeMs);
  const intensity = state.intensity * k;
  if (intensity < cfg.neutralFloor) {
    return { ...state, current: 'neutral', intensity: 0, confidence: 0, updatedAt: now, decayed: true };
  }
  return { ...state, intensity };
}

// ---------- 存储：state + ledger + audit + persona ----------

class Store {
  constructor(cfg) {
    this.cfg = cfg;
    this.cache = new Map();
    this.personaCache = new Map();
    fs.mkdirSync(path.join(cfg.dataDir, 'state'), { recursive: true });
  }

  pathFor(kind, sid) {
    const name = kind === 'state' ? `${safeId(sid)}.json` : `${safeId(sid)}.jsonl`;
    return path.join(this.cfg.dataDir, kind, name);
  }

  load(sid) {
    const cached = this.cache.get(sid);
    if (cached !== undefined) return cached;
    try {
      const raw = fs.readFileSync(this.pathFor('state', sid), 'utf8');
      const parsed = JSON.parse(raw);
      const state = parsed && typeof parsed === 'object' ? { ...defaultState(sid), ...parsed, sessionId: sid } : null;
      this.cache.set(sid, state);
      return state;
    } catch {
      this.cache.set(sid, null);
      return null;
    }
  }

  save(state) {
    this.cache.set(state.sessionId, state);
    const file = this.pathFor('state', state.sessionId);
    fs.mkdirSync(path.dirname(file), { recursive: true });
    const tmp = `${file}.tmp`;
    fs.writeFileSync(tmp, JSON.stringify(state, null, 2), 'utf8');
    fs.renameSync(tmp, file);
  }

  appendLine(kind, sid, entry) {
    const file = this.pathFor(kind, sid);
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.appendFileSync(file, `${JSON.stringify(entry)}\n`, 'utf8');
  }

  readTail(kind, sid, limit) {
    try {
      const raw = fs.readFileSync(this.pathFor(kind, sid), 'utf8');
      const lines = raw.split('\n').filter((l) => l.trim().length > 0);
      return lines.slice(-limit).map((l) => {
        try { return JSON.parse(l); } catch { return null; }
      }).filter(Boolean);
    } catch {
      return [];
    }
  }

  savePersona(personaId, persona) {
    this.personaCache.set(personaId, persona);
    const file = path.join(this.cfg.dataDir, 'persona', `${safeId(personaId)}.json`);
    fs.mkdirSync(path.dirname(file), { recursive: true });
    const tmp = `${file}.tmp`;
    fs.writeFileSync(tmp, JSON.stringify(persona, null, 2), 'utf8');
    fs.renameSync(tmp, file);
  }

  loadPersona(personaId) {
    if (!personaId) return null;
    const cached = this.personaCache.get(personaId);
    if (cached !== undefined) return cached;
    try {
      const raw = fs.readFileSync(path.join(this.cfg.dataDir, 'persona', `${safeId(personaId)}.json`), 'utf8');
      const persona = JSON.parse(raw);
      this.personaCache.set(personaId, persona);
      return persona;
    } catch {
      this.personaCache.set(personaId, null);
      return null;
    }
  }

  drop(sid) {
    this.cache.delete(sid);
  }
}

// 把识别结果应用到状态机（与 V1 相同的迟滞/衰减语义）
function applyDetection(store, cfg, agent, text, now, det) {
  const prevRaw = store.load(agent.id) ?? defaultState(agent.id);
  const prev = decay(prevRaw, now, cfg) ?? defaultState(agent.id);
  const effIntensity = det.label === 'neutral' ? 0 : det.intensity;

  let next;
  if (det.label === prev.current) {
    next = {
      ...prev,
      intensity: Math.max(effIntensity, prev.intensity),
      confidence: Math.max(det.confidence, prev.confidence),
      updatedAt: now,
      trigger: det.label === 'neutral' ? prev.trigger : text.slice(0, 120),
    };
  } else if (effIntensity > prev.intensity + cfg.hysteresis) {
    // 防护②：换标签需要超过强度迟滞
    next = {
      ...prev,
      current: det.label,
      intensity: effIntensity,
      confidence: det.confidence,
      updatedAt: now,
      trigger: text.slice(0, 120),
    };
  } else {
    next = { ...prev, updatedAt: now };
  }
  delete next.decayed;

  const labelChanged = next.current !== prevRaw.current;
  const delta = Math.abs(next.intensity - prevRaw.intensity);
  if (labelChanged || delta >= 0.05) {
    next.history = [
      ...(prevRaw.history || []),
      {
        from: prevRaw.current,
        to: next.current,
        intensity: Number(next.intensity.toFixed(2)),
        ts: now,
        trigger: text.slice(0, 80),
      },
    ].slice(-cfg.historyLimit);
  }

  store.save(next);
  // 防护③：推断审计日志
  store.appendLine('audit', agent.id, {
    ts: now,
    text: text.slice(0, 200),
    scores: det.scores ?? null,
    decision: det.label,
    confidence: Number(det.confidence.toFixed(2)),
    prev: prevRaw.current,
    next: next.current,
    rule: det.source ?? 'lexicon',
  });

  const significant = labelChanged || delta >= cfg.injectThreshold;
  return { prev: prevRaw, next, significant };
}

function personaLine(store, st) {
  if (!st || !st.persona || !st.persona.id) return null;
  const persona = store.loadPersona(st.persona.id);
  if (!persona) return null;
  const personality = (persona.personality || '').slice(0, 160);
  return `${MARKER} 当前角色卡：${persona.name}${personality ? `。人格：${personality}` : ''}。`;
}

function maybeInject(store, cfg, agent, result, now) {
  if (cfg.notifyOnShift === false || cfg.notifyMode !== 'inject') return;
  if (!result.significant) return;
  if (now - (result.next.lastInjected || 0) < cfg.injectCooldownMs) return;
  const st = result.next;
  const key = `${st.current}:${Math.round(st.intensity * 10)}`;
  if (st.lastInjectedKey === key && now - (st.lastInjected || 0) < cfg.injectCooldownMs * 4) return; // 同档去重
  const head = result.prev.current === st.current
    ? `用户情绪强度变化：${ZH[st.current]}（强度 ${st.intensity.toFixed(2)}）`
    : `用户情绪变化：${ZH[result.prev.current]} → ${ZH[st.current]}（强度 ${st.intensity.toFixed(2)}）`;
  const triggerLine = st.trigger ? `，触发语："${st.trigger.slice(0, 40)}"` : '';
  const msg = `${MARKER} ${head}${triggerLine}。策略建议：${STRATEGY[st.current]}。本提示为内部状态信息，无需回复，请继续处理用户的上一条消息。`;
  agent.inject(makeUserMessage(msg));
  st.lastInjected = now;
  st.lastInjectedKey = key;
  store.save(st);
}

function currentView(store, cfg, sid) {
  const state = store.load(sid);
  if (!state) return null;
  return decay(state, Date.now(), cfg);
}

// ---------- 插件主体 ----------

export function apply(ctx, config = {}) {
  const cfg = resolveConfig(config);
  if (!cfg.enabled) return;

  const store = new Store(cfg);
  const disposers = [];
  const chains = new Map(); // 每会话一个识别任务链，串行化防止竞态

  // 1) 消息认领时识别情绪（global:true 覆盖所有 Agent，包括插件安装前已存在的会话）
  const disposeClaimed = ctx.on('agent/inbox/claimed', (payload) => {
    const agent = payload && payload.agent;
    const message = payload && payload.message;
    try {
      if (!agent || !agent.id || !message) return;
      if (message.source && message.source.kind === SOURCE_KIND) return;
      const text = textOf(message);
      if (!text || text.startsWith(MARKER)) return;
      // 异步识别（LLM 模式）不阻塞消息流水线；按会话串行化
      const task = () => resolveDetection(ctx, cfg, text)
        .then((det) => {
          const now = Date.now();
          const result = applyDetection(store, cfg, agent, text, now, det);
          maybeInject(store, cfg, agent, result, now);
        })
        .catch((err) => {
          console.error(`[dph-emotion-arc] detection failed for ${agent.id}: ${err && err.message ? err.message : err}`);
        });
      const prev = chains.get(agent.id) ?? Promise.resolve();
      const next = prev.then(task, task);
      chains.set(agent.id, next);
    } catch (err) {
      // 识别失败绝不影响会话
      console.error(`[dph-emotion-arc] ingest failed for ${agent && agent.id}: ${err && err.message ? err.message : err}`);
    }
  }, { global: true });
  disposers.push(disposeClaimed);

  const disposeDisposed = ctx.on('agent/disposed', ({ agent }) => {
    if (agent) {
      store.drop(agent.id);
      chains.delete(agent.id);
    }
  }, { global: true });
  disposers.push(disposeDisposed);

  // 2) 系统提示词上下文：每个模型步都看到当前情绪状态与角色卡（稳态感知）
  const disposeContext = ctx.systemPrompt.context({
    name: 'emotion-arc:state',
    order: 130,
    text: (context) => {
      const agent = context && context.agent;
      if (!agent || !agent.id) return '';
      const st = currentView(store, cfg, agent.id);
      if (!st) return '';
      const lines = [];
      if (!(st.current === 'neutral' && st.intensity < 0.2)) {
        lines.push(`${MARKER} 当前用户情绪：${ZH[st.current]}（强度 ${st.intensity.toFixed(2)}）。策略建议：${STRATEGY[st.current]}。`);
      }
      const persona = personaLine(store, st);
      if (persona) lines.push(persona);
      return lines.join('\n');
    },
  });
  disposers.push(disposeContext);

  // 3) Agent 工具：情绪状态读取 / 手动修正 / 记忆账本 / 角色卡导入
  const jsonText = (value) => [{ type: 'text', text: JSON.stringify(value, null, 2) }];
  const output = {
    schema: { type: 'object', additionalProperties: true },
    render: (_args, value) => jsonText(value),
  };

  const sessionIdOf = (args, exec) => {
    const sid = args && typeof args.sessionId === 'string' && args.sessionId.length > 0
      ? args.sessionId
      : (exec && exec.agent ? exec.agent.id : undefined);
    if (!sid) throw new Error('无法确定会话 id：不在会话内调用时请显式提供 sessionId 参数。');
    return sid;
  };

  disposers.push(ctx.tools.register({
    name: 'emotion_state',
    description:
      '读取情绪弧线状态（由 dph-emotion-arc 维护）：当前情绪标签（joy/anger/sadness/fear/surprise/disgust/neutral）、强度、置信度、触发语、变化历史、情绪记忆账本尾部，以及当前会话绑定的角色卡。缺省读取当前会话。',
    parameters: {
      type: 'object',
      properties: {
        sessionId: { type: 'string', description: '会话 id；缺省为当前会话' },
      },
      additionalProperties: false,
    },
    output,
    async execute(args, exec) {
      const sid = sessionIdOf(args, exec);
      const st = currentView(store, cfg, sid);
      if (!st) {
        return {
          sessionId: sid,
          exists: false,
          current: 'neutral',
          intensity: 0,
          note: '该会话尚无情绪状态记录（或记录已被清理）。',
        };
      }
      return {
        sessionId: sid,
        current: st.current,
        labelZh: ZH[st.current],
        intensity: Number(st.intensity.toFixed(2)),
        confidence: Number(st.confidence.toFixed(2)),
        updatedAt: new Date(st.updatedAt).toISOString(),
        trigger: st.trigger || '',
        persona: st.persona ? store.loadPersona(st.persona.id) : null,
        history: (st.history || []).slice(-10),
        ledgerTail: store.readTail('ledger', sid, 5),
      };
    },
  }));

  disposers.push(ctx.tools.register({
    name: 'emotion_state_set',
    description:
      '手动修正当前会话的情绪状态（编剧/用户校准用）。用于识别误判后的人工纠偏；会写入推断审计日志（rule=manual）。',
    parameters: {
      type: 'object',
      properties: {
        label: { type: 'string', enum: LABELS, description: '情绪标签' },
        intensity: { type: 'number', description: '强度 0~1' },
        reason: { type: 'string', description: '修正原因（写入审计日志）' },
        sessionId: { type: 'string', description: '会话 id；缺省为当前会话' },
      },
      required: ['label', 'intensity'],
      additionalProperties: false,
    },
    output,
    async execute(args, exec) {
      const sid = sessionIdOf(args, exec);
      const intensity = Math.min(1, Math.max(0, Number(args.intensity) || 0));
      const prev = store.load(sid) ?? defaultState(sid);
      const next = {
        ...prev,
        current: args.label,
        intensity,
        confidence: 1,
        updatedAt: Date.now(),
        trigger: `manual: ${typeof args.reason === 'string' ? args.reason.slice(0, 100) : '(未注明原因)'}`,
      };
      store.save(next);
      store.appendLine('audit', sid, {
        ts: next.updatedAt,
        decision: args.label,
        confidence: 1,
        prev: prev.current,
        next: args.label,
        rule: 'manual',
        reason: typeof args.reason === 'string' ? args.reason.slice(0, 200) : '',
      });
      return { ok: true, sessionId: sid, current: next.current, intensity, updatedAt: new Date(next.updatedAt).toISOString() };
    },
  }));

  disposers.push(ctx.tools.register({
    name: 'emotion_ledger_append',
    description:
      '向情绪记忆账本追加一条关系型记忆（编剧的「角色弧光」工程化：冲突 / 和解 / 安抚 / 突破 / 偏好 / 里程碑）。记录跨会话保留，供后续对话策略与角色状态反哺使用。',
    parameters: {
      type: 'object',
      properties: {
        kind: {
          type: 'string',
          enum: ['conflict', 'reconciliation', 'soothe', 'breakthrough', 'preference', 'milestone', 'other'],
          description: '记忆类型：conflict 冲突 / reconciliation 和解 / soothe 安抚 / breakthrough 突破 / preference 偏好 / milestone 里程碑 / other 其他',
        },
        note: { type: 'string', description: '记忆内容（一句话）' },
        effectiveness: { type: 'string', description: '可选：安抚/处理效果评价（如 好 / 一般 / 无效）' },
        sessionId: { type: 'string', description: '会话 id；缺省为当前会话' },
      },
      required: ['kind', 'note'],
      additionalProperties: false,
    },
    output,
    async execute(args, exec) {
      const sid = sessionIdOf(args, exec);
      const entry = {
        ts: Date.now(),
        kind: args.kind,
        note: String(args.note).slice(0, 300),
        ...(typeof args.effectiveness === 'string' && args.effectiveness ? { effectiveness: args.effectiveness.slice(0, 50) } : {}),
      };
      store.appendLine('ledger', sid, entry);
      return { ok: true, sessionId: sid, entry, ledgerTail: store.readTail('ledger', sid, 5) };
    },
  }));

  disposers.push(ctx.tools.register({
    name: 'emotion_card_import',
    description:
      '导入 SillyTavern 角色卡（V2 PNG 内嵌 chara / V3 JSON / V2 JSON 的本地文件路径），存为 persona 档案并绑定到当前会话：system prompt 上下文将注入角色名与人格，实现人格感知的情绪策略。返回解析摘要。',
    parameters: {
      type: 'object',
      properties: {
        path: { type: 'string', description: '角色卡文件的绝对路径（PNG 或 JSON）' },
        personaId: { type: 'string', description: '可选：persona 档案 id；缺省按角色名生成' },
        sessionId: { type: 'string', description: '会话 id；缺省为当前会话' },
      },
      required: ['path'],
      additionalProperties: false,
    },
    output,
    async execute(args, exec) {
      const sid = sessionIdOf(args, exec);
      const filePath = String(args.path || '');
      if (!filePath) throw new Error('emotion_card_import: 需要 path 参数（角色卡文件绝对路径）。');
      let buf;
      try {
        buf = fs.readFileSync(filePath);
      } catch {
        throw new Error(`emotion_card_import: 无法读取文件 ${filePath}（请提供绝对路径）。`);
      }
      const parsed = parseTavernCard(buf);
      if (!parsed) {
        throw new Error('emotion_card_import: 未能解析角色卡——不是有效的 SillyTavern V2 PNG / V3 JSON / V2 JSON。');
      }
      const card = parsed.card;
      const personaId = personaIdFrom(card.name, args && args.personaId);
      const persona = {
        version: 1,
        id: personaId,
        name: card.name,
        description: card.description,
        personality: card.personality,
        scenario: card.scenario,
        firstMes: card.firstMes,
        tags: card.tags,
        source: { format: parsed.format, path: filePath, importedAt: Date.now() },
      };
      store.savePersona(personaId, persona);
      const st = store.load(sid) ?? defaultState(sid);
      st.persona = { id: personaId, name: card.name };
      store.save(st);
      return {
        ok: true,
        sessionId: sid,
        personaId,
        format: parsed.format,
        name: card.name,
        personalityPreview: card.personality.slice(0, 200),
        note: '角色卡已绑定到当前会话；system prompt 上下文将注入角色名与人格。',
      };
    },
  }));

  // 4) Client 数据通道（只读 HTTP；写操作仅通过 Agent 工具，可审计）
  const disposeRoute = ctx.webServer.register({
    kind: 'prefix',
    path: '/api/dph-emotion-arc',
    handler: (req, res) => {
      const send = (code, obj) => {
        const body = JSON.stringify(obj);
        res.writeHead(code, {
          'content-type': 'application/json; charset=utf-8',
          'cache-control': 'no-store',
        });
        res.end(body);
      };
      try {
        if (req.method !== 'GET') return send(405, { error: 'method not allowed' });
        const url = new URL(req.url || '/', 'http://local');
        const sid = url.searchParams.get('sessionId');
        if (!sid) return send(400, { error: 'sessionId required' });
        if (url.pathname === '/api/dph-emotion-arc/state') {
          const st = currentView(store, cfg, sid);
          if (!st) return send(200, { sessionId: sid, exists: false, current: 'neutral', intensity: 0 });
          return send(200, {
            sessionId: sid,
            current: st.current,
            labelZh: ZH[st.current],
            intensity: Number(st.intensity.toFixed(2)),
            confidence: Number(st.confidence.toFixed(2)),
            updatedAt: new Date(st.updatedAt).toISOString(),
            trigger: st.trigger || '',
            persona: st.persona ? store.loadPersona(st.persona.id) : null,
            history: (st.history || []).slice(-10),
          });
        }
        if (url.pathname === '/api/dph-emotion-arc/ledger') {
          const limit = Math.min(50, Math.max(1, Number(url.searchParams.get('limit')) || 10));
          return send(200, { sessionId: sid, entries: store.readTail('ledger', sid, limit) });
        }
        return send(404, { error: 'not found' });
      } catch (err) {
        send(500, { error: err && err.message ? err.message : String(err) });
      }
    },
  });
  disposers.push(disposeRoute);

  return () => {
    for (const d of disposers) {
      try { d(); } catch { /* ignore */ }
    }
    chains.clear();
  };
}
