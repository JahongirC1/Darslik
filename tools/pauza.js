/* Jonli test: pauza, o'yin boshlangach PIN bilan qo'shilish, har savol
   natijasida kim xato qilgani (server). Ishlatish: node tools/pauza.js */
const { ishgaTushir, sqliteD1 } = require('./emul.js');
let xato = 0;
const ok = (n, v) => { if (!v) xato++; console.log((v ? '  ✓ ' : '  ✗ ') + n); };
const kut = ms => new Promise(r => setTimeout(r, ms));
(async () => {
  const BAZA = sqliteD1();
  const s = await ishgaTushir({ env: { BAZA, KABINET_PAROL: 'Bosh-Parol-2026' } });
  const U = s.url;
  const yoz = (y, b, t) => fetch(U + 'api/' + y, { method: 'POST', headers: Object.assign({ 'Content-Type': 'application/json' }, t ? { Authorization: 'Bearer ' + t } : {}), body: JSON.stringify(b) }).then(r => r.json());
  const ol = (y, t) => fetch(U + 'api/' + y, { headers: t ? { Authorization: 'Bearer ' + t } : {} }).then(r => r.json());
  const AT = (await yoz('g/kirish', { login: 'admin', parol: 'Bosh-Parol-2026' })).token;
  const sv = [0, 1, 2].map(i => ({ tur: 'tanlov', p: 'soz' + i, pAr: false, v: ['a', 'b', 'c', 'd'], vAr: false, ok: 0, label: 'Tarjimasini toping' }));
  const o = await yoz('o/yarat', { nom: 'Sinov', vaqt: 10, savollar: sv, sozlama: { oraliq: 5 } }, AT);
  ok('o‘yin yaratildi', o.ok && /^\d{6}$/.test(o.pin));
  const A = await yoz('o/kir', { pin: o.pin, ism: 'Ali Valiyev' }), B = await yoz('o/kir', { pin: o.pin, ism: 'Bobur Karimov' });
  await yoz('o/boshla', { id: o.id }, AT);
  BAZA._db.prepare('UPDATE oyinlar SET t0 = ? WHERE id = ?').run(Date.now() - 500, o.id);      // 3-2-1 ni o'tkazib yuboramiz
  let h = await ol('o/boshqar?id=' + o.id, AT);
  ok('1-savol boshlandi', h.faza === 'savol' && h.i === 0 && h.pauza === false);
  // o'yin boshlangach — PIN bilan yangi talaba kiradi va o'ynaydi
  const C = await yoz('o/kir', { pin: o.pin, ism: 'Dilnoza Aliyeva' });
  ok('o‘yin boshlangach ham PIN bilan qo‘shiladi', C.ok);
  let hc = await ol(`o/h?id=${o.id}&o=${C.oid}`);
  ok('kech kirgan talaba — tomoshabin emas, shu savolni ko‘radi', hc.faza === 'savol' && hc.men.chiqdi === null && !!hc.savol);
  ok('kech kirgan javob bera oladi', (await yoz('o/javob', { id: o.id, o: C.oid, i: 0, j: 0 })).ok);
  await yoz('o/javob', { id: o.id, o: A.oid, i: 0, j: 0 });
  // pauza
  ok('pauza bosildi', (await yoz('o/pauza', { id: o.id }, AT)).pauza === true);
  h = await ol('o/boshqar?id=' + o.id, AT);
  const q1 = h.qoldi;
  ok('pauzada: holat «pauza», qolgan vaqt beriladi', h.pauza === true && q1 > 0 && q1 <= 10000 && h.faza === 'savol');
  await kut(1500);
  h = await ol('o/boshqar?id=' + o.id, AT);
  ok('pauzada vaqt to‘xtab turadi (1,5 s o‘tdi, qolgan vaqt o‘zgarmadi)', h.qoldi === q1 && h.faza === 'savol');
  let hb = await ol(`o/h?id=${o.id}&o=${B.oid}`);
  ok('talabaga ham «pauza» va qolgan vaqt boradi', hb.pauza === true && hb.qoldi === q1);
  const jp = await yoz('o/javob', { id: o.id, o: B.oid, i: 0, j: 1 });
  ok('pauzada javob qabul qilinmaydi', !jp.ok && jp.pauza);
  BAZA._db.prepare('UPDATE oyinlar SET pauza = pauza - 60000, t0 = t0 - 60000 WHERE id = ?').run(o.id);   // 1 daqiqa pauzada turdi
  ok('davom etish', (await yoz('o/pauza', { id: o.id, yoq: 1 }, AT)).pauza === false);
  h = await ol('o/boshqar?id=' + o.id, AT);
  ok('davom etgach: o‘sha savol, vaqt pauzadagi joyidan', h.pauza === false && h.faza === 'savol' && h.i === 0 && Math.abs((h.oxiri - h.hozir) - q1) < 1500);
  ok('endi javob qabul qilinadi', (await yoz('o/javob', { id: o.id, o: B.oid, i: 0, j: 1 })).ok);
  // natija: kim xato qildi
  await yoz('o/keyingi', { id: o.id, faza: 'savol', i: 0 }, AT);
  h = await ol('o/boshqar?id=' + o.id, AT);
  ok('natija: Bobur xato qildi («b» deb javob berdi)', h.faza === 'natija' && h.xato_qildi.length === 1 && h.xato_qildi[0].ism === 'Bobur Karimov' && h.xato_qildi[0].javob === 'b');
  ok('natija: javob bermaganlar yo‘q', h.javob_bermadi.length === 0);
  ok('ustoz tanlagan savollar orasidagi vaqt — 5 s', h.R === 5 && h.oxiri - h.hozir <= 5100 && h.oxiri - h.hozir > 3500);
  await yoz('o/keyingi', { id: o.id, faza: 'natija', i: 0 }, AT);
  await yoz('o/javob', { id: o.id, o: A.oid, i: 1, j: 2 });
  // pauzada «Keyingi» — davom etib, keyingisiga o'tadi
  await yoz('o/pauza', { id: o.id }, AT);
  await yoz('o/keyingi', { id: o.id, faza: 'savol', i: 1 }, AT);
  h = await ol('o/boshqar?id=' + o.id, AT);
  ok('pauzada «Keyingi» — pauza yechilib, natijaga o‘tadi', h.pauza === false && h.faza === 'natija' && h.i === 1);
  ok('2-savol: Ali xato, Bobur va Dilnoza javob bermadi', h.xato_qildi.map(x => x.ism).join() === 'Ali Valiyev' && h.javob_bermadi.length === 2);
  // savol o'rtasida kirgan talaba «javob bermadi» ga tushmaydi
  await yoz('o/keyingi', { id: o.id, faza: 'natija', i: 1 }, AT);
  const E = await yoz('o/kir', { pin: o.pin, ism: 'Erkin Sobirov' });                          // 3-savol paytida kirdi
  await yoz('o/keyingi', { id: o.id, faza: 'savol', i: 2 }, AT);
  h = await ol('o/boshqar?id=' + o.id, AT);
  ok('savol chiqqandan keyin kirgan — «javob bermadi» ro‘yxatida yo‘q', E.ok && h.javob_bermadi.length === 3 && !h.javob_bermadi.includes('Erkin Sobirov'));
  await yoz('o/tugat', { id: o.id }, AT);
  h = await ol('o/boshqar?id=' + o.id, AT);
  const x1 = (h.xatolar || []).find(q => q.i === 0) || {};
  ok('yakuniy xatolar: kech kirganlar oldingi savollarga «javob bermadi» deb yozilmaydi', !(x1.javobsiz || []).includes('Erkin Sobirov') && !(x1.javobsiz || []).includes('Dilnoza Aliyeva'));
  ok('yakunda hamma o‘yinchida «togri» bor (foiz uchun)', h.oyinchilar.length === 4 && h.oyinchilar.every(x => typeof x.togri === 'number'));
  s.close();
  console.log(xato ? '\n' + xato + ' ta xato' : '\nhammasi joyida');
  process.exit(xato ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
