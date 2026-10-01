// 验证人设包主卡：用插件解析器解析并打印摘要
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseTavernCard } from '../engine.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const file = path.join(here, 'persona-pack-suwanqing', '苏晚晴-角色卡-V3.json');
const r = parseTavernCard(fs.readFileSync(file));
if (!r) {
  console.error('FAIL: 无法解析主卡');
  process.exit(1);
}
console.log('format:', r.format);
console.log('name:', r.card.name);
console.log('personality 长度:', r.card.personality.length);
console.log('firstMes:', r.card.firstMes);
console.log('OK');
