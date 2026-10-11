// FR24 Excel dışa aktarma: şablona doğru hücrelere yazıyor mu, formüller duruyor mu, uymayan çalışma reddediliyor mu.
//   NODE_PATH=<jszip olan node_modules> node test_fr24.cjs   → üretilen dosyalar %TEMP%\fr24_test_*.xlsx
const fs = require('fs'), os = require('os'), path = require('path'), assert = require('assert');
const JSZip = require('jszip');
const F = require('./js/fr24-excel.js');
const sablon = fs.readFileSync(path.join(__dirname, 'templates/fr24-sablon.xlsx'));

// uygunluk: formun çerçevesi
const ok = { n: 125, lsl: 22, usl: 28, dagilim: 'normal' };
assert.strictEqual(F.uygunluk(ok), '');
assert.strictEqual(F.uygunluk({ ...ok, dagilim: 'empirical' }), '');
assert.match(F.uygunluk({ ...ok, n: 126 }), /125/);
assert.match(F.uygunluk({ ...ok, usl: '' }), /iki taraflı/);
assert.match(F.uygunluk({ ...ok, lsl: null }), /iki taraflı/);
assert.match(F.uygunluk({ ...ok, dagilim: 'weibull' }), /uymaz/);
assert.deepStrictEqual([0, 49, 50, 99, 100, 124].map(F.olcumHucresi), ['B9', 'B58', 'D9', 'D58', 'F9', 'F33']);

let tohum = 7; const rnd = () => (tohum = (tohum * 16807) % 2147483647) / 2147483647;
const normal = (m, s) => m + s * Math.sqrt(-2 * Math.log(rnd())) * Math.cos(2 * Math.PI * rnd());
const hucre = (xml, ref) => (xml.match(new RegExp('<c r="' + ref + '"[^>]*?(?:/>|>.*?</c>)')) || [''])[0];

(async () => {
  const sab = await JSZip.loadAsync(sablon), sabXml = await sab.file('xl/worksheets/sheet1.xml').async('string');
  let x0;
  for (const n of [125, 37]) {
    const degerler = Array.from({ length: n }, () => +normal(25.07, 0.54).toFixed(2));
    const b = { degerler, lsl: '22', usl: '28', hedef: 25, dagilim: 'normal', urun: 'Deneme <Ürün> & Co', karakteristik: 'Kalınlık (mm)',
      alet: 'Kumpas', sorumlu: 'Kalite Sorumlusu', yapan: 'Operatör A', tarih: '2026-10-10' };
    const buf = await F.olustur(JSZip, sablon, b, 'nodebuffer');
    const z = await JSZip.loadAsync(buf), x = await z.file('xl/worksheets/sheet1.xml').async('string');
    x0 = x;
    degerler.forEach((v, i) => assert(hucre(x, F.olcumHucresi(i)).includes('<v>' + v + '</v>'), 'ölçüm ' + (i + 1)));
    if (n < 125) assert(hucre(x, 'F33').endsWith('/>'), 'boş yuva boş kalmalı');
    assert(hucre(x, 'N19').includes('<v>22</v>') && hucre(x, 'N20').includes('<v>28</v>') && hucre(x, 'N18').includes('<v>25</v>'));
    assert(hucre(x, 'N14').includes('<v>46305</v>'), '10.10.2026 = 46305');
    assert(hucre(x, 'N8').includes('Deneme &lt;Ürün&gt; &amp; Co'), 'metin kaçışlı');
    assert(hucre(x, 'N15').includes('>mm<'), 'birim karakteristikten');
    assert(hucre(x, 'N16').includes('Operatör A') && hucre(x, 'J16').includes('Çalışmayı yapan'), 'çalışmayı yapan satırı');
    assert(hucre(x, 'A7').includes(`(${n} adet · Kumpas)`));
    assert(!hucre(x, 'J1').includes('SİMÜLASYON'), 'gerçek veride simülasyon yazmaz');
    assert(hucre(x, 'N9').endsWith('/>') && hucre(x, 'N10').endsWith('/>'), 'ERP\'de olmayan alan boş kalır (uydurulmaz)');
    assert(/s="\d+"/.test(hucre(x, 'B9')) && /s="\d+"/.test(hucre(x, 'N8')), 'biçim korunur');
    assert.strictEqual(x.split('<f').length, sabXml.split('<f').length, 'formül sayısı değişmemeli');
    assert.strictEqual(Object.keys(z.files).length, Object.keys(sab.files).length, 'grafik/çizim/logo dosyaları yerinde');
    const cikti = path.join(os.tmpdir(), `fr24_test_${n}.xlsx`); fs.writeFileSync(cikti, buf);
    console.log('✔', n, 'ölçüm →', cikti);
  }
  const sx = await (await JSZip.loadAsync(await F.olustur(JSZip, sablon, { degerler: [25, 25.1, 24.9], lsl: 22, usl: 28, simulasyon: true }, 'nodebuffer')))
    .file('xl/worksheets/sheet1.xml').async('string');
  assert(hucre(sx, 'J1').includes('SİMÜLASYON — gerçek ölçüm değildir'), 'simülasyon FR24 başlığında görünmeli');
  // müşteri kabulü ≥1,33: değerlendirme formülü ve kabul notu çalışmanın eşiğiyle
  const kb = await F.olustur(JSZip, sablon, { degerler: [25, 25.1, 24.9], lsl: 22, usl: 28, kabul: { yeterli: 1.33, sartli: 1 } }, 'nodebuffer');
  fs.writeFileSync(path.join(os.tmpdir(), 'fr24_test_kabul.xlsx'), kb);
  const kx = await (await JSZip.loadAsync(kb)).file('xl/worksheets/sheet1.xml').async('string');
  assert(hucre(kx, 'J43').includes('&gt;=1.33,"YETERLİ"') && hucre(kx, 'J43').includes('&gt;=1,"ŞARTLI KABUL"'), 'J43 eşikleri');
  assert(hucre(kx, 'J51').includes('Cpk ≥ 1,33 yeterli · 1,00–1,33'), 'J51 kabul notu');
  assert(hucre(x0, 'J43').includes('&gt;=1.67') && !hucre(x0, 'J51').includes('müşteri'), 'varsayılanda PPAP eşiği kalır');
  await assert.rejects(F.olustur(JSZip, sablon, { degerler: new Array(126).fill(25), lsl: 22, usl: 28 }, 'nodebuffer'), /125/);
  console.log('✔ FR24 dışa aktarma testleri geçti');
})().catch(e => { console.error('✘', e.message); process.exit(1); });
