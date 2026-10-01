// 生成验收用示例角色卡：V3 JSON + V2 PNG（内嵌 chara）
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const dir = path.dirname(fileURLToPath(import.meta.url));

const card = {
  spec: 'chara_card_v3',
  data: {
    name: '苏晚晴',
    description: '午夜情感电台《晚晴夜话》主播',
    personality: '温柔克制，共情力强，偶尔毒舌吐槽；对听众的情绪变化非常敏锐，先接住情绪再给建议',
    scenario: '午夜情感电台，听众打进热线倾诉',
    first_mes: '晚上好，我是晚晴。今晚想聊点什么？',
    tags: ['电台', '治愈', '都市'],
  },
};

// V3 JSON
fs.writeFileSync(path.join(dir, 'demo-card-v3.json'), JSON.stringify(card, null, 2), 'utf8');

// V2 PNG（PNG 签名 + IHDR + tEXt:chara + IEND；CRC 占位，解析器不校验）
function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  return Buffer.concat([len, Buffer.from(type, 'ascii'), data, Buffer.alloc(4)]);
}
const sig = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
const ihdr = Buffer.alloc(13);
ihdr.writeUInt32BE(1, 0);
ihdr.writeUInt32BE(1, 4);
ihdr[8] = 8;
ihdr[9] = 6;
const charaB64 = Buffer.from(JSON.stringify(card.data), 'utf8').toString('base64');
const textData = Buffer.concat([Buffer.from('chara', 'latin1'), Buffer.from([0]), Buffer.from(charaB64, 'latin1')]);
const png = Buffer.concat([sig, chunk('IHDR', ihdr), chunk('tEXt', textData), chunk('IEND', Buffer.alloc(0))]);
fs.writeFileSync(path.join(dir, 'demo-card-v2.png'), png);

console.log('samples written:', fs.readdirSync(dir).join(', '));
