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

  /** b = { degerler:[sayı], lsl, usl, hedef, urun, karakteristik, alet, sorumlu, tarih:Date|string, birim, simulasyon } */
  function doldur(xml, b) {
    var neden = uygunluk({ n: b.degerler.length, lsl: b.lsl, usl: b.usl, dagilim: b.dagilim });
    if (neden) throw new Error(neden);
    b.degerler.forEach(function (v, i) {
      if (!isFinite(v)) throw new Error((i + 1) + '. ölçüm sayı değil');
      xml = yaz(xml, olcumHucresi(i), Number(v));
    });
    var alet = b.alet || '';
    if (b.simulasyon) xml = yaz(xml, 'J1', 'PROSES VE MAKİNE YETERLİLİĞİ  ·  SİMÜLASYON — gerçek ölçüm değildir');
    xml = yaz(xml, 'A7', 'ÖLÇÜM DEĞERLERİ  (' + b.degerler.length + ' adet' + (alet ? ' · ' + alet : '') + ')');
    var metin = { N8: b.urun, N11: b.karakteristik, N12: alet, N13: b.sorumlu, N15: b.birim || birimBul(b.karakteristik) };
    Object.keys(metin).forEach(function (ref) { if (metin[ref]) xml = yaz(xml, ref, String(metin[ref])); });
    var t = b.tarih ? new Date(b.tarih) : null;
    if (t && !isNaN(t.getTime())) xml = yaz(xml, 'N14', excelTarih(t));
    xml = yaz(xml, 'N19', parseFloat(b.lsl));
    xml = yaz(xml, 'N20', parseFloat(b.usl));
    var h = parseFloat(b.hedef);
    if (isFinite(h)) xml = yaz(xml, 'N18', h);
    return xml;
  }

  /** şablon (ArrayBuffer/Buffer) → doldurulmuş xlsx; tip: 'blob' (tarayıcı) | 'nodebuffer' (test) */
  async function olustur(JSZip, sablon, b, tip) {
    var zip = await JSZip.loadAsync(sablon);
    var yol = 'xl/worksheets/sheet1.xml';
    zip.file(yol, doldur(await zip.file(yol).async('string'), b), { createFolders: false });   // klasör girdisi eklenmesin
    return zip.generateAsync({ type: tip || 'blob', compression: 'DEFLATE',
      mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
  }

  var api = { uygunluk: uygunluk, doldur: doldur, olustur: olustur, olcumHucresi: olcumHucresi, KAPASITE: KAPASITE };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  if (typeof window !== 'undefined') window.fr24Excel = api;
})();
