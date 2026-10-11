// FR24 nitel (p/np/u/c) dışa aktarma: değerler doğru hücrelere yazılıyor mu, formüller duruyor mu, uymayan reddediliyor mu.
// Üretilen dosyalar + ERP'nin beklenen değerleri %TEMP%'e yazılır (Excel ile karşılaştırma için).
//   NODE_PATH=<jszip olan node_modules> node test_fr24_nitel.cjs
const fs = require('fs'), os = require('os'), path = require('path'), assert = require('assert');
const JSZip = require('jszip');
const F = require('./js/fr24-excel.js'), S = require('./js/sim-veri.js'), A = require('./js/attr-cap-calculations.js');
const sablon = fs.readFileSync(path.join(__dirname, 'templates/fr24-nitel-sablon.xlsx'));
const hucre = (xml, ref) => (xml.match(new RegExp('<c r="' + ref + '"[^>]*?(?:/>|>.*?</c>)')) || [''])[0];
let tohum = 5; const rnd = () => (tohum = (tohum * 16807) % 2147483647) / 2147483647;

assert.match(F.nitelUygunluk({ rows: [[10, 1]], kart: 'p' }), /en az 2/i);
assert.match(F.nitelUygunluk({ rows: Array(51).fill([10, 1]), kart: 'p' }), /50/);
assert.match(F.nitelUygunluk({ rows: [[10, 1], [10, 11]], kart: 'np' }), /2\. alt grup/);
assert.strictEqual(F.nitelUygunluk({ rows: [[10, 1], [10, 11]], kart: 'c' }), '');          // Poisson'da hata > n olabilir
assert.match(F.nitelUygunluk({ rows: [[10, 1], [10, 2]], kart: 'x' }), /Kart türü/);

(async () => {
  const sab = await JSZip.loadAsync(sablon), sabXml = await sab.file('xl/worksheets/sheet1.xml').async('string');
  const beklenen = {};
  for (const kart of ['p', 'np', 'u', 'c']) {
    const binom = kart === 'p' || kart === 'np';
    let rows = S.nitel({ tur: binom ? 'binomial' : 'poisson', altGrup: 30, n: binom ? 2000 : 400, cpkAlt: 0.9, cpkUst: 1.2 }, A, rnd).rows;
    if (kart === 'p' || kart === 'u') rows = rows.map(([n, x], i) => [n + (i % 5) * 37, x]);   // değişken n
    const b = { rows, kart, urun: 'Deneme <ürün>', karakteristik: 'Görsel kusur', alet: 'Gözle', sorumlu: 'Kalite', yapan: 'Operatör A',
      tarih: '2026-10-11', kabul: { yeterli: 1.33, sartli: 1 } };
    const buf = await F.olustur(JSZip, sablon, b, 'nodebuffer', F.nitelDoldur);
    const x = await (await JSZip.loadAsync(buf)).file('xl/worksheets/sheet1.xml').async('string');
    rows.forEach(([n, v], i) => assert(hucre(x, 'B' + (9 + i)).includes('<v>' + n + '</v>') && hucre(x, 'C' + (9 + i)).includes('<v>' + v + '</v>'), 'satır ' + (i + 1)));
    assert(!/<v>/.test(hucre(x, 'B' + (9 + rows.length))), 'boş yuva boş');
    assert(hucre(x, 'N16').includes('>' + kart + '<') && hucre(x, 'N14').includes('Operatör A') && hucre(x, 'N15').includes('<v>46306</v>'));
    assert(hucre(x, 'N8').includes('Deneme &lt;ürün&gt;') && hucre(x, 'N21').includes('<v>1.33</v>'));
    assert.strictEqual(x.split('<f').length, sabXml.split('<f').length, 'formül sayısı değişmemeli');
    const R = binom ? A.binomialCapability(rows.map(([n, d]) => ({ n, d }))) : A.poissonCapability(rows.map(([n, c]) => ({ n, c })));
    beklenen[kart] = { oran: binom ? R.pbar : R.ubar, cpk: S.nitelCpk(R, A.normInv), kd: (binom ? R.pchart : R.uchart).filter(p => p.ooc).length, k: rows.length };
    fs.writeFileSync(path.join(os.tmpdir(), `fr24n_${kart}.xlsx`), buf);
    console.log('✔', kart, rows.length, 'alt grup · ERP Cpk eşd.', beklenen[kart].cpk.toFixed(3));
  }
  fs.writeFileSync(path.join(os.tmpdir(), 'fr24n_beklenen.json'), JSON.stringify(beklenen));
  console.log('✔ FR24 nitel dışa aktarma testleri geçti');
})().catch(e => { console.error('✘', e.message); process.exit(1); });
