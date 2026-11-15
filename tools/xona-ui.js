/* «Do'stlar bilan o'yin» brauzerda: talaba bosh sahifadan xona ochadi →
   do'sti PIN bilan kiradi → egasi boshlaydi → ikkalasi o'ynaydi (ustozsiz)
   → podium → revansh. Ishlatish: node tools/xona-ui.js [rasmlar-papkasi] */
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
  await fetch(U + 'api/g/guruhlar');                                   // jadvallar yaratiladi
  BAZA._db.prepare("INSERT INTO guruhlar (nom, kurs, univ) VALUES ('2418', 3, 'jtu')").run();
  const gid = BAZA._db.prepare("SELECT id FROM guruhlar WHERE nom = '2418'").get().id;
  const T = [['901000001', 'Ali', 'Valiyev'], ['901000002', 'Bobur', 'Karimov']];
  for (const [t, i, f] of T) {
    BAZA._db.prepare("INSERT INTO azolar (tel, ism, familiya, guruh_id, holat) VALUES (?, ?, ?, ?, 'tasdiqlangan')").run('+998' + t, i, f, gid);
    await s.env.DB.put('pay:+998' + t, '1', { metadata: { tur: 'tolov', sana: '2026-10-01' } });
  }
  const b = await chromium.launch({ args: ['--autoplay-policy=no-user-gesture-required'] });
  const jx = [];
  const tel = async k => {
    const p = await (await b.newContext({ viewport: { width: 390, height: 844 } })).newPage();
    p.on('pageerror', e => jx.push(e.message)); p.on('dialog', d => d.accept());
    const [t, ism, fam] = T[k];
    await p.addInitScript(([t, ism, fam]) => {
      localStorage.setItem('au_user_v1', JSON.stringify({ ism, familiya: fam, tel: '+998' + t, sana: '2026-09-01' }));
      localStorage.setItem('au_ruxsat_v1', JSON.stringify({ tel: '+998' + t, ruxsat: true, tur: 'tolov' }));
      localStorage.setItem('au_yangilik_v1', '9999-99-99');
    }, [t, ism, fam]);
    return p;
  };
  const A = await tel(0), B = await tel(1);
  await A.goto(U + 'index.html'); await A.waitForTimeout(1500);
  ok('bosh sahifada «➕ Do‘stlar bilan o‘yin ochish»', await A.isVisible('#xonaOch'));
  await A.click('#xonaOch'); await A.waitForSelector('.xona-f', { timeout: 5000 });
  ok('forma: qismlar, savollar soni, vaqt, tur, rejim', (await A.$$('.xona-f .xq.qism button')).length > 20 && /Savollar soni/.test(await matn(A, '.xona-f')));
  await A.click('.xona-f .xq.qism button >> nth=2'); await A.click('.xona-f .xq button:text-is("5")'); await A.click('.xona-f .xq button:text-is("10 s")');
  ok('tanlov: 1 ta qism, 5 savol, 10 s', /1 ta qism tanlandi/.test(await matn(A, '.xona-f')) && await A.isVisible('.xona-f .xq button.on:text-is("5")'));
  await A.click('.xona-f .xq button:has-text("To‘g‘ri / Noto‘g‘ri")'); await A.click('.xona-f .xq button:has-text("Yozib javob")');
  ok('savol turi: bir nechtasi tanlanadi (3 ta)', (await A.$$('.xona-f .xq button.on:has-text("✓")')).length === 3 && /aralash/.test(await matn(A, '.xona-f')));
  await A.click('.xona-f .xq button:has-text("Yozib javob")');
  const turlar = await A.evaluate(() => [...new Set(jSavollar(VOCAB.map((_, i) => i), 40, 'aralash', ['tanlov', 'tn']).map(q => q.tur))].sort().join());
  ok('2 ta tur tanlansa — savollar faqat shu ikkisidan, aralash', turlar === 'tanlov,tn');
  for (const n of ['4 variant', 'To‘g‘ri / Noto‘g‘ri']) await A.click(`.xona-f .xq button:has-text("${n}")`);
  ok('hammasini olib tashlab bo‘lmaydi — kamida bittasi qoladi', (await A.$$('.xona-f .xq button.on:has-text("✓")')).length === 1);
  await rasm(A, 'x1-forma.png');
  await A.click('#xonaBtn'); await A.waitForURL(/jonli\.html\?pin=\d{6}/, { timeout: 8000 });
  await A.waitForSelector('.xona-p', { timeout: 6000 });
  const PIN = (await matn(A, '.xp-pin b')).replace(/\D/g, '');
  ok('xona ochildi: egasi panelida PIN, ulashish, chaqirish', /^\d{6}$/.test(PIN) && /ulashish/.test(await matn(A, '.xona-p')) && /chaqirish/.test(await matn(A, '.xona-p')));
  ok('do‘st kirmaguncha «Boshlash» o‘chiq', await A.isDisabled('.xona-p .oy-btn.toliq >> nth=0'));
  await B.goto(U + 'jonli.html?pin=' + PIN); await B.click('#kirBtn'); await B.waitForSelector('#eKut.faol', { timeout: 6000 });
  ok('do‘stga: «Ali Valiyev ochgan o‘yin — boshlashini kuting»', /Ali Valiyev ochgan o‘yin/.test(await matn(B, '#eKut')) && !(await B.isVisible('.xona-p')));
  await A.waitForTimeout(2600);
  ok('egasi kirganni ko‘radi (2 kishi), «Boshlash» yoqildi', (await A.$$('.xona-p .oy-chip')).length === 2 && !(await A.isDisabled('.xona-p .oy-btn.toliq >> nth=0')));
  await rasm(A, 'x2-egasi-lobbi.png'); await rasm(B, 'x3-dost-kutish.png');
  await A.click('.xona-p .oy-btn.toliq >> nth=0');
  for (const p of [A, B]) await p.waitForSelector('#eSavol.faol .oy-javob', { timeout: 12000 });
  ok('ikkala telefonda ham savol chiqdi (ustozsiz)', await A.isVisible('#eSavol.faol .oy-javob') && await B.isVisible('#eSavol.faol .oy-javob'));
  await rasm(A, 'x4-savol.png');
  await A.click('#eSavol .oy-javob >> nth=0'); await B.click('#eSavol .oy-javob >> nth=1');
  await A.waitForSelector('#eNatija.faol', { timeout: 6000 }).catch(() => {});
  ok('hamma javob berdi — vaqt tugashini kutmasdan natija', await A.isVisible('#eNatija.faol'));
  ok('egasida «Keyingi savol ›» tugmasi, do‘stida yo‘q', await A.isVisible('#eNatija button:has-text("Keyingi savol")') && !(await B.isVisible('#eNatija button:has-text("Keyingi savol")')));
  await rasm(A, 'x4b-natija-egasi.png');
  await A.click('#eNatija button:has-text("Keyingi savol")');
  for (const p of [A, B]) await p.waitForSelector('#eSavol.faol #javoblar .oy-javob', { timeout: 6000 }).catch(() => {});
  ok('egasi bosdi — natijani kutmasdan ikkalasida 2-savol', /Savol 2/.test(await matn(B, '#eSavol')) && /Savol 2/.test(await matn(A, '#eSavol')));
  await B.click('#eSavol #javoblar .oy-javob >> nth=1'); await A.click('#eSavol #javoblar .oy-javob >> nth=0');
  const ido = await A.evaluate(() => JSON.parse(localStorage.getItem('au_jonli_oyin_v1')));
  await fetch(U + 'api/o/xona-tugat', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: ido.id, o: ido.oid }) });
  for (const p of [A, B]) await p.waitForSelector('#eYakun.faol', { timeout: 8000 }).catch(() => {});
  ok('podium ikkalasida', await A.isVisible('#eYakun .oy-podium') && await B.isVisible('#eYakun .oy-podium'));
  ok('egasiga: «Kim qaysi so‘zda xato qildi» — ismlar bilan', /Kim qaysi so‘zda xato qildi/.test(await matn(A, '#eYakun')) && /Bobur Karimov/.test(await matn(A, '#eYakun .xq-k')));
  ok('do‘stida bu ro‘yxat yo‘q', !/Kim qaysi so‘zda/.test(await matn(B, '#eYakun')));
  ok('egasida «🔁 Revansh», do‘stida — kutish yozuvi', /Revansh/.test(await matn(A, '#revJoy')) && /revansh ochsa/.test(await matn(B, '#revJoy')));
  await A.waitForTimeout(2200); await A.evaluate(() => document.querySelector('#revJoy').scrollIntoView()); await rasm(A, 'x5-yakun-egasi.png');
  await A.click('#revJoy a >> nth=0'); await A.waitForURL(/jonli\.html\?pin=\d{6}/, { timeout: 8000 });
  const PIN2 = new URL(A.url()).searchParams.get('pin');
  ok('revansh: yangi xona, yangi PIN', /^\d{6}$/.test(PIN2) && PIN2 !== PIN);
  await B.waitForSelector('#revJoy a[href*="' + PIN2 + '"]', { timeout: 9000 }).catch(() => {});
  ok('do‘stida «🔁 Revansh! Qo‘shilish» tugmasi o‘zi chiqdi', await B.isVisible('#revJoy a[href*="' + PIN2 + '"]'));
  await rasm(B, 'x6-dost-revansh.png');
  ok('sahifalarda JS xatosi yo‘q', !jx.length || (console.log(jx), false));
  await b.close(); s.close();
  console.log(xato ? '\n' + xato + ' ta xato' : '\nhammasi joyida');
  process.exit(xato ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
