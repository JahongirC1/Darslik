/* ============================================================
   Akbarali Umar Til Markazi — sayt "worker"i
   Bu fayl Cloudflare SERVERIDA ishlaydi, brauzerga yuborilmaydi.

   • POST /api/natija            → Telegram botga + bazaga
   • GET  /api/natija            → ulanishni tekshirish
   • GET  /api/royxat?key=…      → foydalanuvchilar (JSON)
   • GET  /api/natijalar?key=…   → test natijalari (JSON)
   • GET  /api/csv?key=…&tur=royxat|natija → Excel uchun CSV
   • /api/g/…                    → guruhlar va ustoz kabineti (D1, oxirida)
   • /api/o/…                    → jonli test (Kahoot kabi; D1, oxirida)
   • /api/c/…                    → umumiy chat (D1, eng oxirida)
   • qolgan so'rovlar            → sayt fayllari
   ============================================================ */

/* Natijalar botining tokeni va chat ID si KODDA SAQLANMAYDI (repo ochiq).
   Ular ikki yo'ldan biri bilan beriladi:
     1) Cloudflare'dagi muhit o'zgaruvchilari BOT_TOKEN va CHAT_ID (afzal);
     2) tools/zip.js — zip yasashda sirlar.json dan (gitignore'da) shu ikki
        qatorga yozib beradi.
   Ikkalasi ham bo'lmasa, botga xabar ketmaydi, sayt esa ishlayveradi. */
const BOT_TOKEN   = '';     // natijalar boti — tools/zip.js to'ldiradi
const TOLOV_TOKEN = '';   // to'lovlar boti (alohida)
const CHAT_ID     = '';
// Bot /start bosilganda yozadigan matn — brend faylidan keladi
const BOT_SALOM   = "Assalomu alaykum!\nAkbarali Umar Til Markazi — arab tili lug‘ati va fe‘l trenajyori.\nTo‘lov chekini shu yerga yuboring, ruxsat ochiladi.";
// Yangi foydalanuvchi xabari boshidagi yorliq — brend faylidan
const BOT_YORLIQ  = "Lug‘at app";
const ADMIN_KEY   = 'akbarali2026';

const token = env => env.BOT_TOKEN || BOT_TOKEN;
// Chek va ruxsat uchun alohida bot. Berilmagan bo'lsa, natijalar boti
// ishlatiladi — shunda ham hammasi avvalgidek ishlayveradi.
const tolovToken = env => env.TOLOV_BOT_TOKEN || TOLOV_TOKEN || token(env);
// «Savol va murojaatlar» boti (@Akbarali_Umar_bot) — natijalar botidan alohida,
// faqat Cloudflare Secret: MUROJAAT_BOT_TOKEN. Berilmasa, murojaat bo'limi o'chiq.
const murojaatToken = env => env.MUROJAAT_BOT_TOKEN || '';
// «Qayta tashrif» xabarlari uchun alohida bot — Secret: TASHRIF_BOT_TOKEN.
// Berilmasa, qayta tashrif xabari yuborilmaydi (bazada baribir saqlanadi).
const tashrifToken = env => env.TASHRIF_BOT_TOKEN || '';
const chat  = env => env.CHAT_ID   || CHAT_ID;
const kalit = env => env.ADMIN_KEY || ADMIN_KEY;

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const p = url.pathname;

    if (p === '/api/natija') {
      if (request.method === 'GET')  return tekshir(env);
      if (request.method === 'POST') return yubor(request, env);
      return json({ ok: false, xato: 'faqat GET yoki POST' }, 405);
    }
    if (p === '/api/lugat') {
      if (request.method === 'GET')  return lugatOqi(env);
      if (request.method === 'POST') return lugatYoz(request, url, env);
      return json({ ok: false, xato: 'faqat GET yoki POST' }, 405);
    }
    if (p === '/api/ruxsat') {
      if (request.method === 'GET')  return ruxsatOqi(url, env);
      if (request.method === 'POST') return ruxsatYoz(request, url, env);
      return json({ ok: false, xato: 'faqat GET yoki POST' }, 405);
    }
    if (p.startsWith('/api/g/')) return guruhApi(request, url, env);
    if (p.startsWith('/api/o/')) return oyinApi(request, url, env);
    if (p.startsWith('/api/c/')) return chatApi(request, url, env);
    if (p === '/api/tolovlar')  return tolovlar(url, env);
    if (p === '/api/bot')       return botWebhook(request, env);
    if (p === '/api/bot-m')     return murojaatWebhook(request, env);
    if (p === '/api/bot-sozla') return botSozla(url, env, request);
    if (p === '/api/bot-holat') return botHolat(url, env);
    if (p === '/api/reyting')   return reyting(env, url);
    if (p === '/api/ochir')     return ochir(url, env);
    if (p === '/api/royxat')    return royxat(url, env, 'user');
    if (p === '/api/natijalar') return royxat(url, env, 'res');
    if (p === '/api/csv')       return csv(url, env);
    if (p === '/api/qayta')     return qayta(url, env);

    return env.ASSETS.fetch(request);
  }
};

/* ---------------- bazaga yozish (KV ixtiyoriy) ---------------- */
async function saqla(env, tur, obj) {
  if (!env.DB) return false;
  try {
    const vaqt = new Date().toISOString();
    if (tur === 'user') {
      const k = 'user:' + (obj.tel || vaqt);
      const eski = await env.DB.get(k, 'json');
      await env.DB.put(k, JSON.stringify({
        ism: obj.ism, familiya: obj.familiya, tel: obj.tel,
        birinchi: eski ? eski.birinchi : vaqt, oxirgi: vaqt,
        kirishlar: eski ? (eski.kirishlar || 1) + 1 : 1
      }));
    } else {
      // tel metama'lumotda ham — o'chirishda har yozuvni o'qib o'tirmaslik uchun
      await env.DB.put('res:' + vaqt + ':' + Math.random().toString(36).slice(2, 7),
        JSON.stringify(Object.assign({ vaqt }, obj)), { metadata: { tel: String(obj.tel || '') } });
      // reyting yig'indisi shu yerda yangilanadi — keyin uni qayta hisoblash shart emas
      try { await aggYangila(env, obj); } catch (e) {}
    }
    return true;
  } catch (e) { return false; }
}

/* ---------------- GET /api/natija ---------------- */
async function tekshir(env) {
  const bor = { token: !!token(env), chat: !!chat(env), baza: !!env.DB };
  try {
    const r = await fetch(`https://api.telegram.org/bot${token(env)}/getMe`);
    const d = await r.json();
    if (!d.ok) return json({ ok: false, sozlangan: bor, xato: 'token noto\u2018g\u2018ri', javob: d.description });

    const t = await fetch(`https://api.telegram.org/bot${token(env)}/sendMessage`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chat_id: chat(env), text: '✅ Ulanish tekshirildi — bot ishlayapti.' })
    });
    const td = await t.json();
    if (!td.ok) return json({
      ok: false, sozlangan: bor, bot: d.result.username,
      xato: 'chatga yuborib bo\u2018lmadi', javob: td.description,
      maslahat: 'Botga /start bosilganmi?'
    });
    return json({
      ok: true, sozlangan: bor, bot: d.result.username,
      xabar: 'Hammasi joyida — botga sinov xabari yuborildi.' +
             (bor.baza ? '' : ' Baza hali ulanmagan (faqat Telegramga yoziladi).')
    });
  } catch (e) {
    return json({ ok: false, sozlangan: bor, xato: 'ulanib bo\u2018lmadi' });
  }
}

/* Yorliq — qaysi ilovadan kelganini ajratib turish uchun. Faqat
   foydalanuvchi xabarlarida (ro'yxat, qayta tashrif); test natijasi va
   sinov xabarlarida qo'yilmaydi.                                      */
const yorliqli = matn => (BOT_YORLIQ ? BOT_YORLIQ + '\n' : '') + matn;

/* Toshkent vaqti (UTC+5). Worker UTC da ishlaydi, shuning uchun
   xabardagi vaqt mahalliy vaqtga to'g'ri kelmay qolardi.             */
function vaqtMatni() {
  const t = new Date(Date.now() + 5 * 3600 * 1000);
  const ik = n => String(n).padStart(2, '0');
  return `${ik(t.getUTCDate())}/${ik(t.getUTCMonth() + 1)}/${t.getUTCFullYear()}, ` +
         `${ik(t.getUTCHours())}:${ik(t.getUTCMinutes())}`;
}

/* ---------------- POST /api/natija ---------------- */
async function yubor(request, env) {
  try {
    const d = await request.json();
    const esc = s => String(s == null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').slice(0, 300);
    const u = d.user || {};
    const kim0 = `<b>${esc(u.ism)} ${esc(u.familiya)}</b>\n📞 ${esc(u.tel)}`;
    let text = null, kim = kim0;

    if (d.tur === 'royxat') {
      await saqla(env, 'user', u);
      text = yorliqli(`🆕 <b>Yangi foydalanuvchi</b>\n\n${kim}`);
    } else if (d.tur === 'kirish') {
      await saqla(env, 'user', u);
      // Cloudflare Pages da jadval bo'yicha ishga tushirish yo'q, shuning
      // uchun kechagi xulosani birinchi kirgan odam «uyg'otadi». Bir
      // marta yuborilishi bayroq bilan kafolatlanadi.
      try { await kechagiXulosa(env); } catch (e) {}
      // natijalar botiga emas — alohida «tashrif» botiga
      if (!tashrifToken(env)) return json({ ok: true, saqlandi: true, tashrif: 'bot yo‘q' });
      const gq = await guruhQatori(env, u.tel);
      text = yorliqli('\ud83d\udc63 <b>Qayta tashrif</b>\n\n' +
        `\ud83d\udc64 Ism: ${esc(u.ism)} ${esc(u.familiya)}\n` +
        `\ud83d\udcde Tel: ${esc(u.tel)}\n` + (gq ? esc(gq) + '\n' : '') +
        (d.ilova ? `\ud83d\udcd8 Bo\u2018lim: ${esc(d.ilova)}\n` : '') +
        `\ud83d\udd52 ${vaqtMatni()}`);
    } else if (d.tur === 'qidiruv') {
      await qidiruvSaqla(env, u, d);
      return json({ ok: true, saqlandi: true });
    } else if (d.tur === 'sinov') {
      text = `🔧 <b>Sinov xabari</b>\n\n${kim}\n\nUlanish ishlayapti.`;
    } else if (d.tur === 'natija') {
      const foiz = d.jami ? Math.round(d.togri / d.jami * 100) : 0;
      const belgi = foiz >= 80 ? '🟢' : foiz >= 50 ? '🟡' : '🔴';
      const sek = Number(d.vaqt) || 0;
      const ball = (d.ball === undefined || d.ball === null) ? (Number(d.togri) || 0) : (Number(d.ball) || 0);
      const vaqtMatn = sek ? Math.floor(sek / 60) + ':' + String(sek % 60).padStart(2, '0') : '';
      const natija = {
        ism: u.ism, familiya: u.familiya, tel: u.tel, bolim: d.bolim, mashq: d.mashq,
        togri: d.togri, jami: d.jami, foiz, vaqt_sek: sek, ball, izoh: d.izoh || ''
      };
      await saqla(env, 'res', natija);
      await natijaD1(env, natija);                     // guruh reytingi va ustoz kabineti uchun
      const gq = await guruhQatori(env, u.tel);
      if (gq) kim = kim0 + '\n' + esc(gq);
      text = `${belgi} <b>Test natijasi</b>\n\n${kim}\n\n` +
             `📚 Bo'lim: ${esc(d.bolim)}\n📝 Mashq: ${esc(d.mashq)}\n` +
             `✅ Natija: <b>${d.togri}/${d.jami}</b> (${foiz}%)` +
             (vaqtMatn ? `\n⏱ Vaqt: ${vaqtMatn} · Ball: <b>${ball}</b>` : '') +
             (d.izoh ? `\n\n${esc(d.izoh)}` : '');
    } else {
      return json({ ok: false, xato: 'nomalum tur' });
    }

    if (!text) return json({ ok: true, saqlandi: true });

    const r = await fetch(`https://api.telegram.org/bot${d.tur === 'kirish' ? tashrifToken(env) : token(env)}/sendMessage`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chat_id: chat(env), text, parse_mode: 'HTML' })
    });
    const res = await r.json();
    return json({ ok: !!res.ok, javob: res.ok ? undefined : res.description });
  } catch (e) {
    return json({ ok: false, xato: 'xatolik' });
  }
}

/* ================= QIDIRUV QAYDLARI =================
   Har bir qidiruv alohida kalit bo'lib yoziladi, ma'lumoti esa KV
   metadata ichida. Shunday qilinsa, xulosa uchun bitta list() yetadi —
   har yozuvni alohida o'qish shart emas. Kalitlar 30 kundan keyin o'zi
   o'chadi.                                                             */

const bugunSana = () => new Date(Date.now() + 5 * 3600 * 1000)
  .toISOString().slice(0, 10);                       // Toshkent kuni

async function qidiruvSaqla(env, u, d) {
  if (!env.DB) return;
  const soz = matn(d.soz, 60);
  if (!soz) return;
  try {
    await env.DB.put(
      'q:' + bugunSana() + ':' + Date.now() + ':' + Math.random().toString(36).slice(2, 6),
      '1',
      { expirationTtl: 2592000,
        metadata: Object.assign({ s: soz, t: Number(d.topildi) || 0, k: matn(u.tel, 20) },
          d.qayerda === 'fel' ? { b: 'fel' } : null) });
  } catch (e) {}
}

async function qidiruvlar(env, sana) {
  const chiq = [];
  let cursor;
  do {
    const l = await env.DB.list({ prefix: 'q:' + sana + ':', cursor, limit: 1000 });
    for (const k of l.keys) if (k.metadata) chiq.push(k.metadata);
    cursor = l.list_complete ? null : l.cursor;
  } while (cursor);
  return chiq;
}

/* «ki», «kit» — yarim yozilgan so'zlar. Ilova odam yozishdan
   to'xtaganini kutadi, lekin o'rtada 2 sekund to'xtab qolsa, yarim
   so'z ham qayd bo'lib qolishi mumkin. Shu odam o'sha kuni to'liq
   so'zni ham qidirgan bo'lsa, yarimini hisobotdan chiqaramiz.         */
function tozala(qator) {
  const kimda = {};
  qator.forEach(r => {
    const kim = r.k || '-';
    (kimda[kim] = kimda[kim] || []).push(String(r.s || '').toLowerCase());
  });
  return qator.filter(r => {
    const s = String(r.s || '').toLowerCase();
    return !kimda[r.k || '-'].some(x => x.length > s.length && x.indexOf(s) === 0);
  });
}

function qidiruvMatni(sana, rows) {
  const sarlavha = `🔎 <b>Qidiruv — ${sana}</b>\n\n`;
  const bosh = `🔎 <b>Qidiruv — ${sana}</b>\n\nQidiruv bo‘lmadi.`;
  if (!rows.length) return bosh;
  // Lug'at va fe'l trenajyori alohida: trenajyorda topilmagan fe'l
  // lug'atda bor bo'lishi mumkin, ikkisini qo'shib hisoblash chalg'itardi
  const lug = tozala(rows.filter(r => r.b !== 'fel'));
  const fel = tozala(rows.filter(r => r.b === 'fel'));
  if (!lug.length && !fel.length) return bosh;
  const kishi = {};
  lug.concat(fel).forEach(r => { if (r.k) kishi[r.k] = 1; });

  const bolim = (qator, nechta) => {
    const soni = {}, topilmagan = [];
    qator.forEach(r => {
      soni[r.s] = (soni[r.s] || 0) + 1;
      if (!r.t && topilmagan.indexOf(r.s) < 0) topilmagan.push(r.s);
    });
    const eng = Object.keys(soni).sort((a, b) => soni[b] - soni[a]).slice(0, nechta);
    return `Jami: <b>${qator.length}</b> ta · ${Object.keys(soni).length} xil so‘z\n` +
      eng.map(w => `${soni[w]} × ${tgEsc(w)}`).join('\n') +
      (topilmagan.length
        ? `\n\n<b>Topilmagan (${topilmagan.length}):</b>\n` +
          topilmagan.slice(0, 25).map(tgEsc).join(', ') +
          (topilmagan.length > 25 ? '…' : '')
        : '');
  };

  return sarlavha + `👥 ${Object.keys(kishi).length} kishi\n\n` +
    (lug.length ? `<b>📘 Lug‘at</b>\n` + bolim(lug, 15) : '') +
    (fel.length ? (lug.length ? '\n\n' : '') + `<b>📗 Fe‘l trenajyori</b>\n` + bolim(fel, 10) : '');
}

/* Qidiruv hisoboti ASOSIY (natijalar) boti orqali ketadi — to'lov boti
   faqat cheklar uchun. Shuning uchun bu yerda token(env), tolovToken
   emas.                                                                */
async function qidiruvXabar(env, text) {
  if (!token(env)) return;
  try {
    await fetch(`https://api.telegram.org/bot${token(env)}/sendMessage`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chat_id: chat(env), text, parse_mode: 'HTML' })
    });
  } catch (e) {}
}

async function kechagiXulosa(env) {
  if (!env.DB) return;
  const kecha = new Date(Date.now() + 5 * 3600 * 1000 - 86400000)
    .toISOString().slice(0, 10);
  const bayroq = 'qx:' + kecha;
  if (await env.DB.get(bayroq)) return;              // allaqachon yuborilgan
  await env.DB.put(bayroq, '1', { expirationTtl: 604800 });
  const rows = await qidiruvlar(env, kecha);
  if (!rows.length) return;                          // bo'sh kun — bezovta qilmaymiz
  const matnXulosa = qidiruvMatni(kecha, rows);
  if (/Qidiruv bo‘lmadi/.test(matnXulosa)) return;   // faqat yarim so'zlar edi
  await qidiruvXabar(env, yorliqli(matnXulosa));
}

/* ================= TO'LOV VA RUXSAT =================
   Ruxsat telefon raqamiga bog'lanadi — saytga kirishda ayni shu raqam
   so'raladi. KV da:
       pay:<tel>       → metadata {tur, sana, izoh}   tur: tolov | imtiyoz
       tg:<chat id>    → telefon raqami  (bot bilan yozishayotgan o'quvchi)
       telchat:<tel>   → chat id         (ruxsat berilganda xabar yuborish uchun)

   Ruxsatni o'qituvchi Telegram botda bir qator yozib beradi:
       /ruxsat  +998901234567     — to'lagani uchun
       /imtiyoz +998901234567     — bepul (imtiyozli talaba)
       /bekor   +998901234567     — ruxsatni olib tashlash
   Shuning uchun saytga kirish, hujjat to'ldirish, komissiya to'lash
   kerak emas.                                                        */

// Telefon raqamini bitta ko'rinishga keltiramiz: +998XXXXXXXXX
function telNorm(t) {
  const d = String(t == null ? '' : t).replace(/\D/g, '');
  if (d.length === 9) return '+998' + d;
  if (d.length === 12 && d.startsWith('998')) return '+' + d;
  if (d.length === 13 && d.startsWith('9998')) return '+' + d.slice(1);
  return null;
}
const payKalit = tel => 'pay:' + tel;

async function ruxsatOl(env, tel) {
  if (!env.DB || !tel) return null;
  try {
    const g = await env.DB.getWithMetadata(payKalit(tel));
    if (!g || g.value === null) return null;
    return g.metadata || { tur: 'tolov', sana: '' };
  } catch (e) { return null; }
}

async function ruxsatBer(env, tel, tur, izoh) {
  const m = {
    tur: tur === 'imtiyoz' ? 'imtiyoz' : 'tolov',
    sana: new Date().toISOString().slice(0, 10),
    izoh: matn(izoh, 200)
  };
  await env.DB.put(payKalit(tel), '1', { metadata: m });
  return m;
}

/* To'lov botining nomi. Saytdagi «Chekni yuborish» tugmasi shundan
   yasaladi. Bazada bir soat turadi: token almashtirilsa, qo'lda hech
   narsa qilmasdan bir soat ichida o'zi to'g'rilanadi. Darrov kerak
   bo'lsa — /api/bot-sozla ni ochish kifoya.                           */
async function tolovBotNomi(env) {
  if (!env.DB || !tolovToken(env)) return '';
  try {
    const saqlangan = await env.DB.get('tolov:bot');
    if (saqlangan) return saqlangan;
    const me = await (await fetch(
      `https://api.telegram.org/bot${tolovToken(env)}/getMe`)).json();
    if (!me.ok) return '';
    await env.DB.put('tolov:bot', me.result.username, { expirationTtl: 3600 });
    return me.result.username;
  } catch (e) { return ''; }
}

// Nechta qurilmadan kirishga ruxsat (telefon + kompyuter)
const QURILMA_CHEKI = 2;

/* ---------- Bepul sinov: birinchi 24 soat ----------
   Yangi foydalanuvchi KIRGAN PAYTIDAN boshlab 24 soat dasturdan to'liq
   foydalanadi, keyin to'lov so'raladi. KV da:
       sinov:<tel>   → {bosh: ISO}   bepul vaqt qachon boshlangan
       sinovq:<q>    → ISO           shu qurilmadagi birinchi bepul vaqt
   Eski foydalanuvchiga yangi bepul vaqt berilmaydi — boshlanish user:<tel>
   dagi birinchi kirish vaqtidan olinadi. Bir qurilmada yangi raqam yozib
   qayta bepul foydalanib bo'lmaydi: qurilmaning birinchi bepul vaqti
   hisobga olinadi.
   Avvalgi versiya (kalendar kuni, {kun: 'YYYY-MM-DD'}) yozuvlari ham
   o'qiladi: o'sha kuni kirgan odamning 24 soati kirgan vaqtidan sanaladi. */
const SINOV_SOAT = 24;     // 0 — bepul sinov o'chiq
const toshkentKun = t => new Date((t === undefined ? Date.now() : t) + 5 * 3600e3).toISOString().slice(0, 10);
const kunBoshi = kun => Date.parse(kun + 'T00:00:00Z') - 5 * 3600e3;     // Toshkentda 00:00
const vaqtMs = v => { const t = Date.parse(v); return isNaN(t) ? null : t; };

async function sinovHolati(env, tel, q) {
  if (!SINOV_SOAT || !env.DB) return { ruxsat: false };
  try {
    const hozir = Date.now();
    const u = await env.DB.get('user:' + tel, 'json');
    const birinchi = u && vaqtMs(u.birinchi);
    let s = await env.DB.get('sinov:' + tel, 'json');
    let bosh = s && vaqtMs(s.bosh);
    if (bosh === null && s && s.kun) {
      // eski yozuv: o'sha kuni ro'yxatdan o'tgan bo'lsa — kirgan vaqti, aks holda kun boshi
      bosh = birinchi && toshkentKun(birinchi) === s.kun ? birinchi : kunBoshi(s.kun);
      await env.DB.put('sinov:' + tel, JSON.stringify({ bosh: new Date(bosh).toISOString() }));
    }
    if (bosh === null) {
      bosh = birinchi && birinchi < hozir ? birinchi : hozir;
      const qk = q ? await env.DB.get('sinovq:' + q) : null;
      if (qk) {
        // eski yozuvda faqat sana — bugungi bo'lsa e'tiborga olinmaydi
        const qb = /^\d{4}-\d{2}-\d{2}$/.test(qk) ? (qk < toshkentKun(bosh) ? kunBoshi(qk) : null) : vaqtMs(qk);
        if (qb !== null && qb < bosh) bosh = qb;
      }
      await env.DB.put('sinov:' + tel, JSON.stringify({ bosh: new Date(bosh).toISOString() }));
      if (q && !qk) await env.DB.put('sinovq:' + q, new Date(bosh).toISOString());
    }
    const tugash = new Date(bosh + SINOV_SOAT * 3600e3).toISOString();
    if (hozir < bosh + SINOV_SOAT * 3600e3) return { ruxsat: true, tur: 'sinov', tugash };
    return { ruxsat: false, sabab: 'sinov_tugadi', tugash };
  } catch (e) { return { ruxsat: false }; }
}

async function ruxsatOqi(url, env) {
  const tel = telNorm(url.searchParams.get('tel'));
  if (!tel) return json({ ok: false, xato: 'telefon raqami noto\u2018g\u2018ri' }, 400);
  if (!env.DB) return json({ ok: false, xato: 'baza ulanmagan' });

  const bot = await tolovBotNomi(env);
  const r = await ruxsatOl(env, tel);
  if (!r) return json(Object.assign({ ok: true, bot }, await sinovHolati(env, tel, matn(url.searchParams.get('q'), 40))));

  /* Qurilmaga bog'lash — birov boshqaning raqamini yozib kirmasligi uchun.
     Ruxsat birinchi kirgan qurilmaga bog'lanadi; QURILMA_CHEKI tagacha
     qo'shiladi (telefon va kompyuter). Undan keyin boshqa qurilma
     kiritilsa, ruxsat berilmaydi va o'qituvchiga xabar boradi.          */
  const q = matn(url.searchParams.get('q'), 40);
  const royxat = Array.isArray(r.qurilmalar) ? r.qurilmalar : [];

  // qurilma raqami kelmasa (eski sayt yoki brauzer saqlay olmasa) —
  // to'smaymiz, aks holda to'lagan odam kira olmay qolishi mumkin
  if (!q || royxat.indexOf(q) > -1)
    return json({ ok: true, ruxsat: true, tur: r.tur, sana: r.sana, bot });

  if (royxat.length < QURILMA_CHEKI) {
    royxat.push(q);
    try {
      await env.DB.put(payKalit(tel), '1',
        { metadata: Object.assign({}, r, { qurilmalar: royxat }) });
    } catch (e) {}
    if (royxat.length > 1)
      await tgYubor(env, chat(env),
        `📱 ${tel} — ikkinchi qurilmadan kirdi (jami ${royxat.length} ta).`);
    return json({ ok: true, ruxsat: true, tur: r.tur, sana: r.sana, bot });
  }

  // chek to'lgan — yangi qurilma admin ruxsatini kutadi (qurilmaSorov)
  const kutish = await qurilmaSorov(env, tel, q, royxat.length);
  return json({ ok: true, ruxsat: false, sabab: 'boshqa_qurilma', kutish, bot });
}

/* ---------- Yangi qurilma: admin ruxsati ----------
   Chek to'lgan raqam bilan yangi qurilmadan kirilsa, adminga to'lov
   botida tugmali xabar boradi:
       ✅ Ruxsat berish            — shu qurilma ham qo'shiladi
       ♻️ Faqat shu qurilma        — eski qurilmalar o'chadi (telefon almashgan)
       ❌ Rad etish
   Qurilma ekranida «admin ruxsatini kutyapmiz» turadi va o'zi tekshirib
   turadi — ruxsat berilishi bilan dastur ochiladi. KV da:
       qkut:<tel>:<q> → id           shu qurilmaning so'rovi
       qk:<id>        → {tel, q, holat: kutilmoqda | ok | rad}   (7 kun)
   Kuniga bitta raqamdan 5 tadan ko'p so'rov xabari yuborilmaydi. */
const QK_TTL = 7 * 86400;
async function qurilmaSorov(env, tel, q, n) {
  try {
    const kk = `qkut:${tel}:${q}`;
    const bor = await env.DB.get(kk);
    if (bor) {
      const r = await env.DB.get('qk:' + bor, 'json');
      if (r) return r.holat === 'rad' ? 'rad' : 'kutilmoqda';
    }
    const sk = 'red:' + tel, son = Number(await env.DB.get(sk)) || 0;
    if (son >= 5) return 'kutilmoqda';
    await env.DB.put(sk, String(son + 1), { expirationTtl: 86400 });
    const id = tasodifiy(5);
    await env.DB.put('qk:' + id, JSON.stringify({ tel, q, holat: 'kutilmoqda', vaqt: new Date().toISOString() }), { expirationTtl: QK_TTL });
    await env.DB.put(kk, id, { expirationTtl: QK_TTL });
    let kim = '';
    try { const u = await env.DB.get('user:' + tel, 'json'); if (u) kim = tgEsc([u.ism, u.familiya].filter(Boolean).join(' ')) + '\n'; } catch (e) {}
    await tgYubor(env, chat(env),
      `📱 <b>Yangi qurilma — ruxsatingizni kutyapti</b>\n${kim}📞 ${tel}\n\n` +
      `Bu raqam ${n} ta qurilmada ochiq. Endi ${n + 1}-qurilmadan kirmoqchi.\n` +
      `Ruxsat bersangiz, o‘sha qurilmada dastur darhol ochiladi.`,
      { reply_markup: { inline_keyboard: [
        [{ text: '✅ Ruxsat berish', callback_data: 'qr:' + id }],
        [{ text: '♻️ Faqat shu qurilma (eskilari o‘chadi)', callback_data: 'qa:' + id }],
        [{ text: '❌ Rad etish', callback_data: 'qx:' + id }]] } });
  } catch (e) {}
  return 'kutilmoqda';
}
// admin tugmani bosdi (to'lov boti, callback_query)
async function qurilmaTugma(env, cq) {
  const javob = text => tgSo(env, 'tolov', 'answerCallbackQuery', { callback_query_id: cq.id, text, show_alert: false });
  const t = String(cq.data || '').match(/^q([rax]):([0-9a-f]{10})$/);
  if (!t) { await javob(''); return; }
  if (!asosiyAdmin(env, cq.from && cq.from.id)) { await javob('Bu tugma faqat admin uchun'); return; }
  const rec = env.DB && await env.DB.get('qk:' + t[2], 'json');
  if (!rec) { await javob('So‘rov eskirgan (7 kundan oshgan)'); return; }
  if (rec.holat === 'ok') { await javob('Allaqachon ruxsat berilgan'); return; }
  if (t[1] === 'x' && rec.holat === 'rad') { await javob('Allaqachon rad etilgan'); return; }
  let natija, tugmalar = null;
  if (t[1] === 'x') {
    rec.holat = 'rad';
    natija = '❌ Rad etildi';
    // fikr o'zgarsa — keyin ham ruxsat bersa bo'ladi
    tugmalar = [[{ text: '✅ Baribir ruxsat berish', callback_data: 'qr:' + t[2] }]];
  } else {
    const r = await ruxsatOl(env, rec.tel);
    if (!r) { await javob('Bu raqamda to‘lov ruxsati yo‘q'); return; }
    const eski = Array.isArray(r.qurilmalar) ? r.qurilmalar : [];
    const royxat = t[1] === 'a' ? [rec.q] : eski.filter(x => x !== rec.q).concat(rec.q);
    await env.DB.put(payKalit(rec.tel), '1', { metadata: Object.assign({}, r, { qurilmalar: royxat }) });
    rec.holat = 'ok';
    natija = t[1] === 'a' ? '♻️ Faqat shu qurilma ochiq — eskilari o‘chirildi' : `✅ Ruxsat berildi (jami ${royxat.length} ta qurilma)`;
    const oq = await env.DB.get('telchat:' + rec.tel);
    if (oq) await tgSo(env, 'tolov', 'sendMessage', { chat_id: oq, text: '✅ Yangi qurilmangizga ruxsat berildi. Dastur o‘zi ochiladi (ochilmasa — sahifani yangilang).' });
  }
  await env.DB.put('qk:' + t[2], JSON.stringify(rec), { expirationTtl: QK_TTL });
  await javob(natija);
  if (cq.message && cq.message.chat) await tgSo(env, 'tolov', 'editMessageText', Object.assign({
    chat_id: cq.message.chat.id, message_id: cq.message.message_id, parse_mode: 'HTML',
    text: tgEsc(cq.message.text || '📱 Yangi qurilma') + '\n\n<b>' + natija + '</b>' }, tugmalar ? { reply_markup: { inline_keyboard: tugmalar } } : {}));
}

async function ruxsatYoz(request, url, env) {
  if (url.searchParams.get('key') !== kalit(env))
    return json({ ok: false, xato: 'kalit noto‘g‘ri' }, 403);
  if (!env.DB) return json({ ok: false, xato: 'baza ulanmagan' });
  let d;
  try { d = await request.json(); } catch (e) { return json({ ok: false, xato: 'buzuq so‘rov' }, 400); }
  const tel = telNorm(d.tel);
  if (!tel) return json({ ok: false, xato: 'telefon raqami noto‘g‘ri' }, 400);
  try {
    if (d.amal === 'bekor') {
      await env.DB.delete(payKalit(tel));
      return json({ ok: true, tel, ruxsat: false });
    }
    const m = await ruxsatBer(env, tel, d.tur, d.izoh);
    return json({ ok: true, tel, ruxsat: true, tur: m.tur, sana: m.sana });
  } catch (e) { return json({ ok: false, xato: 'saqlanmadi' }); }
}

async function tolovlar(url, env) {
  if (url.searchParams.get('key') !== kalit(env))
    return json({ ok: false, xato: 'kalit noto‘g‘ri' }, 403);
  if (!env.DB) return json({ ok: false, xato: 'baza ulanmagan' });
  const chiq = [];
  try {
    let cursor;
    do {
      const l = await env.DB.list({ prefix: 'pay:', cursor, limit: 1000 });
      for (const k of l.keys)
        chiq.push(Object.assign({ tel: k.name.slice(4) }, k.metadata || {}));
      cursor = l.list_complete ? null : l.cursor;
    } while (cursor);
  } catch (e) { return json({ ok: false, xato: 'o‘qib bo‘lmadi' }); }
  chiq.sort((a, b) => String(b.sana || '').localeCompare(String(a.sana || '')));
  return json({ ok: true, soni: chiq.length, tolovlar: chiq });
}

/* ---------------- Telegram bot ----------------
   O'qituvchi bot bilan yozishib ruxsat beradi, o'quvchi esa chekni
   shu botga yuboradi. Webhook'ni bir marta ulash kerak:
       /api/bot-sozla?key=<admin kaliti>                               */

async function tgYubor(env, chat_id, text, qoshimcha) {
  if (!tolovToken(env)) return;
  try {
    await fetch(`https://api.telegram.org/bot${tolovToken(env)}/sendMessage`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(Object.assign({ chat_id, text, parse_mode: 'HTML' }, qoshimcha || {}))
    });
  } catch (e) {}
}

async function botSozla(url, env, request) {
  if (url.searchParams.get('key') !== kalit(env))
    return json({ ok: false, xato: 'kalit noto\u2018g\u2018ri' }, 403);
  if (!tolovToken(env)) return json({ ok: false, xato: 'TOLOV_BOT_TOKEN berilmagan' });
  const manzil = new URL(request.url).origin + '/api/bot';
  try {
    const r = await fetch(`https://api.telegram.org/bot${tolovToken(env)}/setWebhook`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        url: manzil, secret_token: kalit(env),
        allowed_updates: ['message', 'callback_query'], drop_pending_updates: true
      })
    });
    const d = await r.json();
    // Bot nomini saqlaymiz: saytdagi «Chekni yuborish» tugmasi shundan
    // oladi, shuning uchun tugma har doim to'g'ri botga olib boradi.
    let nomi = '';
    try {
      const me = await (await fetch(`https://api.telegram.org/bot${tolovToken(env)}/getMe`)).json();
      if (me.ok) { nomi = me.result.username;
        if (env.DB) await env.DB.put('tolov:bot', nomi, { expirationTtl: 3600 }); }
    } catch (e) {}
    // «Savol va murojaatlar» boti (@Akbarali_Umar_bot, MUROJAAT_BOT_TOKEN) — unga ham webhook
    let murojaat = { ok: false, xato: 'MUROJAAT_BOT_TOKEN berilmagan' };
    const mt = murojaatToken(env);
    if (mt && mt !== tolovToken(env)) {
      try {
        const r2 = await (await fetch(`https://api.telegram.org/bot${mt}/setWebhook`, {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ url: new URL(request.url).origin + '/api/bot-m', secret_token: kalit(env), allowed_updates: ['message', 'callback_query'] })
        })).json();
        const me2 = await (await fetch(`https://api.telegram.org/bot${mt}/getMe`)).json();
        murojaat = { ok: !!r2.ok, bot: me2.ok ? '@' + me2.result.username : '', javob: r2.description || r2.result };
      } catch (e) { murojaat = { ok: false, xato: 'ulanib bo‘lmadi' }; }
    }
    // Avvalgi versiya murojaat webhookini adashib natijalar botiga ulagan bo'lishi mumkin —
    // natijalar boti faqat xabar yuboradi, unga webhook kerak emas: shuni olib tashlaymiz
    let natijalar = null;
    if (token(env) && token(env) !== tolovToken(env) && token(env) !== mt) {
      try {
        const w = await (await fetch(`https://api.telegram.org/bot${token(env)}/getWebhookInfo`)).json();
        if (w.ok && /\/api\/bot-m$/.test(w.result.url || '')) {
          const dw = await (await fetch(`https://api.telegram.org/bot${token(env)}/deleteWebhook`, { method: 'POST' })).json();
          natijalar = { webhook: dw.ok ? 'olib tashlandi' : 'olib tashlab bo‘lmadi' };
        }
      } catch (e) {}
    }
    let tashrif = { ok: false, xato: 'TASHRIF_BOT_TOKEN berilmagan — qayta tashrif xabarlari yuborilmaydi' };
    if (tashrifToken(env)) {
      try {
        const me3 = await (await fetch(`https://api.telegram.org/bot${tashrifToken(env)}/getMe`)).json();
        tashrif = me3.ok ? { ok: true, bot: '@' + me3.result.username } : { ok: false, xato: 'token noto‘g‘ri' };
      } catch (e) { tashrif = { ok: false, xato: 'ulanib bo‘lmadi' }; }
    }
    return json({ ok: !!d.ok, manzil, bot: nomi ? '@' + nomi : '', javob: d.description || d.result, murojaat, tashrif, natijalar });
  } catch (e) { return json({ ok: false, xato: 'ulanib bo\u2018lmadi' }); }
}

/* Bot nima holatda — nosozlikni topish uchun.
   Telegram webhook'ga javob bermasa yoki xato qaytarsa, sababi
   getWebhookInfo dagi last_error_message da turadi.                   */
async function botHolat(url, env) {
  if (url.searchParams.get('key') !== kalit(env))
    return json({ ok: false, xato: 'kalit noto‘g‘ri' }, 403);

  const chiq = {
    bot_tokeni: token(env) ? 'bor' : 'YO‘Q',
    chat_id: chat(env) || 'YO‘Q',
    baza: env.DB ? 'ulangan' : 'ULANMAGAN'
  };
  if (!token(env)) {
    chiq.maslahat = 'Cloudflare → Settings → Variables and Secrets → BOT_TOKEN';
    return json(chiq);
  }
  try {
    const nat = await (await fetch(`https://api.telegram.org/bot${token(env)}/getMe`)).json();
    chiq.natijalar_boti = nat.ok ? '@' + nat.result.username
      : 'token noto‘g‘ri: ' + nat.description;
    for (const [nom, tk] of [['murojaat_boti', murojaatToken(env)], ['tashrif_boti', tashrifToken(env)]]) {
      if (!tk) { chiq[nom] = 'token berilmagan'; continue; }
      const b = await (await fetch(`https://api.telegram.org/bot${tk}/getMe`)).json();
      chiq[nom] = b.ok ? '@' + b.result.username : 'token noto‘g‘ri: ' + b.description;
    }
    // «Savol va murojaatlar» boti: webhook ulanganmi, oxirgi xabarni kim deb tanidi
    if (murojaatToken(env)) {
      const mw = await (await fetch(`https://api.telegram.org/bot${murojaatToken(env)}/getWebhookInfo`)).json();
      const mi = (mw && mw.result) || {};
      chiq.murojaat_webhook = /\/api\/bot-m$/.test(mi.url || '') ? mi.url : (mi.url ? 'BOSHQA MANZIL: ' + mi.url : 'ULANMAGAN — /api/bot-sozla?key=… ni oching');
      if (mi.url && !(mi.allowed_updates || []).includes('callback_query')) chiq.murojaat_webhook += ' (tugmalar uchun /api/bot-sozla ni yana bir marta oching)';
      if (mi.last_error_message) chiq.murojaat_oxirgi_xato = mi.last_error_message;
      if (env.DB) try { const o = await env.DB.get('bot:m-oxirgi', 'json'); if (o) chiq.murojaat_oxirgi_xabar = o; } catch (e) {}
      chiq.yordamchilar = (await yordamchilar(env)).map(x => x.ism + ' (' + x.id + ')');
    }

    const me = await (await fetch(`https://api.telegram.org/bot${tolovToken(env)}/getMe`)).json();
    chiq.tolov_boti = me.ok ? '@' + me.result.username
      : 'token noto‘g‘ri: ' + me.description;
    // Eng oson o'tkazib yuboriladigan xato: saytdagi «Chekni yuborish»
    // tugmasi boshqa botga ishora qiladi. U holda chek bizga umuman
    // yetib kelmaydi va hech qayerda xato ham ko'rinmaydi — Telegram
    // yuboradigan narsaning o'zi bo'lmaydi.
    // tugma manzili bazadan olinadi — mos kelmasa, shu yerda ko'rinadi
    if (me.ok && env.DB) {
      const saqlangan = await env.DB.get('tolov:bot');
      chiq.tugma_qaysi_botga = saqlangan ? '@' + saqlangan : 'SAQLANMAGAN';
      if (saqlangan !== me.result.username)
        chiq.maslahat = '/api/bot-sozla?key=… ni oching — tugma manzili yangilanadi';
    }

    const w = await (await fetch(`https://api.telegram.org/bot${tolovToken(env)}/getWebhookInfo`)).json();
    const i = (w && w.result) || {};
    chiq.webhook = i.url || 'ULANMAGAN';
    chiq.kutayotgan_xabar = i.pending_update_count || 0;
    if (i.last_error_message) {
      chiq.oxirgi_xato = i.last_error_message;
      chiq.oxirgi_xato_vaqti = i.last_error_date
        ? new Date(i.last_error_date * 1000).toISOString() : '';
    }
    if (!i.url) chiq.maslahat = '/api/bot-sozla?key=… ni oching';
    else if (i.url.indexOf('/api/bot') < 0) chiq.maslahat = 'webhook boshqa manzilga ulangan';

    // o'qituvchi chatiga sinov xabari
    const t = await (await fetch(`https://api.telegram.org/bot${tolovToken(env)}/sendMessage`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chat_id: chat(env), text: '🔧 To‘lovlar boti tekshirildi — xabar yetib keldi.' })
    })).json();
    chiq.chatga_yuborish = t.ok ? 'ishladi' : 'ISHLAMADI: ' + t.description;
    if (!t.ok) chiq.maslahat = 'To‘lovlar botiga /start bosilmagan yoki CHAT_ID noto‘g‘ri';
  } catch (e) {
    chiq.xato = String((e && e.message) || e).slice(0, 200);
  }
  return json(chiq);
}

// Telegram HTML rejimida < & > belgilari xabarni buzadi: ism ichida
// uchrasa, sendMessage butunlay ishlamay qoladi
const tgEsc = s => String(s == null ? '' : s)
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

const BOT_YORDAM =
  'Buyruqlar:\n' +
  '<code>/ruxsat +998901234567</code> — to‘lagani uchun ochish\n' +
  '<code>/imtiyoz +998901234567</code> — bepul ochish\n' +
  '<code>/bekor +998901234567</code> — ruxsatni olib tashlash\n' +
  '<code>/holat +998901234567</code> — tekshirish\n' +
  '<code>/qurilma +998901234567</code> — qurilma bog\u2018lanishini tozalash\n' +
  '<code>/royxat</code> — ruxsat berilganlar\n' +
  '<code>/qidiruv</code> — bugun qidirilgan so‘zlar ' +
  '(<code>/qidiruv kecha</code> yoki <code>/qidiruv 2026-09-26</code>)\n\n' +
  '<b>Javob berish:</b> o‘quvchining xabariga (yoki «Chek keldi» xabariga) ' +
  '<b>Reply</b> qilib yozing — bot o‘z nomidan yuboradi.\n' +
  '<code>/javob +998901234567 matn</code> — raqam bo‘yicha yozish\n\n' +
  '<b>Yordamchi admin</b> — «Savol va murojaatlar» botida: u yerda «➕ Yordamchi qo‘shish» tugmasini bosing (ko‘rinmasa, /start).';

async function botWebhook(request, env) {
  // Telegram har so'rovga shu sarlavhani qo'shadi — begona so'rovni kesamiz
  if (request.headers.get('X-Telegram-Bot-Api-Secret-Token') !== kalit(env))
    return json({ ok: false }, 403);
  let u;
  try { u = await request.json(); } catch (e) { return json({ ok: true }); }
  if (u && u.callback_query) {                 // xabardagi tugma (yangi qurilmaga ruxsat)
    try { await qurilmaTugma(env, u.callback_query); }
    catch (e) { await botQayd(env, 'bot:xato', { vaqt: new Date().toISOString(), xato: String((e && e.stack) || e).slice(0, 400) }); }
    return json({ ok: true });
  }
  const m = u && u.message;
  if (!m || !m.chat) return json({ ok: true });

  const suhbat = String(m.chat.id);
  const matnQator = String(m.text || m.caption || '').trim();
  const oqituvchi = asosiyAdmin(env, suhbat);   // to'lov botini faqat asosiy admin boshqaradi

  // Har bir kelgan xabarni qayd etamiz. Telegram'ga baribir {ok:true}
  // qaytariladi (aks holda u xabarni qayta-qayta yuboraveradi), lekin
  // nima bo'lgani /api/bot-holat da ko'rinib turadi.
  await botQayd(env, 'bot:oxirgi', {
    vaqt: new Date().toISOString(), suhbat,
    kim: oqituvchi ? 'o\u2018qituvchi' : 'o\u2018quvchi',
    turi: m.photo ? 'rasm' : (m.document ? 'fayl' : (m.text ? 'matn' : 'boshqa')),
    matn: matnQator.slice(0, 80)
  });

  try {
    if (oqituvchi && await adminJavob(env, 'tolov', suhbat, m, matnQator)) {}
    else if (oqituvchi && /^\/yordamchi/i.test(matnQator))
      await tgSo(env, 'tolov', 'sendMessage', { chat_id: suhbat, text: 'Yordamchi admin «Savol va murojaatlar» botida qo‘shiladi — o‘sha botda «➕ Yordamchi qo‘shish» tugmasini bosing (ko‘rinmasa, /start).' });
    else if (oqituvchi) await botOqituvchi(env, suhbat, matnQator);
    else await botOquvchi(env, suhbat, m, matnQator);
  } catch (e) {
    await botQayd(env, 'bot:xato', {
      vaqt: new Date().toISOString(), suhbat,
      xato: String((e && e.stack) || (e && e.message) || e).slice(0, 400)
    });
  }
  return json({ ok: true });
}

// Nosozlikni topish uchun kichik qaydlar. Baza bo'lmasa — jim o'tadi.
async function botQayd(env, kalit, obj) {
  if (!env.DB) return;
  try { await env.DB.put(kalit, JSON.stringify(obj), { expirationTtl: 604800 }); } catch (e) {}
}

async function botOqituvchi(env, suhbat, matnQator) {
  const b = matnQator.split(/\s+/);
  const buyruq = (b[0] || '').toLowerCase().replace(/@.*$/, '');

  if (buyruq === '/royxat') {
    if (!env.DB) return tgYubor(env, suhbat, 'Baza ulanmagan.');
    const r = [];
    let cursor;
    do {
      const l = await env.DB.list({ prefix: 'pay:', cursor, limit: 1000 });
      for (const k of l.keys) r.push(Object.assign({ tel: k.name.slice(4) }, k.metadata || {}));
      cursor = l.list_complete ? null : l.cursor;
    } while (cursor);
    r.sort((a, b2) => String(b2.sana || '').localeCompare(String(a.sana || '')));
    const oxirgi = r.slice(0, 25).map(x =>
      `${x.tel} — ${x.tur === 'imtiyoz' ? 'imtiyoz' : 'to‘lagan'} · ${x.sana || ''}`).join('\n');
    return tgYubor(env, suhbat,
      `<b>Ruxsat berilganlar: ${r.length} ta</b>` + (oxirgi ? '\n\n' + oxirgi : '') +
      (r.length > 25 ? `\n\n…va yana ${r.length - 25} ta` : ''));
  }

  // Kunlik xulosani kutmasdan, xohlagan payt so'rab olish uchun.
  // Telefon raqami kerak emas — shu sababli pastdagi tekshiruvdan oldin turadi.
  if (buyruq === '/qidiruv') {
    if (!env.DB) return tgYubor(env, suhbat, 'Baza ulanmagan.');
    const arg = (b[1] || '').toLowerCase();
    let sana = bugunSana();
    if (arg === 'kecha')
      sana = new Date(Date.now() + 5 * 3600 * 1000 - 86400000).toISOString().slice(0, 10);
    else if (/^\d{4}-\d{2}-\d{2}$/.test(arg)) sana = arg;
    // Hisobot natijalar botiga ketadi. Buyruq to'lov botida yozilgan
    // bo'lsa, u yerda «qayerga ketdi» degan bir qator qoldiramiz —
    // aks holda javob bermagandek ko'rinardi.
    await qidiruvXabar(env, qidiruvMatni(sana, await qidiruvlar(env, sana)));
    if (tolovToken(env) !== token(env))
      return tgYubor(env, suhbat, '🔎 Hisobot «natijalar» botiga yuborildi.');
    return;
  }

  // raqam bo'yicha o'quvchiga yozish (bot bilan yozishgan bo'lsa)
  if (buyruq === '/javob') {
    const tel = telNorm(b[1]), matnJ = matnQator.replace(/^\S+\s+\S+\s*/, '');
    if (!tel || !matnJ) return tgYubor(env, suhbat, 'Masalan: <code>/javob +998901234567 Ochildimi?</code>');
    const oq = env.DB && await env.DB.get('telchat:' + tel);
    if (!oq) return tgYubor(env, suhbat, `${tel} — bu raqam bot bilan yozishmagan (botga /start bosmagan).`);
    const r = await tgSo(env, 'tolov', 'sendMessage', { chat_id: oq, text: matnJ });
    return tgYubor(env, suhbat, r.ok ? `✅ ${tel} ga yuborildi.` : '❌ Yuborib bo‘lmadi — o‘quvchi botni bloklagan bo‘lishi mumkin.');
  }

  if (['/ruxsat', '/imtiyoz', '/bekor', '/holat', '/qurilma'].indexOf(buyruq) < 0) {
    // Siz o'zingiz chek yuborib sinasangiz, bot uni o'quvchinikidek
    // yo'naltirmaydi: bu chat admin chati. Shuni aytib qo'yamiz.
    const chek = !matnQator.startsWith('/');
    return tgYubor(env, suhbat, (chek
      ? 'Bu chat — admin chati, shuning uchun bu yerga yuborilgan chek '
        + 'yo\u2018naltirilmaydi. Sinash uchun boshqa Telegram hisobidan '
        + 'yuboring.\n\n' : '') + BOT_YORDAM);
  }

  const tel = telNorm(b[1]);
  if (!tel) return tgYubor(env, suhbat,
    'Telefon raqamini yozing, masalan:\n<code>' + buyruq + ' +998901234567</code>');
  if (!env.DB) return tgYubor(env, suhbat, 'Baza ulanmagan.');

  if (buyruq === '/holat') {
    const r = await ruxsatOl(env, tel);
    if (!r) {
      let s = null;
      try { s = await env.DB.get('sinov:' + tel, 'json'); } catch (e) {}
      const b = s && (vaqtMs(s.bosh) || (s.kun ? kunBoshi(s.kun) : null));
      const t = b ? b + SINOV_SOAT * 3600e3 : 0;
      const korin = ms => new Date(ms + 5 * 3600e3).toISOString().slice(0, 16).replace('T', ' ');
      return tgYubor(env, suhbat, `${tel} — <b>yopiq</b>` + (b
        ? (Date.now() < t ? ` (bepul sinovda, ${korin(t)} gacha)` : ` (bepul sinov ${korin(t)} da tugagan)`) : ''));
    }
    const n = (r.qurilmalar || []).length;
    return tgYubor(env, suhbat,
      `${tel} — <b>ochiq</b> (${r.tur === 'imtiyoz' ? 'imtiyoz' : 'to‘lagan'}, ${r.sana})\n` +
      `Qurilma: ${n} / ${QURILMA_CHEKI}`);
  }

  // Telefonini almashtirgan o'quvchi uchun: bog'lanishni bo'shatamiz
  if (buyruq === '/qurilma') {
    const r = await ruxsatOl(env, tel);
    if (!r) return tgYubor(env, suhbat, `${tel} — ruxsat berilmagan.`);
    await env.DB.put(payKalit(tel), '1',
      { metadata: Object.assign({}, r, { qurilmalar: [] }) });
    await env.DB.delete('red:' + tel);
    return tgYubor(env, suhbat,
      `${tel} — qurilma bog‘lanishi tozalandi. Endi yangi qurilmadan kira oladi.`);
  }

  if (buyruq === '/bekor') {
    await env.DB.delete(payKalit(tel));
    return tgYubor(env, suhbat, `${tel} — ruxsat olib tashlandi.`);
  }

  const tur = buyruq === '/imtiyoz' ? 'imtiyoz' : 'tolov';
  await ruxsatBer(env, tel, tur, b.slice(2).join(' '));
  await tgYubor(env, suhbat,
    `✅ ${tel} — ochildi (${tur === 'imtiyoz' ? 'imtiyozli' : 'to‘lagan'}).`);
  // o'quvchining o'ziga ham xabar beramiz, agar bot bilan yozishgan bo'lsa
  try {
    const oq = await env.DB.get('telchat:' + tel);
    if (oq) await tgYubor(env, oq,
      'Ruxsat ochildi ✅\nSaytga qayting va «Men to‘ladim» tugmasini bosing.');
  } catch (e) {}
}

async function botOquvchi(env, suhbat, m, matnQator) {
  // /start 998901234567 — saytdagi tugma shu ko'rinishda ochadi
  const s = matnQator.match(/^\/start\s+(\d{9,13})/);
  if (s) {
    const tel = telNorm(s[1]);
    if (tel && env.DB) {
      await env.DB.put('tg:' + suhbat, tel);
      await env.DB.put('telchat:' + tel, suhbat);
    }
    return tgYubor(env, suhbat, BOT_SALOM);
  }
  if (matnQator.startsWith('/start')) {
    // Raqamsiz kelgan: saytdagi tugma orqali kelmagan, shuning uchun
    // telefoni bog'lanmagan. Chek kelganda o'qituvchi raqamini qidirib
    // yurmasligi uchun bir qator qo'shamiz.
    return tgYubor(env, suhbat, BOT_SALOM +
      '\n\nRaqamingiz avtomatik bog‘lanishi uchun saytdagi ' +
      '«Chekni yuborish» tugmasi orqali kiring.');
  }

  // chek yoki xabar — o'qituvchiga yo'naltiramiz
  let tel = '';
  try { tel = (env.DB && await env.DB.get('tg:' + suhbat)) || ''; } catch (e) {}
  const kim = tgEsc([m.from && m.from.first_name, m.from && m.from.last_name]
    .filter(Boolean).join(' ')) || 'nomalum';
  const user = m.from && m.from.username ? ' @' + tgEsc(m.from.username) : '';

  // hamma adminlarga (asosiy + yordamchilar): xabarning o'zi va izoh;
  // ikkalasiga ham «Reply» qilinsa, javob o'quvchiga boradi
  const chek = !!(m.photo || m.document);
  await adminlargaYetkaz(env, 'tolov', m,
    (chek ? '💳 <b>Chek keldi</b>' : '💬 <b>To‘lov botiga xabar</b>') + `\n${kim}${user}\n` +
    (tel ? `📞 ${tel}\n\nOchish uchun:\n<code>/ruxsat ${tel}</code>`
         : '\n⚠️ Telefon raqami bog‘lanmagan — raqamini so‘rang, ' +
           'so‘ng <code>/ruxsat +998…</code> deb yozing.') +
    '\n\n↩️ Javob yozish uchun shu xabarga <b>Reply</b> qiling.', kim);
  if (await birMarta(env, 'tolov', suhbat))
    await tgYubor(env, suhbat, 'Qabul qilindi. Tekshirilgach xabar beramiz.');
}

/* ---------------- LUG'AT TAHRIRI ----------------
   data.js saytning o'zida turadi va o'zgarmaydi. Admin kiritgan
   tuzatishlar KV da bitta "yamoq" (patch) bo'lib saqlanadi:
       { ochir: [id...], tahrir: {id: {ar,uz,kop}}, qosh: [{...}] }
   id = "<qism raqami>|<asl arabcha so'z>". Sahifa ochilganda har bir
   foydalanuvchi shu yamoqni olib, lug'atga qo'llaydi — shuning uchun
   admin kiritgan tuzatish hammaga darrov ko'rinadi, qayta deploy
   qilish shart emas.                                                  */

const YAMOQ = 'lugat:yamoq';
const SHAXSIY_SIG = 1000;                            // bir kishining «Mening lug'atim»idagi so'zlar chegarasi
// har safar YANGI obyekt qaytaramiz: umumiy nusxa bo'lsa, bir so'rovda
// massivga qo'shilgan narsa keyingi so'rovlarga ham o'tib ketadi
const boshYamoq = () => ({ v: 0, ochir: [], tahrir: {}, qosh: [], fel: {} });

async function yamoqOl(env) {
  if (!env.DB) return null;
  try {
    const y = await env.DB.get(YAMOQ, 'json');
    if (!y) return boshYamoq();
    return {
      v: Number(y.v) || 0,
      ochir: Array.isArray(y.ochir) ? y.ochir : [],
      tahrir: (y.tahrir && typeof y.tahrir === 'object') ? y.tahrir : {},
      qosh: Array.isArray(y.qosh) ? y.qosh : [],
      fel: (y.fel && typeof y.fel === 'object') ? y.fel : {}
    };
  } catch (e) { return boshYamoq(); }
}

/* Admin kiritgan fe'l: bob, o'zak, unlilar, tur, asosiy shakllar va qo'lda
   tuzatilgan kataklar (tuz: «zamon|mayl|nisbat|katak» → shakl).          */
const FEL_BOBLAR_S = ['I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX', 'X'];
const FEL_TURLAR_S = ['solim', 'mudoaf', 'mahmuz', 'misol', 'ajvaf', 'noqis', 'lafif-maqrun', 'lafif-mafruq'];
const FEL_KATAK_RE = /^(otgan|hozirgi)\|(aniqlik|istak|shart|buyruq)\|(aniq|majhul)\|(3ms|3md|3mp|3fs|3fd|3fp|2ms|2md|2mp|2fs|2fd|2fp|1s|1p)$/;
function felTozala(f) {
  if (!f || typeof f !== 'object') return null;
  const root = [...String(f.root || '').replace(/[^\u0621-\u064A]/g, '')];
  const bob = FEL_BOBLAR_S.includes(f.bob) ? f.bob : '';
  if (root.length < 2 || root.length > 4 || !bob) return null;
  const unli = v => ['a', 'u', 'i'].includes(v) ? v : '';
  const tuz = {};
  if (f.tuz && typeof f.tuz === 'object')
    for (const [k, v] of Object.entries(f.tuz).slice(0, 700)) if (FEL_KATAK_RE.test(k) && matn(v, 60)) tuz[k] = matn(v, 60);
  return { bob, root: root.join(''), pastV: unli(f.pastV) || 'a', presV: unli(f.presV), tur: FEL_TURLAR_S.includes(f.tur) ? f.tur : '',
    masdar: matn(f.masdar, 60), foil: matn(f.foil, 60), maful: matn(f.maful, 60), tuz };
}

async function lugatOqi(env) {
  const y = await yamoqOl(env);
  if (!y) return json({ ok: false, xato: 'baza ulanmagan', yamoq: boshYamoq() });
  return json({ ok: true, yamoq: y });
}

// bo'sh bo'lmagan qatorga keltiramiz; uzunligini ham cheklaymiz
const matn = (s, n) => String(s == null ? '' : s).trim().slice(0, n || 200);

async function lugatYoz(request, url, env) {
  if (url.searchParams.get('key') !== kalit(env))
    return json({ ok: false, xato: 'kalit noto‘g‘ri' }, 403);
  if (!env.DB) return json({
    ok: false, xato: 'baza ulanmagan',
    maslahat: 'Cloudflare → Settings → Bindings → KV namespace, nomi: DB'
  });

  let d;
  try { d = await request.json(); } catch (e) { return json({ ok: false, xato: 'buzuq so‘rov' }, 400); }
  const y = await yamoqOl(env);
  const id = matn(d.id, 300);

  if (d.amal === 'ochir') {
    if (!id) return json({ ok: false, xato: 'id yo‘q' }, 400);
    if (id[0] === '+') {                     // admin o'zi qo'shgan so'z — butunlay olib tashlaymiz
      y.qosh = y.qosh.filter(x => x.id !== id);
      delete y.tahrir[id];
    } else {
      if (!y.ochir.includes(id)) y.ochir.push(id);
      delete y.tahrir[id];
    }
  } else if (d.amal === 'tiklash') {         // o'chirilganni qaytarish
    y.ochir = y.ochir.filter(x => x !== id);
  } else if (d.amal === 'tahrir') {
    const ar = matn(d.ar, 200), uz = matn(d.uz, 300);
    if (!id || !ar || !uz) return json({ ok: false, xato: 'arabchasi va tarjimasi bo‘sh' }, 400);
    const yoz = { ar, uz, kop: matn(d.kop, 200) };
    const q = y.qosh.find(x => x.id === id);
    if (q) Object.assign(q, yoz);            // admin qo'shgan so'z — o'z joyida yangilanadi
    else y.tahrir[id] = yoz;
  } else if (d.amal === 'qosh') {
    const ar = matn(d.ar, 200), uz = matn(d.uz, 300);
    if (!ar || !uz) return json({ ok: false, xato: 'arabchasi va tarjimasi bo‘sh' }, 400);
    if (y.qosh.length >= 3000) return json({ ok: false, xato: 'juda ko‘p qo‘shilgan' }, 400);
    y.qosh.push({
      id: '+' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
      qism: Number(d.qism) || 0, ar, uz, kop: matn(d.kop, 200)
    });
  } else if (d.amal === 'fel') {             // so'zni fe'l deb belgilash / fe'l ma'lumotini tuzatish
    const k = matn(d.kalit, 200);
    if (!k) return json({ ok: false, xato: 'fe’l kaliti yo‘q' }, 400);
    if (!d.fel) delete y.fel[k];               // admin kiritgan ma'lumot olib tashlanadi (asl holiga qaytadi)
    else {
      const f = felTozala(d.fel);
      if (!f) return json({ ok: false, xato: 'o‘zak (2–4 harf) va bob kerak' }, 400);
      if (!y.fel[k] && Object.keys(y.fel).length >= 2000) return json({ ok: false, xato: 'juda ko‘p fe’l' }, 400);
      y.fel[k] = f;
    }
  } else if (d.amal === 'hammasini_tiklash') {
    y.ochir = []; y.tahrir = {}; y.qosh = []; y.fel = {};
  } else {
    return json({ ok: false, xato: 'nomalum amal' }, 400);
  }

  y.v = (Number(y.v) || 0) + 1;
  try { await env.DB.put(YAMOQ, JSON.stringify(y)); }
  catch (e) { return json({ ok: false, xato: 'saqlanmadi' }); }
  return json({ ok: true, yamoq: y });
}

/* ---------------- REYTING (hammaga ochiq) ----------------
   Natijalar KV da har test uchun alohida yozuv bo'lib turadi. Ularning
   hammasini har safar o'qib chiqish natija ko'paygani sari og'irlashadi va
   Cloudflare cheklovlariga urilib uziladi. Shuning uchun har foydalanuvchi
   uchun bitta 'agg:' kaliti yuritiladi: yig'indi KV metadata ichida turadi,
   natija yozilganda darrov yangilanadi. Reytingni ko'rsatish uchun bitta
   list() yetarli — natija necha ming bo'lsa ham o'qishlar soni ortmaydi. */

function aggKalit(r) {
  const k = String(r.tel || ((r.ism || '') + (r.familiya || '')) || 'nomalum');
  return 'agg:' + encodeURIComponent(k).slice(0, 400);
}
function aggYozuv(r) {
  return {
    ism: r.ism || '', familiya: r.familiya || '', tel: r.tel || '',
    ball: (r.ball === undefined || r.ball === null) ? (Number(r.togri) || 0) : (Number(r.ball) || 0),
    togri: Number(r.togri) || 0, jami: Number(r.jami) || 0, testlar: 1
  };
}
function aggBirlashtir(a, b) {
  return {
    ism: b.ism || a.ism || '', familiya: b.familiya || a.familiya || '', tel: b.tel || a.tel || '',
    ball: (Number(a.ball) || 0) + (Number(b.ball) || 0),
    togri: (Number(a.togri) || 0) + (Number(b.togri) || 0),
    jami: (Number(a.jami) || 0) + (Number(b.jami) || 0),
    testlar: (Number(a.testlar) || 0) + (Number(b.testlar) || 0)
  };
}
async function aggYangila(env, r) {
  const nom = aggKalit(r);
  let eski = {};
  try { const g = await env.DB.getWithMetadata(nom); if (g && g.metadata) eski = g.metadata; } catch (e) {}
  await env.DB.put(nom, '1', { metadata: aggBirlashtir(eski, aggYozuv(r)) });
}
function reytingTozala(x, admin) {
  const o = Object.assign({}, x);
  if (!admin) delete o.tel;
  return o;
}

async function reyting(env, url) {
  const admin = url && url.searchParams.get('key') === kalit(env);
  if (!env.DB) return json({ ok: false, xato: 'baza ulanmagan', reyting: [] });
  let rows = [], xatoMatn = '', manba = 'yigindi';

  try {
    let cursor;
    do {
      const l = await env.DB.list({ prefix: 'agg:', cursor, limit: 1000 });
      for (const k of l.keys) if (k.metadata) rows.push(k.metadata);
      cursor = l.list_complete ? null : l.cursor;
    } while (cursor);
  } catch (e) { xatoMatn = String((e && e.message) || e).slice(0, 150); }

  // yig'indi hali tuzilmagan bo'lsa — eski usulda, hamma yozuvni o'qib
  if (!rows.length) {
    manba = 'toliq';
    const m = new Map(), o = await ochirilganlar(env);
    try {
      let cursor;
      do {
        const l = await env.DB.list({ prefix: 'res:', cursor, limit: 1000 });
        for (const k of l.keys) {
          let r = null;
          try { r = await env.DB.get(k.name, 'json'); }
          catch (e) { if (!xatoMatn) xatoMatn = String((e && e.message) || e).slice(0, 150); continue; }
          if (!r || ochirilganmi(o, r)) continue;
          const nom = aggKalit(r);
          m.set(nom, aggBirlashtir(m.get(nom) || {}, aggYozuv(r)));
        }
        cursor = l.list_complete ? null : l.cursor;
      } while (cursor);
    } catch (e) { if (!xatoMatn) xatoMatn = String((e && e.message) || e).slice(0, 150); }
    rows = [...m.values()];
  }

  const list = rows
    .filter(x => x && (x.ism || x.familiya || x.tel))
    .map(x => ({
      ism: x.ism || '', familiya: x.familiya || '', tel: x.tel || '',
      ball: Number(x.ball) || 0, testlar: Number(x.testlar) || 0,
      foiz: Number(x.jami) ? Math.round((Number(x.togri) || 0) / Number(x.jami) * 100) : 0
    }))
    .sort((a, b) => b.ball - a.ball || b.foiz - a.foiz)
    .map((x, i) => Object.assign({ orin: i + 1 }, x));

  return json({
    ok: list.length > 0, soni: list.length, manba,
    xato: xatoMatn || undefined,
    reyting: list.map(x => reytingTozala(x, admin))
  });
}

/* ---------------- YIG'INDINI QAYTA HISOBLASH (faqat admin) ----------------
   Bir marta ishlatiladi: mavjud natijalardan 'agg:' kalitlarini tuzadi.
   Bir so'rovda hammasi ulgurmasligi mumkin, shuning uchun bo'lak-bo'lak
   ishlaydi va sahifa o'zi keyingi bo'lakka o'tadi.                        */
async function qayta(url, env) {
  const kaliti = url.searchParams.get('key');
  const sahifa = (matn, keyingi) => new Response(
    '<!doctype html><meta charset="utf-8">' +
    '<meta name="viewport" content="width=device-width,initial-scale=1">' +
    (keyingi ? '<meta http-equiv="refresh" content="1;url=' + keyingi.replace(/&/g, '&amp;') + '">' : '') +
    '<body style="font-family:system-ui,sans-serif;padding:26px;line-height:1.7;color:#1c2434">' + matn + '</body>',
    { headers: { 'Content-Type': 'text/html; charset=utf-8' } });

  if (kaliti !== kalit(env)) return sahifa('<h3>Kalit noto‘g‘ri</h3>', null);
  if (!env.DB) return sahifa('<h3>Baza ulanmagan</h3>', null);

  const BUDJET = 300;
  let cursor = url.searchParams.get('cursor') || undefined;
  let oqildi = Number(url.searchParams.get('oqildi')) || 0;
  let xato = '';

  try {
    if (!cursor) {
      let c;
      do {
        const l = await env.DB.list({ prefix: 'agg:', cursor: c, limit: 1000 });
        for (const k of l.keys) await env.DB.delete(k.name);
        c = l.list_complete ? null : l.cursor;
      } while (c);
    }

    const m = new Map(), o = await ochirilganlar(env);
    let bu = 0, tugadi = false;
    while (bu < BUDJET) {
      const l = await env.DB.list({ prefix: 'res:', cursor, limit: 200 });
      for (const k of l.keys) {
        let r = null;
        try { r = await env.DB.get(k.name, 'json'); }
        catch (e) { if (!xato) xato = String((e && e.message) || e).slice(0, 120); continue; }
        bu++; oqildi++;
        if (!r || ochirilganmi(o, r)) continue;
        const nom = aggKalit(r);
        m.set(nom, aggBirlashtir(m.get(nom) || {}, aggYozuv(r)));
      }
      cursor = l.list_complete ? null : l.cursor;
      if (!cursor) { tugadi = true; break; }
    }

    for (const [nom, v] of m) {
      let eski = {};
      try { const g = await env.DB.getWithMetadata(nom); if (g && g.metadata) eski = g.metadata; } catch (e) {}
      await env.DB.put(nom, '1', { metadata: aggBirlashtir(eski, v) });
    }

    const keyingi = tugadi ? null :
      '/api/qayta?key=' + encodeURIComponent(kaliti) +
      '&cursor=' + encodeURIComponent(cursor) + '&oqildi=' + oqildi;

    return sahifa(
      '<h3>Reyting yig‘indisi qayta hisoblanmoqda</h3>' +
      '<p>O‘qilgan natija: <b>' + oqildi + '</b></p>' +
      (tugadi
        ? '<p style="color:#2f7d5b;font-weight:700">Tugadi — reytingni ochib ko‘ring.</p>'
        : '<p>Davom etmoqda… sahifani yopmang.</p>') +
      (xato ? '<p style="color:#b5442f">' + xato + '</p>' : ''),
      keyingi);
  } catch (e) {
    return sahifa('<h3>Xatolik</h3><p>' + String((e && e.message) || e).slice(0, 200) + '</p>' +
                  '<p>O‘qilgan: ' + oqildi + '</p>', null);
  }
}

/* ---------------- O'CHIRISH (faqat admin) ----------------
   Reytingda ✕ bosilganda keladi. Avval yig'indi (agg:) o'chiriladi —
   reyting aynan shundan o'qiladi, odam darrov ro'yxatdan chiqadi.

   Keyin natija yozuvlari (res:). Bitta so'rovda KV amallari soni
   cheklangan (bepul tarifda 1000), natijalar ko'p bo'lsa, hammasini
   o'qib chiqishga ulgurmaydi — ilgari aynan shu sabab o'chirish yarmida
   uzilib, odam reytingda qolib ketardi. Endi amallar sanaladi; ulgurmagan
   eski yozuvlar «ochir:<tel>» belgisi orqali qayta hisoblashda (qayta,
   reytingning to'liq usuli) e'tiborga olinmaydi.                        */
async function ochirilganlar(env) {
  const m = new Map();
  try {
    let c;
    do {
      const l = await env.DB.list({ prefix: 'ochir:', cursor: c, limit: 1000 });
      for (const k of l.keys) m.set(k.name.slice(6), (k.metadata && k.metadata.vaqt) || '');
      c = l.list_complete ? null : l.cursor;
    } while (c);
  } catch (e) {}
  return m;
}
// shu odam o'chirilgandan oldingi natijami
function ochirilganmi(o, r) {
  const v = r && o.get(String(r.tel || ''));
  return v !== undefined && v !== null && String(r.vaqt || '') <= v;
}
async function ochir(url, env) {
  if (url.searchParams.get('key') !== kalit(env))
    return json({ ok: false, xato: 'kalit noto\u2018g\u2018ri' }, 403);
  if (!env.DB) return json({ ok: false, xato: 'baza ulanmagan' });
  const tel = url.searchParams.get('tel');
  const hammasiniHam = url.searchParams.get('hammasi') === '1';
  if (!hammasiniHam && !tel) return json({ ok: false, xato: 'telefon raqami yo\u2018q' });
  const BYUDJET = 900;
  let amal = 0, ochirildi = 0, qoldi = false;
  try {
    if (!hammasiniHam) {
      await env.DB.delete(aggKalit({ tel })); amal++;
      const vaqt = new Date().toISOString();
      await env.DB.put('ochir:' + tel, vaqt, { metadata: { vaqt } }); amal++;
    }
    let cursor;
    do {
      const l = await env.DB.list({ prefix: 'res:', cursor, limit: 1000 }); amal++;
      for (const k of l.keys) {
        if (amal >= BYUDJET) { qoldi = true; break; }
        if (hammasiniHam) { await env.DB.delete(k.name); amal++; ochirildi++; continue; }
        let t = k.metadata ? k.metadata.tel : undefined;
        if (t === undefined) { const v = await env.DB.get(k.name, 'json'); amal++; t = v && v.tel; }
        if (String(t) === String(tel)) { await env.DB.delete(k.name); amal++; ochirildi++; }
      }
      cursor = !qoldi && !l.list_complete ? l.cursor : null;
    } while (cursor);
    if (hammasiniHam) {
      for (const prefix of ['agg:', 'ochir:']) {
        let c;
        do {
          const l = await env.DB.list({ prefix, cursor: c, limit: 1000 }); amal++;
          for (const k of l.keys) { if (amal >= BYUDJET) { qoldi = true; break; } await env.DB.delete(k.name); amal++; }
          c = !qoldi && !l.list_complete ? l.cursor : null;
        } while (c);
      }
    }
    return json({ ok: true, ochirildi, qoldi });
  } catch (e) {
    return json({ ok: false, xato: String((e && e.message) || e).slice(0, 150), ochirildi });
  }
}

/* ---------------- ro'yxatlar ---------------- */
async function hammasi(env, prefix) {
  const chiq = [];
  let cursor;
  do {
    const l = await env.DB.list({ prefix, cursor, limit: 1000 });
    for (const k of l.keys) {
      let v = null;
      try { v = await env.DB.get(k.name, 'json'); } catch (e) { continue; }
      if (v) chiq.push(v);
    }
    cursor = l.list_complete ? null : l.cursor;
  } while (cursor);
  return chiq;
}

async function royxat(url, env, prefix) {
  if (url.searchParams.get('key') !== kalit(env))
    return json({ ok: false, xato: 'kalit noto\u2018g\u2018ri' }, 403);
  if (!env.DB) return json({
    ok: false, xato: 'baza ulanmagan',
    maslahat: 'Cloudflare \u2192 Settings \u2192 Bindings \u2192 KV namespace qo\u2018shing, nomi: DB'
  });
  const d = await hammasi(env, prefix + ':');
  d.sort((a, b) => String(b.vaqt || b.oxirgi || '').localeCompare(String(a.vaqt || a.oxirgi || '')));
  return json({ ok: true, soni: d.length, malumot: d });
}

async function csv(url, env) {
  if (url.searchParams.get('key') !== kalit(env))
    return new Response('kalit noto\u2018g\u2018ri', { status: 403 });
  if (!env.DB) return new Response('baza ulanmagan', { status: 200 });
  const tur = url.searchParams.get('tur') === 'natija' ? 'res' : 'user';
  const d = await hammasi(env, tur + ':');
  const q = s => '"' + String(s == null ? '' : s).replace(/"/g, '""') + '"';
  let out;
  if (tur === 'user') {
    d.sort((a, b) => String(b.oxirgi).localeCompare(String(a.oxirgi)));
    out = ['Ism,Familiya,Telefon,Birinchi kirish,Oxirgi kirish,Kirishlar soni']
      .concat(d.map(x => [x.ism, x.familiya, x.tel, x.birinchi, x.oxirgi, x.kirishlar].map(q).join(',')))
      .join('\n');
  } else {
    d.sort((a, b) => String(b.vaqt).localeCompare(String(a.vaqt)));
    out = ['Sana,Ism,Familiya,Telefon,Bolim,Mashq,Togri,Jami,Foiz,Vaqt (sek),Ball,Izoh']
      .concat(d.map(x => [x.vaqt, x.ism, x.familiya, x.tel, x.bolim, x.mashq,
                          x.togri, x.jami, x.foiz, x.vaqt_sek == null ? '' : x.vaqt_sek,
                          x.ball == null ? x.togri : x.ball, x.izoh].map(q).join(',')))
      .join('\n');
  }
  return new Response('\ufeff' + out, {
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="${tur === 'user' ? 'foydalanuvchilar' : 'natijalar'}.csv"`
    }
  });
}

function json(obj, status = 200) {
  return new Response(JSON.stringify(obj, null, 2), {
    status, headers: { 'Content-Type': 'application/json; charset=utf-8' }
  });
}

/* ================================================================
   GURUHLAR VA USTOZ KABINETI  (Cloudflare D1 — bog'lanish nomi BAZA)

   Talaba guruhga so'rov yuboradi → ustoz yoki admin tasdiqlaydi →
   talaba guruh reytingida ko'rinadi. Ustoz /ustoz.html da login va
   parol bilan kiradi va FAQAT o'ziga biriktirilgan guruhlarni ko'radi:
   a'zolar, reyting, natijalar, xato so'zlar, Excel. U talabalarni
   tasdiqlay oladi, lekin hech narsani o'chira olmaydi — o'chirish,
   ko'chirish, guruh va ustozlarni boshqarish faqat adminda.

   Admin kabinetga «admin» login va KABINET_PAROL bilan kiradi. Bu parol
   faqat Cloudflare'da Secret bo'lib turadi (repoda ham, sahifada ham
   yo'q): ADMIN_KEY sayt sahifasi ichida ko'rinadi, unga ishonib
   bo'lmaydi. KABINET_PAROL berilmagan bo'lsa, admin kira olmaydi.

   Jadvallar birinchi so'rovda o'zi yaratiladi — qo'lda SQL yozish
   shart emas. BAZA ulanmagan bo'lsa, bu bo'lim jimgina o'chiq turadi,
   saytning qolgan qismi avvalgidek ishlaydi.
   ================================================================ */
const SXEMA = [
  `CREATE TABLE IF NOT EXISTS guruhlar (id INTEGER PRIMARY KEY AUTOINCREMENT, nom TEXT NOT NULL, kurs INTEGER NOT NULL DEFAULT 0,
     univ TEXT NOT NULL DEFAULT 'jtu', yaratilgan TEXT, UNIQUE (univ, nom))`,
  `CREATE TABLE IF NOT EXISTS ustozlar (login TEXT PRIMARY KEY, nom TEXT NOT NULL, tuz TEXT NOT NULL, xesh TEXT NOT NULL, yaratilgan TEXT)`,
  `CREATE TABLE IF NOT EXISTS ustoz_guruh (login TEXT NOT NULL, guruh_id INTEGER NOT NULL, PRIMARY KEY (login, guruh_id))`,
  `CREATE TABLE IF NOT EXISTS azolar (tel TEXT PRIMARY KEY, ism TEXT, familiya TEXT, guruh_id INTEGER, holat TEXT NOT NULL,
     sorov_vaqt TEXT, tasdiq_vaqt TEXT, tasdiqlagan TEXT)`,
  `CREATE INDEX IF NOT EXISTS azo_guruh ON azolar (guruh_id, holat)`,
  `CREATE TABLE IF NOT EXISTS natijalar (id INTEGER PRIMARY KEY AUTOINCREMENT, tel TEXT, ism TEXT, familiya TEXT, vaqt TEXT,
     bolim TEXT, mashq TEXT, togri INTEGER, jami INTEGER, ball INTEGER, vaqt_sek INTEGER, izoh TEXT)`,
  `CREATE INDEX IF NOT EXISTS natija_tel ON natijalar (tel, vaqt)`,
  `CREATE TABLE IF NOT EXISTS sessiyalar (token TEXT PRIMARY KEY, login TEXT NOT NULL, rol TEXT NOT NULL, tugash TEXT NOT NULL)`,
  // jonli test
  `CREATE TABLE IF NOT EXISTS oyinlar (id INTEGER PRIMARY KEY AUTOINCREMENT, pin TEXT NOT NULL, login TEXT NOT NULL, ustoz TEXT,
     nom TEXT, holat TEXT NOT NULL, savollar TEXT NOT NULL, son INTEGER NOT NULL, vaqt INTEGER NOT NULL, t0 INTEGER,
     yaratilgan TEXT, tugagan TEXT)`,
  `CREATE INDEX IF NOT EXISTS oyin_pin ON oyinlar (pin, holat)`,
  `CREATE TABLE IF NOT EXISTS oyin_oyinchi (oyin_id INTEGER NOT NULL, oid TEXT NOT NULL, ism TEXT, tel TEXT,
     ball INTEGER NOT NULL DEFAULT 0, togri INTEGER NOT NULL DEFAULT 0, qoshilgan INTEGER, PRIMARY KEY (oyin_id, oid))`,
  `CREATE TABLE IF NOT EXISTS oyin_javob (oyin_id INTEGER NOT NULL, oid TEXT NOT NULL, savol INTEGER NOT NULL, javob INTEGER,
     ms INTEGER, ball INTEGER, PRIMARY KEY (oyin_id, oid, savol))`,
  // umumiy chat
  `CREATE TABLE IF NOT EXISTS chat (id INTEGER PRIMARY KEY AUTOINCREMENT, tel TEXT, ism TEXT NOT NULL, rol TEXT NOT NULL,
     matn TEXT NOT NULL, vaqt INTEGER NOT NULL)`,
  `CREATE TABLE IF NOT EXISTS chat_onlayn (tel TEXT PRIMARY KEY, ism TEXT, vaqt INTEGER NOT NULL)`,
  `CREATE TABLE IF NOT EXISTS chat_blok (tel TEXT PRIMARY KEY, vaqt TEXT)`,
  // push-bildirishnoma: obunalar va VAPID kalit (o'zi yaratiladi)
  `CREATE TABLE IF NOT EXISTS push_obuna (endpoint TEXT PRIMARY KEY, p256dh TEXT NOT NULL, auth TEXT NOT NULL, tel TEXT, vaqt INTEGER)`,
  `CREATE TABLE IF NOT EXISTS sozlama (kalit TEXT PRIMARY KEY, qiymat TEXT NOT NULL)`,
  // jonli test: ×2 tavakkal (savoldan oldin tanlanadi)
  `CREATE TABLE IF NOT EXISTS oyin_xavf (oyin_id INTEGER NOT NULL, oid TEXT NOT NULL, savol INTEGER NOT NULL, hal INTEGER NOT NULL DEFAULT 0,
     PRIMARY KEY (oyin_id, oid, savol))`,
  // guruh va guruh battle (turnir bosqichi ham shu jadvalda)
  `CREATE TABLE IF NOT EXISTS battlelar (id INTEGER PRIMARY KEY AUTOINCREMENT, a_gid INTEGER NOT NULL, b_gid INTEGER NOT NULL,
     holat TEXT NOT NULL, kutadi TEXT, vaqt TEXT, sozlama TEXT, oyin_id INTEGER, natija TEXT, turnir_id INTEGER, raund INTEGER, juft INTEGER,
     yaratdi TEXT, yaratilgan TEXT)`,
  `CREATE TABLE IF NOT EXISTS battle_qatnash (bid INTEGER NOT NULL, tel TEXT NOT NULL, ism TEXT, PRIMARY KEY (bid, tel))`,
  `CREATE TABLE IF NOT EXISTS turnirlar (id INTEGER PRIMARY KEY AUTOINCREMENT, nom TEXT, univ TEXT, kurs INTEGER, holat TEXT NOT NULL,
     jadval TEXT NOT NULL, golib INTEGER, yaratdi TEXT, yaratilgan TEXT)`,
  // guruhga e'lon (sardor/ustoz) — talabaning «guruhim» oynasida
  `CREATE TABLE IF NOT EXISTS guruh_elon (id INTEGER PRIMARY KEY AUTOINCREMENT, gid INTEGER NOT NULL, ism TEXT, matn TEXT NOT NULL, vaqt INTEGER NOT NULL)`,
  // talaba taklif qilgan universitet (admin tasdiqlagach hammaga ko'rinadi) va ustozlik so'rovlari
  `CREATE TABLE IF NOT EXISTS universitetlar (kod TEXT PRIMARY KEY, nom TEXT NOT NULL, qisqa TEXT, holat TEXT NOT NULL DEFAULT 'kutilmoqda', taklif TEXT, vaqt TEXT)`,
  // foydalanuvchining o'zi qo'shgan so'zlari (telefon bo'yicha zaxira) va umumiy lug'atga takliflar
  `CREATE TABLE IF NOT EXISTS shaxsiy_lugat (tel TEXT PRIMARY KEY, sozlar TEXT NOT NULL, vaqt INTEGER NOT NULL)`,
  `CREATE TABLE IF NOT EXISTS soz_taklif (id INTEGER PRIMARY KEY AUTOINCREMENT, tel TEXT NOT NULL, ism TEXT, ar TEXT NOT NULL, uz TEXT NOT NULL, kop TEXT,
     qism INTEGER, izoh TEXT, holat TEXT NOT NULL DEFAULT 'kutilmoqda', javob TEXT, vaqt TEXT, hal_vaqt TEXT)`,
  `CREATE TABLE IF NOT EXISTS ustoz_sorov (id INTEGER PRIMARY KEY AUTOINCREMENT, ism TEXT NOT NULL, tel TEXT NOT NULL, univ TEXT, izoh TEXT, vaqt TEXT)`
];
// keyin qo'shilgan ustunlar: eski bazada yo'q bo'lsa qo'shiladi («duplicate column» — bor degani)
const USTUNLAR = [`ALTER TABLE guruhlar ADD COLUMN kurs INTEGER NOT NULL DEFAULT 0`,
  `ALTER TABLE oyin_oyinchi ADD COLUMN avatar TEXT`,
  // chat: xabarni tahrirlash/o'chirish (kalit — yozgan qurilmaning maxfiy kaliti, sha256)
  `ALTER TABLE chat ADD COLUMN kalit TEXT`, `ALTER TABLE chat ADD COLUMN login TEXT`,
  `ALTER TABLE chat ADD COLUMN ozgardi INTEGER`, `ALTER TABLE chat ADD COLUMN tahrir INTEGER NOT NULL DEFAULT 0`,
  `ALTER TABLE chat ADD COLUMN ochirildi INTEGER NOT NULL DEFAULT 0`,
  // jonli test rejimlari
  `ALTER TABLE oyinlar ADD COLUMN sozlama TEXT`, `ALTER TABLE oyinlar ADD COLUMN hal INTEGER NOT NULL DEFAULT -1`,
  `ALTER TABLE oyinlar ADD COLUMN muddat INTEGER`, `ALTER TABLE oyinlar ADD COLUMN pauza INTEGER`,
  `ALTER TABLE oyin_oyinchi ADD COLUMN jamoa TEXT`, `ALTER TABLE oyin_oyinchi ADD COLUMN chiqdi INTEGER`,
  `ALTER TABLE oyin_oyinchi ADD COLUMN t0 INTEGER`, `ALTER TABLE oyin_oyinchi ADD COLUMN yozildi INTEGER NOT NULL DEFAULT 0`,
  `ALTER TABLE oyin_oyinchi ADD COLUMN kirdi INTEGER NOT NULL DEFAULT -1`,
  `ALTER TABLE oyin_javob ADD COLUMN togri INTEGER NOT NULL DEFAULT 0`, `ALTER TABLE oyin_javob ADD COLUMN matn TEXT`,
  // guruh sardori: kabinetga telefon raqami va bir martalik kod bilan kiradi
  `ALTER TABLE guruhlar ADD COLUMN sardor_tel TEXT`, `ALTER TABLE guruhlar ADD COLUMN sardor_tuz TEXT`,
  `ALTER TABLE guruhlar ADD COLUMN sardor_xesh TEXT`];
/* Eski bazada guruh nomi butun saytda yagona edi (nom UNIQUE). Endi har
   universitetning o'z guruhlari bor — «101» ikki universitetda bo'lishi
   mumkin. Jadval bir marta qayta quriladi: id lar o'zgarmaydi, eski
   guruhlar Jahon tillari universitetiga (jtu) tegishli bo'ladi. */
async function guruhUnivKochir(db) {
  try { await db.prepare('SELECT univ FROM guruhlar LIMIT 1').all(); return; }
  catch (e) { if (!/no such column/i.test(String(e && e.message || e))) throw e; }
  await db.batch([
    db.prepare(`CREATE TABLE guruhlar_yangi (id INTEGER PRIMARY KEY AUTOINCREMENT, nom TEXT NOT NULL, kurs INTEGER NOT NULL DEFAULT 0,
      univ TEXT NOT NULL DEFAULT 'jtu', yaratilgan TEXT, UNIQUE (univ, nom))`),
    db.prepare(`INSERT INTO guruhlar_yangi (id, nom, kurs, univ, yaratilgan) SELECT id, nom, kurs, 'jtu', yaratilgan FROM guruhlar`),
    db.prepare(`DROP TABLE guruhlar`),
    db.prepare(`ALTER TABLE guruhlar_yangi RENAME TO guruhlar`)
  ]);
  return true;
}
const sxemaVada = new WeakMap();      // har bir baza uchun bir marta
async function baza(env) {
  const db = env.BAZA;
  if (!db) return null;
  const ustunlar = () => Promise.all(USTUNLAR.map(s => db.prepare(s).run().catch(e => {
    if (!/duplicate column/i.test(String(e && e.message || e))) throw e;
  })));
  // guruhlar jadvali ko'chirilsa (qayta yaratiladi) — uning yangi ustunlari yana qo'shiladi
  if (!sxemaVada.has(db)) sxemaVada.set(db, db.batch(SXEMA.map(s => db.prepare(s)))
    .then(ustunlar)
    .then(() => guruhUnivKochir(db))
    .then(k => k && ustunlar())
    .catch(e => { sxemaVada.delete(db); throw e; }));
  await sxemaVada.get(db);
  await univYukla(db);
  return db;
}
const hozirIso = () => new Date().toISOString();
const SESSIYA_KUN = 30;

// «➡️ 3-kurs · 2428» — talaba saytda universitet, kurs va guruhini tanlagan bo'lsa
// (Telegram xabarlari uchun: qayta tashrif, test natijasi). Topilmasa — ''.
async function guruhQatori(env, telXom) {
  try {
    const db = await baza(env), tel = telNorm(telXom);
    if (!db || !tel) return '';
    const g = await db.prepare(`SELECT g.nom, g.kurs, g.univ, a.holat FROM azolar a JOIN guruhlar g ON g.id = a.guruh_id WHERE a.tel = ?`).bind(tel).first();
    if (!g) return '';
    const un = univTop(g.univ);
    return '➡️ ' + (un && g.univ !== 'jtu' ? un.qisqa + ' · ' : '') + (g.kurs ? g.kurs + '-kurs · ' : '') + g.nom +
      (g.holat === 'tasdiqlangan' ? '' : ' (tasdiq kutmoqda)');
  } catch (e) { return ''; }
}

// natija har doim D1 ga ham yoziladi — guruh reytingi va ustoz hisobotlari shundan
async function natijaD1(env, r) {
  try {
    const db = await baza(env); if (!db) return;
    const tel = telNorm(r.tel); if (!tel) return;
    await db.prepare(`INSERT INTO natijalar (tel, ism, familiya, vaqt, bolim, mashq, togri, jami, ball, vaqt_sek, izoh)
                      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
      .bind(tel, matn(r.ism, 60), matn(r.familiya, 60), hozirIso(), matn(r.bolim, 60), matn(r.mashq, 120),
            Number(r.togri) || 0, Number(r.jami) || 0, Number(r.ball) || 0, Number(r.vaqt_sek) || 0, matn(r.izoh, 500))
      .run();
  } catch (e) {}
}

/* ---------- parol: PBKDF2-SHA256, tuz bilan ---------- */
const hex = b => [...new Uint8Array(b)].map(x => x.toString(16).padStart(2, '0')).join('');
const tasodifiy = n => hex(crypto.getRandomValues(new Uint8Array(n)));
async function parolXesh(parol, tuz) {
  const k = await crypto.subtle.importKey('raw', new TextEncoder().encode(String(parol)), 'PBKDF2', false, ['deriveBits']);
  const b = await crypto.subtle.deriveBits({ name: 'PBKDF2', hash: 'SHA-256', salt: new TextEncoder().encode(tuz), iterations: 20000 }, k, 256);
  return hex(b);
}
function tengmi(a, b) {
  a = String(a); b = String(b);
  if (a.length !== b.length) return false;
  let f = 0; for (let i = 0; i < a.length; i++) f |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return f === 0;
}

/* ---------- kim so'rayapti: sessiya ---------- */
async function kimSorayapti(request, url, db) {
  const h = request.headers.get('Authorization') || '';
  const t = (h.startsWith('Bearer ') ? h.slice(7) : url.searchParams.get('t') || '').trim();
  if (!/^[0-9a-f]{40,80}$/.test(t)) return null;
  const s = await db.prepare('SELECT login, rol, tugash FROM sessiyalar WHERE token = ?').bind(t).first();
  if (!s || s.tugash < hozirIso()) return null;
  if (s.rol === 'admin') return { login: 'admin', rol: 'admin', nom: 'Admin', token: t };
  if (s.rol === 'sardor') {
    // sardor hali ham o'sha guruhning sardori va tasdiqlangan a'zosimi
    const g = await db.prepare(`SELECT g.id, g.nom, a.ism, a.familiya FROM guruhlar g JOIN azolar a ON a.tel = g.sardor_tel AND a.guruh_id = g.id
      AND a.holat = 'tasdiqlangan' WHERE g.sardor_tel = ?`).bind(s.login).first();
    return g ? { login: s.login, rol: 'sardor', nom: ((g.ism || '') + ' ' + (g.familiya || '')).trim() + ' · ' + g.nom + ' sardori', gid: g.id, token: t } : null;
  }
  const u = await db.prepare('SELECT login, nom FROM ustozlar WHERE login = ?').bind(s.login).first();
  return u ? { login: u.login, rol: 'ustoz', nom: u.nom, token: t } : null;
}
// sardor kabinetda faqat shularni qila oladi (o'z guruhi doirasida)
const SARDOR_YOL = new Set(['chiqish', 'kabinet', 'guruh', 'natijalar', 'csv', 'kurs', 'xatolar', 'sorovlar', 'liga', 'guruh-elon',
  'battlelar', 'battle-chaqir', 'battle-javob', 'battle-och', 'battle-bekor', 'turnirlar', 'turnir-yarat', 'turnir-vaqt', 'turnir-ochir']);
// ustoz faqat o'z guruhlariga, admin hammasiga
async function guruhRuxsat(db, kim, guruhId) {
  if (kim.rol === 'admin') return true;
  const r = await db.prepare('SELECT 1 AS bor FROM ustoz_guruh WHERE login = ? AND guruh_id = ?').bind(kim.login, Number(guruhId)).first();
  return !!r;
}
/* Universitetlar. Kirish oynasida «Universitet talabasiman» belgilansa
   shu ro'yxat chiqadi. qatiy: true — guruhlar ro'yxati admin tomonidan
   tuziladi, talaba faqat shundan topadi (yozib xato qilsa — «topilmadi»).
   Qolganlarida talaba kursini tanlab, guruh raqamini o'zi yozadi —
   bunday guruh hali bo'lmasa o'zi yaratiladi va adminga xabar boradi. */
const UNIVERSITETLAR = [
  { kod: 'jtu', nom: 'Jahon tillari universiteti', qisqa: 'JTU', qatiy: true },
  { kod: 'sharq', nom: 'Sharqshunoslik universiteti', qisqa: 'Sharqshunoslik' },
  { kod: 'islom', nom: 'Islomshunoslik akademiyasi', qisqa: 'Islomshunoslik' },
  { kod: 'yangiasr', nom: 'Yangi asr universiteti', qisqa: 'Yangi asr' },
  { kod: 'alfraganus', nom: 'Alfraganus universiteti', qisqa: 'Alfraganus' },
  { kod: 'oriental', nom: 'Oriental universiteti', qisqa: 'Oriental' }
];
// bazadagi universitetlar (talaba taklif qilgan): baza() har 30 soniyada yangilaydi
let UNIV_DB = [], UNIV_DB_V = 0;
async function univYukla(db, majbur) {
  if (!majbur && Date.now() - UNIV_DB_V < 30000) return;
  try { UNIV_DB = ((await db.prepare('SELECT kod, nom, qisqa, holat, taklif, vaqt FROM universitetlar ORDER BY nom').all()).results || []); UNIV_DB_V = Date.now(); } catch (e) {}
}
const univTop = kod => UNIVERSITETLAR.find(u => u.kod === kod) || UNIV_DB.find(u => u.kod === kod) || null;
// talabalarga ko'rinadigan ro'yxat: asosiylar + admin tasdiqlaganlari
const univRoyxat = () => UNIVERSITETLAR.concat(UNIV_DB.filter(u => u.holat === 'tasdiqlangan').map(u => ({ kod: u.kod, nom: u.nom, qisqa: u.qisqa || u.nom })));
const univKod = kod => univTop(kod) ? kod : 'jtu';
// talaba yozgan guruh nomi: raqam/harf, chiziqcha — 1…20 belgi
const GURUH_NOM_RX = /^[0-9A-Za-z\u0400-\u04FF][0-9A-Za-z\u0400-\u04FF ._\-]{0,19}$/;
// tartib: universitet ro'yxatdagi tartibda, keyin 1-kurs, 2-kurs… , kurssiz guruhlar oxirida
const GURUH_TARTIB = `ORDER BY CASE g.univ ${UNIVERSITETLAR.map((u, i) => `WHEN '${u.kod}' THEN ${i}`).join(' ')} ELSE 99 END, (g.kurs = 0), g.kurs, g.nom`;
async function ustozGuruhlari(db, kim) {
  const q = kim.rol === 'admin'
    ? db.prepare(`SELECT g.id, g.nom, g.kurs, g.univ FROM guruhlar g ${GURUH_TARTIB}`)
    : db.prepare(`SELECT g.id, g.nom, g.kurs, g.univ FROM guruhlar g JOIN ustoz_guruh ug ON ug.guruh_id = g.id WHERE ug.login = ? ${GURUH_TARTIB}`).bind(kim.login);
  const g = (await q.all()).results || [];
  const son = (await db.prepare(`SELECT guruh_id, holat, COUNT(*) AS n FROM azolar WHERE guruh_id IS NOT NULL GROUP BY guruh_id, holat`).all()).results || [];
  return g.map(x => ({
    id: x.id, nom: x.nom, kurs: x.kurs || 0, univ: x.univ || 'jtu',
    azolar: (son.find(s => s.guruh_id === x.id && s.holat === 'tasdiqlangan') || {}).n || 0,
    kutilmoqda: (son.find(s => s.guruh_id === x.id && s.holat === 'kutilmoqda') || {}).n || 0
  }));
}
// a'zolar va ularning umumiy natijasi (reyting tartibida)
async function azolarReyting(db, shart, qiymatlar) {
  return ((await db.prepare(`
    SELECT a.tel, a.ism, a.familiya, a.holat, a.sorov_vaqt, a.tasdiq_vaqt, a.tasdiqlagan, a.guruh_id, g.nom AS guruh, g.kurs, g.univ,
           COUNT(n.id) AS testlar, COALESCE(SUM(n.togri), 0) AS togri, COALESCE(SUM(n.jami), 0) AS jami,
           COALESCE(SUM(n.ball), 0) AS ball, MAX(n.vaqt) AS oxirgi
      FROM azolar a JOIN guruhlar g ON g.id = a.guruh_id LEFT JOIN natijalar n ON n.tel = a.tel AND n.bolim IS NOT '${XONA_BOLIM}'
     WHERE ${shart}
     GROUP BY a.tel ORDER BY ball DESC, togri DESC, a.familiya`).bind(...qiymatlar).all()).results || [])
    .map(x => Object.assign(x, { foiz: x.jami ? Math.round(x.togri / x.jami * 100) : 0 }));
}
const guruhAzolari = (db, guruhId, holat) => azolarReyting(db, 'a.guruh_id = ? AND a.holat = ?', [Number(guruhId), holat]);
// kurs reytingi: shu universitetning shu kursidagi (ustoz uchun — faqat o'z guruhlaridagi) tasdiqlangan talabalar
async function kursAzolari(db, kim, kurs, univ) {
  const sh = `g.kurs = ? AND g.univ = ? AND a.holat = 'tasdiqlangan'`, q = [Number(kurs), univKod(univ)];
  if (!kim || kim.rol === 'admin') return azolarReyting(db, sh, q);
  return azolarReyting(db, sh + ` AND g.id IN (SELECT guruh_id FROM ustoz_guruh WHERE login = ?)`, q.concat(kim.login));
}
const csvMatn = s => '"' + String(s == null ? '' : s).replace(/"/g, '""') + '"';
const toshkent = v => new Date(Date.parse(v) + 5 * 3600e3).toISOString().slice(0, 16).replace('T', ' ');
function csvJavob(qatorlar, nom) {
  return new Response('\uFEFF' + qatorlar.join('\n'), { headers: { 'Content-Type': 'text/csv; charset=utf-8',
    'Content-Disposition': `attachment; filename*=UTF-8''${encodeURIComponent(nom + '.csv')}` } });
}

/* Ustoz (yoki sardor) kabinetga kirdi — «Qayta tashriflar» botiga.
   Sahifa ochilganda bir marta (?tashrif=1), bir odam uchun 10 daqiqada
   bir martadan ko'p emas (sahifa qayta-qayta yangilansa ham). */
async function kabinetTashrif(env, db, kim, guruhlar) {
  if (!tashrifToken(env) || !chat(env)) return;
  try {
    const k = 'tashrif:' + kim.login, eski = await db.prepare('SELECT qiymat FROM sozlama WHERE kalit = ?').bind(k).first();
    if (eski && Date.now() - Number(eski.qiymat) < 10 * 60e3) return;
    await db.prepare('INSERT INTO sozlama (kalit, qiymat) VALUES (?, ?) ON CONFLICT(kalit) DO UPDATE SET qiymat = excluded.qiymat').bind(k, String(Date.now())).run();
    const gr = (guruhlar || []).map(g => g.nom).slice(0, 20).join(', ');
    const text = yorliqli((kim.rol === 'sardor' ? '⭐ <b>Sardor kabinetga kirdi</b>' : '🧑‍🏫 <b>Ustoz kabinetiga kirdi</b>') + '\n\n' +
      `👤 ${tgEsc(kim.nom)}` + (kim.rol === 'ustoz' ? ` (${tgEsc(kim.login)})` : `\n📞 ${tgEsc(kim.login)}`) + '\n' +
      (gr ? `👥 Guruhlari: ${tgEsc(gr)}\n` : '') + `🕒 ${vaqtMatni()}`);
    await fetch(`https://api.telegram.org/bot${tashrifToken(env)}/sendMessage`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ chat_id: chat(env), text, parse_mode: 'HTML' }) });
  } catch (e) {}
}
/* Tanlangan talabalarga push (sayt yopiq bo'lsa ham). Bepul rejada bitta
   so'rovda 50 tadan ko'p tashqi so'rov yo'q — eng ko'pi 30 ta qurilmaga. */
async function pushTellarga(db, origin, tellar, sarlavha, m, havola) {
  tellar = [...new Set((tellar || []).filter(Boolean))].slice(0, 300);
  if (!tellar.length) return 0;
  try {
    const obunalar = (await db.prepare(`SELECT * FROM push_obuna WHERE tel IN (${tellar.map(() => '?').join(',')}) ORDER BY vaqt DESC LIMIT 30`).bind(...tellar).all()).results || [];
    if (!obunalar.length) return 0;
    const kalit = await vapidKalit(db), yuk = JSON.stringify({ sarlavha, matn: String(m).slice(0, 180), url: havola || '/index.html' });
    let yetdi = 0; const eskilar = [];
    await Promise.all(obunalar.map(async o => {
      try { const j = await pushYubor(o, yuk, kalit, origin); if (j.status === 404 || j.status === 410) eskilar.push(o.endpoint); else if (j.ok) yetdi++; } catch (e) {}
    }));
    if (eskilar.length) await db.batch(eskilar.map(e => db.prepare('DELETE FROM push_obuna WHERE endpoint = ?').bind(e)));
    return yetdi;
  } catch (e) { return 0; }
}

async function guruhApi(request, url, env) {
  let db;
  try { db = await baza(env); } catch (e) { return json({ ok: false, xato: 'baza xatosi: ' + String(e.message || e).slice(0, 120) }); }
  if (!db) return json({ ok: false, yoqilgan: false, xato: 'D1 baza ulanmagan (BAZA)' });
  const yol = url.pathname.slice('/api/g/'.length);
  let d = {};
  if (request.method === 'POST') { try { d = await request.json(); } catch (e) { d = {}; } }
  try {
    /* ---------------- talaba (telefon raqami bilan) ---------------- */
    const barchaGuruh = async () => (await db.prepare(`SELECT g.id, g.nom, g.kurs, g.univ FROM guruhlar g ${GURUH_TARTIB}`).all()).results || [];
    if (yol === 'guruhlar') return json({ ok: true, yoqilgan: true, guruhlar: await barchaGuruh(), universitetlar: univRoyxat() });   // kirish oynasi uchun
    if (yol === 'men') {
      const tel = telNorm(url.searchParams.get('tel'));
      if (!tel) return json({ ok: false, xato: 'telefon raqami noto‘g‘ri' }, 400);
      const a = await db.prepare(`SELECT a.guruh_id, a.holat, g.nom AS guruh, g.kurs, g.univ, g.sardor_tel FROM azolar a LEFT JOIN guruhlar g ON g.id = a.guruh_id WHERE a.tel = ?`).bind(tel).first();
      const azo = a && a.guruh_id && a.guruh ? { guruh_id: a.guruh_id, guruh: a.guruh, kurs: a.kurs || 0, univ: a.univ || 'jtu', univ_nom: (univTop(a.univ) || {}).qisqa || null, holat: a.holat,
        sardor: a.holat === 'tasdiqlangan' && a.sardor_tel === tel } : null;
      if (azo && azo.holat === 'tasdiqlangan')
        azo.elonlar = ((await db.prepare('SELECT ism, matn, vaqt FROM guruh_elon WHERE gid = ? AND vaqt > ? ORDER BY id DESC LIMIT 5')
          .bind(a.guruh_id, Date.now() - 14 * 864e5).all()).results || []);
      return json({ ok: true, yoqilgan: true, guruhlar: await barchaGuruh(), universitetlar: univRoyxat(), azo });
    }
    /* ---------- «Mening lug'atim»: foydalanuvchi o'zi qo'shgan so'zlar ----------
       So'zlar telefonda turadi; bu yerda — zaxira nusxasi (boshqa qurilmada ham chiqishi uchun).
       Qaysi nusxa yangi bo'lsa (vaqt), o'sha qoladi.                                        */
    if (yol === 'lugatim') {
      const tel = telNorm(request.method === 'POST' ? d.tel : url.searchParams.get('tel'));
      if (!tel) return json({ ok: false, xato: 'telefon raqami noto‘g‘ri' }, 400);
      const bor = await db.prepare('SELECT sozlar, vaqt FROM shaxsiy_lugat WHERE tel = ?').bind(tel).first();
      const oqi = () => { let sz = []; try { sz = JSON.parse(bor.sozlar) || []; } catch (e) {} return { ok: true, sozlar: sz, vaqt: bor.vaqt }; };
      if (request.method !== 'POST') return json(bor ? oqi() : { ok: true, sozlar: [], vaqt: 0 });
      const vaqt = Math.min(Math.round(Number(d.vaqt)) || 0, Date.now() + 60000);
      if (bor && bor.vaqt > vaqt) return json(Object.assign(oqi(), { eski: true }));        // serverdagisi yangiroq — o'shani qaytaramiz
      const sz = (Array.isArray(d.sozlar) ? d.sozlar : []).slice(0, SHAXSIY_SIG).map(x => ({ id: matn(x && x.id, 20), ar: matn(x && x.ar, 120), uz: matn(x && x.uz, 200),
        kop: matn(x && x.kop, 120), t: Math.round(Number(x && x.t)) || 0 })).filter(x => x.id && x.ar && x.uz);
      await db.prepare('INSERT OR REPLACE INTO shaxsiy_lugat (tel, sozlar, vaqt) VALUES (?, ?, ?)').bind(tel, JSON.stringify(sz), vaqt || Date.now()).run();
      return json({ ok: true, saqlandi: sz.length });
    }
    if (yol === 'soz-taklif' && request.method === 'POST') {        // so'zni umumiy lug'atga taklif qilish → admin paneli
      const tel = telNorm(d.tel), ar = matn(d.ar, 120).replace(/\s+/g, ' '), uz = matn(d.uz, 200).replace(/\s+/g, ' ');
      if (!tel) return json({ ok: false, xato: 'Avval saytga telefon raqamingiz bilan kiring' }, 400);
      if (!/[\u0600-\u06FF]/.test(ar)) return json({ ok: false, xato: 'Arabcha so‘zni arab harflarida yozing' }, 400);
      if (uz.length < 2) return json({ ok: false, xato: 'O‘zbekcha tarjimasini yozing' }, 400);
      const kut = (await db.prepare(`SELECT COUNT(*) AS n FROM soz_taklif WHERE tel = ? AND holat = 'kutilmoqda'`).bind(tel).first()).n;
      if (kut >= 30) return json({ ok: false, xato: 'Sizning 30 ta taklifingiz hali ko‘rib chiqilmagan — biroz kuting' }, 429);
      if ((await db.prepare(`SELECT COUNT(*) AS n FROM soz_taklif WHERE holat = 'kutilmoqda'`).first()).n >= 2000) return json({ ok: false, xato: 'Hozircha takliflar ko‘p — keyinroq urinib ko‘ring' }, 429);
      const eski = await db.prepare(`SELECT id, holat FROM soz_taklif WHERE tel = ? AND ar = ? ORDER BY id DESC`).bind(tel, ar).first();
      if (eski && eski.holat === 'kutilmoqda') {                    // shu so'z yana yuborildi — tarjimasi yangilanadi
        await db.prepare(`UPDATE soz_taklif SET uz = ?, kop = COALESCE(NULLIF(?, ''), kop), qism = COALESCE(?, qism), izoh = COALESCE(NULLIF(?, ''), izoh), vaqt = ? WHERE id = ?`).bind(uz, matn(d.kop, 120), Number(d.qism) || null, matn(d.izoh, 300), hozirIso(), eski.id).run();
        return json({ ok: true, id: eski.id, yangilandi: true });
      }
      const u = await db.prepare(`INSERT INTO soz_taklif (tel, ism, ar, uz, kop, qism, izoh, vaqt) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`)
        .bind(tel, matn(d.ism, 80), ar, uz, matn(d.kop, 120), Number(d.qism) || null, matn(d.izoh, 300), hozirIso()).run();
      const esc = t => String(t).replace(/&/g, '&amp;').replace(/</g, '&lt;');
      await qidiruvXabar(env, `📝 <b>Yangi so‘z taklifi</b>\n\n${esc(ar)} — ${esc(uz)}${d.kop ? `\nKo‘pligi: ${esc(matn(d.kop, 120))}` : ''}` +
        `\n👤 ${esc(matn(d.ism, 80) || '—')} · ${tel}${d.izoh ? `\n💬 ${esc(matn(d.izoh, 300))}` : ''}\n\nKo‘rib chiqish: ${url.origin}/ustoz.html → So‘z takliflari`);
      return json({ ok: true, id: u.meta && u.meta.last_row_id });
    }
    if (yol === 'soz-takliflarim') {                                // foydalanuvchiga: takliflarining holati
      const tel = telNorm(url.searchParams.get('tel'));
      if (!tel) return json({ ok: false, xato: 'telefon raqami noto‘g‘ri' }, 400);
      return json({ ok: true, takliflar: (await db.prepare('SELECT id, ar, uz, kop, holat, javob, vaqt FROM soz_taklif WHERE tel = ? ORDER BY id DESC LIMIT 100').bind(tel).all()).results || [] });
    }
    if (yol === 'ustoz-sorov' && request.method === 'POST') {       // «Men ustozman» — admindan login so'rash
      const tel = telNorm(d.tel), ism = matn(d.ism, 80).replace(/\s+/g, ' ');
      if (ism.length < 3) return json({ ok: false, xato: 'Ism va familiyangizni yozing' }, 400);
      if (!tel) return json({ ok: false, xato: 'Telefon raqamini to‘g‘ri yozing' }, 400);
      const un = univTop(d.univ), univ = un ? un.nom : matn(d.univ_nom, 80);
      if (!univ) return json({ ok: false, xato: 'Universitetingizni tanlang yoki yozing' }, 400);
      const jami = (await db.prepare('SELECT COUNT(*) AS n FROM ustoz_sorov').first()).n;
      if (jami >= 300) return json({ ok: false, xato: 'Hozircha so‘rovlar ko‘p — keyinroq urinib ko‘ring' }, 429);
      await db.prepare('DELETE FROM ustoz_sorov WHERE tel = ?').bind(tel).run();          // bir raqamdan — bitta so'rov
      await db.prepare('INSERT INTO ustoz_sorov (ism, tel, univ, izoh, vaqt) VALUES (?, ?, ?, ?, ?)').bind(ism, tel, univ, matn(d.izoh, 300), hozirIso()).run();
      const esc = s => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;');
      await qidiruvXabar(env, `👨‍🏫 <b>Ustozlik so‘rovi</b>\n\n${esc(ism)}\n📞 ${tel}\n🎓 ${esc(univ)}` + (d.izoh ? `\n💬 ${esc(matn(d.izoh, 300))}` : '') +
        `\n\nLogin berish: ${url.origin}/ustoz.html → Ustozlar`);
      return json({ ok: true });
    }
    if (yol === 'qoshil' && request.method === 'POST') {
      const tel = telNorm(d.tel);
      if (!tel) return json({ ok: false, xato: 'telefon raqami noto‘g‘ri' }, 400);
      let g = d.guruh_id ? await db.prepare('SELECT id, nom, kurs, univ FROM guruhlar WHERE id = ?').bind(Number(d.guruh_id)).first() : null, yangiGuruh = false;
      if (!g && !d.guruh_id && d.univ_yangi) {
        // ro'yxatda yo'q universitet — taklif sifatida qo'shiladi (admin tasdiqlaguncha faqat shu talabaniki)
        const un = matn(d.univ_yangi, 80).replace(/\s+/g, ' ');
        if (un.length < 3) return json({ ok: false, xato: 'Universitet nomini to‘liq yozing' }, 400);
        const nn = un.toLowerCase();
        let bor = univRoyxat().find(u => u.nom.toLowerCase() === nn) || UNIV_DB.find(u => u.nom.toLowerCase() === nn);
        if (!bor) {
          const n = (await db.prepare(`SELECT COUNT(*) AS n FROM universitetlar WHERE taklif = ? AND holat = 'kutilmoqda'`).bind(tel).first()).n;
          if (n >= 3) return json({ ok: false, xato: 'Siz taklif qilgan universitetlar hali tasdiqlanmagan — kuting' }, 429);
          const kod = 'u' + tasodifiy(4);
          await db.prepare(`INSERT INTO universitetlar (kod, nom, qisqa, holat, taklif, vaqt) VALUES (?, ?, ?, 'kutilmoqda', ?, ?)`).bind(kod, un, un.split(' ').slice(0, 2).join(' '), tel, hozirIso()).run();
          await univYukla(db, true);
          bor = univTop(kod);
          d.univYangiMi = true;
        }
        d.univ = bor.kod;
      }
      if (!g && !d.guruh_id) {
        // qatiy bo'lmagan universitet: talaba kursi va guruh raqamini o'zi yozgan
        const u = univTop(d.univ), nom = matn(d.nom, 20), kurs = Number(d.kurs);
        if (!u || u.qatiy) return json({ ok: false, xato: 'guruhni ro‘yxatdan tanlang' }, 400);
        if (!GURUH_NOM_RX.test(nom)) return json({ ok: false, xato: 'guruh raqami noto‘g‘ri' }, 400);
        if (!(kurs >= 1 && kurs <= 6)) return json({ ok: false, xato: 'kursni tanlang' }, 400);
        g = await db.prepare('SELECT id, nom, kurs, univ FROM guruhlar WHERE univ = ? AND nom = ?').bind(u.kod, nom).first();
        if (!g) {
          await db.prepare('INSERT OR IGNORE INTO guruhlar (nom, kurs, univ, yaratilgan) VALUES (?, ?, ?, ?)').bind(nom, Math.floor(kurs), u.kod, hozirIso()).run();
          g = await db.prepare('SELECT id, nom, kurs, univ FROM guruhlar WHERE univ = ? AND nom = ?').bind(u.kod, nom).first();
          yangiGuruh = true;
        }
      }
      if (!g) return json({ ok: false, xato: 'bunday guruh yo‘q' }, 400);
      const gid = g.id, gu = univTop(g.univ), gMatn = (gu && g.univ !== 'jtu' ? gu.qisqa + ' · ' : '') + (g.kurs ? g.kurs + '-kurs · ' : '') + g.nom;
      const eski = await db.prepare('SELECT guruh_id, holat FROM azolar WHERE tel = ?').bind(tel).first();
      if (eski && eski.guruh_id === gid && eski.holat === 'tasdiqlangan') return json({ ok: true, holat: 'tasdiqlangan', guruh: g.nom });
      const ism = matn(d.ism, 60), fam = matn(d.familiya, 60);
      await db.prepare(`INSERT INTO azolar (tel, ism, familiya, guruh_id, holat, sorov_vaqt) VALUES (?, ?, ?, ?, 'kutilmoqda', ?)
                        ON CONFLICT(tel) DO UPDATE SET ism = excluded.ism, familiya = excluded.familiya, guruh_id = excluded.guruh_id,
                        holat = 'kutilmoqda', sorov_vaqt = excluded.sorov_vaqt, tasdiq_vaqt = NULL, tasdiqlagan = NULL`)
        .bind(tel, ism, fam, gid, hozirIso()).run();
      const esc = s => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;');
      await qidiruvXabar(env, `👥 <b>Guruhga so‘rov</b>\n\n${esc(ism)} ${esc(fam)}\n📞 ${tel}\n➡️ ${esc(gMatn)}` +
        (yangiGuruh ? `\n🆕 Bu guruh hali yo‘q edi — talaba yozgani bo‘yicha yaratildi (${esc(gu ? gu.nom : '')})` : '') +
        (d.univYangiMi ? `\n🎓 Yangi universitet taklif qilindi: ${esc(gu ? gu.nom : '')} — kabinetda tasdiqlang` : '') +
        `\n\nTasdiqlash: ${url.origin}/ustoz.html`);
      return json({ ok: true, holat: 'kutilmoqda', guruh: g.nom, guruh_id: gid, kurs: g.kurs || 0, univ: g.univ });
    }
    if (['liga-men', 'musobaqa-men', 'qatnashaman', 'guruhdoshlar', 'duel-yarat', 'duellar'].includes(yol))
      return musobaqaTalaba(yol, request, url, env, db, d);
    if (yol === 'bekor' && request.method === 'POST') {          // talaba o'z so'rovini qaytarib oladi
      const tel = telNorm(d.tel);
      if (!tel) return json({ ok: false, xato: 'telefon raqami noto‘g‘ri' }, 400);
      await db.prepare(`DELETE FROM azolar WHERE tel = ? AND holat != 'tasdiqlangan'`).bind(tel).run();
      return json({ ok: true });
    }
    if (yol === 'reyting') {                                     // ?tur=kurs — butun kurs bo'yicha
      const tel = telNorm(url.searchParams.get('tel'));
      const a = tel && await db.prepare(`SELECT a.guruh_id, g.nom, g.kurs, g.univ FROM azolar a JOIN guruhlar g ON g.id = a.guruh_id WHERE a.tel = ? AND a.holat = 'tasdiqlangan'`).bind(tel).first();
      if (!a) return json({ ok: false, xato: 'guruh a‘zosi emas' });
      const kursBoyicha = url.searchParams.get('tur') === 'kurs';
      if (kursBoyicha && !a.kurs) return json({ ok: false, xato: 'guruhning kursi belgilanmagan' });
      const r = kursBoyicha ? await kursAzolari(db, null, a.kurs, a.univ) : await guruhAzolari(db, a.guruh_id, 'tasdiqlangan');
      return json({ ok: true, guruh: a.nom, kurs: a.kurs || 0, univ: a.univ, reyting: r.map((x, i) => ({ orin: i + 1, ism: x.ism, familiya: x.familiya,
        guruh: x.guruh, ball: x.ball, foiz: x.foiz, testlar: x.testlar, men: x.tel === tel })) });
    }

    /* ---------------- kabinetga kirish ---------------- */
    if (yol === 'kirish' && request.method === 'POST') {
      const login = matn(d.login, 40).toLowerCase(), parol = String(d.parol || '');
      let rol = null;
      if (login === 'admin') {
        if (!env.KABINET_PAROL) return json({ ok: false, xato: 'Admin paroli (KABINET_PAROL) Cloudflare’da berilmagan' }, 403);
        if (tengmi(parol, env.KABINET_PAROL)) rol = 'admin';
      } else if (/^[+\d\s()-]{9,20}$/.test(login) && telNorm(login)) {
        // guruh sardori: login — telefon raqami, parol — admin/ustoz bergan kod
        const g = await db.prepare('SELECT sardor_tuz, sardor_xesh FROM guruhlar WHERE sardor_tel = ?').bind(telNorm(login)).first();
        if (g && g.sardor_xesh && tengmi(await parolXesh(parol.trim().toUpperCase(), g.sardor_tuz), g.sardor_xesh)) rol = 'sardor';
      } else {
        const u = await db.prepare('SELECT tuz, xesh FROM ustozlar WHERE login = ?').bind(login).first();
        if (u && tengmi(await parolXesh(parol, u.tuz), u.xesh)) rol = 'ustoz';
      }
      if (!rol) return json({ ok: false, xato: 'Login yoki parol noto‘g‘ri' }, 403);
      const t = tasodifiy(24);
      await db.prepare('DELETE FROM sessiyalar WHERE tugash < ?').bind(hozirIso()).run();
      await db.prepare('INSERT INTO sessiyalar (token, login, rol, tugash) VALUES (?, ?, ?, ?)')
        .bind(t, rol === 'sardor' ? telNorm(login) : login, rol, new Date(Date.now() + SESSIYA_KUN * 864e5).toISOString()).run();
      return json({ ok: true, token: t, rol });
    }

    const kim = await kimSorayapti(request, url, db);
    if (!kim) return json({ ok: false, xato: 'kirish kerak', kirish: true }, 401);
    const admin = kim.rol === 'admin';
    const faqatAdmin = () => json({ ok: false, xato: 'bu faqat admin uchun' }, 403);
    if (kim.rol === 'sardor' && !SARDOR_YOL.has(yol)) return json({ ok: false, xato: 'sardor buni qila olmaydi' }, 403);

    if (yol === 'chiqish' && request.method === 'POST') {
      await db.prepare('DELETE FROM sessiyalar WHERE token = ?').bind(kim.token).run();
      return json({ ok: true });
    }
    if (yol === 'kabinet') {
      const javob = { ok: true, rol: kim.rol, nom: kim.nom, login: kim.login, guruhlar: await ustozGuruhlari(db, kim), universitetlar: kim.rol === 'admin' ? univRoyxat().concat(UNIV_DB.filter(u => u.holat === 'kutilmoqda')
        .map(u => ({ kod: u.kod, nom: '⏳ ' + u.nom, qisqa: '⏳ ' + (u.qisqa || u.nom) }))) : univRoyxat() };
      if (kim.rol === 'sardor') javob.gid = kim.gid;
      // ustoz (sardor ham) kabinetga kirdi — «tashrif» botiga (admin o'zi kirgani yuborilmaydi)
      if (url.searchParams.get('tashrif') === '1' && kim.rol !== 'admin') await kabinetTashrif(env, db, kim, javob.guruhlar);
      if (admin) {
        const u = (await db.prepare('SELECT login, nom FROM ustozlar ORDER BY nom').all()).results || [];
        const ug = (await db.prepare('SELECT login, guruh_id FROM ustoz_guruh').all()).results || [];
        javob.ustozlar = u.map(x => ({ login: x.login, nom: x.nom, guruhlar: ug.filter(y => y.login === x.login).map(y => y.guruh_id) }));
        javob.parolBor = !!env.KABINET_PAROL;
        javob.kutilgan = { univ: UNIV_DB.filter(u => u.holat === 'kutilmoqda').length,
          ustoz: (await db.prepare('SELECT COUNT(*) AS n FROM ustoz_sorov').first()).n,
          soz: (await db.prepare(`SELECT COUNT(*) AS n FROM soz_taklif WHERE holat = 'kutilmoqda'`).first()).n };
      }
      return json(javob);
    }
    if (yol === 'guruh') {
      const gid = Number(url.searchParams.get('id'));
      if (!(await guruhRuxsat(db, kim, gid))) return json({ ok: false, xato: 'bu guruh sizga biriktirilmagan' }, 403);
      const g = await db.prepare('SELECT id, nom, kurs, univ, sardor_tel FROM guruhlar WHERE id = ?').bind(gid).first();
      if (!g) return json({ ok: false, xato: 'guruh topilmadi' }, 404);
      g.sardor = g.sardor_tel || null; delete g.sardor_tel;
      return json({ ok: true, guruh: g, azolar: await guruhAzolari(db, gid, 'tasdiqlangan'),
                    kutilmoqda: await guruhAzolari(db, gid, 'kutilmoqda') });
    }
    if (yol === 'kurs' || (yol === 'csv' && url.searchParams.get('kurs'))) {
      const kurs = Number(url.searchParams.get('kurs'));
      if (!(kurs >= 1 && kurs <= 6)) return json({ ok: false, xato: 'kurs noto‘g‘ri' }, 400);
      const univ = univKod(url.searchParams.get('univ')), u = univTop(univ);
      const az = await kursAzolari(db, kim, kurs, univ);
      if (yol === 'kurs') return json({ ok: true, kurs, univ, azolar: az });
      return csvJavob(['O‘rin,Ism,Familiya,Guruh,Telefon,Testlar,To‘g‘ri,Jami,Foiz,Ball,Oxirgi faollik']
        .concat(az.map((x, i) => [i + 1, x.ism, x.familiya, x.guruh, x.tel, x.testlar, x.togri, x.jami, x.foiz, x.ball,
          x.oxirgi ? toshkent(x.oxirgi) : ''].map(csvMatn).join(','))), (univ !== 'jtu' ? u.qisqa + ' ' : '') + kurs + '-kurs - reyting');
    }
    if (yol === 'natijalar' || yol === 'csv') {
      const gid = Number(url.searchParams.get('id'));
      if (!(await guruhRuxsat(db, kim, gid))) return json({ ok: false, xato: 'bu guruh sizga biriktirilmagan' }, 403);
      const sh = [`a.guruh_id = ?`, `a.holat = 'tasdiqlangan'`], b = [gid];
      const tel = telNorm(url.searchParams.get('tel')); if (tel) { sh.push('n.tel = ?'); b.push(tel); }
      const dan = url.searchParams.get('dan'), gacha = url.searchParams.get('gacha');
      if (/^\d{4}-\d{2}-\d{2}$/.test(dan || '')) { sh.push('n.vaqt >= ?'); b.push(new Date(Date.parse(dan + 'T00:00:00Z') - 5 * 3600e3).toISOString()); }
      if (/^\d{4}-\d{2}-\d{2}$/.test(gacha || '')) { sh.push('n.vaqt < ?'); b.push(new Date(Date.parse(gacha + 'T00:00:00Z') + 19 * 3600e3).toISOString()); }
      const mq = matn(url.searchParams.get('mashq'), 40); if (mq) { sh.push('n.mashq LIKE ?'); b.push('%' + mq + '%'); }
      const rows = (await db.prepare(`SELECT n.id, n.tel, a.ism, a.familiya, n.vaqt, n.bolim, n.mashq, n.togri, n.jami, n.ball, n.vaqt_sek, n.izoh
        FROM natijalar n JOIN azolar a ON a.tel = n.tel WHERE ${sh.join(' AND ')} ORDER BY n.vaqt DESC LIMIT ?`)
        .bind(...b, yol === 'csv' ? 5000 : 300).all()).results || [];
      if (yol === 'natijalar') return json({ ok: true, natijalar: rows });
      const q = csvMatn, tk = toshkent;
      const tur = url.searchParams.get('tur');
      let out;
      if (tur === 'azolar') {
        const az = await guruhAzolari(db, gid, 'tasdiqlangan');
        out = ['O‘rin,Ism,Familiya,Telefon,Testlar,To‘g‘ri,Jami,Foiz,Ball,Oxirgi faollik']
          .concat(az.map((x, i) => [i + 1, x.ism, x.familiya, x.tel, x.testlar, x.togri, x.jami, x.foiz, x.ball, x.oxirgi ? tk(x.oxirgi) : ''].map(q).join(','))).join('\n');
      } else {
        out = ['Sana,Ism,Familiya,Telefon,Bo‘lim,Mashq,To‘g‘ri,Jami,Foiz,Ball,Vaqt (sek),Izoh']
          .concat(rows.map(x => [tk(x.vaqt), x.ism, x.familiya, x.tel, x.bolim, x.mashq, x.togri, x.jami,
            x.jami ? Math.round(x.togri / x.jami * 100) : 0, x.ball, x.vaqt_sek, x.izoh].map(q).join(','))).join('\n');
      }
      const g = await db.prepare('SELECT nom FROM guruhlar WHERE id = ?').bind(gid).first();
      return csvJavob([out], (g ? g.nom : 'guruh') + (tur === 'azolar' ? ' - reyting' : ' - natijalar'));
    }
    if (yol === 'xatolar') {
      const gid = Number(url.searchParams.get('id'));
      if (!(await guruhRuxsat(db, kim, gid))) return json({ ok: false, xato: 'bu guruh sizga biriktirilmagan' }, 403);
      const rows = (await db.prepare(`SELECT n.izoh, n.tel FROM natijalar n JOIN azolar a ON a.tel = n.tel
        WHERE a.guruh_id = ? AND a.holat = 'tasdiqlangan' AND n.izoh LIKE 'Xato%' ORDER BY n.vaqt DESC LIMIT 2000`).bind(gid).all()).results || [];
      const m = new Map();
      rows.forEach(r => String(r.izoh).replace(/^Xato[^:]*:\s*/, '').split(',').map(s => s.trim()).filter(Boolean).forEach(s => {
        const e = m.get(s) || { soz: s, marta: 0, talabalar: new Set() };
        e.marta++; e.talabalar.add(r.tel); m.set(s, e);
      }));
      return json({ ok: true, xatolar: [...m.values()].sort((a, b) => b.talabalar.size - a.talabalar.size || b.marta - a.marta)
        .slice(0, 60).map(e => ({ soz: e.soz, marta: e.marta, talabalar: e.talabalar.size })) });
    }
    // ustoz/admin ko'radigan barcha guruhlardagi so'rovlar (kabinet tepasida, yangisi tepada)
    const ustozShart = admin ? '' : ' AND g.id IN (SELECT guruh_id FROM ustoz_guruh WHERE login = ?)', ustozQ = admin ? [] : [kim.login];
    if (yol === 'sorovlar' && kim.rol === 'sardor') return json({ ok: true, sorovlar: [] });   // sardor so'rov tasdiqlamaydi
    if (yol === 'sorovlar') {
      const r = await azolarReyting(db, `a.holat = 'kutilmoqda'` + ustozShart, ustozQ);
      r.sort((a, b) => String(b.sorov_vaqt || '').localeCompare(String(a.sorov_vaqt || '')));
      return json({ ok: true, sorovlar: r.map(x => ({ tel: x.tel, ism: x.ism, familiya: x.familiya, guruh_id: x.guruh_id,
        guruh: x.guruh, kurs: x.kurs || 0, univ: x.univ || 'jtu', sorov_vaqt: x.sorov_vaqt })) });
    }
    if (yol === 'tasdiq-hammasi' && request.method === 'POST') {   // ko'rib turgan so'rovlarini birdan
      const tellar = [...new Set((Array.isArray(d.tellar) ? d.tellar : []).map(telNorm).filter(Boolean))].slice(0, 500);
      if (!tellar.length) return json({ ok: true, tasdiqlandi: 0 });
      const v = hozirIso();
      const r = await db.batch(tellar.map(t => db.prepare(`UPDATE azolar SET holat = 'tasdiqlangan', tasdiq_vaqt = ?, tasdiqlagan = ?
        WHERE tel = ? AND holat = 'kutilmoqda'` + (admin ? '' : ' AND guruh_id IN (SELECT guruh_id FROM ustoz_guruh WHERE login = ?)'))
        .bind(...[v, kim.nom, t].concat(ustozQ))));
      return json({ ok: true, tasdiqlandi: r.reduce((s, x) => s + ((x && (x.meta ? x.meta.changes : x.changes)) || 0), 0) });
    }
    if (yol === 'tasdiq' && request.method === 'POST') {       // ustoz ham, admin ham
      const tel = telNorm(d.tel), holat = d.holat === 'rad' ? 'rad' : 'tasdiqlangan';
      const a = tel && await db.prepare('SELECT guruh_id, holat FROM azolar WHERE tel = ?').bind(tel).first();
      if (!a || !a.guruh_id) return json({ ok: false, xato: 'so‘rov topilmadi' }, 404);
      if (!(await guruhRuxsat(db, kim, a.guruh_id))) return json({ ok: false, xato: 'bu guruh sizga biriktirilmagan' }, 403);
      if (a.holat === 'tasdiqlangan' && !admin) return json({ ok: false, xato: 'allaqachon tasdiqlangan' }, 400);
      if (holat === 'rad') await db.prepare('DELETE FROM azolar WHERE tel = ?').bind(tel).run();
      else await db.prepare(`UPDATE azolar SET holat = 'tasdiqlangan', tasdiq_vaqt = ?, tasdiqlagan = ? WHERE tel = ?`)
        .bind(hozirIso(), kim.nom, tel).run();
      return json({ ok: true, holat });
    }

    if (yol === 'liga' || /^(battle|turnir)/.test(yol)) return musobaqaKabinet(yol, request, url, env, db, d, kim);
    if (yol === 'sardorlar') {                                // admin: barcha guruhlar, sardori va a'zolari (tayinlash uchun)
      if (kim.rol !== 'admin') return json({ ok: false, xato: 'sardorni faqat admin tayinlaydi' }, 403);
      const gl = (await db.prepare('SELECT id, nom, kurs, univ, sardor_tel FROM guruhlar ORDER BY kurs, nom').all()).results || [];
      const al = (await db.prepare(`SELECT tel, ism, familiya, guruh_id FROM azolar WHERE holat = 'tasdiqlangan' ORDER BY familiya, ism`).all()).results || [];
      const azo = new Map();
      al.forEach(x => { if (!azo.has(x.guruh_id)) azo.set(x.guruh_id, []); azo.get(x.guruh_id).push({ tel: x.tel, ism: ((x.ism || '') + ' ' + (x.familiya || '')).trim() }); });
      return json({ ok: true, guruhlar: gl.map(g => {
        const a = azo.get(g.id) || [], sr = g.sardor_tel ? a.find(x => x.tel === g.sardor_tel) : null;
        return { id: g.id, nom: g.nom, kurs: g.kurs, univ: g.univ, sardor: g.sardor_tel || null, sardor_ism: sr ? sr.ism : null, azolar: a };
      }) });
    }
    if (yol === 'sardor' && request.method === 'POST') {       // {guruh_id, tel} — sardor qilish; tel bo'sh — olib tashlash (faqat admin)
      if (kim.rol !== 'admin') return json({ ok: false, xato: 'sardorni faqat admin tayinlaydi' }, 403);
      const gid = Number(d.guruh_id);
      const g = await db.prepare('SELECT id, sardor_tel FROM guruhlar WHERE id = ?').bind(gid).first();
      if (!g) return json({ ok: false, xato: 'guruh topilmadi' }, 404);
      const eski = g.sardor_tel, amallar = [];
      if (eski) amallar.push(db.prepare('DELETE FROM ustoz_guruh WHERE login = ?').bind(eski),
        db.prepare(`DELETE FROM sessiyalar WHERE login = ? AND rol = 'sardor'`).bind(eski));
      if (!d.tel) {
        amallar.push(db.prepare('UPDATE guruhlar SET sardor_tel = NULL, sardor_tuz = NULL, sardor_xesh = NULL WHERE id = ?').bind(gid));
        await db.batch(amallar);
        return json({ ok: true });
      }
      const tel = telNorm(d.tel);
      const a = tel && await db.prepare(`SELECT ism, familiya FROM azolar WHERE tel = ? AND guruh_id = ? AND holat = 'tasdiqlangan'`).bind(tel, gid).first();
      if (!a) return json({ ok: false, xato: 'talaba shu guruhda emas' }, 400);
      // boshqa guruhda sardor bo'lsa — u yerdan olinadi
      amallar.push(db.prepare(`UPDATE guruhlar SET sardor_tel = NULL, sardor_tuz = NULL, sardor_xesh = NULL WHERE sardor_tel = ? AND id != ?`).bind(tel, gid),
        db.prepare('DELETE FROM ustoz_guruh WHERE login = ?').bind(tel));
      const kod = [...crypto.getRandomValues(new Uint8Array(8))].map(x => 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'[x % 32]).join(''), tuz = tasodifiy(16);
      amallar.push(db.prepare('UPDATE guruhlar SET sardor_tel = ?, sardor_tuz = ?, sardor_xesh = ? WHERE id = ?').bind(tel, tuz, await parolXesh(kod, tuz), gid),
        db.prepare('INSERT OR IGNORE INTO ustoz_guruh (login, guruh_id) VALUES (?, ?)').bind(tel, gid));
      await db.batch(amallar);
      return json({ ok: true, tel, kod, ism: ((a.ism || '') + ' ' + (a.familiya || '')).trim() });
    }
    if (yol === 'guruh-elon' && request.method === 'POST') {   // {guruh_id, matn} — guruh a'zolariga (push + «guruhim» oynasi)
      const gid = kim.rol === 'sardor' ? kim.gid : Number(d.guruh_id);
      if (!(await guruhRuxsat(db, kim, gid))) return json({ ok: false, xato: 'bu guruh sizga biriktirilmagan' }, 403);
      const m = matn(d.matn, 400).replace(/[ \t]+/g, ' ');
      if (!m) return json({ ok: false, xato: 'Xabar bo‘sh' }, 400);
      const g = await db.prepare('SELECT nom FROM guruhlar WHERE id = ?').bind(gid).first();
      await db.prepare('INSERT INTO guruh_elon (gid, ism, matn, vaqt) VALUES (?, ?, ?, ?)').bind(gid, kim.nom, m, Date.now()).run();
      await db.prepare('DELETE FROM guruh_elon WHERE vaqt < ?').bind(Date.now() - 30 * 864e5).run();
      const tellar = ((await db.prepare(`SELECT tel FROM azolar WHERE guruh_id = ? AND holat = 'tasdiqlangan'`).bind(gid).all()).results || []).map(x => x.tel);
      const p = await pushTellarga(db, url.origin, tellar, '📢 ' + (g ? g.nom + '-guruh' : 'Guruh') + ' · ' + kim.nom, m, '/index.html?guruhim=1');
      return json({ ok: true, azolar: tellar.length, yetdi: p });
    }

    /* ---------------- faqat admin ---------------- */
    if (!admin) return faqatAdmin();
    if (yol === 'universitetlar') {                                // taklif qilinganlar va tasdiqlanganlar
      await univYukla(db, true);
      const son = (await db.prepare(`SELECT g.univ, COUNT(DISTINCT g.id) AS guruh, COUNT(a.tel) AS talaba FROM guruhlar g LEFT JOIN azolar a ON a.guruh_id = g.id GROUP BY g.univ`).all()).results || [];
      return json({ ok: true, universitetlar: UNIV_DB.map(u => Object.assign({}, u, son.find(x => x.univ === u.kod) || { guruh: 0, talaba: 0 })) });
    }
    if (yol === 'univ-hal' && request.method === 'POST') {           // {kod, amal: tasdiq|rad, nom?, qisqa?}
      const u = await db.prepare('SELECT * FROM universitetlar WHERE kod = ?').bind(String(d.kod || '')).first();
      if (!u) return json({ ok: false, xato: 'topilmadi' }, 404);
      if (d.amal === 'tasdiq') {
        const nom = matn(d.nom, 80) || u.nom, qisqa = matn(d.qisqa, 30) || u.qisqa || nom;
        await db.prepare(`UPDATE universitetlar SET holat = 'tasdiqlangan', nom = ?, qisqa = ? WHERE kod = ?`).bind(nom, qisqa, u.kod).run();
      } else if (d.amal === 'rad') {                                 // universitet, uning guruhlari va so'rovlari o'chadi
        const gl = ((await db.prepare('SELECT id FROM guruhlar WHERE univ = ?').bind(u.kod).all()).results || []).map(x => x.id);
        const amal = [db.prepare('DELETE FROM universitetlar WHERE kod = ?').bind(u.kod)];
        for (const g of gl) amal.push(db.prepare('DELETE FROM azolar WHERE guruh_id = ?').bind(g), db.prepare('DELETE FROM ustoz_guruh WHERE guruh_id = ?').bind(g), db.prepare('DELETE FROM guruhlar WHERE id = ?').bind(g));
        await db.batch(amal);
      } else return json({ ok: false, xato: 'nomalum amal' }, 400);
      await univYukla(db, true);
      return json({ ok: true });
    }
    if (yol === 'soz-takliflar') {                                  // ?hammasi=1 — hal qilinganlari ham
      const h = url.searchParams.get('hammasi') === '1';
      return json({ ok: true, takliflar: (await db.prepare(`SELECT * FROM soz_taklif ${h ? '' : `WHERE holat = 'kutilmoqda'`} ORDER BY ${h ? 'id DESC' : 'id'} LIMIT 300`).all()).results || [] });
    }
    if (yol === 'soz-taklif-hal' && request.method === 'POST') {     // {id, amal: qabul|rad, ar?, uz?, kop?, qism?, javob?}
      const t = await db.prepare('SELECT * FROM soz_taklif WHERE id = ?').bind(Number(d.id)).first();
      if (!t) return json({ ok: false, xato: 'topilmadi' }, 404);
      if (t.holat !== 'kutilmoqda') return json({ ok: false, xato: 'bu taklif allaqachon hal qilingan' }, 400);
      if (d.amal === 'qabul') {                                      // umumiy lug'atga (yamoq) qo'shiladi — hammaga darrov ko'rinadi
        const ar = matn(d.ar, 200) || t.ar, uz = matn(d.uz, 300) || t.uz, kop = d.kop === undefined ? (t.kop || '') : matn(d.kop, 200), qism = Number(d.qism) || t.qism || 0;
        if (!qism) return json({ ok: false, xato: 'Qaysi qismga qo‘shilishini tanlang' }, 400);
        const y = await yamoqOl(env);
        if (!y) return json({ ok: false, xato: 'baza (KV) ulanmagan' }, 500);
        if (y.qosh.length >= 3000) return json({ ok: false, xato: 'juda ko‘p qo‘shilgan' }, 400);
        y.qosh.push({ id: '+' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6), qism, ar, uz, kop });
        y.v = (Number(y.v) || 0) + 1;
        await env.DB.put(YAMOQ, JSON.stringify(y));
        await db.prepare(`UPDATE soz_taklif SET holat = 'qabul', ar = ?, uz = ?, kop = ?, qism = ?, javob = ?, hal_vaqt = ? WHERE id = ?`).bind(ar, uz, kop, qism, matn(d.javob, 200), hozirIso(), t.id).run();
        try { await pushTellarga(db, url.origin, [t.tel], '✅ Taklifingiz qabul qilindi', `«${ar} — ${uz}» umumiy lug‘atga qo‘shildi. Rahmat!`, '/index.html'); } catch (e) {}
      } else if (d.amal === 'rad') {
        await db.prepare(`UPDATE soz_taklif SET holat = 'rad', javob = ?, hal_vaqt = ? WHERE id = ?`).bind(matn(d.javob, 200), hozirIso(), t.id).run();
      } else return json({ ok: false, xato: 'nomalum amal' }, 400);
      return json({ ok: true });
    }
    if (yol === 'ustoz-sorovlar') {
      return json({ ok: true, sorovlar: (await db.prepare('SELECT * FROM ustoz_sorov ORDER BY id DESC').all()).results || [] });
    }
    if (yol === 'ustoz-sorov-ochir' && request.method === 'POST') {
      await db.prepare('DELETE FROM ustoz_sorov WHERE id = ?').bind(Number(d.id)).run();
      return json({ ok: true });
    }
    if (yol === 'xona-sozlama') {                                   // «Do'stlar bilan o'yin»: kim xona ocha oladi
      if (request.method === 'POST') {
        const yoz = [];
        if (d.ruxsat !== undefined) {
          if (!XONA_RUXSAT.includes(d.ruxsat)) return json({ ok: false, xato: 'noto‘g‘ri tanlov' }, 400);
          yoz.push(['xona_ruxsat', d.ruxsat]);
        }
        for (const [k, [kalit, , min, max]] of Object.entries(XONA_LIM)) {
          if (d[k] === undefined) continue;
          const n = k === 'reyting' ? (d[k] ? 1 : 0) : Math.round(Number(d[k]));
          if (!(n >= min && n <= max)) return json({ ok: false, xato: `${min} dan ${max} gacha son yozing` }, 400);
          yoz.push([kalit, String(n)]);
        }
        if (yoz.length) await db.batch(yoz.map(([k, v]) => db.prepare('INSERT OR REPLACE INTO sozlama (kalit, qiymat) VALUES (?, ?)').bind(k, v)));
      }
      return json(Object.assign({ ok: true, ruxsat: await xonaRuxsat(db) }, await xonaLimit(db)));
    }
    const kursNorm = k => { k = Number(k); return k >= 1 && k <= 6 ? Math.floor(k) : 0; };
    if (yol === 'guruh-saqla' && request.method === 'POST') {     // bitta guruh: yaratish yoki nomi/kursini o'zgartirish
      const nom = matn(d.nom, 60);
      if (!nom) return json({ ok: false, xato: 'guruh nomini yozing' }, 400);
      const eski = d.id ? await db.prepare('SELECT univ FROM guruhlar WHERE id = ?').bind(Number(d.id)).first() : null;
      const univ = eski ? eski.univ : univKod(d.univ);
      const bor = await db.prepare('SELECT id FROM guruhlar WHERE univ = ? AND nom = ? AND id != ?').bind(univ, nom, Number(d.id) || 0).first();
      if (bor) return json({ ok: false, xato: 'bu nomli guruh allaqachon bor' }, 400);
      if (d.id) {
        if (d.kurs === undefined) await db.prepare('UPDATE guruhlar SET nom = ? WHERE id = ?').bind(nom, Number(d.id)).run();
        else await db.prepare('UPDATE guruhlar SET nom = ?, kurs = ? WHERE id = ?').bind(nom, kursNorm(d.kurs), Number(d.id)).run();
      } else await db.prepare('INSERT INTO guruhlar (nom, kurs, univ, yaratilgan) VALUES (?, ?, ?, ?)').bind(nom, kursNorm(d.kurs), univ, hozirIso()).run();
      return json({ ok: true });
    }
    if (yol === 'guruh-kopla' && request.method === 'POST') {     // bir yo'la: yangilari yaratiladi, borlarining kursi yangilanadi
      const kurs = kursNorm(d.kurs), univ = univKod(d.univ);
      const nomlar = [...new Set((Array.isArray(d.nomlar) ? d.nomlar : []).map(n => matn(n, 60)).filter(Boolean))].slice(0, 100);
      if (!nomlar.length) return json({ ok: false, xato: 'guruh nomini yozing' }, 400);
      const bor = new Map(((await db.prepare('SELECT nom, kurs FROM guruhlar WHERE univ = ?').bind(univ).all()).results || []).map(x => [x.nom, x.kurs || 0]));
      const yangi = nomlar.filter(n => !bor.has(n)), kochdi = nomlar.filter(n => bor.has(n) && bor.get(n) !== kurs);
      const v = hozirIso();
      const amallar = yangi.map(n => db.prepare('INSERT INTO guruhlar (nom, kurs, univ, yaratilgan) VALUES (?, ?, ?, ?)').bind(n, kurs, univ, v))
        .concat(kochdi.map(n => db.prepare('UPDATE guruhlar SET kurs = ? WHERE univ = ? AND nom = ?').bind(kurs, univ, n)));
      if (amallar.length) await db.batch(amallar);
      return json({ ok: true, yangi, kochdi, oldinBor: nomlar.filter(n => bor.has(n) && bor.get(n) === kurs) });
    }
    if (yol === 'guruh-ochir' && request.method === 'POST') {
      const gid = Number(d.id);
      await db.batch([
        db.prepare('DELETE FROM ustoz_guruh WHERE guruh_id = ?').bind(gid),
        db.prepare('DELETE FROM azolar WHERE guruh_id = ?').bind(gid),
        db.prepare('DELETE FROM guruhlar WHERE id = ?').bind(gid)
      ]);
      return json({ ok: true });
    }
    if (yol === 'ustoz-saqla' && request.method === 'POST') {
      const login = matn(d.login, 40).toLowerCase(), nom = matn(d.nom, 80);
      if (!/^[a-z0-9_.-]{3,40}$/.test(login) || login === 'admin')
        return json({ ok: false, xato: 'login: kamida 3 ta lotin harf yoki raqam (admin emas)' }, 400);
      if (!nom) return json({ ok: false, xato: 'ustozning ismini yozing' }, 400);
      const bor = await db.prepare('SELECT login FROM ustozlar WHERE login = ?').bind(login).first();
      const amallar = [];
      if (d.parol) {
        if (String(d.parol).length < 6) return json({ ok: false, xato: 'parol kamida 6 belgi' }, 400);
        const tuz = tasodifiy(16), xesh = await parolXesh(d.parol, tuz);
        amallar.push(bor
          ? db.prepare('UPDATE ustozlar SET nom = ?, tuz = ?, xesh = ? WHERE login = ?').bind(nom, tuz, xesh, login)
          : db.prepare('INSERT INTO ustozlar (login, nom, tuz, xesh, yaratilgan) VALUES (?, ?, ?, ?, ?)').bind(login, nom, tuz, xesh, hozirIso()));
        if (bor) amallar.push(db.prepare('DELETE FROM sessiyalar WHERE login = ? AND rol = ?').bind(login, 'ustoz'));
      } else {
        if (!bor) return json({ ok: false, xato: 'yangi ustoz uchun parol yozing' }, 400);
        amallar.push(db.prepare('UPDATE ustozlar SET nom = ? WHERE login = ?').bind(nom, login));
      }
      amallar.push(db.prepare('DELETE FROM ustoz_guruh WHERE login = ?').bind(login));
      (Array.isArray(d.guruhlar) ? d.guruhlar : []).forEach(g => amallar.push(
        db.prepare('INSERT OR IGNORE INTO ustoz_guruh (login, guruh_id) VALUES (?, ?)').bind(login, Number(g))));
      await db.batch(amallar);
      return json({ ok: true });
    }
    if (yol === 'ustoz-ochir' && request.method === 'POST') {
      const login = matn(d.login, 40).toLowerCase();
      await db.batch([
        db.prepare('DELETE FROM ustoz_guruh WHERE login = ?').bind(login),
        db.prepare('DELETE FROM sessiyalar WHERE login = ? AND rol = ?').bind(login, 'ustoz'),
        db.prepare('DELETE FROM ustozlar WHERE login = ?').bind(login)
      ]);
      return json({ ok: true });
    }
    if (yol === 'azo-kochir' && request.method === 'POST') {      // boshqa guruhga yoki guruhdan chiqarish
      const tel = telNorm(d.tel);
      if (!tel) return json({ ok: false, xato: 'telefon raqami noto‘g‘ri' }, 400);
      if (!d.guruh_id) await db.prepare('DELETE FROM azolar WHERE tel = ?').bind(tel).run();
      else await db.prepare(`UPDATE azolar SET guruh_id = ?, holat = 'tasdiqlangan', tasdiq_vaqt = ?, tasdiqlagan = 'Admin' WHERE tel = ?`)
        .bind(Number(d.guruh_id), hozirIso(), tel).run();
      return json({ ok: true });
    }
    if (yol === 'natija-ochir' && request.method === 'POST') {
      await db.prepare('DELETE FROM natijalar WHERE id = ?').bind(Number(d.id)).run();
      return json({ ok: true });
    }
    return json({ ok: false, xato: 'nomalum so‘rov' }, 404);
  } catch (e) {
    return json({ ok: false, xato: String((e && e.message) || e).slice(0, 160) }, 500);
  }
}


/* ================================================================
   JONLI TEST (Kahoot kabi)

   Ustoz kabinetda qismlarni, savollar sonini, yo'nalishni va har bir
   savol vaqtini tanlaydi → 6 xonali PIN chiqadi. Talabalar
   /jonli.html da PIN va ismini yozib kiradi. Ustoz «Boshlash»ni
   bosgach, hamma uchun bir xil savol bir vaqtda chiqadi; oxirida
   1-2-3 o'rin (podium) va barcha o'rinlar.

   Vaqt jadvali bitta raqamdan hisoblanadi — t0 (birinchi savol
   boshlanishi, ms). i-savol: [t0 + i·(V+R), +V) — javob vaqti, keyin
   R soniya natija. Server har so'rovda hozirgi holatni shundan
   hisoblaydi, shuning uchun har soniya bazaga yozish shart emas.
   «Keyingi» tugmasi faqat t0 ni oldinga suradi.

   Savollar ustoz brauzerida lug'atdan tuziladi (kabinetda lug'at bor)
   va serverda saqlanadi; to'g'ri javob talabaga faqat savol vaqti
   tugagandan keyin beriladi. Ball: to'g'ri javob 500–1000 (tezroq —
   ko'proq), noto'g'ri 0. Tugagach, telefon raqami bor talabalar
   natijasi «natijalar» jadvaliga ham yoziladi — guruh reytingi va
   ustoz kabinetida ko'rinadi.
   ================================================================ */
const OYIN_R = 7;                       // natija ko'rinadigan soniyalar (standart)
// savollar orasidagi vaqt — o'yinni ochgan kishi tanlaydi (2–30 s); sozlama.R
const oraliqNorm = v => { const n = Math.round(Number(v)); return n >= 2 && n <= 30 ? n : null; };
const oraliqOl = s => oraliqNorm(s && s.R) || OYIN_R;
const OYIN_R_UYGA = 4;                  // uyga vazifada natija qisqaroq (talaba «Keyingi» ni ham bosa oladi)
const OYIN_TAYYOR = 5000;               // «Boshlash»dan birinchi savolgacha (3-2-1)
const oyinFaza = (o, hozir) => {
  // {faza: kutish|tayyor|savol|natija|tugadi, i, boshi, oxiri}
  // pauza: vaqt pauza bosilgan paytda «muzlaydi» — davom etganda t0 shuncha suriladi
  if (o.pauza && o.holat !== 'tugadi') hozir = Number(o.pauza);
  if (o.holat === 'kutish' || !o.t0) return { faza: 'kutish', i: -1 };
  const R = o._R || OYIN_R, V = o.vaqt * 1000, Q = (o.vaqt + R) * 1000, t0 = Number(o.t0);
  if (o.holat === 'tugadi' || hozir >= t0 + o.son * Q) return { faza: 'tugadi', i: o.son - 1 };
  if (hozir < t0) return { faza: 'tayyor', i: -1, oxiri: t0 };
  const i = Math.floor((hozir - t0) / Q), boshi = t0 + i * Q;
  return hozir < boshi + V ? { faza: 'savol', i, boshi, oxiri: boshi + V } : { faza: 'natija', i, boshi: boshi + V, oxiri: boshi + Q };
};
/* Rejimlar (oyinlar.sozlama, JSON):
     jamoalar  [{k, nom, gid?}]  — jamoaviy o'yin; gid bo'lsa — jamoa = guruh (battle)
     yoqotish  1 — «oxirgi qolgan»: xato qilgan chiqadi
     xavf      1 — savoldan oldin «×2 tavakkal»: topsa ×2, topmasa −500
     uyga      1 — uyga vazifa: muddatgacha har kim o'z vaqtida (o'yinchining t0 si)
     guruhlar  [gid] — faqat shu guruh talabalari qatnasha oladi
     duel      {a, b, aIsm, bIsm} — ikki talaba (uyga vazifa ko'rinishida)
     battle_id — guruh va guruh battle
   Savol turlari (savol.tur): tanlov (4 variant), tn (to'g'ri/noto'g'ri),
   yoz (javobni yozadi; savol.qabul — qabul qilinadigan javoblar). */
const avatarNorm = a => /^\d{1,2}-\d{1,2}$/.test(String(a || '')) ? String(a) : null;
const oyinBall = (ms, V) => Math.round(1000 * (1 - Math.min(1, Math.max(0, ms / (V * 1000))) / 2));
const ozgardi = r => !!(r && ((r.meta && r.meta.changes) || r.changes));
const sozOl = o => { try { const x = JSON.parse(o.sozlama || '{}'); return x && typeof x === 'object' ? x : {}; } catch (e) { return {}; } };
const JAMOA_NOM = ['Qizil', 'Ko‘k', 'Sariq', 'Yashil'];
const XAVF_JARIMA = 500;

// o'yinchining hozirgi bosqichi: jonli — hammaga bitta, uyga vazifa — o'zining vaqti
function oyinchiFaza(o, p, hozir) {
  if (!o.soz.uyga) return oyinFaza(o, hozir);
  if (o.holat === 'tugadi') return { faza: 'tugadi', i: o.son - 1 };
  if (!p || !p.t0) return { faza: 'kutish', i: -1 };
  return oyinFaza({ holat: 'boshlandi', t0: p.t0, son: o.son, vaqt: o.vaqt, _R: OYIN_R_UYGA }, hozir);
}
const oyinchiTugatdimi = (o, p, hozir) => !!(p && p.t0 && hozir >= Number(p.t0) + o.son * (o.vaqt + OYIN_R_UYGA) * 1000);
// hal qilinishi kerak bo'lgan oxirgi savol (natijasi ochilgan)
const halGacha = f => f.faza === 'natija' ? f.i : f.faza === 'savol' ? f.i - 1 : f.faza === 'tugadi' ? f.i : -1;

/* O'yin oxirida xatolar: savollar bo'yicha (ustoz ekrani) va talabaning o'zi.
   To'g'ri javob matni: variantli/to'g'ri-noto'g'rida — tanlangan variant,
   yozib javobda — birinchi qabul qilinadigan ma'no.                      */
const savolTogri = q => q.tur === 'yoz' ? ((q.qabul || [])[0] || '') : ((q.v || [])[q.ok] || '');
const savolJavob = (q, x) => q.tur === 'yoz' ? (x.matn || '') : (x.javob === null || x.javob === undefined ? '' : ((q.v || [])[x.javob] || ''));
const savolQisqa = (q, i) => ({ i, p: q.p, pAr: !!q.pAr, juft: q.tur === 'tn' ? q.juft : undefined, juftAr: q.tur === 'tn' ? !!q.juftAr : undefined,
  label: q.label || '', tur: q.tur, togri: savolTogri(q), vAr: q.tur === 'tanlov' ? !!q.vAr : false });
// shu savol paytida o'yinda bo'lganmi: tomoshabin emas, oldin chiqmagan, savol chiqqandan keyin kirmagan
const savoldaBormi = (x, i) => x.chiqdi !== -1 && (x.chiqdi === null || x.chiqdi === undefined || x.chiqdi >= i) && !((x.kirdi === undefined ? -1 : x.kirdi) >= i);
async function oyinXatolar(db, o, r) {
  const j = (await db.prepare('SELECT oid, savol, javob, togri, matn FROM oyin_javob WHERE oyin_id = ?').bind(o.id).all()).results || [];
  const ism = new Map(r.map(x => [x.oid, x.ism])), qatnash = r.filter(x => x.chiqdi !== -1);
  return o.savollar.map((q, i) => {
    const bu = j.filter(x => x.savol === i), javobBer = new Set(bu.map(x => x.oid));
    const xato = bu.filter(x => !x.togri && ism.has(x.oid)).map(x => ({ ism: ism.get(x.oid), javob: savolJavob(q, x) }));
    // javob bermaganlar: o'sha paytda o'yinda bo'lganlar («oxirgi qolgan»da oldin chiqqanlar emas)
    const javobsiz = o.soz.uyga ? [] : qatnash.filter(x => !javobBer.has(x.oid) && savoldaBormi(x, i)).map(x => x.ism);
    return Object.assign(savolQisqa(q, i), { xato, javobsiz, topdi: bu.filter(x => x.togri).length });
  }).filter(x => x.xato.length || x.javobsiz.length)
    .sort((a, b) => (b.xato.length + b.javobsiz.length) - (a.xato.length + a.javobsiz.length) || a.i - b.i);
}
async function oyinchiXatolari(db, o, oid) {
  const j = (await db.prepare('SELECT savol, javob, togri, matn FROM oyin_javob WHERE oyin_id = ? AND oid = ?').bind(o.id, oid).all()).results || [];
  return o.savollar.map((q, i) => {
    const x = j.find(y => y.savol === i);
    return x && x.togri ? null : Object.assign(savolQisqa(q, i), { javob: x ? savolJavob(q, x) : null });
  }).filter(Boolean);
}

// pauzadagi o'yin: {pauza: true, qoldi: ms} — sekundomer to'xtab turadi
const pauzaOchiq = (o, f) => o.pauza && o.holat !== 'tugadi' ? { pauza: true, qoldi: f.oxiri ? Math.max(0, f.oxiri - Number(o.pauza)) : 0 } : { pauza: false };
// pauzani yechish: t0 pauzada turgan vaqtga suriladi
async function pauzaYech(db, o, hozir) {
  if (!o.pauza) return;
  const sur = Math.max(0, hozir - Number(o.pauza));
  await db.prepare('UPDATE oyinlar SET t0 = t0 + ?, pauza = NULL WHERE id = ? AND pauza IS NOT NULL').bind(sur, o.id).run();
  o.t0 = Number(o.t0) + sur; o.pauza = null;
}

async function oyinReyting(db, o) {
  const tartib = o.soz && o.soz.yoqotish ? 'CASE WHEN chiqdi IS NULL THEN 100000 ELSE chiqdi END DESC, ' : '';
  return ((await db.prepare(`SELECT oid, ism, tel, ball, togri, avatar, jamoa, chiqdi, t0, yozildi, kirdi FROM oyin_oyinchi WHERE oyin_id = ?
    ORDER BY ${tartib}ball DESC, togri DESC, qoshilgan`).bind(o.id).all()).results || []).map((x, i) => Object.assign(x, { orin: i + 1 }));
}
// jamoalar hisobi: o'rtacha ball (kichik jamoa ham teng kurashadi)
async function jamoaHisob(db, o) {
  if (!o.soz.jamoalar) return null;
  const r = (await db.prepare('SELECT jamoa, COUNT(*) AS n, SUM(ball) AS b, SUM(togri) AS t FROM oyin_oyinchi WHERE oyin_id = ? AND jamoa IS NOT NULL GROUP BY jamoa')
    .bind(o.id).all()).results || [];
  return o.soz.jamoalar.map((j, x) => {
    const s = r.find(y => y.jamoa === j.k) || {};
    return { k: j.k, nom: j.nom, rang: x, soni: s.n || 0, ball: s.n ? Math.round(s.b / s.n) : 0, togri: s.t || 0 };
  }).sort((a, b) => b.ball - a.ball || b.togri - a.togri);
}
// tavakkal qilib topmaganlar (javob bermaganlar ham) — −500; har yozuv bir marta
async function xavfHal(db, oyinId, gacha, oid) {
  if (gacha < 0) return;
  const r = (await db.prepare(`SELECT x.oid, x.savol, j.togri FROM oyin_xavf x LEFT JOIN oyin_javob j ON j.oyin_id = x.oyin_id AND j.oid = x.oid AND j.savol = x.savol
    WHERE x.oyin_id = ? AND x.hal = 0 AND x.savol <= ?${oid ? ' AND x.oid = ?' : ''}`).bind(...[oyinId, gacha].concat(oid ? [oid] : [])).all()).results || [];
  for (const x of r) {
    const u = await db.prepare('UPDATE oyin_xavf SET hal = 1 WHERE oyin_id = ? AND oid = ? AND savol = ? AND hal = 0').bind(oyinId, x.oid, x.savol).run();
    if (ozgardi(u) && !x.togri)
      await db.prepare('UPDATE oyin_oyinchi SET ball = MAX(0, ball - ?) WHERE oyin_id = ? AND oid = ?').bind(XAVF_JARIMA, oyinId, x.oid).run();
  }
}
// jonli o'yin: ochilgan savollar natijasini bir marta hal qilamiz (tavakkal, o'yindan chiqish)
async function oyinHal(db, o, f) {
  const gacha = halGacha(f);
  if (gacha < 0) return;
  if (o.soz.xavf) await xavfHal(db, o.id, gacha);
  if (!o.soz.yoqotish) return;
  for (let i = Math.max(-1, Number(o.hal)) + 1; i <= gacha; i++) {
    const u = await db.prepare('UPDATE oyinlar SET hal = ? WHERE id = ? AND hal < ?').bind(i, o.id, i).run();
    if (!ozgardi(u)) continue;
    o.hal = i;
    const t = await db.prepare(`SELECT COUNT(*) AS n FROM oyin_oyinchi p JOIN oyin_javob j ON j.oyin_id = p.oyin_id AND j.oid = p.oid AND j.savol = ? AND j.togri = 1
      WHERE p.oyin_id = ? AND p.chiqdi IS NULL`).bind(i, o.id).first();
    if (!t || !t.n) continue;                            // hamma xato qilsa — hech kim chiqmaydi
    await db.prepare(`UPDATE oyin_oyinchi SET chiqdi = ? WHERE oyin_id = ? AND chiqdi IS NULL
      AND oid NOT IN (SELECT oid FROM oyin_javob WHERE oyin_id = ? AND savol = ? AND togri = 1)`).bind(i, o.id, o.id, i).run();
    if (t.n <= 1 && i < o.son - 1) {                     // bitta qoldi — g'olib, o'yin shu savol natijasi bilan tugaydi
      await db.prepare('UPDATE oyinlar SET son = ? WHERE id = ?').bind(i + 1, o.id).run();
      o.son = i + 1;
    }
  }
}
const oyinMashq = o => (o.soz.xona ? 'Do‘stlar bilan — ' : o.soz.duel ? 'Duel — ' : o.soz.battle_id ? 'Battle — ' : o.soz.uyga ? 'Uyga vazifa — ' : 'Jonli test — ') + (o.nom || '');
const XONA_BOLIM = 'Do‘stlar bilan';                   // reyting hisobiga kirmaydi
const natijaQator = (db, o, x, v) => db.prepare(`INSERT INTO natijalar (tel, ism, familiya, vaqt, bolim, mashq, togri, jami, ball, vaqt_sek, izoh)
  VALUES (?, ?, '', ?, ?, ?, ?, ?, ?, ?, ?)`).bind(x.tel, x.ism, v, o.soz.xona && !o.soz.reyting ? XONA_BOLIM : 'Jonli test', matn(oyinMashq(o), 120),
  x.togri, o.son, x.togri, o.son * o.vaqt, (x.orin ? x.orin + '-o‘rin, ' : '') + x.ball + ' ochko');
// «Do'stlar bilan o'yin» tugadi — AU Natijalar botiga faqat natija: 1-2-3 o'rinlar
async function xonaNatijaBot(env, o, royxat) {
  const r = royxat.filter(x => x.chiqdi !== -1);
  if (!token(env) || r.length < 2) return;
  const e = t => String(t == null ? '' : t).replace(/&/g, '&amp;').replace(/</g, '&lt;');
  const foiz = x => o.son ? Math.round((x.togri || 0) / o.son * 100) : 0;
  const text = `🎮 <b>Do‘stlar bilan o‘yin</b>\n${e(o.nom)} · ${r.length} kishi · ${o.son} savol\n\n` +
    r.slice(0, 3).map((x, i) => `${['🥇', '🥈', '🥉'][i]} ${e(x.ism)} — ${x.togri}/${o.son} (${foiz(x)}%) · ${x.ball} ball`).join('\n');
  try {
    await fetch(`https://api.telegram.org/bot${token(env)}/sendMessage`, { method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chat_id: chat(env), text, parse_mode: 'HTML' }) });
  } catch (x) {}
}
// o'yin tugadi: holatni bir marta «tugadi» qilamiz va natijalarni guruh jadvaliga yozamiz
async function oyinYakunla(db, o, env) {
  const r = await db.prepare(`UPDATE oyinlar SET holat = 'tugadi', tugagan = ? WHERE id = ? AND holat != 'tugadi'`).bind(hozirIso(), o.id).run();
  if (!ozgardi(r)) return;
  o.holat = 'tugadi';
  if (o.soz.xavf) await xavfHal(db, o.id, o.son - 1);
  const royxat = await oyinReyting(db, o), v = hozirIso();
  const amallar = royxat.filter(x => x.tel && !x.yozildi && (!o.soz.uyga || x.t0)).map(x => natijaQator(db, o, x, v));
  if (amallar.length) await db.batch(amallar);
  if (o.soz.xona && env) await xonaNatijaBot(env, o, royxat);
  if (o.soz.battle_id) await battleYakun(db, o, royxat, env);
}
// talabaga ko'rinadigan savol (to'g'ri javobsiz)
const savolOchiq = (q, i) => ({ i, tur: q.tur || 'tanlov', p: q.p, pAr: !!q.pAr, v: q.tur === 'yoz' ? [] : q.v, vAr: !!q.vAr,
  label: q.label || '', juft: q.juft || '', juftAr: !!q.juftAr });
// rejim — sahifalar shunga qarab chizadi
const rejimOchiq = (s, o) => ({ jamoa: !!s.jamoalar, battle: !!s.battle_id, yoqotish: !!s.yoqotish, xavf: !!s.xavf, uyga: !!s.uyga, xona: !!s.xona,
  duel: s.duel ? { a: s.duel.aIsm, b: s.duel.bIsm } : null, muddat: o.muddat || null,
  guruhlar: s.guruh_nomlar || null, jamoalar: s.jamoalar ? s.jamoalar.map(j => j.nom) : null });

/* «Yozib javob berish»: imlodagi kichik xato kechiriladi — bitta harf
   (qo'shilgan, tushib qolgan yoki almashgan); apostrof va katta-kichik
   harf ahamiyatsiz. */
const uzNorm = t => String(t || '').toLowerCase().replace(/[‘’'`ʻʼ]/g, '').replace(/[^a-z0-9Ѐ-ӿ ]+/g, ' ').replace(/\s+/g, ' ').trim();
function birHarf(a, b) {
  if (Math.abs(a.length - b.length) > 1) return false;
  let i = 0, j = 0, f = 0;
  while (i < a.length && j < b.length) {
    if (a[i] === b[j]) { i++; j++; continue; }
    if (++f > 1) return false;
    if (a.length > b.length) i++; else if (b.length > a.length) j++; else { i++; j++; }
  }
  return f + (a.length - i) + (b.length - j) <= 1;
}
function yozMos(m, qabul) {
  const x = uzNorm(m);
  if (!x) return false;
  return (qabul || []).some(q => { const y = uzNorm(q); return y && (x === y || (y.length >= 4 && birHarf(x, y))); });
}
function javobTekshir(q, d) {
  if (q.tur === 'yoz') { const m = matn(d.matn, 80).replace(/\s+/g, ' '); return m ? { j: null, matn: m, togri: yozMos(m, q.qabul) } : null; }
  const j = Number(d.j);
  if (!(Number.isInteger(j) && j >= 0 && j < q.v.length)) return null;
  return { j, matn: null, togri: j === q.ok };
}
// ustoz yuborgan savollarni tozalash
function savollarNorm(arr) {
  return (Array.isArray(arr) ? arr : []).slice(0, 100).map(q => {
    q = q || {};
    const tur = q.tur === 'tn' || q.tur === 'yoz' ? q.tur : 'tanlov';
    const b = { tur, p: matn(q.p, 300), pAr: !!q.pAr, label: matn(q.label, 80) };
    if (tur === 'yoz') {
      b.qabul = (Array.isArray(q.qabul) ? q.qabul : []).slice(0, 8).map(x => matn(x, 60)).filter(Boolean);
      b.v = []; b.ok = -1;
    } else {
      b.v = (Array.isArray(q.v) ? q.v : []).slice(0, 4).map(x => matn(x, 120)); b.vAr = !!q.vAr; b.ok = Number(q.ok);
      if (tur === 'tn') { b.juft = matn(q.juft, 200); b.juftAr = !!q.juftAr; }
    }
    return b;
  }).filter(q => q.p && (q.tur === 'yoz' ? q.qabul.length : q.v.length >= 2 && q.ok >= 0 && q.ok < q.v.length));
}
/* «Do'stlar bilan o'yin» — talaba o'zi ochadigan xona.
   Xona egasi ham o'ynaydi; o'yin o'zi yuradi (vaqt, natija, keyingi savol),
   hamma javob bersa — kutmasdan keyingisiga o'tadi. Natija guruh reytingiga
   yozilmaydi (admin yoqsa — yoziladi). Cheklovlar (admin o'zgartiradi):
   xonada 30 kishi, kuniga 15 ta xona, 2 soatda o'zi yopiladi.
   Kim ocha oladi — admin kabinetda tanlaydi (sozlama.xona_ruxsat).        */
const XONA_RUXSAT = ['guruh', 'tolov', 'hamma', 'yoq'];
// cheklovlar: [kalit, odatiy, eng kam, eng ko'p]
const XONA_LIM = { kun: ['xona_kun', 15, 1, 100], sig: ['xona_sig', 30, 2, 100], soat: ['xona_soat', 2, 1, 12], reyting: ['xona_reyting', 0, 0, 1] };
async function xonaLimit(db) {
  const r = ((await db.prepare(`SELECT kalit, qiymat FROM sozlama WHERE kalit LIKE 'xona_%'`).all()).results || []);
  const l = {};
  for (const [k, [kalit, odat, min, max]] of Object.entries(XONA_LIM)) {
    const x = r.find(y => y.kalit === kalit), n = x ? Math.round(Number(x.qiymat)) : NaN;
    l[k] = n >= min && n <= max ? n : odat;
  }
  return l;
}
async function xonaRuxsat(db) {
  const r = await db.prepare(`SELECT qiymat FROM sozlama WHERE kalit = 'xona_ruxsat'`).first();
  return r && XONA_RUXSAT.includes(r.qiymat) ? r.qiymat : 'hamma';
}
// shu telefon xona ocha oladimi: {ok} yoki {ok:false, xato}
async function xonaOchaOladi(db, env, tel) {
  const rux = await xonaRuxsat(db);
  if (rux === 'yoq') return { ok: false, xato: 'Hozircha o‘yin ochish yopiq', ruxsat: rux };
  if (!tel) return { ok: false, xato: 'Avval saytga telefon raqamingiz bilan kiring', ruxsat: rux };
  if (rux === 'guruh' && !(await db.prepare(`SELECT 1 AS bor FROM azolar WHERE tel = ? AND holat = 'tasdiqlangan'`).bind(tel).first()))
    return { ok: false, xato: 'O‘yin ochish uchun guruhga qo‘shiling (Guruhim bo‘limi) — ustozingiz tasdiqlagach ochiladi', ruxsat: rux };
  if (rux === 'tolov' && !(await ruxsatOl(env, tel))) return { ok: false, xato: 'O‘yin ochish to‘lov qilganlar uchun', ruxsat: rux };
  const L = await xonaLimit(db);
  const bugun = (await db.prepare(`SELECT COUNT(*) AS n FROM oyinlar WHERE login = ? AND yaratilgan > ?`).bind('xona:' + tel, new Date(Date.now() - 864e5).toISOString()).first()).n;
  if (bugun >= L.kun) return { ok: false, xato: `Bugun ${L.kun} ta o‘yin ochdingiz — ertaga yana`, ruxsat: rux, qoldi: 0, limit: L };
  return { ok: true, ruxsat: rux, qoldi: L.kun - bugun, limit: L };
}

// yangi o'yin (ustoz, sardor; battle ham shu yerdan)
async function oyinYarat(db, kim, nom, vaqt, savollar, soz, muddat) {
  const hozir = Date.now();
  const eski = new Date(hozir - 30 * 864e5).toISOString();
  await db.batch([
    db.prepare(`DELETE FROM oyin_javob WHERE oyin_id IN (SELECT id FROM oyinlar WHERE yaratilgan < ?)`).bind(eski),
    db.prepare(`DELETE FROM oyin_xavf WHERE oyin_id IN (SELECT id FROM oyinlar WHERE yaratilgan < ?)`).bind(eski),
    db.prepare(`DELETE FROM oyin_oyinchi WHERE oyin_id IN (SELECT id FROM oyinlar WHERE yaratilgan < ?)`).bind(eski),
    db.prepare(`DELETE FROM oyinlar WHERE yaratilgan < ?`).bind(eski),
    // 1 kundan eski tugamagan jonli o'yinlar yopiladi (uyga vazifa — o'z muddati bilan)
    db.prepare(`UPDATE oyinlar SET holat = 'tugadi' WHERE holat NOT IN ('tugadi', 'uyga') AND yaratilgan < ?`).bind(new Date(hozir - 864e5).toISOString())
  ]);
  let pin = '';
  for (let k = 0; k < 20 && !pin; k++) {
    const p = String(100000 + (crypto.getRandomValues(new Uint32Array(1))[0] % 900000));
    if (!(await db.prepare(`SELECT 1 AS bor FROM oyinlar WHERE pin = ? AND holat != 'tugadi'`).bind(p).first())) pin = p;
  }
  if (!pin) return null;
  const r = await db.prepare(`INSERT INTO oyinlar (pin, login, ustoz, nom, holat, savollar, son, vaqt, yaratilgan, sozlama, muddat) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
    .bind(pin, kim.login, kim.nom, matn(nom, 100) || 'Jonli test', soz.uyga ? 'uyga' : 'kutish', JSON.stringify(savollar), savollar.length, vaqt,
      hozirIso(), JSON.stringify(soz), muddat || null).run();
  return { id: (r.meta && r.meta.last_row_id) || r.lastInsertRowid, pin };
}

async function oyinApi(request, url, env) {
  let db;
  try { db = await baza(env); } catch (e) { return json({ ok: false, xato: 'baza xatosi' }); }
  if (!db) return json({ ok: false, xato: 'D1 baza ulanmagan (BAZA)' });
  const yol = url.pathname.slice('/api/o/'.length), hozir = Date.now();
  let d = {};
  if (request.method === 'POST') { try { d = await request.json(); } catch (e) { d = {}; } }
  const olOyin = async id => {
    const o = await db.prepare('SELECT * FROM oyinlar WHERE id = ?').bind(Number(id)).first();
    if (!o) return null;
    o.savollar = JSON.parse(o.savollar || '[]'); o.soz = sozOl(o); o._R = oraliqOl(o.soz);
    // uyga vazifa muddati o'tdi — yakunlaymiz
    if ((o.soz.uyga || o.soz.xona) && o.holat !== 'tugadi' && o.muddat && hozir >= o.muddat) await oyinYakunla(db, o, env);
    return o;
  };
  const oyinchi = (o, oid) => db.prepare('SELECT oid, ism, tel, ball, togri, avatar, jamoa, chiqdi, t0, yozildi FROM oyin_oyinchi WHERE oyin_id = ? AND oid = ?').bind(o.id, oid).first();
  try {
    /* ---------------- talaba (kirish talab qilinmaydi) ---------------- */
    if (yol === 'kir' && request.method === 'POST') {
      const pin = String(d.pin || '').replace(/\D/g, '');
      const ism = matn(d.ism, 60).replace(/\s+/g, ' ');
      if (pin.length !== 6) return json({ ok: false, xato: 'PIN 6 ta raqamdan iborat' }, 400);
      if (ism.length < 2) return json({ ok: false, xato: 'Ismingizni yozing' }, 400);
      const o = await db.prepare(`SELECT id, nom, holat, sozlama, muddat, t0, son, vaqt, pauza FROM oyinlar WHERE pin = ? AND holat != 'tugadi' ORDER BY id DESC LIMIT 1`).bind(pin).first();
      if (!o) return json({ ok: false, xato: 'Bunday PIN bilan o‘yin topilmadi' }, 404);
      o.soz = sozOl(o); o._R = oraliqOl(o.soz);
      if ((o.soz.uyga || o.soz.xona) && o.muddat && hozir >= o.muddat) return json({ ok: false, xato: o.soz.xona ? 'Bu o‘yin yopilgan' : 'Uyga vazifa muddati tugagan' }, 400);
      const tel = telNorm(d.tel) || null, s = o.soz;
      // kim qatnasha oladi
      if (s.duel && (!tel || (tel !== s.duel.a && tel !== s.duel.b)))
        return json({ ok: false, xato: `Bu duel faqat ${s.duel.aIsm} va ${s.duel.bIsm} uchun` }, 403);
      let gidim = null;
      if ((s.guruhlar && s.guruhlar.length) || (s.jamoalar && s.jamoalar[0] && s.jamoalar[0].gid)) {
        const a = tel && await db.prepare(`SELECT guruh_id FROM azolar WHERE tel = ? AND holat = 'tasdiqlangan'`).bind(tel).first();
        gidim = a ? a.guruh_id : null;
      }
      if (s.guruhlar && s.guruhlar.length && !s.guruhlar.includes(gidim))
        return json({ ok: false, xato: `Bu test faqat ${(s.guruh_nomlar || []).join(', ')} guruh talabalari uchun. Saytga o‘z raqamingiz bilan kirgan bo‘lishingiz kerak.` }, 403);
      let jamoa = null;
      if (s.jamoalar && s.jamoalar[0] && s.jamoalar[0].gid) {
        const j = s.jamoalar.find(x => x.gid === gidim);
        if (!j) return json({ ok: false, xato: `Bu battle faqat ${s.jamoalar.map(x => x.nom).join(' va ')} guruh talabalari uchun. Saytga o‘z raqamingiz bilan kirgan bo‘lishingiz kerak.` }, 403);
        jamoa = j.k;
      }
      // shu telefon (yoki shu qurilma) bilan oldin kirgan bo'lsa — o'sha o'yinchi
      let eski = null;
      if (d.oid && /^[0-9a-f]{24}$/.test(d.oid)) eski = await db.prepare('SELECT oid FROM oyin_oyinchi WHERE oyin_id = ? AND oid = ?').bind(o.id, d.oid).first();
      if (!eski && tel) eski = await db.prepare('SELECT oid FROM oyin_oyinchi WHERE oyin_id = ? AND tel = ?').bind(o.id, tel).first();
      const avatar = avatarNorm(d.avatar);
      if (eski) {
        await db.prepare('UPDATE oyin_oyinchi SET ism = ?, avatar = COALESCE(?, avatar) WHERE oyin_id = ? AND oid = ?').bind(ism, avatar, o.id, eski.oid).run();
        return json({ ok: true, id: o.id, oid: eski.oid, nom: o.nom });
      }
      const son = await db.prepare('SELECT COUNT(*) AS n FROM oyin_oyinchi WHERE oyin_id = ?').bind(o.id).first();
      const sig = s.xona ? Math.min(300, s.sig || 30) : 300;
      if (son && son.n >= sig) return json({ ok: false, xato: s.xona ? `Xonada joy qolmadi (${sig} kishi)` : 'O‘yinda joy qolmadi' }, 400);
      if (s.jamoalar && jamoa === null) {                // avtomatik jamoa: eng kam odamlisiga
        const r = (await db.prepare('SELECT jamoa, COUNT(*) AS n FROM oyin_oyinchi WHERE oyin_id = ? GROUP BY jamoa').bind(o.id).all()).results || [];
        jamoa = s.jamoalar.map(j => ({ k: j.k, n: (r.find(x => x.jamoa === j.k) || {}).n || 0 })).sort((a, b) => a.n - b.n)[0].k;
      }
      // «oxirgi qolgan» boshlangandan keyin kirgan — tomoshabin
      const chiqdi = s.yoqotish && o.holat !== 'kutish' ? -1 : null;
      const oid = tasodifiy(12);
      // o'yin boshlangach kirgan: shu savoldan oldingilari «javob bermadi» hisoblanmaydi
      const kirdi = s.uyga ? -1 : oyinFaza(o, hozir).i;
      await db.prepare('INSERT INTO oyin_oyinchi (oyin_id, oid, ism, tel, qoshilgan, avatar, jamoa, chiqdi, kirdi) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)')
        .bind(o.id, oid, ism, tel, hozir, avatar, jamoa, chiqdi, kirdi).run();
      return json({ ok: true, id: o.id, oid, nom: o.nom });
    }
    /* ---------- «Do'stlar bilan o'yin»: talaba ochgan xona ---------- */
    if (yol === 'xona-ruxsat') {                                   // bosh sahifa: «➕ O'yin ochish» ko'rinsinmi
      return json(Object.assign({ ok: true }, await xonaOchaOladi(db, env, telNorm(url.searchParams.get('tel')))));
    }
    if (yol === 'xona-yarat' && request.method === 'POST') {       // {tel, ism, nom, vaqt, savollar, sozlama, oldingi?}
      const tel = telNorm(d.tel), ism = matn(d.ism, 60).replace(/\s+/g, ' ');
      if (ism.length < 2) return json({ ok: false, xato: 'Ismingizni yozing' }, 400);
      const mum = await xonaOchaOladi(db, env, tel);
      if (!mum.ok) return json(mum, 403);
      const sv = savollarNorm(d.savollar).slice(0, 30);
      if (sv.length < 3) return json({ ok: false, xato: 'Kamida 3 ta savol kerak' }, 400);
      const V = Math.max(5, Math.min(60, Math.round(Number(d.vaqt)) || 15));
      const sz = d.sozlama || {}, soz = { xona: 1, sig: mum.limit.sig };
      if (mum.limit.reyting) soz.reyting = 1;                     // admin yoqqan: natija guruh reytingiga ham
      const nj = Math.round(Number(sz.jamoa));
      if (nj >= 2 && nj <= 4) soz.jamoalar = JAMOA_NOM.slice(0, nj).map((nom, k) => ({ k: String(k), nom }));
      if (sz.yoqotish) soz.yoqotish = 1;
      if (sz.xavf) soz.xavf = 1;
      if (sz.manba === 'fel') soz.manba = 'fel';
      if (oraliqNorm(sz.oraliq)) soz.R = oraliqNorm(sz.oraliq);
      soz.ochdi = ism; soz.sozlama = { qism: (Array.isArray(sz.qism) ? sz.qism : []).slice(0, 40).map(Number), son: sv.length, vaqt: V, tur: matn(sz.tur, 20), yon: matn(sz.yon, 10),
        jamoa: nj || 0, yoqotish: !!sz.yoqotish, xavf: !!sz.xavf };                // revansh uchun
      const o = await oyinYarat(db, { login: 'xona:' + tel, nom: ism }, matn(d.nom, 60) || ('O‘yin: ' + ism.split(' ')[0]), V, sv, soz, hozir + mum.limit.soat * 3600e3);
      if (!o) return json({ ok: false, xato: 'yaratib bo‘lmadi, qayta urinib ko‘ring' }, 500);
      // egasi — birinchi o'yinchi; uning oid'i xonani boshqarish kaliti
      const oid = tasodifiy(12), jamoa = soz.jamoalar ? '0' : null;
      await db.prepare('INSERT INTO oyin_oyinchi (oyin_id, oid, ism, tel, qoshilgan, avatar, jamoa) VALUES (?, ?, ?, ?, ?, ?, ?)').bind(o.id, oid, ism, tel, hozir, avatarNorm(d.avatar), jamoa).run();
      soz.egasi = oid;
      await db.prepare('UPDATE oyinlar SET sozlama = ? WHERE id = ?').bind(JSON.stringify(soz), o.id).run();
      // revansh: eski xonadagilarga yangi PIN ko'rinadi
      if (d.oldingi && d.oldingi.id) {
        const e = await db.prepare('SELECT id, sozlama FROM oyinlar WHERE id = ?').bind(Number(d.oldingi.id)).first();
        const es = e && sozOl(e);
        if (es && es.xona && es.egasi === String(d.oldingi.o || '')) { es.revansh = o.pin; await db.prepare('UPDATE oyinlar SET sozlama = ? WHERE id = ?').bind(JSON.stringify(es), e.id).run(); }
      }
      return json({ ok: true, id: o.id, pin: o.pin, oid, qoldi: (mum.qoldi || 1) - 1 });
    }
    if (/^xona-(boshla|chiqar|chaqir|tugat|keyingi|pauza|jamoa)$/.test(yol) && request.method === 'POST') {   // faqat xona egasi
      const o = await olOyin(d.id);
      if (!o || !o.soz.xona) return json({ ok: false, xato: 'o‘yin topilmadi' }, 404);
      if (o.soz.egasi !== String(d.o || '')) return json({ ok: false, xato: 'Buni faqat xonani ochgan kishi qila oladi' }, 403);
      if (yol === 'xona-boshla') {
        if (o.holat !== 'kutish') return json({ ok: false, xato: 'o‘yin allaqachon boshlangan' }, 400);
        const n = (await db.prepare('SELECT COUNT(*) AS n FROM oyin_oyinchi WHERE oyin_id = ?').bind(o.id).first()).n;
        if (n < 2) return json({ ok: false, xato: 'Kamida yana bitta do‘stingiz qo‘shilsin' }, 400);
        await db.prepare(`UPDATE oyinlar SET holat = 'boshlandi', t0 = ? WHERE id = ? AND holat = 'kutish'`).bind(hozir + OYIN_TAYYOR, o.id).run();
        return json({ ok: true });
      }
      if (yol === 'xona-pauza') {                                  // {yoq} — vaqtni to'xtatish / davom ettirish
        if (o.holat === 'tugadi') return json({ ok: false, xato: 'o‘yin tugagan' }, 400);
        if (d.yoq) { await pauzaYech(db, o, hozir); return json({ ok: true, pauza: false }); }
        const f = oyinFaza(o, hozir);
        if (f.faza !== 'savol' && f.faza !== 'natija' && f.faza !== 'tayyor') return json({ ok: false, xato: 'hozir to‘xtatib bo‘lmaydi' }, 400);
        if (!o.pauza) await db.prepare('UPDATE oyinlar SET pauza = ? WHERE id = ? AND pauza IS NULL').bind(hozir, o.id).run();
        return json({ ok: true, pauza: true });
      }
      if (yol === 'xona-jamoa') {                                  // {oid, jamoa} — o'yinchini jamoaga o'tkazish; {aralash: 1} — teng bo'lib aralashtirish
        if (!o.soz.jamoalar) return json({ ok: false, xato: 'bu o‘yin jamoaviy emas' }, 400);
        if (o.holat !== 'kutish') return json({ ok: false, xato: 'o‘yin boshlangan — jamoalarni endi o‘zgartirib bo‘lmaydi' }, 400);
        const kl = o.soz.jamoalar.map(j => j.k);
        if (d.aralash) {
          const r = ((await db.prepare('SELECT oid FROM oyin_oyinchi WHERE oyin_id = ?').bind(o.id).all()).results || []).map(x => x.oid);
          for (let i = r.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [r[i], r[j]] = [r[j], r[i]]; }
          if (r.length) await db.batch(r.map((x, i) => db.prepare('UPDATE oyin_oyinchi SET jamoa = ? WHERE oyin_id = ? AND oid = ?').bind(kl[i % kl.length], o.id, x)));
          return json({ ok: true });
        }
        const k = String(d.jamoa == null ? '' : d.jamoa);
        if (!kl.includes(k)) return json({ ok: false, xato: 'jamoa noto‘g‘ri' }, 400);
        const u = await db.prepare('UPDATE oyin_oyinchi SET jamoa = ? WHERE oyin_id = ? AND oid = ?').bind(k, o.id, String(d.oid || '')).run();
        return json({ ok: ozgardi(u), xato: ozgardi(u) ? undefined : 'o‘yinchi topilmadi' });
      }
      if (yol === 'xona-keyingi') {                                // natijani (yoki 3-2-1 ni) kutmasdan keyingi savolga
        await pauzaYech(db, o, hozir);                            // pauzada bosilsa — davom etib, keyingisiga o'tadi
        const f = oyinFaza(o, hozir);
        if (f.faza !== 'natija' && f.faza !== 'tayyor') return json({ ok: false, xato: 'Hozir o‘tib bo‘lmaydi — savol vaqti tugashini kuting' }, 400);
        if (d.faza && (d.faza !== f.faza || Number(d.i) !== f.i)) return json({ ok: true, eskirgan: true });
        await db.prepare('UPDATE oyinlar SET t0 = t0 - ? WHERE id = ?').bind(Math.max(0, f.oxiri - hozir), o.id).run();
        return json({ ok: true });
      }
      if (yol === 'xona-chiqar') {
        const x = String(d.oid || '');
        if (x === o.soz.egasi) return json({ ok: false, xato: 'o‘zingizni chiqara olmaysiz' }, 400);
        await db.batch([db.prepare('DELETE FROM oyin_javob WHERE oyin_id = ? AND oid = ?').bind(o.id, x),
                        db.prepare('DELETE FROM oyin_xavf WHERE oyin_id = ? AND oid = ?').bind(o.id, x),
                        db.prepare('DELETE FROM oyin_oyinchi WHERE oyin_id = ? AND oid = ?').bind(o.id, x)]);
        return json({ ok: true });
      }
      if (yol === 'xona-chaqir') {                                 // guruhdoshlarga push (bir xonaga bir marta)
        if (o.holat === 'tugadi') return json({ ok: false, xato: 'o‘yin tugagan' }, 400);
        if (o.soz.chaqirildi) return json({ ok: false, xato: 'Guruhdoshlaringiz allaqachon chaqirildi' });
        const men = await oyinchi(o, o.soz.egasi);
        const a = men && men.tel && await db.prepare(`SELECT guruh_id FROM azolar WHERE tel = ? AND holat = 'tasdiqlangan'`).bind(men.tel).first();
        if (!a) return json({ ok: false, xato: 'Siz guruhga qo‘shilmagansiz' });
        const tellar = ((await db.prepare(`SELECT tel FROM azolar WHERE guruh_id = ? AND holat = 'tasdiqlangan' AND tel != ?`).bind(a.guruh_id, men.tel).all()).results || []).map(x => x.tel);
        const yetdi = await pushTellarga(db, url.origin, tellar, '🎮 ' + men.ism + ' sizni o‘yinga chaqiryapti!', `PIN ${o.pin} · ${o.son} ta savol — hozir qo‘shiling`, '/jonli.html?pin=' + o.pin);
        o.soz.chaqirildi = 1;
        await db.prepare('UPDATE oyinlar SET sozlama = ? WHERE id = ?').bind(JSON.stringify(o.soz), o.id).run();
        return json({ ok: true, guruhdosh: tellar.length, yetdi });
      }
      if (o.holat === 'kutish') {                                  // xona-tugat: boshlanmagan — o'chiramiz
        await db.batch([db.prepare('DELETE FROM oyin_oyinchi WHERE oyin_id = ?').bind(o.id), db.prepare('DELETE FROM oyinlar WHERE id = ?').bind(o.id)]);
        return json({ ok: true, ochirildi: true });
      }
      await oyinYakunla(db, o, env);
      return json({ ok: true });
    }
    if (yol === 'avatar' && request.method === 'POST') {           // kutish xonasida o'ziga ko'rinish tanlaydi
      const avatar = avatarNorm(d.avatar);
      if (!avatar) return json({ ok: false, xato: 'avatar noto‘g‘ri' }, 400);
      const r = await db.prepare('UPDATE oyin_oyinchi SET avatar = ? WHERE oyin_id = ? AND oid = ?').bind(avatar, Number(d.id), String(d.o || '')).run();
      return json({ ok: ozgardi(r) });
    }
    if (yol === 'h') {                                            // talaba holati (har 1–2 soniyada)
      const o = await olOyin(url.searchParams.get('id')), oid = url.searchParams.get('o') || '';
      if (!o) return json({ ok: false, xato: 'o‘yin topilmadi' }, 404);
      let men = await oyinchi(o, oid);
      if (!men) return json({ ok: false, xato: 'o‘yinchi topilmadi', chiqarildi: true }, 404);
      const s = o.soz;
      let f = oyinchiFaza(o, men, hozir);
      if (s.xona && f.faza === 'savol' && !o.pauza) {              // xona: hamma javob berdi — kutib o'tirmaymiz
        const t = await db.prepare(`SELECT (SELECT COUNT(*) FROM oyin_oyinchi WHERE oyin_id = ? AND chiqdi IS NULL) AS kerak,
          (SELECT COUNT(*) FROM oyin_javob WHERE oyin_id = ? AND savol = ?) AS berdi`).bind(o.id, o.id, f.i).first();
        if (t && t.kerak && t.berdi >= t.kerak) {
          const u = await db.prepare('UPDATE oyinlar SET t0 = t0 - ? WHERE id = ? AND t0 = ?').bind(Math.max(0, f.oxiri - hozir), o.id, o.t0).run();
          if (ozgardi(u)) { o.t0 = Number(o.t0) - Math.max(0, f.oxiri - hozir); f = oyinchiFaza(o, men, hozir); }
        }
      }
      if (!s.uyga) {
        if (f.faza === 'tugadi' && o.holat !== 'tugadi') await oyinYakunla(db, o, env);
        else { await oyinHal(db, o, f); f = oyinchiFaza(o, men, hozir); }
      } else {
        if (s.xavf) await xavfHal(db, o.id, halGacha(f), oid);
        if (f.faza === 'tugadi' && o.holat !== 'tugadi' && !men.yozildi && men.tel) {     // o'zi tugatdi — natija darrov guruh jadvaliga
          const u = await db.prepare('UPDATE oyin_oyinchi SET yozildi = 1 WHERE oyin_id = ? AND oid = ? AND yozildi = 0').bind(o.id, oid).run();
          if (ozgardi(u)) { const m = await oyinchi(o, oid); await natijaQator(db, o, m, hozirIso()).run(); }
        }
        if (s.duel && o.holat !== 'tugadi' && f.faza === 'tugadi') {     // ikkalasi ham tugatdi — natija ochiladi
          const r = (await db.prepare('SELECT oid, t0 FROM oyin_oyinchi WHERE oyin_id = ?').bind(o.id).all()).results || [];
          if (r.length >= 2 && r.every(x => oyinchiTugatdimi(o, x, hozir))) { await oyinYakunla(db, o, env); f = oyinchiFaza(o, men, hozir); }
        }
      }
      men = await oyinchi(o, oid);
      const javob = Object.assign({ ok: true, hozir, nom: o.nom, son: o.son, vaqt: o.vaqt, R: s.uyga ? OYIN_R_UYGA : o._R, t0: s.uyga ? men.t0 : o.t0,
        faza: f.faza, i: f.i, oxiri: f.oxiri || null, rejim: rejimOchiq(s, o), yakuniy: o.holat === 'tugadi' }, s.uyga ? {} : pauzaOchiq(o, f), {
        men: { ism: men.ism, ball: men.ball, togri: men.togri, avatar: men.avatar, jamoa: men.jamoa, chiqdi: men.chiqdi } });
      if (s.jamoalar) {
        javob.jamoalar = await jamoaHisob(db, o);
        const mj = s.jamoalar.find(j => j.k === men.jamoa);
        javob.men.jamoaNom = mj ? mj.nom : null; javob.men.jamoaRang = mj ? s.jamoalar.indexOf(mj) : null;
      }
      if (s.xona) {
        javob.xona = { egasi: oid === s.egasi, ochdi: s.ochdi || '', pin: o.pin, revansh: s.revansh || null, chaqirildi: !!s.chaqirildi, sozlama: s.sozlama || null };
        if (f.faza === 'kutish' && oid === s.egasi)
          javob.xona.oyinchilar = ((await db.prepare('SELECT oid, ism, avatar, jamoa FROM oyin_oyinchi WHERE oyin_id = ? ORDER BY qoshilgan LIMIT 40').bind(o.id).all()).results || [])
            .map(x => Object.assign(x, { men: x.oid === oid }));
      }
      if (f.faza === 'kutish' || f.faza === 'tayyor') {
        javob.oyinchilar = (await db.prepare('SELECT COUNT(*) AS n FROM oyin_oyinchi WHERE oyin_id = ?').bind(o.id).first()).n;
        if (s.jamoalar && men.jamoa !== null && f.faza === 'kutish')
          javob.jamoadoshlar = ((await db.prepare('SELECT ism, avatar FROM oyin_oyinchi WHERE oyin_id = ? AND jamoa = ? ORDER BY qoshilgan LIMIT 40')
            .bind(o.id, men.jamoa).all()).results || []);
      }
      if (s.xavf && (f.faza === 'kutish' || f.faza === 'tayyor' || f.faza === 'natija' || f.faza === 'savol')) {
        const r = (await db.prepare('SELECT savol FROM oyin_xavf WHERE oyin_id = ? AND oid = ? AND savol IN (?, ?)').bind(o.id, oid, Math.max(0, f.i), f.i + 1).all()).results || [];
        javob.xavf_shu = f.i >= 0 && r.some(x => x.savol === f.i);
        javob.xavf_keyingi = r.some(x => x.savol === (f.faza === 'natija' ? f.i + 1 : 0));
      }
      if (s.yoqotish) {
        const t = await db.prepare('SELECT COUNT(*) AS n, SUM(CASE WHEN chiqdi IS NULL THEN 1 ELSE 0 END) AS tirik FROM oyin_oyinchi WHERE oyin_id = ?').bind(o.id).first();
        javob.tirik = (t && t.tirik) || 0; javob.jami = (t && t.n) || 0;
      }
      if (f.faza === 'savol' || f.faza === 'natija') {
        const q = o.savollar[f.i];
        javob.savol = savolOchiq(q, f.i);
        const j = await db.prepare('SELECT javob, ball, togri, matn FROM oyin_javob WHERE oyin_id = ? AND oid = ? AND savol = ?').bind(o.id, oid, f.i).first();
        javob.javobim = j ? { j: j.javob, ball: j.ball, matn: j.matn, togri: f.faza === 'natija' ? !!j.togri : undefined } : null;
        if (f.faza === 'natija') {
          if (q.tur === 'yoz') javob.ok_matn = q.qabul.join(', '); else javob.ok_j = q.ok;
          const t = await db.prepare('SELECT COUNT(*) AS n, SUM(togri) AS togri FROM oyin_javob WHERE oyin_id = ? AND savol = ?').bind(o.id, f.i).first();
          javob.topdi = (t && t.togri) || 0; javob.javob_berdi = (t && t.n) || 0;
        }
      }
      if (f.faza === 'natija' || f.faza === 'tugadi') {
        const r = await oyinReyting(db, o), m = r.find(x => x.oid === oid);
        javob.men.orin = m ? m.orin : null; javob.jami = r.length;
        // uyga vazifa hali tugamagan — boshqalarning natijasi yashirin (duelda ayniqsa)
        const yashir = s.uyga && o.holat !== 'tugadi';
        javob.top = yashir ? [] : r.slice(0, f.faza === 'tugadi' ? 500 : 5).map(x => ({ orin: x.orin, ism: x.ism, ball: x.ball, togri: x.togri, avatar: x.avatar,
          jamoa: x.jamoa, chiqdi: x.chiqdi, men: x.oid === oid }));
        if (yashir) { javob.men.orin = null; javob.tugatganlar = r.filter(x => oyinchiTugatdimi(o, x, hozir)).length; }
        if (f.faza === 'tugadi' && !(men.chiqdi === -1)) javob.xatolarim = await oyinchiXatolari(db, o, oid);
        if (f.faza === 'tugadi' && s.xona && oid === s.egasi && o.holat === 'tugadi') javob.xatolar = await oyinXatolar(db, o, r);
      }
      return json(javob);
    }
    if (yol === 'javob' && request.method === 'POST') {
      const o = await olOyin(d.id), oid = String(d.o || '');
      if (!o) return json({ ok: false, xato: 'o‘yin topilmadi' }, 404);
      const men = await oyinchi(o, oid);
      if (!men) return json({ ok: false, xato: 'o‘yinchi topilmadi' }, 404);
      if (o.pauza && !o.soz.uyga) return json({ ok: false, xato: o.soz.xona ? 'O‘yin pauzada — davom ettirilishini kuting' : 'O‘yin pauzada — ustoz davom ettirishini kuting', pauza: true });
      const f = oyinchiFaza(o, men, hozir), i = Number(d.i);
      if (f.faza !== 'savol' || f.i !== i) return json({ ok: false, xato: 'vaqt tugadi', kech: true });
      if (men.chiqdi !== null && men.chiqdi !== undefined) return json({ ok: false, xato: 'Siz o‘yindan chiqqansiz', chiqdi: true });
      const q = o.savollar[i], t = javobTekshir(q, d);
      if (!t) return json({ ok: false, xato: 'javob noto‘g‘ri' }, 400);
      const ms = hozir - f.boshi;
      let ball = t.togri ? oyinBall(ms, o.vaqt) : 0;
      if (t.togri && o.soz.xavf && await db.prepare('SELECT 1 AS bor FROM oyin_xavf WHERE oyin_id = ? AND oid = ? AND savol = ?').bind(o.id, oid, i).first()) ball *= 2;
      const r = await db.prepare('INSERT OR IGNORE INTO oyin_javob (oyin_id, oid, savol, javob, ms, ball, togri, matn) VALUES (?, ?, ?, ?, ?, ?, ?, ?)')
        .bind(o.id, oid, i, t.j, ms, ball, t.togri ? 1 : 0, t.matn).run();
      if (ozgardi(r))
        await db.prepare('UPDATE oyin_oyinchi SET ball = ball + ?, togri = togri + ? WHERE oyin_id = ? AND oid = ?').bind(ball, t.togri ? 1 : 0, o.id, oid).run();
      return json({ ok: true });                                // to'g'rimi — savol vaqti tugagach aytiladi
    }
    if (yol === 'xavf' && request.method === 'POST') {             // keyingi savolga «×2 tavakkal» (yoki bekor qilish)
      const o = await olOyin(d.id), oid = String(d.o || '');
      if (!o || !o.soz.xavf) return json({ ok: false, xato: 'bu o‘yinda tavakkal yo‘q' }, 400);
      const men = await oyinchi(o, oid);
      if (!men) return json({ ok: false, xato: 'o‘yinchi topilmadi' }, 404);
      if (men.chiqdi !== null && men.chiqdi !== undefined) return json({ ok: false, xato: 'Siz o‘yindan chiqqansiz' });
      const f = oyinchiFaza(o, men, hozir), i = Number(d.i);
      const mumkin = Number.isInteger(i) && i >= 0 && i < o.son &&
        (((f.faza === 'kutish' || f.faza === 'tayyor') && i === 0) || (f.faza === 'natija' && f.i === i - 1));
      if (!mumkin) return json({ ok: false, xato: 'Tavakkalni savol chiqishidan oldin tanlash kerak' });
      if (d.yoq) await db.prepare('DELETE FROM oyin_xavf WHERE oyin_id = ? AND oid = ? AND savol = ? AND hal = 0').bind(o.id, oid, i).run();
      else await db.prepare('INSERT OR IGNORE INTO oyin_xavf (oyin_id, oid, savol) VALUES (?, ?, ?)').bind(o.id, oid, i).run();
      return json({ ok: true, xavf: !d.yoq });
    }
    if (yol === 'boshla-men' && request.method === 'POST') {       // uyga vazifa: talaba o'zi boshlaydi
      const o = await olOyin(d.id), oid = String(d.o || '');
      if (!o || !o.soz.uyga) return json({ ok: false, xato: 'o‘yin topilmadi' }, 404);
      if (o.holat === 'tugadi') return json({ ok: false, xato: 'Muddat tugagan' });
      await db.prepare('UPDATE oyin_oyinchi SET t0 = ? WHERE oyin_id = ? AND oid = ? AND t0 IS NULL').bind(hozir + 3000, o.id, oid).run();
      return json({ ok: true });
    }
    if (yol === 'keyingi-men' && request.method === 'POST') {      // uyga vazifa: natijani kutmasdan keyingi savolga
      const o = await olOyin(d.id), oid = String(d.o || '');
      if (!o || !o.soz.uyga) return json({ ok: false, xato: 'o‘yin topilmadi' }, 404);
      const men = await oyinchi(o, oid), f = oyinchiFaza(o, men, hozir);
      if (f.faza !== 'natija' && f.faza !== 'tayyor') return json({ ok: false, xato: 'hozir o‘tib bo‘lmaydi' });
      if (d.faza && (d.faza !== f.faza || Number(d.i) !== f.i)) return json({ ok: true, eskirgan: true });
      await db.prepare('UPDATE oyin_oyinchi SET t0 = t0 - ? WHERE oyin_id = ? AND oid = ?').bind(Math.max(0, f.oxiri - hozir), o.id, oid).run();
      return json({ ok: true });
    }

    /* ---------------- ustoz / admin / sardor (kabinet sessiyasi) ---------------- */
    const kim = await kimSorayapti(request, url, db);
    if (!kim) return json({ ok: false, xato: 'kirish kerak', kirish: true }, 401);
    const egasi = o => o && (kim.rol === 'admin' || o.login === kim.login);

    if (yol === 'yarat' && request.method === 'POST') {
      const V = Math.round(Number(d.vaqt));
      if (!(V >= 5 && V <= 120)) return json({ ok: false, xato: 'vaqt 5–120 soniya' }, 400);
      const sv = savollarNorm(d.savollar);
      if (!sv.length) return json({ ok: false, xato: 'savollar yo‘q' }, 400);
      const sz = d.sozlama || {}, soz = {};
      const nj = Math.round(Number(sz.jamoa));
      if (nj >= 2 && nj <= 4) soz.jamoalar = JAMOA_NOM.slice(0, nj).map((nom, k) => ({ k: String(k), nom }));
      if (sz.uyga) soz.uyga = 1;
      if (sz.yoqotish && !soz.uyga) soz.yoqotish = 1;
      if (sz.xavf) soz.xavf = 1;
      if (sz.manba === 'fel') soz.manba = 'fel';
      if (oraliqNorm(sz.oraliq)) soz.R = oraliqNorm(sz.oraliq);
      // qaysi guruhlar qatnashadi (sardor — faqat o'z guruhi)
      let gids = kim.rol === 'sardor' ? [kim.gid] : (Array.isArray(sz.guruhlar) ? sz.guruhlar.map(Number).filter(Boolean).slice(0, 30) : []);
      for (const g of gids) if (!(await guruhRuxsat(db, kim, g))) return json({ ok: false, xato: 'bu guruh sizga biriktirilmagan' }, 403);
      if (gids.length) {
        const g = (await db.prepare(`SELECT id, nom FROM guruhlar WHERE id IN (${gids.map(() => '?').join(',')})`).bind(...gids).all()).results || [];
        soz.guruhlar = g.map(x => x.id); soz.guruh_nomlar = g.map(x => x.nom);
      }
      const soat = Math.max(1, Math.min(168, Math.round(Number(sz.soat)) || 24));
      const r = await oyinYarat(db, kim, d.nom, V, sv, soz, soz.uyga ? hozir + soat * 3600e3 : null);
      if (!r) return json({ ok: false, xato: 'PIN yaratib bo‘lmadi, qayta urinib ko‘ring' }, 500);
      return json(Object.assign({ ok: true }, r));
    }
    if (yol === 'royxat') {                                        // oxirgi o'yinlar
      const q = kim.rol === 'admin'
        ? db.prepare(`SELECT id, pin, nom, ustoz, holat, son, vaqt, yaratilgan, sozlama, muddat FROM oyinlar ORDER BY id DESC LIMIT 30`)
        : db.prepare(`SELECT id, pin, nom, ustoz, holat, son, vaqt, yaratilgan, sozlama, muddat FROM oyinlar WHERE login = ? ORDER BY id DESC LIMIT 30`).bind(kim.login);
      const o = ((await q.all()).results || []).filter(x => { const z = sozOl(x); return !z.duel && !z.xona; });
      const son = o.length ? ((await db.prepare(`SELECT oyin_id, COUNT(*) AS n, MAX(ball) AS eng FROM oyin_oyinchi WHERE oyin_id IN (${o.map(() => '?').join(',')}) GROUP BY oyin_id`)
        .bind(...o.map(x => x.id)).all()).results || []) : [];
      return json({ ok: true, oyinlar: o.map(x => { const s = sozOl(x); delete x.sozlama;
        if (s.uyga && x.holat !== 'tugadi' && x.muddat && hozir >= x.muddat) x.holat = 'tugadi';
        return Object.assign(x, { rejim: rejimOchiq(s, x), oyinchilar: (son.find(z => z.oyin_id === x.id) || {}).n || 0 }); }) });
    }
    const o = await olOyin(url.searchParams.get('id') || d.id);
    if (!o) return json({ ok: false, xato: 'o‘yin topilmadi' }, 404);
    if (!egasi(o)) return json({ ok: false, xato: 'bu o‘yin sizniki emas' }, 403);
    const s = o.soz;

    if (yol === 'boshqar') {                                       // ustoz ekrani (har soniyada)
      let f;
      if (s.uyga) f = o.holat === 'tugadi' ? { faza: 'tugadi', i: o.son - 1 } : { faza: 'uyga', i: -1 };
      else {
        f = oyinFaza(o, hozir);
        if (f.faza === 'tugadi' && o.holat !== 'tugadi') await oyinYakunla(db, o, env);
        else { await oyinHal(db, o, f); f = oyinFaza(o, hozir); }
      }
      const r = await oyinReyting(db, o);
      const javob = { ok: true, hozir, id: o.id, pin: o.pin, nom: o.nom, holat: o.holat, son: o.son, vaqt: o.vaqt, R: o._R, t0: o.t0,
        faza: f.faza, i: f.i, oxiri: f.oxiri || null, rejim: rejimOchiq(s, o), muddat: o.muddat || null, pauza: false,
        oyinchilar: r.map(x => ({ oid: x.oid, ism: x.ism, ball: x.ball, togri: x.togri, orin: x.orin, avatar: x.avatar, jamoa: x.jamoa, chiqdi: x.chiqdi })) };
      if (!s.uyga) Object.assign(javob, pauzaOchiq(o, f));
      if (s.jamoalar) javob.jamoalar = await jamoaHisob(db, o);
      if (s.battle_id) javob.battle = await db.prepare('SELECT id, a_gid, b_gid, turnir_id FROM battlelar WHERE id = ?').bind(s.battle_id).first();
      if (s.uyga) {                                                // kim qayergacha yechdi
        const j = (await db.prepare('SELECT oid, COUNT(*) AS n FROM oyin_javob WHERE oyin_id = ? GROUP BY oid').bind(o.id).all()).results || [];
        javob.oyinchilar.forEach((x, k) => { x.javoblar = (j.find(y => y.oid === x.oid) || {}).n || 0; x.tugatdi = oyinchiTugatdimi(o, r[k], hozir); x.boshladi = !!r[k].t0; });
        if (s.guruhlar && s.guruhlar.length) {
          const kirgan = new Set(r.map(x => x.tel).filter(Boolean));
          javob.kirmaganlar = ((await db.prepare(`SELECT a.tel, a.ism, a.familiya, g.nom AS guruh FROM azolar a JOIN guruhlar g ON g.id = a.guruh_id
            WHERE a.holat = 'tasdiqlangan' AND a.guruh_id IN (${s.guruhlar.map(() => '?').join(',')}) ORDER BY a.familiya`).bind(...s.guruhlar).all()).results || [])
            .filter(x => !kirgan.has(x.tel)).map(x => ({ ism: (x.ism + ' ' + (x.familiya || '')).trim(), guruh: x.guruh }));
        }
      }
      if (s.yoqotish) javob.tirik = r.filter(x => x.chiqdi === null || x.chiqdi === undefined).length;
      if (f.faza === 'tugadi') javob.xatolar = await oyinXatolar(db, o, r);
      if (f.faza === 'savol' || f.faza === 'natija') {
        const q = o.savollar[f.i];
        javob.savol = Object.assign(savolOchiq(q, f.i), f.faza === 'natija' ? { ok: q.ok, qabul: q.qabul || null } : {});
        const t = (await db.prepare('SELECT javob, COUNT(*) AS n FROM oyin_javob WHERE oyin_id = ? AND savol = ? GROUP BY javob').bind(o.id, f.i).all()).results || [];
        javob.javoblar = t.reduce((a, x) => a + x.n, 0);
        if (s.yoqotish) javob.kutilgan = r.filter(x => x.chiqdi === null || x.chiqdi === undefined || x.chiqdi >= f.i).length;
        if (f.faza === 'natija') {
          if (q.tur === 'yoz') javob.yozuvlar = ((await db.prepare(`SELECT LOWER(TRIM(matn)) AS m, COUNT(*) AS n, MAX(togri) AS ok FROM oyin_javob
            WHERE oyin_id = ? AND savol = ? AND matn IS NOT NULL GROUP BY LOWER(TRIM(matn)) ORDER BY n DESC LIMIT 14`).bind(o.id, f.i).all()).results || []);
          else javob.taqsimot = q.v.map((_, k) => (t.find(x => x.javob === k) || {}).n || 0);
          javob.topdi = (await db.prepare('SELECT COUNT(*) AS n FROM oyin_javob WHERE oyin_id = ? AND savol = ? AND togri = 1').bind(o.id, f.i).first()).n;
          // shu savolda kim xato qildi va kim javob bermadi (savol chiqqandan keyin kirganlar hisobga olinmaydi)
          const bu = (await db.prepare('SELECT oid, javob, togri, matn FROM oyin_javob WHERE oyin_id = ? AND savol = ?').bind(o.id, f.i).all()).results || [];
          const ism = new Map(r.map(x => [x.oid, x.ism])), berdi = new Set(bu.map(x => x.oid));
          javob.xato_qildi = bu.filter(x => !x.togri && ism.has(x.oid)).map(x => ({ ism: ism.get(x.oid), javob: savolJavob(q, x) }));
          javob.javob_bermadi = r.filter(x => !berdi.has(x.oid) && savoldaBormi(x, f.i)).map(x => x.ism);
          if (s.yoqotish) javob.chiqqanlar = r.filter(x => x.chiqdi === f.i).map(x => x.oid);
        }
        if (s.xavf) javob.tavakkal = ((await db.prepare(`SELECT x.oid, j.togri FROM oyin_xavf x LEFT JOIN oyin_javob j ON j.oyin_id = x.oyin_id AND j.oid = x.oid AND j.savol = x.savol
          WHERE x.oyin_id = ? AND x.savol = ?`).bind(o.id, f.i).all()).results || []).map(x => ({ oid: x.oid, togri: f.faza === 'natija' ? !!x.togri : undefined }));
      }
      return json(javob);
    }
    if (yol === 'boshla' && request.method === 'POST') {
      if (o.holat !== 'kutish') return json({ ok: false, xato: 'o‘yin allaqachon boshlangan' }, 400);
      await db.prepare(`UPDATE oyinlar SET holat = 'boshlandi', t0 = ? WHERE id = ? AND holat = 'kutish'`).bind(hozir + OYIN_TAYYOR, o.id).run();
      return json({ ok: true });
    }
    if (yol === 'pauza' && request.method === 'POST') {            // {id, yoq} — vaqtni to'xtatish / davom ettirish
      if (s.uyga) return json({ ok: false, xato: 'uyga vazifada pauza yo‘q' }, 400);
      if (d.yoq) { await pauzaYech(db, o, hozir); return json({ ok: true, pauza: false }); }
      const f = oyinFaza(o, hozir);
      if (f.faza !== 'savol' && f.faza !== 'natija' && f.faza !== 'tayyor') return json({ ok: false, xato: 'hozir to‘xtatib bo‘lmaydi' }, 400);
      if (!o.pauza) await db.prepare('UPDATE oyinlar SET pauza = ? WHERE id = ? AND pauza IS NULL').bind(hozir, o.id).run();
      return json({ ok: true, pauza: true });
    }
    if (yol === 'keyingi' && request.method === 'POST') {          // hozirgi bosqichni tugatib, keyingisiga o'tish
      await pauzaYech(db, o, hozir);                              // pauzada bosilsa — davom etib, keyingisiga o'tadi
      const f = oyinFaza(o, hozir);
      if (f.faza !== 'savol' && f.faza !== 'natija' && f.faza !== 'tayyor') return json({ ok: false, xato: 'hozir o‘tib bo‘lmaydi' }, 400);
      // faqat ko'rsatilgan bosqichdan (i) o'tadi — ikki marta bosilsa ikki savol o'tib ketmasin
      if (d.faza && (d.faza !== f.faza || Number(d.i) !== f.i)) return json({ ok: true, eskirgan: true });
      const sur = Math.max(0, f.oxiri - hozir);
      await db.prepare('UPDATE oyinlar SET t0 = t0 - ? WHERE id = ?').bind(sur, o.id).run();
      return json({ ok: true });
    }
    if (yol === 'tugat' && request.method === 'POST') {
      if (o.holat === 'kutish') {                                    // boshlanmagan — butunlay o'chiramiz
        await db.batch([db.prepare('DELETE FROM oyin_oyinchi WHERE oyin_id = ?').bind(o.id), db.prepare('DELETE FROM oyinlar WHERE id = ?').bind(o.id)]);
        if (s.battle_id) await db.prepare('UPDATE battlelar SET oyin_id = NULL WHERE id = ? AND oyin_id = ?').bind(s.battle_id, o.id).run();
        return json({ ok: true, ochirildi: true });
      }
      await oyinYakunla(db, o, env);
      return json({ ok: true });
    }
    if (yol === 'chiqar' && request.method === 'POST') {           // lobbidan noto'g'ri ismni olib tashlash
      await db.batch([db.prepare('DELETE FROM oyin_javob WHERE oyin_id = ? AND oid = ?').bind(o.id, String(d.oid || '')),
                      db.prepare('DELETE FROM oyin_xavf WHERE oyin_id = ? AND oid = ?').bind(o.id, String(d.oid || '')),
                      db.prepare('DELETE FROM oyin_oyinchi WHERE oyin_id = ? AND oid = ?').bind(o.id, String(d.oid || ''))]);
      return json({ ok: true });
    }
    if (yol === 'eslat' && request.method === 'POST') {            // uyga vazifa: hali yechmaganlarga push
      if (!s.uyga || o.holat === 'tugadi') return json({ ok: false, xato: 'faqat davom etayotgan uyga vazifada' }, 400);
      if (!s.guruhlar || !s.guruhlar.length) return json({ ok: false, xato: 'Vazifa guruhga berilmagan — kimga eslatishni bilmaymiz' }, 400);
      const r = await oyinReyting(db, o), tugatgan = new Set(r.filter(x => oyinchiTugatdimi(o, x, hozir)).map(x => x.tel));
      const tellar = ((await db.prepare(`SELECT tel FROM azolar WHERE holat = 'tasdiqlangan' AND guruh_id IN (${s.guruhlar.map(() => '?').join(',')})`).bind(...s.guruhlar).all()).results || [])
        .map(x => x.tel).filter(t => !tugatgan.has(t));
      const qoldi = Math.max(0, Math.round((o.muddat - hozir) / 3600e3));
      const yetdi = await pushTellarga(db, url.origin, tellar, '📚 Uyga vazifa: ' + o.nom, `Hali yechmadingiz — ${qoldi ? qoldi + ' soat' : 'oz vaqt'} qoldi. PIN ${o.pin}`, '/jonli.html?pin=' + o.pin);
      return json({ ok: true, yechmagan: tellar.length, yetdi });
    }
    if (yol === 'csv') {
      const r = await oyinReyting(db, o), jm = k => ((s.jamoalar || []).find(j => j.k === k) || {}).nom || '';
      return csvJavob([(s.jamoalar ? 'O‘rin,Ism,Telefon,Jamoa,Ochko,To‘g‘ri,Savollar' : 'O‘rin,Ism,Telefon,Ochko,To‘g‘ri,Savollar')]
        .concat(r.map(x => [x.orin, x.ism, x.tel || ''].concat(s.jamoalar ? [jm(x.jamoa)] : [], [x.ball, x.togri, o.son]).map(csvMatn).join(','))),
        (s.uyga ? 'Uyga vazifa - ' : 'Jonli test - ') + (o.nom || o.pin));
    }
    return json({ ok: false, xato: 'nomalum so‘rov' }, 404);
  } catch (e) {
    return json({ ok: false, xato: String((e && e.message) || e).slice(0, 160) }, 500);
  }
}
/* ================================================================
   MUSOBAQALAR: guruh va guruh battle, haftalik liga, kurs turniri, duel

   • Battle: sardor (yoki ustoz) boshqa guruhni chaqiradi → raqib
     sardori qabul qiladi (yoki boshqa vaqt taklif qiladi) → belgilangan
     vaqtda kimdir «Battle'ni ochish»ni bosadi — jonli test ochiladi,
     jamoalar — ikki guruh. Hisob: guruh a'zolarining o'rtacha bali.
     Tugagach natija (g'olib, MVP) saqlanadi va chatda e'lon qilinadi.
   • Liga: har hafta (dushanba–yakshanba, Toshkent) bir kursdagi
     guruhlar o'rtacha ball bo'yicha o'zi saralanadi. Hafta tugagach
     g'olib chatda e'lon qilinadi (birinchi kirgan talaba «uyg'otadi»).
   • Turnir: ustoz/admin kursdagi guruhlarni juftlaydi; har juft —
     battle. G'olib keyingi bosqichga o'zi o'tadi.
   • Duel: talaba guruhdoshini chaqiradi — ikkalasiga bir xil savollar,
     24 soat ichida (uyga vazifa ko'rinishida). Natija ikkalasi yechgach.
   ================================================================ */
const toshkentHafta = t => {                 // haftaning boshi (dushanba 00:00, Toshkent) — ms
  const d = new Date((t === undefined ? Date.now() : t) + 5 * 3600e3);
  const kun = (d.getUTCDay() + 6) % 7;
  return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()) - kun * 864e5 - 5 * 3600e3;
};
function haftaRaqami(t) {                    // ISO hafta raqami (Toshkent bo'yicha)
  const d = new Date(t + 5 * 3600e3 + 3 * 864e5);           // payshanba
  const y = Date.UTC(d.getUTCFullYear(), 0, 1);
  return Math.floor((Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()) - y) / 864e5 / 7) + 1;
}
const OYLAR = ['yanvar', 'fevral', 'mart', 'aprel', 'may', 'iyun', 'iyul', 'avgust', 'sentyabr', 'oktabr', 'noyabr', 'dekabr'];
function sanaMatn(iso) {
  const t = Date.parse(iso); if (isNaN(t)) return '';
  const d = new Date(t + 5 * 3600e3), ik = n => String(n).padStart(2, '0');
  return `${d.getUTCDate()}-${OYLAR[d.getUTCMonth()]}, ${ik(d.getUTCHours())}:${ik(d.getUTCMinutes())}`;
}
// «2026-10-13T18:00» (Toshkent) yoki ISO → ISO (UTC)
function vaqtNorm(v) {
  v = String(v || '').trim();
  let t = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(v) ? Date.parse(v + ':00+05:00') : Date.parse(v);
  return isNaN(t) ? null : new Date(t).toISOString();
}
const telId = async tel => (await sha256('au-duel:' + tel)).slice(0, 16);
const jsonOl = (t, b) => { try { return JSON.parse(t || '') || b; } catch (e) { return b; } };
async function chatTizim(db, ism, m) {       // chatda tizim e'loni (battle, liga, turnir)
  try { await db.prepare(`INSERT INTO chat (tel, ism, rol, matn, vaqt) VALUES (NULL, ?, 'tizim', ?, ?)`).bind(ism, matn(m, 500), Date.now()).run(); } catch (e) {}
}
const guruhAzoTellar = async (db, gids) => gids.length ? ((await db.prepare(`SELECT tel FROM azolar WHERE holat = 'tasdiqlangan' AND guruh_id IN (${gids.map(() => '?').join(',')})`)
  .bind(...gids).all()).results || []).map(x => x.tel) : [];
const guruhNomlari = async (db, gids) => {
  gids = [...new Set(gids.filter(Boolean))];
  if (!gids.length) return {};
  const r = (await db.prepare(`SELECT id, nom, kurs, univ, sardor_tel FROM guruhlar WHERE id IN (${gids.map(() => '?').join(',')})`).bind(...gids).all()).results || [];
  return Object.fromEntries(r.map(x => [x.id, x]));
};
// kim qaysi guruhlar nomidan ish ko'ra oladi (admin — hammasi: null)
async function kimGuruhlari(db, kim) {
  if (kim.rol === 'admin') return null;
  if (kim.rol === 'sardor') return [kim.gid];
  return ((await db.prepare('SELECT guruh_id FROM ustoz_guruh WHERE login = ?').bind(kim.login).all()).results || []).map(x => x.guruh_id);
}
const qoladi = (gids, gid) => gids === null || gids.includes(gid);
function battleOchiq(b, nomlar, gids) {
  const n = id => (nomlar[id] || {}).nom || '?';
  return { id: b.id, a: { gid: b.a_gid, nom: n(b.a_gid) }, b: { gid: b.b_gid, nom: n(b.b_gid) }, holat: b.holat, kutadi: b.kutadi, vaqt: b.vaqt,
    sozlama: jsonOl(b.sozlama, {}), oyin_id: b.oyin_id, natija: jsonOl(b.natija, null), turnir_id: b.turnir_id, raund: b.raund,
    yaratdi: b.yaratdi, yaratilgan: b.yaratilgan,
    menda: gids === undefined ? undefined : { a: qoladi(gids, b.a_gid), b: qoladi(gids, b.b_gid) } };
}
// guruhlarning battle hisobi: g'alaba / mag'lubiyat / durang
async function battleRekord(db, gids) {
  const r = (await db.prepare(`SELECT a_gid, b_gid, natija FROM battlelar WHERE holat = 'otdi'`).all()).results || [];
  const rek = {};
  r.forEach(x => {
    const n = jsonOl(x.natija, {}), qo = (g, k) => { if (gids && !gids.includes(g)) return; (rek[g] = rek[g] || { g: 0, m: 0, d: 0 })[k]++; };
    if (!n.golib) { qo(x.a_gid, 'd'); qo(x.b_gid, 'd'); }
    else { qo(n.golib, 'g'); qo(n.golib === x.a_gid ? x.b_gid : x.a_gid, 'm'); }
  });
  return rek;
}
// battle o'yini tugadi — natija, chatda e'lon, turnirda keyingi bosqich
async function battleYakun(db, o, royxat, env) {
  const b = await db.prepare('SELECT * FROM battlelar WHERE id = ?').bind(o.soz.battle_id).first();
  if (!b || b.holat === 'otdi') return;
  const j = await jamoaHisob(db, o), ka = 'g' + b.a_gid, kb = 'g' + b.b_gid;
  const A = j.find(x => x.k === ka) || { ball: 0, soni: 0, togri: 0 }, B = j.find(x => x.k === kb) || { ball: 0, soni: 0, togri: 0 };
  let golib = A.ball > B.ball ? b.a_gid : B.ball > A.ball ? b.b_gid : A.togri > B.togri ? b.a_gid : B.togri > A.togri ? b.b_gid : null;
  if (!A.soni && !B.soni) golib = null;
  const nomlar = await guruhNomlari(db, [b.a_gid, b.b_gid]), nm = id => (nomlar[id] || {}).nom || '?';
  const mvp = royxat[0] && royxat[0].ball ? { ism: royxat[0].ism, ball: royxat[0].ball, togri: royxat[0].togri, avatar: royxat[0].avatar,
    gid: royxat[0].jamoa === ka ? b.a_gid : b.b_gid } : null;
  const natija = { a: { ball: A.ball, soni: A.soni, togri: A.togri }, b: { ball: B.ball, soni: B.soni, togri: B.togri }, golib, mvp, savollar: o.son };
  const u = await db.prepare(`UPDATE battlelar SET holat = 'otdi', natija = ? WHERE id = ? AND holat != 'otdi'`).bind(JSON.stringify(natija), b.id).run();
  if (!ozgardi(u)) return;
  await chatTizim(db, '⚔️ Battle', `${nm(b.a_gid)} — ${A.ball} : ${B.ball} — ${nm(b.b_gid)}. ` +
    (golib ? `🏆 ${nm(golib)}-guruh g‘olib!` : 'Durang!') + (mvp ? ` ⭐ MVP: ${mvp.ism} (${mvp.ball} ball)` : ''));
  if (b.turnir_id) await turnirIlgari(db, b, golib || (A.soni >= B.soni ? b.a_gid : b.b_gid), natija);
}

/* ---------- liga ---------- */
async function ligaHisob(db, univ, kurs) {
  const H = 12, bosh = toshkentHafta(), anchor = bosh - (H - 1) * 7 * 864e5;
  const g = (await db.prepare(`SELECT g.id, g.nom, COUNT(a.tel) AS n FROM guruhlar g LEFT JOIN azolar a ON a.guruh_id = g.id AND a.holat = 'tasdiqlangan'
    WHERE g.univ = ? AND g.kurs = ? GROUP BY g.id ORDER BY g.nom`).bind(univ, kurs).all()).results || [];
  const p = (await db.prepare(`SELECT a.guruh_id AS gid, CAST((julianday(n.vaqt) - julianday(?)) / 7 AS INTEGER) AS h, SUM(n.ball) AS b
    FROM natijalar n JOIN azolar a ON a.tel = n.tel AND a.holat = 'tasdiqlangan' JOIN guruhlar g ON g.id = a.guruh_id
    WHERE g.univ = ? AND g.kurs = ? AND n.vaqt >= ? AND n.bolim IS NOT '${XONA_BOLIM}' GROUP BY gid, h`).bind(new Date(anchor).toISOString(), univ, kurs, new Date(anchor).toISOString()).all()).results || [];
  const ball = (gid, h) => { const x = p.find(y => y.gid === gid && y.h === h), gr = g.find(y => y.id === gid); return x && gr && gr.n ? Math.round(x.b / gr.n) : 0; };
  const saralash = h => g.filter(x => x.n).map(x => ({ gid: x.id, nom: x.nom, soni: x.n, ball: ball(x.id, h) }))
    .sort((a, b) => b.ball - a.ball || a.nom.localeCompare(b.nom)).map((x, i) => Object.assign(x, { orin: i + 1 }));
  const joriy = saralash(H - 1), otgan = saralash(H - 2);
  joriy.forEach(x => { const e = otgan.find(y => y.gid === x.gid); x.trend = e && otgan.some(y => y.ball) ? e.orin - x.orin : 0; });
  const tarix = [], galaba = {};
  for (let h = 0; h < H - 1; h++) {
    const s = saralash(h);
    if (!s.length || !s[0].ball) continue;
    tarix.push({ hafta: haftaRaqami(anchor + h * 7 * 864e5), gid: s[0].gid, nom: s[0].nom, ball: s[0].ball });
    galaba[s[0].gid] = (galaba[s[0].gid] || 0) + 1;
  }
  return { hafta: haftaRaqami(bosh), boshi: new Date(bosh).toISOString(), tugash: new Date(bosh + 7 * 864e5).toISOString(), joriy, otgan, tarix, galaba };
}
// o'tgan hafta g'olibi — chatda bir marta e'lon
async function ligaElon(db, univ, kurs) {
  try {
    const bosh = toshkentHafta(), k = `liga-elon:${new Date(bosh).toISOString().slice(0, 10)}:${univ}:${kurs}`;
    const u = await db.prepare('INSERT OR IGNORE INTO sozlama (kalit, qiymat) VALUES (?, ?)').bind(k, '1').run();
    if (!ozgardi(u)) return;
    const l = await ligaHisob(db, univ, kurs), s = l.otgan;
    if (!s.length || !s[0].ball) return;
    const un = univTop(univ), kursNomi = (un && univ !== 'jtu' ? un.qisqa + ' · ' : '') + kurs + '-kurs';
    await chatTizim(db, '🏆 Guruhlar ligasi', `${kursNomi} · ${haftaRaqami(bosh - 7 * 864e5)}-hafta g‘olibi: ${s[0].nom}-guruh! (o‘rtacha ${s[0].ball} ball)` +
      (s[1] ? ` 🥈 ${s[1].nom}` : '') + (s[2] ? ` 🥉 ${s[2].nom}` : ''));
  } catch (e) {}
}

/* ---------- turnir ---------- */
async function turnirIlgari(db, b, golib, natija) {
  const t = await db.prepare('SELECT * FROM turnirlar WHERE id = ?').bind(b.turnir_id).first();
  if (!t || t.holat === 'tugadi') return;
  const j = jsonOl(t.jadval, { raundlar: [] }), R = j.raundlar, m = R[b.raund] && R[b.raund][b.juft];
  if (!m) return;
  m.golib = golib; m.ball = natija ? { a: natija.a.ball, b: natija.b.ball } : null;
  await turnirYoy(db, t, j);
}
// g'oliblar (va «bye») keyingi bosqichga; final g'olibi — chempion
async function turnirYoy(db, t, j) {
  const R = j.raundlar;
  for (let r = 0; r < R.length; r++) R[r].forEach((m, k) => {
    if (!m.golib && m.a && !m.b && r === 0) m.golib = m.a;            // juftsiz — o'zi o'tadi
    if (!m.golib && m.b && !m.a && r === 0) m.golib = m.b;
    if (m.golib && R[r + 1]) R[r + 1][k >> 1][k % 2 ? 'b' : 'a'] = m.golib;
  });
  const fin = R[R.length - 1][0];
  const tugadi = fin && fin.golib;
  await db.prepare('UPDATE turnirlar SET jadval = ?, holat = ?, golib = ? WHERE id = ?').bind(JSON.stringify(j), tugadi ? 'tugadi' : 'davom', tugadi ? fin.golib : null, t.id).run();
  if (tugadi && t.holat !== 'tugadi') {
    const n = await guruhNomlari(db, [fin.golib]);
    await chatTizim(db, '🏆 Turnir', `«${t.nom}» yakunlandi — chempion: ${(n[fin.golib] || {}).nom || '?'}-guruh! 🎉`);
  }
}
async function turnirOchiq(db, t) {
  const j = jsonOl(t.jadval, { raundlar: [] }), gids = [];
  j.raundlar.forEach(r => r.forEach(m => { if (m.a) gids.push(m.a); if (m.b) gids.push(m.b); }));
  const n = await guruhNomlari(db, gids);
  const bids = []; j.raundlar.forEach(r => r.forEach(m => { if (m.bid) bids.push(m.bid); }));
  const bl = bids.length ? ((await db.prepare(`SELECT id, vaqt, holat, oyin_id FROM battlelar WHERE id IN (${bids.map(() => '?').join(',')})`).bind(...bids).all()).results || []) : [];
  return { id: t.id, nom: t.nom, univ: t.univ, kurs: t.kurs, holat: t.holat, golib: t.golib, sozlama: j.sozlama || {},
    raundlar: j.raundlar.map(r => r.map(m => Object.assign({}, m, { aNom: m.a ? (n[m.a] || {}).nom : null, bNom: m.b ? (n[m.b] || {}).nom : null,
      battle: m.bid ? (bl.find(x => x.id === m.bid) || null) : null }))) };
}

/* ---------- API: talaba tomoni (telefon raqami bilan) ---------- */
async function musobaqaTalaba(yol, request, url, env, db, d) {
  const tel = telNorm(request.method === 'POST' ? d.tel : url.searchParams.get('tel'));
  if (!tel) return json({ ok: false, xato: 'telefon raqami noto‘g‘ri' }, 400);
  const a = await db.prepare(`SELECT a.tel, a.ism, a.familiya, a.guruh_id, g.nom AS guruh, g.kurs, g.univ FROM azolar a JOIN guruhlar g ON g.id = a.guruh_id
    WHERE a.tel = ? AND a.holat = 'tasdiqlangan'`).bind(tel).first();
  if (!a) return json({ ok: false, xato: 'guruh a‘zosi emas' });
  const ismim = ((a.ism || '') + ' ' + (a.familiya || '')).trim();
  if (yol === 'liga-men') {
    await ligaElon(db, a.univ, a.kurs);
    const l = await ligaHisob(db, a.univ, a.kurs);
    return json(Object.assign({ ok: true, guruh_id: a.guruh_id, kurs: a.kurs, univ: a.univ }, l, { otgan: undefined }));
  }
  if (yol === 'musobaqa-men') {
    const bl = (await db.prepare(`SELECT * FROM battlelar WHERE (a_gid = ? OR b_gid = ?) AND (holat IN ('taklif', 'qabul') OR (holat = 'otdi' AND yaratilgan > ?))
      ORDER BY id DESC LIMIT 20`).bind(a.guruh_id, a.guruh_id, new Date(Date.now() - 30 * 864e5).toISOString()).all()).results || [];
    const n = await guruhNomlari(db, bl.flatMap(b => [b.a_gid, b.b_gid]));
    const q = bl.length ? ((await db.prepare(`SELECT bid, tel, ism FROM battle_qatnash WHERE bid IN (${bl.map(() => '?').join(',')})`).bind(...bl.map(b => b.id)).all()).results || []) : [];
    const battlelar = bl.map(b => Object.assign(battleOchiq(b, n), { qatnash: q.filter(x => x.bid === b.id).length,
      qatnashchilar: q.filter(x => x.bid === b.id).slice(0, 12).map(x => x.ism), men_qatnashaman: q.some(x => x.bid === b.id && x.tel === tel),
      pin: null }));
    // ochilgan battle o'yinining PIN i — qatnashish uchun
    const oy = battlelar.filter(b => b.oyin_id && b.holat === 'qabul').map(b => b.oyin_id);
    if (oy.length) ((await db.prepare(`SELECT id, pin, holat FROM oyinlar WHERE id IN (${oy.map(() => '?').join(',')})`).bind(...oy).all()).results || [])
      .forEach(o => { const b = battlelar.find(x => x.oyin_id === o.id); if (b && o.holat !== 'tugadi') b.pin = o.pin; });
    const t = await db.prepare(`SELECT * FROM turnirlar WHERE univ = ? AND kurs = ? AND (holat = 'davom' OR yaratilgan > ?) ORDER BY id DESC LIMIT 1`)
      .bind(a.univ, a.kurs, new Date(Date.now() - 14 * 864e5).toISOString()).first();
    const rek = (await battleRekord(db, [a.guruh_id]))[a.guruh_id] || { g: 0, m: 0, d: 0 };
    return json({ ok: true, guruh_id: a.guruh_id, guruh: a.guruh, battlelar, rekord: rek, turnir: t ? await turnirOchiq(db, t) : null });
  }
  if (yol === 'qatnashaman' && request.method === 'POST') {
    const b = await db.prepare(`SELECT id FROM battlelar WHERE id = ? AND (a_gid = ? OR b_gid = ?) AND holat = 'qabul'`).bind(Number(d.bid), a.guruh_id, a.guruh_id).first();
    if (!b) return json({ ok: false, xato: 'battle topilmadi' }, 404);
    if (d.yoq) await db.prepare('DELETE FROM battle_qatnash WHERE bid = ? AND tel = ?').bind(b.id, tel).run();
    else await db.prepare('INSERT OR IGNORE INTO battle_qatnash (bid, tel, ism) VALUES (?, ?, ?)').bind(b.id, tel, ismim).run();
    return json({ ok: true });
  }
  if (yol === 'guruhdoshlar') {
    const r = (await db.prepare(`SELECT a.tel, a.ism, a.familiya, COALESCE(SUM(n.ball), 0) AS ball FROM azolar a LEFT JOIN natijalar n ON n.tel = a.tel AND n.bolim IS NOT '${XONA_BOLIM}'
      WHERE a.guruh_id = ? AND a.holat = 'tasdiqlangan' AND a.tel != ? GROUP BY a.tel ORDER BY a.familiya, a.ism`).bind(a.guruh_id, tel).all()).results || [];
    return json({ ok: true, guruh: a.guruh, azolar: await Promise.all(r.map(async x => ({ id: await telId(x.tel), ism: ((x.ism || '') + ' ' + (x.familiya || '')).trim(), ball: x.ball }))) });
  }
  if (yol === 'duel-yarat' && request.method === 'POST') {
    const sv = savollarNorm(d.savollar).slice(0, 20);
    if (sv.length < 3) return json({ ok: false, xato: 'savollar yo‘q' }, 400);
    const r = (await db.prepare(`SELECT tel, ism, familiya FROM azolar WHERE guruh_id = ? AND holat = 'tasdiqlangan' AND tel != ?`).bind(a.guruh_id, tel).all()).results || [];
    let raqib = null;
    for (const x of r) if (await telId(x.tel) === String(d.raqib || '')) raqib = x;
    if (!raqib) return json({ ok: false, xato: 'raqib topilmadi' }, 404);
    const bugun = (await db.prepare(`SELECT COUNT(*) AS n FROM oyinlar WHERE login = ? AND yaratilgan > ?`).bind('duel:' + tel, new Date(Date.now() - 864e5).toISOString()).first()).n;
    if (bugun >= 10) return json({ ok: false, xato: 'Bugun 10 ta duel yaratdingiz — ertaga yana' }, 429);
    const rIsm = ((raqib.ism || '') + ' ' + (raqib.familiya || '')).trim();
    const soz = { uyga: 1, duel: { a: tel, b: raqib.tel, aIsm: ismim, bIsm: rIsm } };
    const o = await oyinYarat(db, { login: 'duel:' + tel, nom: 'Duel' }, matn(d.nom, 60) || ('Duel: ' + ismim.split(' ')[0] + ' — ' + rIsm.split(' ')[0]),
      Math.max(10, Math.min(30, Math.round(Number(d.vaqt)) || 15)), sv, soz, Date.now() + 24 * 3600e3);
    if (!o) return json({ ok: false, xato: 'yaratib bo‘lmadi' }, 500);
    const yetdi = await pushTellarga(db, url.origin, [raqib.tel], '⚔️ ' + ismim + ' sizni duelga chaqirdi!', `${sv.length} ta savol · 24 soat ichida yeching`, '/jonli.html?pin=' + o.pin);
    return json({ ok: true, id: o.id, pin: o.pin, raqib: rIsm, push: yetdi });
  }
  if (yol === 'duellar') {
    const r = (await db.prepare(`SELECT id, pin, nom, holat, son, vaqt, muddat, sozlama, yaratilgan FROM oyinlar WHERE sozlama LIKE ? AND yaratilgan > ? ORDER BY id DESC LIMIT 30`)
      .bind('%"duel"%' + tel.replace(/[%_]/g, '') + '%', new Date(Date.now() - 14 * 864e5).toISOString()).all()).results || [];
    const hozir = Date.now(), chiq = [];
    let g = 0, m = 0, dr = 0;
    for (const o of r) {
      const s = sozOl(o); if (!s.duel || (s.duel.a !== tel && s.duel.b !== tel)) continue;
      if (o.holat !== 'tugadi' && o.muddat && hozir >= o.muddat) { o.soz = s; o.savollar = []; await oyinYakunla(db, o, env); }
      const p = (await db.prepare('SELECT tel, ball, togri, t0 FROM oyin_oyinchi WHERE oyin_id = ?').bind(o.id).all()).results || [];
      const men = p.find(x => x.tel === tel), u = p.find(x => x.tel !== tel), menA = s.duel.a === tel;
      const x = { id: o.id, pin: o.pin, nom: o.nom, holat: o.holat, son: o.son, muddat: o.muddat, raqib: menA ? s.duel.bIsm : s.duel.aIsm, chaqirdim: menA,
        boshladim: !!(men && men.t0), tugatdim: oyinchiTugatdimi(o, men, hozir), raqib_tugatdi: oyinchiTugatdimi(o, u, hozir) };
      if (o.holat === 'tugadi') {
        x.men = men ? { togri: men.togri, ball: men.ball } : null; x.u = u ? { togri: u.togri, ball: u.ball } : null;
        const mb = men ? men.ball : -1, ub = u ? u.ball : -1;
        x.natija = mb > ub ? 'g' : mb < ub ? 'm' : 'd';
        if (x.natija === 'g') g++; else if (x.natija === 'm') m++; else dr++;
      }
      chiq.push(x);
    }
    return json({ ok: true, duellar: chiq, rekord: { g, m, d: dr } });
  }
  return json({ ok: false, xato: 'nomalum so‘rov' }, 404);
}

/* ---------- API: kabinet (ustoz, admin, sardor) ---------- */
async function musobaqaKabinet(yol, request, url, env, db, d, kim) {
  const gids = await kimGuruhlari(db, kim);
  if (yol === 'liga') {
    const kurs = Number(url.searchParams.get('kurs')), univ = univKod(url.searchParams.get('univ'));
    if (!(kurs >= 1 && kurs <= 6)) return json({ ok: false, xato: 'kurs noto‘g‘ri' }, 400);
    return json(Object.assign({ ok: true, kurs, univ }, await ligaHisob(db, univ, kurs), { otgan: undefined }));
  }
  if (yol === 'battlelar') {
    const r = gids === null
      ? (await db.prepare('SELECT * FROM battlelar ORDER BY id DESC LIMIT 80').all()).results || []
      : gids.length ? (await db.prepare(`SELECT * FROM battlelar WHERE a_gid IN (${gids.map(() => '?').join(',')}) OR b_gid IN (${gids.map(() => '?').join(',')}) ORDER BY id DESC LIMIT 80`)
        .bind(...gids, ...gids).all()).results || [] : [];
    const n = await guruhNomlari(db, r.flatMap(b => [b.a_gid, b.b_gid]));
    const q = r.length ? ((await db.prepare(`SELECT bid, COUNT(*) AS n FROM battle_qatnash WHERE bid IN (${r.map(() => '?').join(',')}) GROUP BY bid`).bind(...r.map(b => b.id)).all()).results || []) : [];
    // raqib tanlash uchun: hamma guruhlar (nomi, kursi)
    const hamma = (await db.prepare(`SELECT g.id, g.nom, g.kurs, g.univ FROM guruhlar g ${GURUH_TARTIB}`).all()).results || [];
    return json({ ok: true, battlelar: r.map(b => Object.assign(battleOchiq(b, n, gids), { qatnash: (q.find(x => x.bid === b.id) || {}).n || 0 })),
      guruhlar: hamma, menikilar: gids, rekord: await battleRekord(db, null) });
  }
  if (yol === 'battle-chaqir' && request.method === 'POST') {
    const a = Number(d.a_gid), b = Number(d.b_gid);
    if (!qoladi(gids, a)) return json({ ok: false, xato: 'bu guruh sizga biriktirilmagan' }, 403);
    if (!a || !b || a === b) return json({ ok: false, xato: 'raqib guruhni tanlang' }, 400);
    const n = await guruhNomlari(db, [a, b]);
    if (!n[a] || !n[b]) return json({ ok: false, xato: 'guruh topilmadi' }, 404);
    const vaqt = vaqtNorm(d.vaqt);
    if (!vaqt) return json({ ok: false, xato: 'vaqtni belgilang' }, 400);
    const sz = d.sozlama || {}, soz = { qism: (Array.isArray(sz.qism) ? sz.qism : []).map(Number).filter(x => x >= 0).slice(0, 60),
      son: Math.max(5, Math.min(40, Math.round(Number(sz.son)) || 15)), vaqt_s: Math.max(5, Math.min(60, Math.round(Number(sz.vaqt_s)) || 15)),
      tur: ['tanlov', 'tn', 'yoz'].includes(sz.tur) ? sz.tur : 'tanlov', yon: ['ar-uz', 'uz-ar', 'aralash'].includes(sz.yon) ? sz.yon : 'ar-uz', xavf: !!sz.xavf,
      oraliq: oraliqNorm(sz.oraliq) || OYIN_R };
    const ikkalasi = qoladi(gids, b);                      // ikkala guruh ham shu ustozniki — darrov kelishilgan
    const r = await db.prepare(`INSERT INTO battlelar (a_gid, b_gid, holat, kutadi, vaqt, sozlama, yaratdi, yaratilgan) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`)
      .bind(a, b, ikkalasi ? 'qabul' : 'taklif', ikkalasi ? null : 'b', vaqt, JSON.stringify(soz), kim.nom, hozirIso()).run();
    const id = (r.meta && r.meta.last_row_id) || r.lastInsertRowid;
    if (ikkalasi) await battleElon(db, url, id, n[a], n[b], vaqt);
    else if (n[b].sardor_tel) await pushTellarga(db, url.origin, [n[b].sardor_tel], '⚔️ ' + n[a].nom + '-guruh sizni battlega chaqirdi!',
      sanaMatn(vaqt) + ' · ' + soz.son + ' savol. Javob berish: sardor paneli', '/ustoz.html');
    return json({ ok: true, id, holat: ikkalasi ? 'qabul' : 'taklif' });
  }
  const b = await db.prepare('SELECT * FROM battlelar WHERE id = ?').bind(Number(d.id || url.searchParams.get('id'))).first();
  if (yol === 'battle-javob' && request.method === 'POST') {
    if (!b || b.holat !== 'taklif') return json({ ok: false, xato: 'chaqiruv topilmadi' }, 404);
    const tomon = b.kutadi === 'a' ? b.a_gid : b.b_gid;
    if (!qoladi(gids, tomon)) return json({ ok: false, xato: 'javobni raqib guruh beradi' }, 403);
    const n = await guruhNomlari(db, [b.a_gid, b.b_gid]);
    if (d.amal === 'qabul') {
      await db.prepare(`UPDATE battlelar SET holat = 'qabul', kutadi = NULL WHERE id = ?`).bind(b.id).run();
      await battleElon(db, url, b.id, n[b.a_gid], n[b.b_gid], b.vaqt);
    } else if (d.amal === 'rad') {
      await db.prepare(`UPDATE battlelar SET holat = 'rad', kutadi = NULL WHERE id = ?`).bind(b.id).run();
      const boshqa = n[b.kutadi === 'a' ? b.b_gid : b.a_gid];
      if (boshqa && boshqa.sardor_tel) await pushTellarga(db, url.origin, [boshqa.sardor_tel], '⚔️ Chaqiruv rad etildi', (n[tomon] || {}).nom + '-guruh bu safar rad etdi', '/ustoz.html');
    } else if (d.amal === 'vaqt') {
      const vaqt = vaqtNorm(d.vaqt);
      if (!vaqt) return json({ ok: false, xato: 'vaqtni belgilang' }, 400);
      await db.prepare(`UPDATE battlelar SET vaqt = ?, kutadi = ? WHERE id = ?`).bind(vaqt, b.kutadi === 'a' ? 'b' : 'a', b.id).run();
      const boshqa = n[b.kutadi === 'a' ? b.b_gid : b.a_gid];
      if (boshqa && boshqa.sardor_tel) await pushTellarga(db, url.origin, [boshqa.sardor_tel], '⚔️ Boshqa vaqt taklif qilindi',
        (n[tomon] || {}).nom + '-guruh: ' + sanaMatn(vaqt), '/ustoz.html');
    } else return json({ ok: false, xato: 'amal noto‘g‘ri' }, 400);
    return json({ ok: true });
  }
  if (yol === 'battle-och' && request.method === 'POST') {       // belgilangan vaqtda — jonli test ochiladi
    if (!b || b.holat !== 'qabul') return json({ ok: false, xato: 'battle kelishilmagan' }, 400);
    if (!qoladi(gids, b.a_gid) && !qoladi(gids, b.b_gid)) return json({ ok: false, xato: 'bu battle sizniki emas' }, 403);
    if (b.oyin_id) {
      const o = await db.prepare('SELECT id, pin, holat, login FROM oyinlar WHERE id = ?').bind(b.oyin_id).first();
      if (o && o.holat !== 'tugadi') {
        if (o.login !== kim.login && kim.rol !== 'admin') return json({ ok: false, xato: 'Battle’ni boshqa ustoz/sardor ochgan — o‘sha ekrandan boshqariladi', pin: o.pin }, 409);
        return json({ ok: true, oyin_id: o.id, pin: o.pin });
      }
    }
    const soz = jsonOl(b.sozlama, {}), sv = savollarNorm(d.savollar);
    if (!sv.length) return json({ ok: false, xato: 'savollar yo‘q' }, 400);
    const n = await guruhNomlari(db, [b.a_gid, b.b_gid]);
    const oz = { jamoalar: [{ k: 'g' + b.a_gid, nom: n[b.a_gid].nom, gid: b.a_gid }, { k: 'g' + b.b_gid, nom: n[b.b_gid].nom, gid: b.b_gid }], battle_id: b.id };
    if (soz.xavf) oz.xavf = 1;
    if (oraliqNorm(soz.oraliq)) oz.R = oraliqNorm(soz.oraliq);
    const o = await oyinYarat(db, kim, `⚔️ ${n[b.a_gid].nom} vs ${n[b.b_gid].nom}`, soz.vaqt_s || 15, sv, oz, null);
    if (!o) return json({ ok: false, xato: 'PIN yaratib bo‘lmadi' }, 500);
    await db.prepare('UPDATE battlelar SET oyin_id = ? WHERE id = ?').bind(o.id, b.id).run();
    // qatnashaman deganlarga va ikkala guruhga — «battle boshlandi, PIN …»
    await pushTellarga(db, url.origin, await guruhAzoTellar(db, [b.a_gid, b.b_gid]), '⚔️ Battle boshlanmoqda!',
      `${n[b.a_gid].nom} vs ${n[b.b_gid].nom} · PIN ${o.pin}`, '/jonli.html?pin=' + o.pin);
    return json({ ok: true, oyin_id: o.id, pin: o.pin });
  }
  if (yol === 'battle-bekor' && request.method === 'POST') {
    if (!b || (b.holat !== 'taklif' && b.holat !== 'qabul')) return json({ ok: false, xato: 'bekor qilib bo‘lmaydi' }, 400);
    if (!qoladi(gids, b.a_gid) && !qoladi(gids, b.b_gid)) return json({ ok: false, xato: 'bu battle sizniki emas' }, 403);
    if (b.turnir_id && kim.rol === 'sardor') return json({ ok: false, xato: 'turnir battle’ini faqat ustoz bekor qiladi' }, 403);
    await db.prepare(`UPDATE battlelar SET holat = 'bekor', kutadi = NULL WHERE id = ?`).bind(b.id).run();
    return json({ ok: true });
  }
  if (yol === 'turnirlar') {
    const r = (await db.prepare(`SELECT * FROM turnirlar ORDER BY id DESC LIMIT 20`).all()).results || [];
    const chiq = [];
    for (const t of r) {
      const o = await turnirOchiq(db, t);
      const ishtirok = o.raundlar[0].some(m => qoladi(gids, m.a) || qoladi(gids, m.b));
      if (gids === null || ishtirok) chiq.push(o);
    }
    return json({ ok: true, turnirlar: chiq, menikilar: gids });
  }
  if (kim.rol === 'sardor') return json({ ok: false, xato: 'sardor buni qila olmaydi' }, 403);
  if (yol === 'turnir-yarat' && request.method === 'POST') {
    let g = [...new Set((Array.isArray(d.guruhlar) ? d.guruhlar : []).map(Number).filter(Boolean))].slice(0, 16);
    if (g.length < 2) return json({ ok: false, xato: 'kamida 2 ta guruh tanlang' }, 400);
    for (const x of g) if (!qoladi(gids, x)) return json({ ok: false, xato: 'faqat o‘z guruhlaringiz bilan turnir ochasiz' }, 403);
    const n = await guruhNomlari(db, g);
    if (Object.keys(n).length !== g.length) return json({ ok: false, xato: 'guruh topilmadi' }, 404);
    if (d.aralash) g = g.map(x => [Math.random(), x]).sort((a, b) => a[0] - b[0]).map(x => x[1]);
    let o = 1; while (o < g.length) o *= 2;
    // juftsizlar (bye) birinchi bosqichda kuchliroq joyga: 1-guruh juftsiz o'tadi
    const joy = Array(o).fill(null);
    let k = 0; for (let i = 0; i < o / 2 && k < g.length; i++) joy[2 * i] = g[k++];
    for (let i = 0; i < o / 2 && k < g.length; i++) joy[2 * i + 1] = g[k++];
    const raundlar = [];
    for (let s = o / 2; s >= 1; s /= 2) raundlar.push(Array.from({ length: s }, () => ({ a: null, b: null, bid: null, golib: null, ball: null })));
    raundlar[0].forEach((m, i) => { m.a = joy[2 * i]; m.b = joy[2 * i + 1]; });
    const sz = d.sozlama || {}, soz = { qism: (Array.isArray(sz.qism) ? sz.qism : []).map(Number).filter(x => x >= 0).slice(0, 60),
      son: Math.max(5, Math.min(40, Math.round(Number(sz.son)) || 15)), vaqt_s: Math.max(5, Math.min(60, Math.round(Number(sz.vaqt_s)) || 15)),
      tur: ['tanlov', 'tn', 'yoz'].includes(sz.tur) ? sz.tur : 'tanlov', yon: ['ar-uz', 'uz-ar', 'aralash'].includes(sz.yon) ? sz.yon : 'ar-uz',
      oraliq: oraliqNorm(sz.oraliq) || OYIN_R };
    const birinchi = n[g[0]];
    const r = await db.prepare(`INSERT INTO turnirlar (nom, univ, kurs, holat, jadval, yaratdi, yaratilgan) VALUES (?, ?, ?, 'davom', ?, ?, ?)`)
      .bind(matn(d.nom, 80) || (birinchi.kurs ? birinchi.kurs + '-kurs turniri' : 'Turnir'), birinchi.univ || 'jtu', birinchi.kurs || 0,
        JSON.stringify({ raundlar, sozlama: soz }), kim.nom, hozirIso()).run();
    const id = (r.meta && r.meta.last_row_id) || r.lastInsertRowid;
    const t = await db.prepare('SELECT * FROM turnirlar WHERE id = ?').bind(id).first();
    await turnirYoy(db, t, jsonOl(t.jadval, {}));
    await chatTizim(db, '🏆 Turnir', `«${t.nom}» boshlandi! Qatnashadi: ${g.map(x => n[x].nom).join(', ')}. Omad! 💪`);
    return json({ ok: true, id });
  }
  if (yol === 'turnir-vaqt' && request.method === 'POST') {      // juftga vaqt belgilash → battle (darrov kelishilgan)
    const t = await db.prepare('SELECT * FROM turnirlar WHERE id = ?').bind(Number(d.tid)).first();
    if (!t || t.holat !== 'davom') return json({ ok: false, xato: 'turnir topilmadi' }, 404);
    const j = jsonOl(t.jadval, {}), m = j.raundlar[Number(d.r)] && j.raundlar[Number(d.r)][Number(d.m)];
    if (!m || !m.a || !m.b || m.golib) return json({ ok: false, xato: 'bu juft hali tayyor emas' }, 400);
    if (!qoladi(gids, m.a) && !qoladi(gids, m.b)) return json({ ok: false, xato: 'ruxsat yo‘q' }, 403);
    const vaqt = vaqtNorm(d.vaqt);
    if (!vaqt) return json({ ok: false, xato: 'vaqtni belgilang' }, 400);
    const n = await guruhNomlari(db, [m.a, m.b]);
    if (m.bid) await db.prepare('UPDATE battlelar SET vaqt = ? WHERE id = ?').bind(vaqt, m.bid).run();
    else {
      const r = await db.prepare(`INSERT INTO battlelar (a_gid, b_gid, holat, vaqt, sozlama, turnir_id, raund, juft, yaratdi, yaratilgan) VALUES (?, ?, 'qabul', ?, ?, ?, ?, ?, ?, ?)`)
        .bind(m.a, m.b, vaqt, JSON.stringify(j.sozlama || {}), t.id, Number(d.r), Number(d.m), kim.nom, hozirIso()).run();
      m.bid = (r.meta && r.meta.last_row_id) || r.lastInsertRowid;
      await db.prepare('UPDATE turnirlar SET jadval = ? WHERE id = ?').bind(JSON.stringify(j), t.id).run();
    }
    await battleElon(db, url, m.bid, n[m.a], n[m.b], vaqt, t.nom);
    return json({ ok: true, bid: m.bid });
  }
  if (yol === 'turnir-ochir' && request.method === 'POST') {
    const t = await db.prepare('SELECT * FROM turnirlar WHERE id = ?').bind(Number(d.tid)).first();
    if (!t) return json({ ok: false, xato: 'turnir topilmadi' }, 404);
    if (kim.rol !== 'admin' && t.yaratdi !== kim.nom) return json({ ok: false, xato: 'turnirni uni ochgan ustoz yoki admin o‘chiradi' }, 403);
    await db.batch([db.prepare(`UPDATE battlelar SET holat = 'bekor' WHERE turnir_id = ? AND holat IN ('taklif', 'qabul')`).bind(t.id),
      db.prepare('DELETE FROM turnirlar WHERE id = ?').bind(t.id)]);
    return json({ ok: true });
  }
  return json({ ok: false, xato: 'nomalum so‘rov' }, 404);
}
// battle kelishildi — ikkala guruhga push va chatda e'lon
async function battleElon(db, url, id, A, B, vaqt, turnir) {
  const m = `${A.nom} vs ${B.nom} · ${sanaMatn(vaqt)}`;
  await chatTizim(db, '⚔️ Battle', (turnir ? `«${turnir}»: ` : 'Battle e‘lon qilindi: ') + m + '. Guruhingiz sharafini himoya qiling! 💪');
  await pushTellarga(db, url.origin, await guruhAzoTellar(db, [A.id, B.id]), '⚔️ Battle: ' + A.nom + ' vs ' + B.nom, sanaMatn(vaqt) + ' — tayyorlaning!', '/index.html?guruhim=1');
}



/* ================================================================
   UMUMIY CHAT — sayt foydalanuvchilari uchun bitta umumiy suhbat

   Kim yozadi: saytga kirgan har kim (ismi va telefoni bilan),
   ustoz va admin — kabinetdan (📢 belgi bilan). Admin xabarni
   o'chiradi va yozuvchini bloklaydi.
   «Onlayn» — so'nggi 2 daqiqada saytni ochib turganlar. Brauzer har
   45 soniyada (chat ochiq bo'lsa — 4 soniyada) yangi xabarlarni
   so'raydi; onlayn belgisi bazaga ko'pi bilan daqiqada bir marta
   yoziladi (D1 bepul limiti uchun).
   Bildirishnoma faqat sayt ochiq turganda (sayt ichida) chiqadi.
   ================================================================ */
const CHAT_ONLAYN_MS = 2 * 60 * 1000;
const chatXabar = x => ({ id: x.id, ism: x.ism, rol: x.rol, matn: x.matn, vaqt: x.vaqt, tahrir: !!x.tahrir, men: false });
const sha256 = async t => hex(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(String(t))));
const chatKalit = k => /^[0-9a-f]{32,64}$/.test(String(k || '')) ? k : null;

async function chatApi(request, url, env) {
  let db;
  try { db = await baza(env); } catch (e) { return json({ ok: false, xato: 'baza xatosi' }); }
  if (!db) return json({ ok: false, yoqilgan: false, xato: 'D1 baza ulanmagan (BAZA)' });
  const yol = url.pathname.slice('/api/c/'.length), hozir = Date.now();
  let d = {};
  if (request.method === 'POST') { try { d = await request.json(); } catch (e) { d = {}; } }
  const royxat = async (keyin, tel) => {
    const r = keyin > 0
      ? (await db.prepare('SELECT * FROM chat WHERE id > ? AND ochirildi = 0 ORDER BY id LIMIT 100').bind(keyin).all()).results || []
      : ((await db.prepare('SELECT * FROM chat WHERE ochirildi = 0 ORDER BY id DESC LIMIT 60').all()).results || []).reverse();
    return r.map(x => Object.assign(chatXabar(x), { men: !!tel && x.tel === tel && x.rol === 'talaba' }));
  };
  const onlayn = async () => (await db.prepare('SELECT ism FROM chat_onlayn WHERE vaqt > ? ORDER BY vaqt DESC LIMIT 200').bind(hozir - CHAT_ONLAYN_MS).all()).results || [];
  try {
    /* ---------------- sayt foydalanuvchisi ---------------- */
    if (yol === 'h') {                                   // yangi xabarlar + onlayn (va «men shu yerdaman»)
      const tel = telNorm(url.searchParams.get('tel')), ism = matn(url.searchParams.get('ism'), 60);
      if (tel && ism) {
        const b = await db.prepare('SELECT vaqt FROM chat_onlayn WHERE tel = ?').bind(tel).first();
        if (!b || hozir - b.vaqt > 60000)
          await db.prepare(`INSERT INTO chat_onlayn (tel, ism, vaqt) VALUES (?, ?, ?) ON CONFLICT(tel) DO UPDATE SET ism = excluded.ism, vaqt = excluded.vaqt`)
            .bind(tel, ism, hozir).run();
      }
      const keyin = Number(url.searchParams.get('keyin')) || 0;
      const javob = { ok: true, hozir, xabarlar: await royxat(keyin, tel) };
      // ozg — oldingi so'rov vaqti: shundan beri tahrirlangan yoki o'chirilgan xabarlar
      const ozg = Number(url.searchParams.get('ozg')) || 0;
      if (ozg > 0 && keyin > 0)
        javob.ozgarish = ((await db.prepare('SELECT id, matn, tahrir, ochirildi FROM chat WHERE ozgardi > ? AND id <= ? ORDER BY id LIMIT 300')
          .bind(ozg - 2000, keyin).all()).results || []).map(x => ({ id: x.id, matn: x.matn, tahrir: !!x.tahrir, ochirildi: !!x.ochirildi }));
      const oxirgi = await db.prepare('SELECT MAX(id) AS id FROM chat').first();
      javob.oxirgi = (oxirgi && oxirgi.id) || 0;
      if (url.searchParams.get('onlayn')) { const o = await onlayn(); javob.onlayn = o.length; javob.ismlar = o.slice(0, 40).map(x => x.ism); }
      else javob.onlayn = (await db.prepare('SELECT COUNT(*) AS n FROM chat_onlayn WHERE vaqt > ?').bind(hozir - CHAT_ONLAYN_MS).first()).n;
      return json(javob);
    }
    /* push-bildirishnoma: faqat ustoz/admin e'lonlari uchun */
    if (yol === 'push-kalit') return json({ ok: true, kalit: (await vapidKalit(db)).pub });
    if (yol === 'obuna' && request.method === 'POST') {
      const o = d.obuna || {}, k = o.keys || {};
      if (!pushManzilmi(o.endpoint) || !/^[A-Za-z0-9_-]{80,100}$/.test(k.p256dh || '') || !/^[A-Za-z0-9_-]{16,32}$/.test(k.auth || ''))
        return json({ ok: false, xato: 'obuna noto‘g‘ri' }, 400);
      await db.prepare(`INSERT INTO push_obuna (endpoint, p256dh, auth, tel, vaqt) VALUES (?, ?, ?, ?, ?)
        ON CONFLICT(endpoint) DO UPDATE SET p256dh = excluded.p256dh, auth = excluded.auth, tel = excluded.tel, vaqt = excluded.vaqt`)
        .bind(o.endpoint, k.p256dh, k.auth, telNorm(d.tel), hozir).run();
      return json({ ok: true });
    }
    if (yol === 'obuna-bekor' && request.method === 'POST') {
      await db.prepare('DELETE FROM push_obuna WHERE endpoint = ?').bind(String(d.endpoint || '')).run();
      return json({ ok: true });
    }
    if (yol === 'elon-oxirgi') {                         // xizmat ishchisi (sw.js) uchun: shifrlanmagan push kelsa
      const x = await db.prepare(`SELECT * FROM chat WHERE rol != 'talaba' AND ochirildi = 0 ORDER BY id DESC LIMIT 1`).first();
      return json({ ok: true, elon: x ? chatXabar(x) : null });
    }
    if (yol === 'yoz' && request.method === 'POST') {
      const tel = telNorm(d.tel), ism = matn(d.ism, 60), m = matn(d.matn, 300).replace(/\s+/g, ' ');
      if (!tel || ism.length < 2) return json({ ok: false, xato: 'Saytga ismingiz va telefoningiz bilan kiring' }, 400);
      if (!m) return json({ ok: false, xato: 'Xabar bo‘sh' }, 400);
      if (await db.prepare('SELECT 1 AS bor FROM chat_blok WHERE tel = ?').bind(tel).first())
        return json({ ok: false, xato: 'Sizga chatda yozish cheklangan' }, 403);
      const oldin = await db.prepare(`SELECT vaqt FROM chat WHERE tel = ? AND rol = 'talaba' ORDER BY id DESC LIMIT 1`).bind(tel).first();
      if (oldin && hozir - oldin.vaqt < 5000) return json({ ok: false, xato: 'Biroz kuting — 5 soniyada bitta xabar' }, 429);
      const k = chatKalit(d.kalit);
      await db.prepare(`INSERT INTO chat (tel, ism, rol, matn, vaqt, kalit) VALUES (?, ?, 'talaba', ?, ?, ?)`)
        .bind(tel, ism, m, hozir, k ? await sha256(k) : null).run();
      await chatTozala(db, hozir);
      return json({ ok: true });
    }
    if ((yol === 'tahrir' || yol === 'ochir-meniki') && request.method === 'POST') {   // o'z xabarini (o'sha qurilmadan)
      const tel = telNorm(d.tel), k = chatKalit(d.kalit);
      const x = await db.prepare(`SELECT * FROM chat WHERE id = ? AND rol = 'talaba' AND ochirildi = 0`).bind(Number(d.id)).first();
      if (!x || !tel || x.tel !== tel) return json({ ok: false, xato: 'Xabar topilmadi' }, 404);
      if (x.kalit && (!k || await sha256(k) !== x.kalit))
        return json({ ok: false, xato: 'Bu xabar boshqa qurilmadan yozilgan — faqat o‘sha qurilmadan o‘zgartirsa bo‘ladi' }, 403);
      if (yol === 'ochir-meniki') {
        await db.prepare(`UPDATE chat SET ochirildi = 1, matn = '', ozgardi = ? WHERE id = ?`).bind(hozir, x.id).run();
        return json({ ok: true });
      }
      const m = matn(d.matn, 300).replace(/\s+/g, ' ');
      if (!m) return json({ ok: false, xato: 'Xabar bo‘sh' }, 400);
      await db.prepare('UPDATE chat SET matn = ?, tahrir = 1, ozgardi = ? WHERE id = ?').bind(m, hozir, x.id).run();
      return json({ ok: true, matn: m });
    }

    /* ---------------- ustoz / admin (kabinet sessiyasi) ---------------- */
    const kim = await kimSorayapti(request, url, db);
    if (!kim) return json({ ok: false, xato: 'kirish kerak', kirish: true }, 401);
    if (kim.rol === 'sardor') return json({ ok: false, xato: 'umumiy chatga faqat ustoz va admin e‘lon yozadi' }, 403);
    if (yol === 'kabinet') {                             // kabinetdagi chat: telefonlar ham (faqat admin)
      const keyin = Number(url.searchParams.get('keyin')) || 0;
      const r = keyin > 0
        ? (await db.prepare('SELECT * FROM chat WHERE id > ? AND ochirildi = 0 ORDER BY id LIMIT 200').bind(keyin).all()).results || []
        : ((await db.prepare('SELECT * FROM chat WHERE ochirildi = 0 ORDER BY id DESC LIMIT 100').all()).results || []).reverse();
      const blok = kim.rol === 'admin' ? ((await db.prepare('SELECT tel FROM chat_blok').all()).results || []).map(x => x.tel) : [];
      const o = await onlayn();
      return json({ ok: true, hozir, onlayn: o.length, ismlar: o.slice(0, 60).map(x => x.ism), bloklar: blok,
        xabarlar: r.map(x => Object.assign(chatXabar(x), { meniki: x.rol !== 'talaba' && !!x.login && x.login === kim.login },
          kim.rol === 'admin' ? { tel: x.tel, blok: blok.includes(x.tel) } : {})) });
    }
    if (yol === 'elon' && request.method === 'POST') {    // ustoz/admin yozadi — 📢 belgi bilan
      const m = matn(d.matn, 500).replace(/[ \t]+/g, ' ');
      if (!m) return json({ ok: false, xato: 'Xabar bo‘sh' }, 400);
      const r = await db.prepare('INSERT INTO chat (tel, ism, rol, matn, vaqt, login) VALUES (NULL, ?, ?, ?, ?, ?)').bind(kim.nom, kim.rol, m, hozir, kim.login).run();
      await chatTozala(db, hozir);
      const n = (await db.prepare('SELECT COUNT(*) AS n FROM push_obuna').first()).n;
      return json({ ok: true, id: (r.meta && r.meta.last_row_id) || r.lastInsertRowid, obunachilar: n });
    }
    if (yol === 'push-yubor' && request.method === 'POST') {   // {id, keyin} — 30 tadan bo'lib (bepul rejada 50 so'rov chegarasi)
      const x = await db.prepare(`SELECT * FROM chat WHERE id = ? AND rol != 'talaba' AND ochirildi = 0`).bind(Number(d.id)).first();
      if (!x) return json({ ok: false, xato: 'e‘lon topilmadi' }, 404);
      const obunalar = (await db.prepare('SELECT * FROM push_obuna WHERE endpoint > ? ORDER BY endpoint LIMIT 30').bind(String(d.keyin || '')).all()).results || [];
      const kalit = await vapidKalit(db), yuk = JSON.stringify({ sarlavha: '📢 ' + x.ism, matn: x.matn.slice(0, 180), id: x.id, url: '/index.html?chat=1' });
      let yetdi = 0, ochdi = 0, xato = 0;
      const eskilar = [];
      await Promise.all(obunalar.map(async o => {
        try {
          const j = await pushYubor(o, yuk, kalit, url.origin);
          if (j.status === 404 || j.status === 410) { eskilar.push(o.endpoint); ochdi++; }
          else if (j.ok) yetdi++; else xato++;
        } catch (e) { xato++; }
      }));
      if (eskilar.length) await db.batch(eskilar.map(e => db.prepare('DELETE FROM push_obuna WHERE endpoint = ?').bind(e)));
      return json({ ok: true, yetdi, ochdi, xato, keyingi: obunalar.length === 30 ? obunalar[29].endpoint : null });
    }
    if ((yol === 'elon-tahrir' || yol === 'elon-ochir') && request.method === 'POST') {   // ustoz — o'z e'loni, admin — istalgan e'lon
      const x = await db.prepare(`SELECT * FROM chat WHERE id = ? AND rol != 'talaba' AND ochirildi = 0`).bind(Number(d.id)).first();
      if (!x) return json({ ok: false, xato: 'e‘lon topilmadi' }, 404);
      if (kim.rol !== 'admin' && x.login !== kim.login) return json({ ok: false, xato: 'faqat o‘z e‘loningizni o‘zgartira olasiz' }, 403);
      if (yol === 'elon-ochir') {
        await db.prepare(`UPDATE chat SET ochirildi = 1, matn = '', ozgardi = ? WHERE id = ?`).bind(hozir, x.id).run();
        return json({ ok: true });
      }
      const m = matn(d.matn, 500).replace(/[ \t]+/g, ' ');
      if (!m) return json({ ok: false, xato: 'Xabar bo‘sh' }, 400);
      await db.prepare('UPDATE chat SET matn = ?, tahrir = 1, ozgardi = ? WHERE id = ?').bind(m, hozir, x.id).run();
      return json({ ok: true });
    }
    if (kim.rol !== 'admin') return json({ ok: false, xato: 'bu faqat admin uchun' }, 403);
    if (yol === 'ochir' && request.method === 'POST') {   // admin — istalgan xabar (hammaning ekranidan ham ketadi)
      await db.prepare(`UPDATE chat SET ochirildi = 1, matn = '', ozgardi = ? WHERE id = ?`).bind(hozir, Number(d.id)).run();
      return json({ ok: true });
    }
    if (yol === 'blok' && request.method === 'POST') {    // {tel | id (xabar), blok: true|false}; bloklansa — xabarlari ham o'chadi
      let tel = telNorm(d.tel);
      if (!tel && d.id) {                                   // saytdagi chatdan: telefon ko'rinmaydi — xabar bo'yicha
        const x = await db.prepare(`SELECT tel FROM chat WHERE id = ? AND rol = 'talaba'`).bind(Number(d.id)).first();
        tel = x && x.tel;
      }
      if (!tel) return json({ ok: false, xato: 'telefon noto‘g‘ri' }, 400);
      if (d.blok === false) await db.prepare('DELETE FROM chat_blok WHERE tel = ?').bind(tel).run();
      else await db.batch([db.prepare('INSERT OR IGNORE INTO chat_blok (tel, vaqt) VALUES (?, ?)').bind(tel, hozirIso()),
                           db.prepare(`UPDATE chat SET ochirildi = 1, matn = '', ozgardi = ? WHERE tel = ? AND rol = 'talaba' AND ochirildi = 0`).bind(hozir, tel)]);
      return json({ ok: true });
    }
    return json({ ok: false, xato: 'nomalum so‘rov' }, 404);
  } catch (e) {
    return json({ ok: false, xato: String((e && e.message) || e).slice(0, 160) }, 500);
  }
}
// eski xabarlar: 30 kundan eskisi va 3000 tadan ortig'i o'chadi (har 50-xabarda bir marta)
async function chatTozala(db, hozir) {
  const r = await db.prepare('SELECT MAX(id) AS id FROM chat').first();
  if (!r || !r.id || r.id % 50) return;
  await db.batch([db.prepare('DELETE FROM chat WHERE vaqt < ? OR id <= ? OR (ochirildi = 1 AND ozgardi < ?)').bind(hozir - 30 * 864e5, r.id - 3000, hozir - 864e5),
                  db.prepare('DELETE FROM chat_onlayn WHERE vaqt < ?').bind(hozir - 7 * 864e5)]);
}


/* ================================================================
   PUSH-BILDIRISHNOMA (Web Push) — sayt yopiq bo'lsa ham ustoz/admin
   e'lonlari telefonga keladi. Talabalarning oddiy xabarlari kelmaydi.

   • VAPID kalit juftligi birinchi kerak bo'lganda o'zi yaratiladi va
     D1 dagi «sozlama» jadvalida saqlanadi (Cloudflare'da hech narsa
     sozlash shart emas, maxfiy kalit repoda yo'q).
   • Xabar RFC 8291 (aes128gcm) bo'yicha shifrlanadi — iPhone (Safari,
     bosh ekranga qo'shilgan sayt), Android Chrome, kompyuter.
   • Faqat ma'lum push xizmatlarining manzillariga yuboriladi.
   ================================================================ */
const PUSH_XIZMAT = /^https:\/\/([a-z0-9-]+\.)*(fcm\.googleapis\.com|push\.services\.mozilla\.com|notify\.windows\.com|push\.apple\.com|android\.googleapis\.com)(\/|$)/i;
const pushManzilmi = e => typeof e === 'string' && e.length < 1000 && PUSH_XIZMAT.test(e);
const b64u = b => { let s = ''; new Uint8Array(b).forEach(c => s += String.fromCharCode(c)); return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, ''); };
const b64uOch = s => { s = String(s).replace(/-/g, '+').replace(/_/g, '/'); while (s.length % 4) s += '='; return Uint8Array.from(atob(s), c => c.charCodeAt(0)); };
const ulash = (...q) => { const n = q.reduce((a, b) => a + b.length, 0), r = new Uint8Array(n); let i = 0; q.forEach(b => { r.set(b, i); i += b.length; }); return r; };
const matnB = t => new TextEncoder().encode(t);

const vapidVada = new WeakMap();      // har bir baza uchun bir marta
async function vapidKalit(db) {
  if (!vapidVada.has(db)) vapidVada.set(db, (async () => {
    let r = await db.prepare(`SELECT qiymat FROM sozlama WHERE kalit = 'vapid'`).first();
    if (!r) {
      const k = await crypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, ['sign', 'verify']);
      const pub = b64u(await crypto.subtle.exportKey('raw', k.publicKey)), jwk = await crypto.subtle.exportKey('jwk', k.privateKey);
      await db.prepare(`INSERT OR IGNORE INTO sozlama (kalit, qiymat) VALUES ('vapid', ?)`).bind(JSON.stringify({ pub, jwk })).run();
      r = await db.prepare(`SELECT qiymat FROM sozlama WHERE kalit = 'vapid'`).first();   // bir vaqtda ikkitasi yaratsa — bittasi qoladi
    }
    const v = JSON.parse(r.qiymat);
    v.kalit = await crypto.subtle.importKey('jwk', v.jwk, { name: 'ECDSA', namedCurve: 'P-256' }, false, ['sign']);
    return v;
  })().catch(e => { vapidVada.delete(db); throw e; }));
  return vapidVada.get(db);
}
async function vapidSarlavha(endpoint, v, sayt) {
  const bosh = b64u(matnB(JSON.stringify({ typ: 'JWT', alg: 'ES256' })));
  const yuk = b64u(matnB(JSON.stringify({ aud: new URL(endpoint).origin, exp: Math.floor(Date.now() / 1000) + 12 * 3600, sub: sayt })));
  const imzo = await crypto.subtle.sign({ name: 'ECDSA', hash: 'SHA-256' }, v.kalit, matnB(bosh + '.' + yuk));
  return `vapid t=${bosh}.${yuk}.${b64u(imzo)}, k=${v.pub}`;
}
async function hmac(kalit, malumot) {
  const k = await crypto.subtle.importKey('raw', kalit, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  return new Uint8Array(await crypto.subtle.sign('HMAC', k, malumot));
}
// RFC 8291: xabarni qabul qiluvchining kaliti bilan shifrlash (aes128gcm)
async function pushShifrla(matn, p256dh, auth) {
  const ua = b64uOch(p256dh), sir = b64uOch(auth);
  const as = await crypto.subtle.generateKey({ name: 'ECDH', namedCurve: 'P-256' }, true, ['deriveBits']);
  const asPub = new Uint8Array(await crypto.subtle.exportKey('raw', as.publicKey));
  const uaKey = await crypto.subtle.importKey('raw', ua, { name: 'ECDH', namedCurve: 'P-256' }, false, []);
  const umumiy = new Uint8Array(await crypto.subtle.deriveBits({ name: 'ECDH', public: uaKey }, as.privateKey, 256));
  const prkKey = await hmac(sir, umumiy);
  const ikm = await hmac(prkKey, ulash(matnB('WebPush: info\0'), ua, asPub, new Uint8Array([1])));
  const tuz = crypto.getRandomValues(new Uint8Array(16));
  const prk = await hmac(tuz, ikm);
  const cek = (await hmac(prk, ulash(matnB('Content-Encoding: aes128gcm\0'), new Uint8Array([1])))).slice(0, 16);
  const nonce = (await hmac(prk, ulash(matnB('Content-Encoding: nonce\0'), new Uint8Array([1])))).slice(0, 12);
  const aes = await crypto.subtle.importKey('raw', cek, 'AES-GCM', false, ['encrypt']);
  const shifr = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv: nonce }, aes, ulash(matnB(matn), new Uint8Array([2]))));
  const rs = new Uint8Array([0, 0, 16, 0]);                      // 4096
  return ulash(tuz, rs, new Uint8Array([asPub.length]), asPub, shifr);
}
async function pushYubor(o, matn, v, sayt) {
  const tana = await pushShifrla(matn, o.p256dh, o.auth);
  return fetch(o.endpoint, { method: 'POST', body: tana, headers: {
    Authorization: await vapidSarlavha(o.endpoint, v, sayt), TTL: '86400', Urgency: 'high',
    'Content-Encoding': 'aes128gcm', 'Content-Type': 'application/octet-stream' } });
}


/* ================================================================
   BOTLARDA JAVOB BERISH VA YORDAMCHI ADMIN

   • Ikki bot: «tolov» (to'lov boti, /api/bot) va «murojaat»
     (@Akbarali_Umar_bot — saytdagi «Savol va murojaatlar», /api/bot-m,
     MUROJAAT_BOT_TOKEN). Natijalar boti (BOT_TOKEN) bu yerda ishlatilmaydi.
   • O'quvchi yozgan har bir xabar barcha adminlarga yo'naltiriladi
     (asosiy admin — CHAT_ID, qo'shimcha — yordamchilar). Admin o'sha
     xabarga Telegram'da «Reply» qilib yozsa, bot uni O'Z NOMIDAN
     o'quvchiga yuboradi (matn, rasm, ovoz — copyMessage). Boshqa
     adminlarga «↩️ … javob berdi» degan qisqa xabar boradi.
   • Yordamchi qo'shish (faqat «Savol va murojaatlar» botida; to'lov
     boti — faqat asosiy admin): asosiy admin /yordamchi → 15 daqiqalik
     kod; ikkinchi odam shu botga «/admin KOD» yozadi. /yordamchilar —
     ro'yxat, /yordamchi_ochir ID — olib tashlash.
   Xotira — KV (env.DB): javob xaritasi 30 kun saqlanadi.
   ================================================================ */
const MUROJAAT_SALOM = 'Assalomu alaykum! 👋\nSavolingiz yoki murojaatingizni shu yerga yozing — tez orada javob beramiz.';
const botTok = (env, qaysi) => qaysi === 'murojaat' ? murojaatToken(env) : tolovToken(env);
async function tgSo(env, qaysi, metod, body) {
  try {
    const r = await fetch(`https://api.telegram.org/bot${botTok(env, qaysi)}/${metod}`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    return await r.json();
  } catch (e) { return { ok: false }; }
}
async function yordamchilar(env) {
  if (!env.DB) return [];
  try { const r = await env.DB.get('bot:adminlar', 'json'); return Array.isArray(r) ? r : []; } catch (e) { return []; }
}
// to'lov boti — faqat asosiy admin; «Savol va murojaatlar» boti — asosiy admin + yordamchilar
async function adminIdlar(env, qaysi) {
  const r = [String(chat(env))].concat(qaysi === 'murojaat' ? (await yordamchilar(env)).map(x => String(x.id)) : []);
  return [...new Set(r.filter(Boolean))];
}
const adminmi = async (env, qaysi, id) => (await adminIdlar(env, qaysi)).includes(String(id));
const asosiyAdmin = (env, id) => String(id) === String(chat(env));
const xaritaKalit = (qaysi, admin, msg) => `jv:${qaysi}:${admin}:${msg}`;
// o'quvchiga «qabul qilindi» deb 10 daqiqada bir martadan ko'p yozmaymiz
async function birMarta(env, qaysi, suhbat) {
  if (!env.DB) return true;
  const k = `mq:${qaysi}:${suhbat}`;
  try { if (await env.DB.get(k)) return false; await env.DB.put(k, '1', { expirationTtl: 600 }); } catch (e) {}
  return true;
}
async function adminlargaYetkaz(env, qaysi, m, izoh, ism) {
  const qiymat = JSON.stringify({ u: String(m.chat.id), ism: ism || '' });
  for (const a of await adminIdlar(env, qaysi)) {
    const f = await tgSo(env, qaysi, 'forwardMessage', { chat_id: a, from_chat_id: m.chat.id, message_id: m.message_id });
    // murojaat botida — faqat xabarning o'zi (unga Reply qilinadi); izoh faqat forward bo'lmasa
    const h = qaysi === 'murojaat' && f.ok ? {} : await tgSo(env, qaysi, 'sendMessage', Object.assign({ chat_id: a, text: izoh, parse_mode: 'HTML' },
      f.ok ? { reply_to_message_id: f.result.message_id } : {}));
    if (!env.DB) continue;
    for (const x of [f, h]) if (x.ok && x.result && x.result.message_id)
      try { await env.DB.put(xaritaKalit(qaysi, a, x.result.message_id), qiymat, { expirationTtl: 30 * 86400 }); } catch (e) {}
  }
}
// admin o'quvchining xabariga «Reply» qildi → o'quvchiga bot nomidan
async function adminJavob(env, qaysi, suhbat, m, matnQator) {
  if (!m.reply_to_message || matnQator.startsWith('/')) return false;
  let x = null;
  try { x = env.DB && await env.DB.get(xaritaKalit(qaysi, suhbat, m.reply_to_message.message_id), 'json'); } catch (e) {}
  if (!x) {
    await tgSo(env, qaysi, 'sendMessage', { chat_id: suhbat, reply_to_message_id: m.message_id, parse_mode: 'HTML',
      text: '⚠️ Bu xabar kimga ekanini topa olmadim. O‘quvchidan kelgan xabarga yoki uning ostidagi izohga <b>Reply</b> qiling.' });
    return true;
  }
  const r = await tgSo(env, qaysi, 'copyMessage', { chat_id: x.u, from_chat_id: suhbat, message_id: m.message_id });
  // murojaat botida yetib borgani haqida xabar yozilmaydi — faqat yetib bormasa ogohlantiramiz
  if (!r.ok || qaysi !== 'murojaat')
    await tgSo(env, qaysi, 'sendMessage', { chat_id: suhbat, reply_to_message_id: m.message_id,
      text: r.ok ? '✅ Yuborildi' + (x.ism ? ': ' + x.ism : '') : '❌ Yuborib bo‘lmadi — o‘quvchi botni bloklagan bo‘lishi mumkin.' });
  if (r.ok) {
    const kim = tgEsc([m.from && m.from.first_name, m.from && m.from.last_name].filter(Boolean).join(' ')) || 'Admin';
    const qisqa = tgEsc((matnQator || (m.photo ? '🖼 rasm' : m.voice ? '🎤 ovozli xabar' : '📎 fayl')).slice(0, 120));
    for (const a of await adminIdlar(env, qaysi)) if (a !== String(suhbat))
      await tgSo(env, qaysi, 'sendMessage', { chat_id: a, parse_mode: 'HTML', text: `↩️ <b>${kim}</b> javob berdi${x.ism ? ' → ' + tgEsc(x.ism) : ''}:\n«${qisqa}»` });
  }
  return true;
}
// «/admin KOD» — yordamchi bo'lish (har qanday botdan)
async function yordamchiQoshil(env, qaysi, suhbat, m, matnQator) {
  const t = matnQator.match(/^\/admin(?:@\S+)?\s+([A-Z0-9]{6})$/i);
  if (!t || !env.DB) return false;
  const kod = t[1].toUpperCase(), bor = await env.DB.get('bot:ykod:' + kod);
  if (!bor) { await tgSo(env, qaysi, 'sendMessage', { chat_id: suhbat, text: 'Kod noto‘g‘ri yoki muddati o‘tgan. Asosiy admindan yangi kod so‘rang.' }); return true; }
  await env.DB.delete('bot:ykod:' + kod);
  const ism = [m.from && m.from.first_name, m.from && m.from.last_name].filter(Boolean).join(' ') || 'Yordamchi';
  const r = (await yordamchilar(env)).filter(x => String(x.id) !== String(suhbat));
  r.push({ id: String(suhbat), ism, user: m.from && m.from.username || '', sana: bugunSana() });
  await env.DB.put('bot:adminlar', JSON.stringify(r));
  await tgSo(env, qaysi, 'sendMessage', { chat_id: suhbat, parse_mode: 'HTML', text: '✅ Siz endi <b>yordamchi admin</b>siz.\n\n' +
    'Shu botga yozilgan murojaatlar endi sizga ham keladi. Javob berish uchun o‘quvchining xabariga <b>Reply</b> qilib yozing — bot o‘z nomidan yuboradi.' });
  await tgSo(env, qaysi, 'sendMessage', { chat_id: chat(env), parse_mode: 'HTML', text: `👥 Yangi yordamchi admin: <b>${tgEsc(ism)}</b> (ID ${suhbat})` });
  return true;
}
// asosiy admin uchun pastdagi doimiy tugmalar (buyruq yozish shart emas)
const YT_QOSH = '➕ Yordamchi qo‘shish', YT_ROYXAT = '👥 Yordamchilar';
const adminTugmalar = () => ({ keyboard: [[{ text: YT_QOSH }, { text: YT_ROYXAT }]], resize_keyboard: true, is_persistent: true });
// tugma matni yoki «/» siz yozilgan so'z ham buyruq hisoblanadi
function yordamchiBuyruqNomi(matnQator) {
  const t = matnQator.trim().toLowerCase().replace(/[‘’ʼ`']/g, '');
  if (t === YT_QOSH.toLowerCase().replace(/[‘’ʼ`']/g, '') || /^\/?yordamchi(@\S+)?( qoshish)?$/.test(t) || t === '/admin') return '/yordamchi';
  if (t === YT_ROYXAT.toLowerCase() || /^\/?yordamchilar(@\S+)?$/.test(t)) return '/yordamchilar';
  if (/^\/?yordamchi_ochir(@\S+)?(\s|$)/.test(t)) return '/yordamchi_ochir';
  return '';
}
async function yordamchiBuyruq(env, qaysi, suhbat, matnQator) {
  const b = matnQator.trim().split(/\s+/), buyruq = yordamchiBuyruqNomi(matnQator);
  if (!buyruq) return false;
  const yoz = (text, qosh) => tgSo(env, qaysi, 'sendMessage', Object.assign({ chat_id: suhbat, text, parse_mode: 'HTML' }, qosh || {}));
  if (!asosiyAdmin(env, suhbat)) { await yoz('Yordamchilarni faqat asosiy admin boshqaradi.'); return true; }
  if (!env.DB) { await yoz('Baza (KV, <code>DB</code>) ulanmagan — yordamchi qo‘shib bo‘lmaydi.'); return true; }
  if (buyruq === '/yordamchi') {
    const kod = [...crypto.getRandomValues(new Uint8Array(6))].map(x => 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'[x % 32]).join('');
    await env.DB.put('bot:ykod:' + kod, '1', { expirationTtl: 900 });
    await yoz(`<b>Yordamchi qo‘shish</b>\n\n1. Ikkinchi odam Telegram'da shu botni ochib, <b>/start</b> bossin.\n2. Keyin botga shu xabarni yuborsin (bosib nusxalanadi):\n\n<code>/admin ${kod}</code>\n\nKod 15 daqiqa amal qiladi va bir marta ishlaydi. U qo‘shilgach, sizga xabar keladi.`, { reply_markup: adminTugmalar() });
  } else if (buyruq === '/yordamchilar') {
    const r = await yordamchilar(env);
    await yoz(r.length ? '<b>Yordamchi adminlar:</b>\n' + r.map(x => `• ${tgEsc(x.ism)}${x.user ? ' @' + tgEsc(x.user) : ''} — ID <code>${x.id}</code> (${x.sana})`).join('\n') +
      '\n\nOlib tashlash uchun pastdagi tugmani bosing.' : 'Hali yordamchi yo‘q. Qo‘shish: «' + YT_QOSH + '» tugmasi.',
      r.length ? { reply_markup: { inline_keyboard: r.map(x => [{ text: '❌ ' + x.ism + ' — olib tashlash', callback_data: 'yo:' + x.id }]) } } : { reply_markup: adminTugmalar() });
  } else {
    if (!await yordamchiOchir(env, qaysi, String(b[1] || ''))) await yoz('Bunday ID li yordamchi yo‘q. Ro‘yxat: «' + YT_ROYXAT + '» tugmasi.');
    else await yoz('✅ Yordamchi olib tashlandi.');
  }
  return true;
}
async function yordamchiOchir(env, qaysi, id) {
  const r = await yordamchilar(env), q = r.filter(x => String(x.id) !== String(id));
  if (!id || q.length === r.length) return false;
  await env.DB.put('bot:adminlar', JSON.stringify(q));
  await tgSo(env, qaysi, 'sendMessage', { chat_id: id, text: 'Siz endi yordamchi admin emassiz.', reply_markup: { remove_keyboard: true } });
  return true;
}
// yordamchilar ro'yxatidagi «❌ olib tashlash» tugmasi
async function murojaatTugma(env, q) {
  const kim = String(q.from && q.from.id || ''), d = String(q.data || '');
  const javob = text => tgSo(env, 'murojaat', 'answerCallbackQuery', { callback_query_id: q.id, text });
  if (!d.startsWith('yo:')) return javob('');
  if (!asosiyAdmin(env, kim)) return javob('Faqat asosiy admin');
  const id = d.slice(3), ism = ((await yordamchilar(env)).find(x => String(x.id) === id) || {}).ism || id;
  if (!await yordamchiOchir(env, 'murojaat', id)) return javob('Allaqachon olib tashlangan');
  await javob('Olib tashlandi');
  if (q.message) await tgSo(env, 'murojaat', 'sendMessage', { chat_id: q.message.chat.id, parse_mode: 'HTML', text: `✅ <b>${tgEsc(ism)}</b> endi yordamchi emas.`, reply_markup: adminTugmalar() });
}

// «Savol va murojaatlar» boti (@Akbarali_Umar_bot): o'quvchi yozadi → adminlar Reply bilan javob beradi
async function murojaatWebhook(request, env) {
  if (request.headers.get('X-Telegram-Bot-Api-Secret-Token') !== kalit(env)) return json({ ok: false }, 403);
  if (!murojaatToken(env)) return json({ ok: true });
  let u;
  try { u = await request.json(); } catch (e) { return json({ ok: true }); }
  if (u && u.callback_query) {
    try { await murojaatTugma(env, u.callback_query); }
    catch (e) { await botQayd(env, 'bot:xato', { vaqt: new Date().toISOString(), xato: String((e && e.stack) || e).slice(0, 400) }); }
    return json({ ok: true });
  }
  const m = u && u.message;
  if (!m || !m.chat) return json({ ok: true });
  const suhbat = String(m.chat.id), matnQator = String(m.text || m.caption || '').trim();
  try {
    const asosiy = asosiyAdmin(env, suhbat), admin = asosiy || await adminmi(env, 'murojaat', suhbat);
    // /api/bot-holat da ko'rinadi: bot kimdan nima oldi va uni kim deb tanidi
    await botQayd(env, 'bot:m-oxirgi', { vaqt: new Date().toISOString(), suhbat, kim: asosiy ? 'asosiy admin' : admin ? 'yordamchi' : 'o‘quvchi', matn: matnQator.slice(0, 40) });
    if (await yordamchiQoshil(env, 'murojaat', suhbat, m, matnQator)) return json({ ok: true });
    if (admin) {
      if (await adminJavob(env, 'murojaat', suhbat, m, matnQator)) return json({ ok: true });
      if (await yordamchiBuyruq(env, 'murojaat', suhbat, matnQator)) return json({ ok: true });
      await tgSo(env, 'murojaat', 'sendMessage', Object.assign({ chat_id: suhbat, parse_mode: 'HTML', text:
        'Bu bot — saytdagi «Savol va murojaatlar». O‘quvchi yozsa, xabari sizga keladi.\n' +
        '<b>Javob berish:</b> o‘quvchining xabariga <b>Reply</b> qilib yozing — bot o‘z nomidan yuboradi.' +
        (asosiy ? '\n\n<b>Ikkinchi admin (yordamchi) qo‘shish:</b> pastdagi «' + YT_QOSH + '» tugmasini bosing.\nTo‘lov buyruqlari (/ruxsat …) — to‘lov botida.' : '') },
        asosiy ? { reply_markup: adminTugmalar() } : {}));
      return json({ ok: true });
    }
    // oddiy odam admin buyrug'ini yozdi — murojaat sifatida yubormaymiz, ID sini ko'rsatamiz
    if (yordamchiBuyruqNomi(matnQator) || /^\/admin(@\S+)?$/i.test(matnQator)) {
      await tgSo(env, 'murojaat', 'sendMessage', { chat_id: suhbat, parse_mode: 'HTML', text:
        'Bu buyruq faqat asosiy admin uchun.\nSizning Telegram ID: <code>' + suhbat + '</code>\n\n' +
        'Yordamchi bo‘lmoqchi bo‘lsangiz, asosiy admin bergan kodni shunday yuboring: <code>/admin KOD</code>' });
      return json({ ok: true });
    }
    if (matnQator.startsWith('/start')) { await tgSo(env, 'murojaat', 'sendMessage', { chat_id: suhbat, text: MUROJAAT_SALOM }); return json({ ok: true }); }
    const kim = tgEsc([m.from && m.from.first_name, m.from && m.from.last_name].filter(Boolean).join(' ')) || 'nomalum';
    const user = m.from && m.from.username ? ' @' + tgEsc(m.from.username) : '';
    let tel = '';
    try { tel = (env.DB && await env.DB.get('tg:' + suhbat)) || ''; } catch (e) {}
    await adminlargaYetkaz(env, 'murojaat', m, `💬 <b>Murojaat</b>\n${kim}${user}` + (tel ? `\n📞 ${tel}` : '') +
      '\n\n↩️ Javob yozish uchun shu xabarga <b>Reply</b> qiling.', kim);
    if (await birMarta(env, 'murojaat', suhbat))
      await tgSo(env, 'murojaat', 'sendMessage', { chat_id: suhbat, text: '✅ Xabaringiz qabul qilindi. Tez orada javob beramiz.' });
  } catch (e) {
    await botQayd(env, 'bot:xato', { vaqt: new Date().toISOString(), suhbat, xato: String((e && e.stack) || e).slice(0, 400) });
  }
  return json({ ok: true });
}
