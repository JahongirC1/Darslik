/* Jonli test brauzerda: pauza, burchakdagi PIN, kech qo'shilish, savol
   natijasida xato qilganlar, yakunda hammaning foizi.
   Ishlatish: node tools/pauza-ui.js [rasmlar-papkasi]                      */
const path = require('path'), { execSync } = require('child_process');
const { chromium } = require(path.join(execSync('npm root -g').toString().trim(), 'playwright'));
const { ishgaTushir, sqliteD1 } = require('./emul.js');
const OUT = process.argv[2];
let xato = 0;
const ok = (n, v) => { if (!v) xato++; console.log((v ? '  ✓ ' : '  ✗ ') + n); };
const matn = (p, s) => p.textContent(s).catch(() => '');
const rasm = async (p, n) => { if (OUT) { await p.waitForTimeout(300); await p.screenshot({ path: path.join(OUT, n) }); } };
(async () => {
  const BAZA = sqliteD1();
  const s = await ishgaTushir({ env: { BAZA, KABINET_PAROL: 'Bosh-Parol-2026' } });
  const U = s.url;
  const yoz = (y, b, t) => fetch(U + 'api/' + y, { method: 'POST', headers: Object.assign({ 'Content-Type': 'application/json' }, t ? { Authorization: 'Bearer ' + t } : {}), body: JSON.stringify(b) }).then(r => r.json());
  const AT = (await yoz('g/kirish', { login: 'admin', parol: 'Bosh-Parol-2026' })).token;
  const sv = ['kitob', 'qalam', 'daftar'].map((p, i) => ({ tur: 'tanlov', p: ['كِتَابٌ', 'قَلَمٌ', 'دَفْتَرٌ'][i], pAr: true, v: [p, 'uy', 'non', 'suv'], vAr: false, ok: 0, label: 'Tarjimasini toping' }));
  const o = await yoz('o/yarat', { nom: 'Pauza sinovi', vaqt: 20, savollar: sv, sozlama: {} }, AT);
  const b = await chromium.launch({ args: ['--autoplay-policy=no-user-gesture-required'] });
  const kp = await (await b.newContext({ viewport: { width: 1280, height: 860 } })).newPage();
  const jx = []; kp.on('pageerror', e => jx.push(e.message)); kp.on('dialog', d => d.accept());
  await kp.addInitScript(() => { try { localStorage.setItem('au_yangilik_v1', '9999-99-99'); } catch (e) {} });
  await kp.goto(U + 'ustoz.html'); await kp.fill('#kLogin', 'admin'); await kp.fill('#kParol', 'Bosh-Parol-2026'); await kp.click('#kBtn');
  await kp.waitForSelector('#eAsosiy.faol', { timeout: 8000 });
  await kp.evaluate(id => oyinOch(id), o.id); await kp.waitForSelector('#eOyin .oy-pin', { timeout: 6000 });
  const tel = async (ism) => {
    const p = await (await b.newContext({ viewport: { width: 390, height: 844 } })).newPage();
    p.on('pageerror', e => jx.push(e.message));
    await p.goto(U + 'jonli.html?pin=' + o.pin); await p.fill('#ism', ism); await p.click('#kirBtn'); await p.waitForTimeout(600); return p;
  };
  const A = await tel('Ali Valiyev'), B = await tel('Bobur Karimov');
  await kp.waitForTimeout(1600);
  await kp.click('#jBoshla'); await kp.waitForSelector('.jo-tayyor', { timeout: 5000 });
  ok('o‘yin boshlandi — burchakda PIN', await kp.isVisible('#jPinB') && (await matn(kp, '#jPinB b')).replace(/\D/g, '') === o.pin);
  await yoz('o/keyingi', { id: o.id, faza: 'tayyor', i: -1 }, AT); await kp.waitForSelector('.jo-savol', { timeout: 5000 });
  await A.waitForSelector('#eSavol.faol .oy-javob', { timeout: 6000 });
  await A.click('#eSavol .oy-javob >> nth=0');
  // o'yin boshlangach yangi talaba kiradi
  const D = await tel('Dilnoza Aliyeva');
  await D.waitForSelector('#eSavol.faol .oy-javob', { timeout: 6000 }).catch(() => {});
  ok('o‘yin boshlangach PIN bilan kirgan talaba savolni ko‘radi', await D.isVisible('#eSavol.faol .oy-javob'));
  await rasm(kp, 'p1-savol-pin.png');
  // pauza
  await kp.click('.jo-pauza-btn'); await kp.waitForSelector('.jo-pauza', { timeout: 4000 });
  const s1 = await matn(kp, '.oy-sekund'); await kp.waitForTimeout(2200); const s2 = await matn(kp, '.oy-sekund');
  ok('pauza: ustoz ekranida «⏸ Pauza», sekundomer to‘xtadi', /Pauza/.test(await matn(kp, '.jo-pauza')) && s1 === s2 && /Davom etish/.test(await matn(kp, '.jo-pauza-btn')));
  await B.waitForSelector('#pauzaQ', { timeout: 4000 }).catch(() => {});
  ok('talaba telefonida «Pauza» oynasi', await B.isVisible('#pauzaQ'));
  await rasm(kp, 'p2-pauza-ustoz.png'); await rasm(B, 'p3-pauza-talaba.png');
  await B.click('#eSavol .oy-javob >> nth=1', { force: true }).catch(() => {});
  ok('pauzada talaba javob bera olmaydi', !(await B.isVisible('#qabul')));
  await kp.click('.jo-pauza-btn'); await kp.waitForTimeout(1500);
  ok('davom etish — pauza oynasi yo‘qoldi, vaqt yana yuradi', !(await kp.isVisible('.jo-pauza')) && (await matn(kp, '.oy-sekund')) !== s2);
  await B.waitForSelector('#pauzaQ', { state: 'detached', timeout: 4000 }).catch(() => {});
  await B.click('#eSavol .oy-javob >> nth=1');
  await kp.waitForSelector('.jo-natija', { timeout: 8000 }).catch(() => {});
  if (!(await kp.isVisible('.jo-natija'))) { await yoz('o/keyingi', { id: o.id, faza: 'savol', i: 0 }, AT); await kp.waitForSelector('.jo-natija', { timeout: 5000 }); }
  ok('natijada «❌ Xato qildi»: Bobur', /Xato qildi/.test(await matn(kp, '.jo-shu-xato')) && /Bobur Karimov/.test(await matn(kp, '.jo-shu-xato')));
  ok('savol paytida kirgan Dilnoza «javob bermadi» deb yozilmaydi, Ali (to‘g‘ri) ham yo‘q', !/Dilnoza/.test(await matn(kp, '.jo-shu-xato')) && !/Ali Valiyev/.test(await matn(kp, '.jo-shu-xato')));
  ok('natijada ham burchakda PIN', await kp.isVisible('#jPinB'));
  await rasm(kp, 'p4-natija-xato.png');
  await yoz('o/tugat', { id: o.id }, AT);
  await kp.waitForSelector('#eOyin .oy-podium', { timeout: 6000 });
  const t = await kp.$$eval('.jo-royxat .oy-rq .t', e => e.map(x => x.textContent));
  ok('yakun: barcha o‘rinlarda har kimning foizi', t.length === 3 && t.every(x => /\d+%/.test(x)));
  ok('yakun: podiumda ham foiz', (await kp.$$eval('.oy-podium .oy-p-ball', e => e.filter(x => /%/.test(x.textContent)).length)) === 3);
  ok('yakunda burchakdagi PIN yo‘qoladi', !(await kp.isVisible('#jPinB')));
  await kp.waitForTimeout(2500); await rasm(kp, 'p5-yakun.png');
  await A.waitForSelector('#eYakun.faol', { timeout: 6000 }).catch(() => {});
  ok('talabada ham ro‘yxatda foiz', /\d+%/.test(await matn(A, '#eYakun .oy-rq')));
  ok('sahifalarda JS xatosi yo‘q', !jx.length || (console.log(jx), false));
  await b.close(); s.close();
  console.log(xato ? '\n' + xato + ' ta xato' : '\nhammasi joyida');
  process.exit(xato ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
