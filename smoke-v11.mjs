// V1.1 冷启动冒烟：全新进程解析包 → 验证 exports 与核心函数 + 样例卡
import fs from 'node:fs';
import { createRequire } from 'node:module';

const pkg = await import('dph-emotion-arc');
console.log('exports:', Object.keys(pkg).join(','));
if (typeof pkg.apply !== 'function' || typeof pkg.detect !== 'function'
  || typeof pkg.parseLlmResponse !== 'function' || typeof pkg.parseTavernCard !== 'function') {
  console.error('SMOKE FAIL: 缺失关键导出');
  process.exit(1);
}

const samples = 'C:/Users/Admin/Desktop/素材/dph-emotion-arc/samples/';
const r1 = pkg.parseTavernCard(fs.readFileSync(samples + 'demo-card-v2.png'));
console.log('png card:', r1 && r1.format, r1 && r1.card.name);
const r2 = pkg.parseTavernCard(fs.readFileSync(samples + 'demo-card-v3.json'));
console.log('json card:', r2 && r2.format, r2 && r2.card.name);
console.log('llm parse:', JSON.stringify(pkg.parseLlmResponse('{"label":"anger","intensity":0.9,"confidence":0.8}')));
console.log('detect:', JSON.stringify(pkg.detect('气死我了！！！', { minConfidence: 0.5 })));

const ok = r1 && r1.card.name === '苏晚晴' && r2 && r2.card.name === '苏晚晴';
console.log(ok ? 'SMOKE OK' : 'SMOKE FAIL: 样例卡解析不符');
process.exit(ok ? 0 : 1);
