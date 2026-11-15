/* Saytga yuklanadigan TO'LIQ zip ni yasaydi: saytga-yuklash.zip (loyiha ildizida).
   Bot tokeni va chat ID kodda saqlanmaydi — bu yerda sirlar.json dan
   (gitignore'da) _worker.js nusxasiga yozib beriladi. sirlar.json bo'lmasa,
   zip tokensiz chiqadi: unda Cloudflare'da BOT_TOKEN va CHAT_ID berilgan
   bo'lishi kerak.                       Ishlatish: node tools/zip.js      */
const fs = require('fs'), path = require('path'), os = require('os'), { execFileSync } = require('child_process');
const ILDIZ = path.join(__dirname, '..'), DEPLOY = path.join(ILDIZ, 'deploy'), CHIQ = path.join(ILDIZ, 'saytga-yuklash.zip');
const FAYLLAR = ['index.html', 'fel.html', 'ustoz.html', 'jonli.html', 'sw.js', '_worker.js', 'manifest.json', 'logo.png', 'fon.jpg', 'ikon-ios.png', 'versiya.json'];
const v = JSON.parse(fs.readFileSync(path.join(DEPLOY, 'versiya.json'), 'utf8')).v;
for (const f of ['index.html', 'fel.html'])
  if (!fs.readFileSync(path.join(DEPLOY, f), 'utf8').includes(`window.AU_VERSIYA = '${v}'`)) { console.error(`✗ ${f} dagi AU_VERSIYA versiya.json (${v}) bilan bir xil emas`); process.exit(1); }
const vaqt = fs.mkdtempSync(path.join(os.tmpdir(), 'au-zip-'));
for (const f of FAYLLAR) fs.copyFileSync(path.join(DEPLOY, f), path.join(vaqt, f));
let sir = null;
try { sir = JSON.parse(fs.readFileSync(path.join(ILDIZ, 'sirlar.json'), 'utf8')); } catch (e) {}
if (sir && sir.BOT_TOKEN) {
  const w = path.join(vaqt, '_worker.js');
  let k = fs.readFileSync(w, 'utf8'), n = 0;
  const qoy = (nom, qiymat) => { k = k.replace(new RegExp(`(const ${nom}\\s*= )''`), (_, b) => { n++; return b + JSON.stringify(String(qiymat || '')).replace(/^"|"$/g, "'"); }); };
  qoy('BOT_TOKEN', sir.BOT_TOKEN); qoy('CHAT_ID', sir.CHAT_ID);
  if (n !== 2) { console.error('✗ _worker.js da BOT_TOKEN / CHAT_ID qatorlari topilmadi'); process.exit(1); }
  fs.writeFileSync(w, k);
}
try { fs.unlinkSync(CHIQ); } catch (e) {}
execFileSync('zip', ['-q', CHIQ].concat(FAYLLAR), { cwd: vaqt });
fs.rmSync(vaqt, { recursive: true, force: true });
console.log(`✓ saytga-yuklash.zip tayyor · versiya ${v} · ` + (sir && sir.BOT_TOKEN ? 'bot tokeni sirlar.json dan qo‘yildi'
  : 'TOKENSIZ — Cloudflare’da BOT_TOKEN va CHAT_ID berilgan bo‘lishi kerak, aks holda botga xabar kelmaydi'));
