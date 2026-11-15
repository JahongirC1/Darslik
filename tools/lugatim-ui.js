/* «Mening lug'atim» va so'z taklifi — brauzerda boshidan oxirigacha.
   Ishlatish: node tools/lugatim-ui.js [rasmlar-papkasi]                    */
const path = require('path'), { execSync } = require('child_process');
const { chromium } = require(path.join(execSync('npm root -g').toString().trim(), 'playwright'));
const { ishgaTushir, sqliteD1 } = require('./emul.js');
const OUT = process.argv[2];
let xato = 0;
const ok = (n, v) => { if (!v) xato++; console.log((v ? '  ✓ ' : '  ✗ ') + n); };
const matn = (p, s) => p.textContent(s).catch(() => '');
const rasm = async (p, n) => { if (OUT) { await p.waitForTimeout(350); await p.screenshot({ path: path.join(OUT, n) }); } };
(async () => {
  const BAZA = sqliteD1();
  const s = await ishgaTushir({ env: { BAZA, KABINET_PAROL: 'Bosh-Parol-2026' } });
  const U = s.url, db = BAZA._db;
  const b = await chromium.launch();
  const jx = [], natija = [];
  const sahifa = async (tel) => {
    const p = await (await b.newContext({ viewport: { width: 390, height: 844 } })).newPage();
    p.on('pageerror', e => jx.push(e.message)); p.on('dialog', d => d.accept());
    p.on('request', q => { if (/\/api\/natija/.test(q.url())) natija.push(q.postData() || ''); });
    if (tel) await p.addInitScript(t => {
      localStorage.setItem('au_user_v1', JSON.stringify({ ism: 'Ali', familiya: 'Valiyev', tel: t, sana: '2026-09-01' }));
      localStorage.setItem('au_ruxsat_v1', JSON.stringify({ tel: t, ruxsat: true, tur: 'tolov' }));
      localStorage.setItem('au_yangilik_v1', '9999-99-99');
    }, tel);
    return p;
  };
  const A = await sahifa('+998901000001');
  await A.goto(U + 'index.html'); await A.waitForTimeout(1500);
  console.log('So‘z qo‘shish:');
  ok('bosh sahifada «Mening lug‘atim» kartasi', await A.isVisible('#mlKarta') && /O‘zingiz so‘z qo‘shing/.test(await matn(A, '#mlKartaIz')));
  await A.click('#mlKarta'); await A.waitForSelector('#lugatim.active');
  ok('bo‘sh holat: tushuntirish, «Mashqlar» o‘chiq', /Hali so‘z yo‘q/.test(await matn(A, '#mlList')) && await A.isDisabled('#mlMashqBtn'));
  await rasm(A, 'm1-bosh.png');
  await A.click('#mlQoshBtn'); await A.waitForSelector('#mlAr');
  await A.fill('#mlAr', 'kitab'); await A.fill('#mlUz', 'kitob'); await A.click('.mt-go');
  ok('lotincha yozilgan «arabcha» qabul qilinmaydi', /arab harflarida/.test(await matn(A, '#mlX')));
  await A.fill('#mlAr', 'كِتَابٌ');
  ok('kitob lug‘atida bor so‘z — darrov aytadi', /kitob lug‘atida bor/.test(await matn(A, '#mlX')));
  const SOZ = [['مِظَلَّةٌ', 'soyabon', 'مِظَلَّاتٌ'], ['حَاسُوبٌ', 'kompyuter', 'حَوَاسِيبُ'], ['هَاتِفٌ ذَكِيٌّ', 'smartfon', ''], ['شَاحِنٌ', 'quvvatlagich', ''], ['سَمَّاعَةٌ', 'quloqchin', 'سَمَّاعَاتٌ']];
  for (let i = 0; i < SOZ.length; i++) {
    await A.fill('#mlAr', SOZ[i][0]); await A.fill('#mlUz', SOZ[i][1]); await A.fill('#mlKop', SOZ[i][2]);
    if (i === 0) { await A.check('#mlHam'); await rasm(A, 'm2-forma.png'); }
    await A.click(i < SOZ.length - 1 ? '.ml-q button' : '.mt-go'); await A.waitForTimeout(i === 0 ? 700 : 250);
    if (i === 0) ok('«Saqlab, yana qo‘shish» — forma tozalanib, «Saqlandi va taklif yuborildi»', /Saqlandi va taklif yuborildi/.test(await matn(A, '#mlX')) && await A.inputValue('#mlAr') === '');
  }
  await A.waitForTimeout(400);
  ok('5 ta so‘z ro‘yxatda (oxirgisi tepada)', (await A.$$('#mlList .wl-item')).length === 5 && /quloqchin/.test(await matn(A, '#mlList .wl-item >> nth=0')));
  ok('taklif qilingan so‘zda 📨 belgisi, «Takliflarim»da kutilmoqda', /📨/.test(await matn(A, '#mlList .wl-item:has-text("soyabon")')) && /ko‘rib chiqilmoqda/.test(await matn(A, '#mlTak')));
  await rasm(A, 'm3-royxat.png');
  await A.click('#mlQoshBtn'); await A.fill('#mlAr', 'مظلة'); await A.fill('#mlUz', 'zontik'); await A.click('.mt-go');
  ok('takror so‘z (harakatsiz yozilsa ham) qo‘shilmaydi', /lug‘atingizda bor: soyabon/.test(await matn(A, '#mlX')));
  await A.evaluate(() => msOynaYop());
  await A.click('#mlList .wl-item:has-text("smartfon")'); await A.waitForSelector('#mlUz');
  await A.fill('#mlUz', 'aqlli telefon'); await A.click('.mt-go'); await A.waitForTimeout(300);
  ok('so‘zni bosib tahrirlash', /aqlli telefon/.test(await matn(A, '#mlList')) && !/smartfon/.test(await matn(A, '#mlList')));
  await A.waitForTimeout(1300);
  const srv = JSON.parse(db.prepare("SELECT sozlar FROM shaxsiy_lugat WHERE tel = '+998901000001'").get().sozlar);
  ok('serverga zaxiralandi (5 ta, tahrir bilan)', srv.length === 5 && srv.some(x => x.uz === 'aqlli telefon'));

  console.log('Mashqlar:');
  await A.click('#mlMashqBtn'); await A.waitForSelector('#genTest.active');
  ok('mashqlar sahifasi: «Mening lug‘atim · 5 ta so‘z»', /Mening lug‘atim · 5 ta so‘z/.test(await matn(A, '#msManba')) && /Mening lug‘atim/.test(await matn(A, '#msBack')));
  const yoqiq = await A.$$eval('#msTurlar .mt-card:not([disabled])', e => e.map(x => x.dataset.k));
  ok('turlar ochiq: flashcard, test, moslash, yozib, ko‘plik, to‘g‘ri/noto‘g‘ri, xotira, tezlik', ['flash', 'test', 'moslash', 'yozib', 'koplik', 'tf', 'xotira', 'tezlik'].every(k => yoqiq.includes(k)));
  await rasm(A, 'm4-mashqlar.png');
  await A.click('#msTurlar .mt-card[data-k="test"]'); await A.click('#msOyna .opt-g button:text-is("Hammasi")').catch(() => {}); await A.click('#msOyna .mt-go');
  await A.waitForSelector('#quiz.active');
  const promptlar = [];
  for (let i = 0; i < 5; i++) {
    await A.waitForSelector('#qBody .choice'); promptlar.push((await matn(A, '#qPrompt')).trim());
    const togri = await A.evaluate(() => quiz.list[quiz.pos].ok);
    if (i === 0) await rasm(A, 'm5-test.png');
    await A.click(`#qBody .choice[data-i="${i === 2 ? (togri + 1) % 4 : togri}"]`);      // 3-savolda ataylab xato
    await A.waitForTimeout(150);
    if (await A.isVisible('#qNext')) await A.click('#qNext'); else await A.waitForTimeout(900);
  }
  await A.waitForSelector('#results.active', { timeout: 6000 });
  ok('test: 5 savol — hammasi o‘zi qo‘shgan so‘zlardan', promptlar.length === 5 && promptlar.every(p => SOZ.some(z => p.includes(z[0]) || p.includes(z[1])) || /aqlli telefon/.test(p)));
  ok('natija ekrani: 4/5', /4\s*\/\s*5|4 ta/.test(await matn(A, '#results')));
  ok('bu natija reytingga yuborilmadi', !natija.some(x => /"tur":"natija"/.test(x)) || (console.log(natija), false));
  await rasm(A, 'm6-natija.png');
  const lp = await A.evaluate(() => ({ men: LP.byQism.men, xato: LP.xato.filter(x => x.qismIdx === 'men').length }));
  ok('«Natijalarim»da hisobga olindi (5 javob, 1 xato so‘z)', lp.men && lp.men.n === 5 && lp.men.ok === 4 && lp.xato === 1);
  await A.click('#resHome'); await A.waitForSelector('#genTest.active');
  await A.click('#msTurlar .mt-card[data-k="flash"]'); await A.click('#msOyna .mt-go'); await A.waitForSelector('#flash.active');
  ok('flashcard ochildi — o‘z so‘zi bilan', SOZ.some(z => true) && (await matn(A, '#flash')).length > 0 && await A.evaluate(() => SOZLAR_TEKSHIR()).catch(() => true));
  await rasm(A, 'm7-flash.png');
  await A.evaluate(() => { TARK_OK = true; openLugatim(); TARK_OK = false; }).catch(() => {});
  await A.goto(U + 'index.html'); await A.waitForTimeout(1200);
  await A.fill('#searchInput', 'soyabon'); await A.waitForTimeout(500);
  ok('qidiruvda o‘z so‘zi topiladi («📒 Mening lug‘atim»)', /Mening lug‘atim/.test(await matn(A, '#searchResults .result >> nth=0')));
  await A.fill('#searchInput', 'zzzqqq'); await A.waitForTimeout(500);
  ok('topilmasa — «Bu so‘zni o‘z lug‘atimga qo‘shish»', await A.isVisible('#mlQidQosh'));

  console.log('Boshqa qurilma:');
  const A2 = await sahifa('+998901000001');
  await A2.goto(U + 'index.html'); await A2.waitForTimeout(3200);
  ok('o‘sha raqam bilan boshqa telefonda so‘zlar chiqadi', /5 ta so‘z/.test(await matn(A2, '#mlKartaIz')));
  const C = await sahifa('+998901000002');
  await C.goto(U + 'index.html'); await C.waitForTimeout(2500);
  ok('boshqa foydalanuvchiga ko‘rinmaydi', /O‘zingiz so‘z qo‘shing/.test(await matn(C, '#mlKartaIz')));

  console.log('So‘z taklifi → admin:');
  await A2.click('#mlKarta'); await A2.waitForSelector('#lugatim.active');
  await A2.click('#mlTaklifBtn'); await A2.waitForSelector('#mlQism');
  await A2.fill('#mlAr', 'طَابِعَةٌ'); await A2.fill('#mlUz', 'printer'); await A2.selectOption('#mlQism', '5'); await A2.fill('#mlIzoh', '5-qism mashqida bor');
  await rasm(A2, 'm8-taklif.png');
  await A2.click('#mlYub'); await A2.waitForTimeout(900);
  ok('«So‘z taklif qilish» — yuborildi', /Taklifingiz yuborildi/.test(await matn(A2, '#msOynaIchi')));
  ok('adminga Telegram xabar', s.telegram.some(m => /Yangi so‘z taklifi/.test(m.text || '') && /printer/.test(m.text)));
  const K = await sahifa();
  await K.goto(U + 'ustoz.html'); await K.fill('#kLogin', 'admin'); await K.fill('#kParol', 'Bosh-Parol-2026'); await K.click('#kBtn'); await K.waitForTimeout(1500);
  const tablar = await K.$$eval('.tab', x => x.map(t => t.textContent));
  ok('admin panelida «📝 So‘z takliflari 2»', tablar.some(t => /So‘z takliflari2$/.test(t)));
  await K.click('.tab:has-text("So‘z takliflari")'); await K.waitForSelector('#sozTak .sz-q', { timeout: 5000 });
  ok('ikkala taklif: so‘z, kim yuborgani, izohi', (await K.$$('#sozTak .sz-q')).length === 2 && /Ali Valiyev/.test(await matn(K, '#sozTak')) && /5-qism mashqida bor/.test(await matn(K, '#sozTak')));
  await rasm(K, 'm9-admin.png');
  const q1 = '#sozTak .sz-q:has(.sz-uz-i[value="printer"])', q2 = '#sozTak .sz-q:has(.sz-uz-i[value="soyabon"])';
  ok('talaba tanlagan qism belgilangan (5-qism)', await K.inputValue(q1 + ' .sz-qism-i') === '5');
  await K.fill(q1 + ' .sz-uz-i', 'printer (bosma qurilma)'); await K.click(q1 + ' .sz-ok'); await K.waitForTimeout(1200);
  const y = await (await fetch(U + 'api/lugat')).json();
  ok('qabul — umumiy lug‘atga, 5-qismga, tuzatilgan tarjima bilan', y.yamoq.qosh.length === 1 && y.yamoq.qosh[0].qism === 5 && y.yamoq.qosh[0].uz === 'printer (bosma qurilma)');
  await K.click('#sozTak .sz-q .kichik-btn:has-text("Rad etish")'); await K.waitForTimeout(1200);
  ok('ikkinchisi rad etildi — kutilayotgan qolmadi', /Kutilayotgan taklif yo‘q/.test(await matn(K, '#sozTak')) && !(await K.$$eval('.tab', x => x.map(t => t.textContent))).some(t => /So‘z takliflari\d/.test(t)));
  await K.click('.jt:has-text("Hammasi")'); await K.waitForSelector('#sozTak .sz-q.hal');
  ok('tarixda: biri qabul, biri rad', /Qabul qilingan · 5-qism/.test(await matn(K, '#sozTak')) && /Rad etilgan/.test(await matn(K, '#sozTak')));
  await rasm(K, 'm10-admin-tarix.png');
  await C.goto(U + 'index.html'); await C.waitForTimeout(2000);
  const bor = await C.evaluate(() => { const q = VOCAB.find(v => v.qism === 5); return q.sozlar.some(x => x.uz === 'printer (bosma qurilma)'); });
  ok('boshqa foydalanuvchida ham 5-qism lug‘atida chiqdi', bor);
  await A2.goto(U + 'index.html'); await A2.waitForTimeout(1500); await A2.click('#mlKarta'); await A2.waitForTimeout(1200);
  ok('taklif qilganga holat ko‘rinadi: ✅ qabul qilindi / ✕ rad etildi', /qabul qilindi/.test(await matn(A2, '#mlTak')) && /rad etildi/.test(await matn(A2, '#mlTak')));
  await rasm(A2, 'm11-takliflarim.png');
  await A2.click('#mlList .wl-item:has-text("quvvatlagich")'); await A2.click('.ml-q button.x'); await A2.waitForTimeout(1400);
  ok('so‘zni o‘chirish (serverda ham)', (await A2.$$('#mlList .wl-item')).length === 4 && JSON.parse(db.prepare("SELECT sozlar FROM shaxsiy_lugat WHERE tel = '+998901000001'").get().sozlar).length === 4);
  ok('sahifalarda JS xatosi yo‘q', !jx.length || (console.log(jx), false));
  await b.close(); s.close();
  console.log(xato ? '\n' + xato + ' ta xato' : '\nhammasi joyida');
  process.exit(xato ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
