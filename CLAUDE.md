# Arab tili — Ibrohimov lug'ati (Akbarali Umar Til Markazi)

Arab tili lug'ati va mashqlari sayti. Egasi bilan muloqot **o'zbek tilida**.

## Tuzilishi

- `deploy/` — saytning o'zi (Cloudflare Pages). **Manba kod yo'qolgan, build yo'q:** tayyor fayllar to'g'ridan-to'g'ri tahrirlanadi.
  - `index.html` — bosh sahifa: lug'at (VOCAB), qidiruv, mashqlar (MANBA/MTUR), guruh, «Mening lug'atim», «Do'stlar bilan o'yin» formasi
  - `fel.html` — fe'l tuslash
  - `jonli.html` — jonli test (talaba tomoni), xona egasi paneli
  - `ustoz.html` — ustoz / admin kabineti
  - `_worker.js` — server (ES module, `export default {fetch}`)
  - `versiya.json`, `sw.js`, `manifest.json`, rasmlar
- `tools/` — testlar (Node). `emul.js` — worker'ni Node'da ishga tushiradi (D1 → node:sqlite, KV → xotira, Telegram → `s.telegram` ga yoziladi).

## Server

- KV `env.DB` (natijalar, to'lov ruxsati `pay:+998…`, lug'at yamog'i `lugat:yamoq`), D1 `env.BAZA` (guruhlar, o'yinlar, sozlama va h.k.).
- Sxema o'zi yaratiladi: `baza(env)` ichida `SXEMA` (CREATE TABLE IF NOT EXISTS) va `USTUNLAR` (ALTER, takror ustun xatosi yutiladi).
- Yo'llar: `/api/g/*` guruh va kabinet (`guruhApi`), `/api/o/*` jonli o'yin (`oyinApi`), `/api/c/*` chat, `/api/lugat` lug'at yamog'i, `/api/natija` natija/hodisa qabul qilish.
- Admin kirishi: login `admin`, parol — Cloudflare'dagi `KABINET_PAROL`. Admin endpointlari `if (!admin) return faqatAdmin();` dan keyin.
- Sozlamalar `sozlama` jadvalida (kalit, qiymat): `xona_ruxsat`, `xona_kun`, `xona_sig`, `xona_soat`, `xona_reyting`.

## Asosiy bo'limlar

- **Jonli test:** vaqt jadvali `t0` dan hisoblanadi (`oyinFaza`); pauza — `o.pauza`, davom etganda `t0` suriladi; savollar orasidagi vaqt `soz.R`.
- **Do'stlar bilan o'yin (xona):** `soz.xona=1`, `soz.egasi` — egasining `oid` (boshqarish kaliti). Natija `natijalar` ga bo'lim «Do‘stlar bilan» bilan yoziladi va reytingga kirmaydi (admin yoqmasa); botga faqat 1–2–3-o'rin boradi.
- **Mening lug'atim:** so'zlar `localStorage` `au_lugatim_v1` + zaxira `shaxsiy_lugat` (tel bo'yicha). Mashqlar `MANBA.tur === 'shaxsiy'`; natijasi reytingga yuborilmaydi.
- **So'z taklifi:** `soz_taklif` jadvali → admin «So‘z takliflari» tabi → qabul qilinsa `lugat:yamoq.qosh` ga qo'shiladi.
- **Universitet taklifi / ustozlik so'rovi:** `universitetlar`, `ustoz_sorov` jadvallari, admin tasdiqlaydi.

## Har o'zgarishdan keyin

1. Versiyani yangilash — **uchala joyda bir xil**: `window.AU_VERSIYA` (`index.html`, `fel.html`) va `versiya.json` dagi `v`.
2. Foydalanuvchiga ko'rinadigan yangilik bo'lsa — `YANGILIKLAR` massiviga yozuv (`index.html` va `fel.html` da bir xil).
3. Testlar: `node tools/<nom>.js` (UI testlari Playwright bilan, global `npm root -g` dan). Barchasi «hammasi joyida» deb tugashi kerak.
4. Saytga yuklash uchun zip: `node tools/zip.js` → `saytga-yuklash.zip` (har doim **to'liq**, qisman yuklash saytni buzadi). Skript versiyalar mosligini tekshiradi va bot tokenini `sirlar.json` dan qo'yadi.

## Xavfsizlik

- **Repo ochiq (public).** Natijalar botining tokeni va `CHAT_ID` kodda yo'q (`_worker.js` da `''`): ular `sirlar.json` da (gitignore'da, `{"BOT_TOKEN","CHAT_ID"}`) yoki Cloudflare muhit o'zgaruvchilarida turadi. **Hech qachon tokenni kodga, testga yoki commit'ga yozmang.**
- `sirlar.json` yo'q bo'lsa (yangi sessiya), `tools/zip.js` tokensiz zip yasaydi — egasidan so'rang: Cloudflare'da `BOT_TOKEN` va `CHAT_ID` berilganmi; berilmagan bo'lsa bot jim qoladi (sayt ishlayveradi).
- `ADMIN_KEY` sahifa kodida ham ko'rinadi (saytda hammaga ochiq) — muhim amallarni unga ishonib qilmaslik (admin sessiyasi orqali).
- `TOLOV_BOT_TOKEN`, `MUROJAAT_BOT_TOKEN`, `TASHRIF_BOT_TOKEN`, `KABINET_PAROL` — faqat Cloudflare Secrets'da, repoga yozilmaydi.
- Zip fayllar (`.gitignore` da) va APK imzo kaliti commit qilinmaydi.
- Saytda parol yo'q: talaba telefon raqami bilan taniladi.
- Mualliflik huquqi bor musiqa (masalan, Kahoot) qo'shilmaydi — kuylar kodda yaratiladi (`OyinOvoz`).
