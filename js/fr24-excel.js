/**
 * FR24 Proses Yeterliliği formu — Excel dışa aktarma.
 * Şablon (templates/fr24-sablon.xlsx) firmanın FR24 formudur: formüller, grafikler, biçim ve antet içinde
 * hazır gelir. Burada yalnız DEĞER hücreleri yazılır (ölçümler, tanımlama, şartname); Excel açılışta her
 * şeyi yeniden hesaplar (fullCalcOnLoad). Şablonu yenilemek: erp-araclar/fr24_sablon_hazirla.py
 *
 * Form 125 bireysel ölçüm, iki taraflı tolerans ve normal / yüzdelik (ISO 22514-2) yöntemiyle çalışır;
 * bu çerçeveye uymayan çalışma (nitel, tek taraflı, >125 ölçüm, Weibull vb.) bu formda dışa aktarılmaz.
 */
(function () {
  var KAPASITE = 125;
  var DAGILIMLAR = { normal: 1, empirical: 1 };   // formun kendi yöntemleri: normal / yüzdelik

  // '' = uygun; değilse kullanıcıya gösterilecek sebep
  function uygunluk(o) {
    var lsl = parseFloat(o.lsl), usl = parseFloat(o.usl);
    if (!isFinite(lsl) || !isFinite(usl)) return 'FR24 formu iki taraflı tolerans ister (LSL ve USL birlikte).';
    if (!(usl > lsl)) return 'USL, LSL\'den büyük olmalı.';
    if (o.n > KAPASITE) return 'FR24 formu en fazla ' + KAPASITE + ' ölçüm alır; bu çalışmada ' + o.n + ' ölçüm var.';
    if (o.n < 2) return 'En az 2 ölçüm gerekli.';
    if (!DAGILIMLAR[String(o.dagilim || 'normal').toLowerCase()])
      return 'FR24 formu normal dağılım ya da ampirik yüzdelik yöntemiyle hesaplar; seçili dağılım (' + o.dagilim + ') bu forma uymaz.';
    return '';
  }

  // ölçüm sırası (0'dan) → hücre: 1–50 B9..B58, 51–100 D9..D58, 101–125 F9..F33
  function olcumHucresi(i) { return 'BDF'.charAt(Math.floor(i / 50)) + (9 + i % 50); }

  function esc(t) { return String(t).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'); }

  // hücrenin biçimini (s) koruyarak değerini yazar; şablonda olmayan hücre = hata (sessizce kaybolmasın)
  function yaz(xml, ref, deger) {
    var m = xml.match(new RegExp('<c r="' + ref + '"( s="\\d+")?[^>]*?(?:/>|>.*?</c>)'));
    if (!m) throw new Error('FR24 şablonunda hücre yok: ' + ref);
    var s = m[1] || '';
    var yeni = typeof deger === 'number'
      ? '<c r="' + ref + '"' + s + '><v>' + deger + '</v></c>'
      : '<c r="' + ref + '"' + s + ' t="inlineStr"><is><t xml:space="preserve">' + esc(deger) + '</t></is></c>';
    return xml.replace(m[0], function () { return yeni; });
  }

  // Excel tarih seri numarası (1900 sistemi), yerel takvim günü
  function excelTarih(d) {
    return Math.round((Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()) - Date.UTC(1899, 11, 30)) / 86400000);
  }

  function birimBul(karakteristik) {
    var m = String(karakteristik || '').match(/\(\s*([a-zA-Zµμ°%²³\/]{1,5})\s*\)\s*$/);
    return m ? m[1] : '';
  }

  // Müşteriye özel kabul eşiği: J43 değerlendirme formülündeki 1.67 / 1.33 ve J51 kabul notu çalışmanınkiyle değişir
  function kabulYaz(xml, k) {
    var y = +k.yeterli, s = +k.sartli, tr = function (v) { return v.toFixed(2).replace('.', ','); };
    var m = xml.match(/<c r="J43"[^>]*>.*?<\/c>/);
    if (!m || m[0].indexOf('&gt;=1.67') < 0 || m[0].indexOf('&gt;=1.33') < 0) throw new Error('FR24 şablonunda değerlendirme formülü (J43) beklenen biçimde değil');
    var yeni = m[0].replace(/&gt;=(1\.67|1\.33)/g, function (_, x) { return '&gt;=' + (x === '1.67' ? y : s); });
    xml = xml.replace(m[0], function () { return yeni; });
    return yaz(xml, 'J51', 'Kabul (müşteri): Cpk ≥ ' + tr(y) + ' yeterli' + (s < y ? ' · ' + tr(s) + '–' + tr(y) + ' müşteri temsilcisiyle gözden geçirilir' : '') + ' · < ' + tr(s) + ' yetersiz');
  }

  /** b = { degerler:[sayı], lsl, usl, hedef, urun, karakteristik, alet, sorumlu, tarih:Date|string, birim, simulasyon, kabul:{yeterli,sartli}|null } */
  function doldur(xml, b) {
    var neden = uygunluk({ n: b.degerler.length, lsl: b.lsl, usl: b.usl, dagilim: b.dagilim });
    if (neden) throw new Error(neden);
    b.degerler.forEach(function (v, i) {
      if (!isFinite(v)) throw new Error((i + 1) + '. ölçüm sayı değil');
      xml = yaz(xml, olcumHucresi(i), Number(v));
    });
    var alet = b.alet || '';
    if (b.simulasyon) xml = yaz(xml, 'J1', 'PROSES VE MAKİNE YETERLİLİĞİ  ·  SİMÜLASYON — gerçek ölçüm değildir');
    if (b.kabul) xml = kabulYaz(xml, b.kabul);
    xml = yaz(xml, 'A7', 'ÖLÇÜM DEĞERLERİ  (' + b.degerler.length + ' adet' + (alet ? ' · ' + alet : '') + ')');
    var metin = { N8: b.urun, N11: b.karakteristik, N12: alet, N13: b.sorumlu, N15: b.birim || birimBul(b.karakteristik), N16: b.yapan };
    Object.keys(metin).forEach(function (ref) { if (metin[ref]) xml = yaz(xml, ref, String(metin[ref])); });
    var t = b.tarih ? new Date(b.tarih) : null;
    if (t && !isNaN(t.getTime())) xml = yaz(xml, 'N14', excelTarih(t));
    xml = yaz(xml, 'N19', parseFloat(b.lsl));
    xml = yaz(xml, 'N20', parseFloat(b.usl));
    var h = parseFloat(b.hedef);
    if (isFinite(h)) xml = yaz(xml, 'N18', h);
    return xml;
  }

  // ── FR24 NİTEL (p / np / u / c) — şablon templates/fr24-nitel-sablon.xlsx (erp-araclar/fr24_nitel_sablon.py).
  // İstatistik, sınırlar, Cpk eşdeğeri, değerlendirme ve grafikler şablonda canlı formül; burada yalnız değerler.
  var NITEL_KAPASITE = 50, KARTLAR = { p: 1, np: 1, u: 1, c: 1 };

  function nitelUygunluk(o) {
    var rows = o.rows || [];
    if (rows.length < 2) return 'En az 2 alt grup gerekli.';
    if (rows.length > NITEL_KAPASITE) return 'FR24 nitel formu en fazla ' + NITEL_KAPASITE + ' alt grup alır; bu çalışmada ' + rows.length + ' var.';
    if (!KARTLAR[o.kart]) return 'Kart türü p, np, u ya da c olmalı.';
    var binom = o.kart === 'p' || o.kart === 'np';
    for (var i = 0; i < rows.length; i++) {
      var n = Number(rows[i][0]), x = Number(rows[i][1]);
      if (!(n > 0) || !(x >= 0) || (binom && x > n)) return (i + 1) + '. alt grupta geçersiz değer (n > 0' + (binom ? ', 0 ≤ kusurlu ≤ n' : ', hata ≥ 0') + ').';
    }
    return '';
  }

  /** b = { rows:[[n, kusurlu|hata]], kart:'p'|'np'|'u'|'c', urun, karakteristik, alet, sorumlu, yapan, tarih, hedef, kabul, simulasyon } */
  function nitelDoldur(xml, b) {
    var neden = nitelUygunluk(b);
    if (neden) throw new Error(neden);
    b.rows.forEach(function (r, i) { xml = yaz(xml, 'B' + (9 + i), Number(r[0])); xml = yaz(xml, 'C' + (9 + i), Number(r[1])); });
    var alet = b.alet || '';
    if (b.simulasyon) xml = yaz(xml, 'J1', 'PROSES VE MAKİNE YETERLİLİĞİ  ·  NİTEL  ·  SİMÜLASYON — gerçek ölçüm değildir');
    xml = yaz(xml, 'A7', 'ALT GRUP VERİLERİ  (' + b.rows.length + ' alt grup' + (alet ? ' · ' + alet : '') + ')');
    var metin = { N8: b.urun, N11: b.karakteristik, N12: alet, N13: b.sorumlu, N14: b.yapan };
    Object.keys(metin).forEach(function (ref) { if (metin[ref]) xml = yaz(xml, ref, String(metin[ref])); });
    var t = b.tarih ? new Date(b.tarih) : null;
    if (t && !isNaN(t.getTime())) xml = yaz(xml, 'N15', excelTarih(t));
    xml = yaz(xml, 'N16', b.kart);
    var h = parseFloat(b.hedef);
    if (isFinite(h)) xml = yaz(xml, 'N20', h);
    if (b.kabul) { xml = yaz(xml, 'N21', +b.kabul.yeterli); xml = yaz(xml, 'N22', +b.kabul.sartli); }
    return xml;
  }

  /** şablon (ArrayBuffer/Buffer) → doldurulmuş xlsx; tip: 'blob' (tarayıcı) | 'nodebuffer' (test); fn: doldur | nitelDoldur */
  async function olustur(JSZip, sablon, b, tip, fn) {
    var zip = await JSZip.loadAsync(sablon);
    var yol = 'xl/worksheets/sheet1.xml';
    zip.file(yol, (fn || doldur)(await zip.file(yol).async('string'), b), { createFolders: false });   // klasör girdisi eklenmesin
    return zip.generateAsync({ type: tip || 'blob', compression: 'DEFLATE',
      mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
  }

  var api = { uygunluk: uygunluk, doldur: doldur, olustur: olustur, olcumHucresi: olcumHucresi, KAPASITE: KAPASITE,
    nitelUygunluk: nitelUygunluk, nitelDoldur: nitelDoldur, NITEL_KAPASITE: NITEL_KAPASITE };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  if (typeof window !== 'undefined') window.fr24Excel = api;
})();
