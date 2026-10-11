// Simülasyon motoru: üretilen veri ERP'nin kendi hesabıyla istenen Cpk aralığında mı, çözünürlüğe uyuyor mu,
// imkânsız istekte anlaşılır sebep veriyor mu.   node test_sim_veri.cjs
const assert = require('assert');
const S = require('./js/sim-veri.js'), C = require('./js/cap-calculations.js'), A = require('./js/attr-cap-calculations.js');
let tohum = 11; const rnd = () => (tohum = (tohum * 16807) % 2147483647) / 2147483647;

// Nicel: ERP'nin gösterdiği Cpk ve Ppk (FR24 Cpk'sı) aralıkta, normal, kararlı, çözünürlüğün katları
for (const o of [
  { n: 125, lsl: 18, usl: 22, hedef: 20, altGrup: 1, cozunurluk: 0.01, cpkAlt: 1.33, cpkUst: 1.67 },
  { n: 125, lsl: 495, usl: 605, altGrup: 5, cozunurluk: 1, cpkAlt: 1.0, cpkUst: 1.1 },
  { n: 50, lsl: 6, usl: 8, altGrup: 1, cozunurluk: 0.001, cpkAlt: 2.0, cpkUst: 2.2 },
]) {
  const t = Date.now(), s = S.nicel(o, C, rnd);
  const R = C.calculateCapability(s.degerler.map(value => ({ value })), { lsl: o.lsl, usl: o.usl, target: o.hedef, subgroupSize: o.altGrup, distribution: 'normal' });
  assert.strictEqual(s.degerler.length, o.n);
  for (const k of [R.within.cpk, R.overall.cpk]) assert(k >= o.cpkAlt && k <= o.cpkUst, `Cpk ${k} aralık dışı (${o.cpkAlt}–${o.cpkUst})`);
  assert(R.normality.ad <= 0.752, 'normal olmalı');
  assert(s.degerler.every(v => Math.abs(v / o.cozunurluk - Math.round(v / o.cozunurluk)) < 1e-6), 'çözünürlük katı');
  console.log(`✔ nicel ${o.lsl}–${o.usl} · Cpk ${R.within.cpk.toFixed(3)} · Ppk ${R.overall.cpk.toFixed(3)} · ${s.deneme} deneme · ${Date.now() - t} ms`);
}
assert.throws(() => S.nicel({ n: 125, lsl: 18, usl: 22, altGrup: 1, cozunurluk: 1, cpkAlt: 1.33, cpkUst: 1.67 }, C, rnd), /10 katı/);
assert.throws(() => S.nicel({ n: 125, lsl: 18, usl: 22, altGrup: 1, cozunurluk: 0.01, cpkAlt: 1.67, cpkUst: 1.33 }, C, rnd), /Cpk aralığı/);
assert.throws(() => S.nicel({ n: 125, lsl: 18, usl: 22, altGrup: 1, cozunurluk: 0.2, cpkAlt: 1.6, cpkUst: 1.61 }, C, rnd), /üretilemedi/);

// Nitel: Cpk eşdeğeri (Z/3) aralıkta, P/U kartı kararlı
for (const o of [{ tur: 'binomial', altGrup: 25, n: 500, cpkAlt: 0.8, cpkUst: 0.95 }, { tur: 'poisson', altGrup: 20, n: 500, cpkAlt: 0.9, cpkUst: 1.1 }]) {
  const s = S.nitel(o, A, rnd), rows = s.rows.map(([n, v]) => o.tur === 'binomial' ? { n, d: v } : { n, c: v });
  const R = o.tur === 'binomial' ? A.binomialCapability(rows) : A.poissonCapability(rows), c = S.nitelCpk(R, A.normInv);
  assert(c >= o.cpkAlt && c <= o.cpkUst && !R.anyOOC, `${o.tur} Cpk eşdeğeri ${c}`);
  console.log(`✔ nitel ${o.tur} · Cpk eşdeğeri ${c.toFixed(3)} · ${s.deneme} deneme`);
}
assert.throws(() => S.nitel({ tur: 'binomial', altGrup: 25, n: 100, cpkAlt: 1.33, cpkUst: 1.67 }, A, rnd), /en az/);   // 2500 parça az
assert(Math.abs(S.hataOrani(1, A.normInv) - 0.0013499) < 2e-6, 'Cpk 1 → %0,135 kusurlu');
console.log('✔ simülasyon motoru testleri geçti');
