/**
 * Proses yeterliliği SİMÜLASYON motoru — istenen Cpk aralığında veri üretir.
 *  - Nicel: normal dağılımlı ölçüm, cihaz çözünürlüğüne yuvarlanmış. Sonuç sayfasındaki Cpk (alt grup içi σ)
 *    ve Ppk (genel s = FR24 formunun Cpk'sı) ikisi de aralıkta, dağılım normal (A²* ≤ 0,752) ve kontrol kartı
 *    testlerinde ihlal yok çıkana kadar yeniden çekilir; kontrol ERP'nin kendi hesabıyla (cap-calculations.js).
 *  - Nitel: Binomial (kusurlu) / Poisson (hata sayısı); Cpk eşdeğeri = Süreç Z / 3.
 * Üretilen veri gerçek ölçüm değildir: çalışma kalıcı olarak "SİMÜLASYON" işaretlenir
 * (analysis_options.simulasyon → ad, açıklama, sonuç sayfası, FR24 Excel başlığı).
 */
(function () {
  var COZUNURLUKLER = [1, 0.5, 0.1, 0.05, 0.02, 0.01, 0.005, 0.002, 0.001];
  var AD_KRITIK = 0.752;                       // FR24 formu ve ERP: A²* ≤ 0,752 → normal
  var MAKS_DENEME = 20000, MAKS_TAM_HESAP = 120;   // tam hesap ~25–50 ms: en kötü durumda birkaç saniye
  var SECENEK = { withinMethod: 'sbar', useUnbiasing: true, ciLevel: 90, sigmaMult: 3, controlChart: 'auto', nonNormalMethod: 'percentile' };

  function ondalik(r) { var s = String(r); return s.indexOf('.') < 0 ? 0 : s.length - s.indexOf('.') - 1; }
  function normal(rnd) { return Math.sqrt(-2 * Math.log(1 - rnd())) * Math.cos(2 * Math.PI * rnd()); }   // Box-Muller
  function ortSs(x) {
    var m = 0, i; for (i = 0; i < x.length; i++) m += x[i]; m /= x.length;
    var q = 0; for (i = 0; i < x.length; i++) q += (x[i] - m) * (x[i] - m);
    return { m: m, s: Math.sqrt(q / (x.length - 1)) };
  }
  function ara(v, a, b) { return v != null && isFinite(v) && v >= a && v <= b; }
  // aralığın kenarına değil ortasına nişan al: örnekleme sapması sınırı aşmasın
  function hedefCpk(a, b, rnd) { return a + (b - a) * (0.2 + 0.6 * rnd()); }

  function cpkAraligi(o) {
    var a = parseFloat(o.cpkAlt), b = parseFloat(o.cpkUst);
    if (!(a > 0) || !(b >= a) || b > 5) return 'Cpk aralığı 0 ile 5 arasında olmalı (alt ≤ üst).';
    return '';
  }

  function nicelKontrol(o) {
    var n = Number(o.n), lsl = parseFloat(o.lsl), usl = parseFloat(o.usl), r = parseFloat(o.cozunurluk), h = parseFloat(o.hedef);
    if (!(Number.isInteger(n) && n >= 10 && n <= 2000)) return 'Veri adedi 10 ile 2000 arasında olmalı.';
    if (!isFinite(lsl) || !isFinite(usl) || !(usl > lsl)) return 'Simülasyon iki taraflı tolerans ister (LSL < USL).';
    if (isFinite(h) && !(h > lsl && h < usl)) return 'Hedef, LSL ile USL arasında olmalı.';
    if (!(r > 0)) return 'Çözünürlük seçin.';
    if ((usl - lsl) / r < 10 - 1e-9) return 'Tolerans çözünürlüğün en az 10 katı olmalı (' + r + ' çözünürlükte tolerans en az ' + +(10 * r).toFixed(ondalik(r)) + ').';
    return cpkAraligi(o);
  }

  /** o = { n, lsl, usl, hedef?, altGrup, cozunurluk, cpkAlt, cpkUst, secenek? }; C = capCalculations; rnd: [0,1) */
  function nicel(o, C, rnd) {
    var neden = nicelKontrol(o); if (neden) throw new Error(neden);
    rnd = rnd || Math.random;
    var lsl = parseFloat(o.lsl), usl = parseFloat(o.usl), a = parseFloat(o.cpkAlt), b = parseFloat(o.cpkUst);
    var r = parseFloat(o.cozunurluk), d = ondalik(o.cozunurluk), n = Number(o.n);
    var orta = isFinite(parseFloat(o.hedef)) ? parseFloat(o.hedef) : (lsl + usl) / 2;
    var secenek = Object.assign({}, SECENEK, o.secenek || {}, { lsl: lsl, usl: usl, target: o.hedef, subgroupSize: Math.max(1, parseInt(o.altGrup, 10) || 1), distribution: 'normal' });
    var tam = 0;
    for (var deneme = 1; deneme <= MAKS_DENEME && tam < MAKS_TAM_HESAP; deneme++) {
      // merkez ±%5 tolerans kayar (gerçek süreç gibi Cp ≥ Cpk); σ hedef Cpk'dan
      var mu = orta + (rnd() - 0.5) * 0.1 * (usl - lsl);
      var s = Math.min(usl - mu, mu - lsl) / (3 * hedefCpk(a, b, rnd));
      if (!(s > 0)) continue;
      var x = new Array(n);
      for (var i = 0; i < n; i++) x[i] = +(Math.round((mu + s * normal(rnd)) / r) * r).toFixed(d);
      var t = ortSs(x);
      if (!(t.s > 0) || !ara(Math.min(usl - t.m, t.m - lsl) / (3 * t.s), a, b)) continue;      // FR24 Cpk = Ppk
      if (C.andersonDarling(x, t.m, t.s).A2star > AD_KRITIK) continue;
      tam++;                                                     // ucuz elemeden geçti: ERP'nin tam hesabıyla doğrula
      var R = C.calculateCapability(x.map(function (v) { return { value: v }; }), secenek);
      // kararlılık: I / X̄ kartında hiçbir test ihlali yok; MR / R / S kartında sınır dışı nokta (kural 1) yok —
      // aralık kartı çarpık dağılır, "9 nokta aynı tarafta" gibi kurallar rastgele veride de tetiklenir (Minitab varsayılanı da yalnız kural 1)
      var g = R.graph || {}, ust = (g.xbarChart && g.xbarChart.tests) || [], alt = (g.sChart && g.sChart.tests) || [];
      if (ara(R.within.cpk, a, b) && ara(R.overall.cpk, a, b) && R.normality.ad <= AD_KRITIK
          && !ust.length && !alt.some(function (t) { return t.rule === 1; }))
        return { degerler: x, cpk: R.within.cpk, ppk: R.overall.cpk, deneme: deneme };
    }
    throw new Error('Bu ayarlarla Cpk ' + a + '–' + b + ' aralığında normal ve kararlı veri üretilemedi. '
      + 'Çözünürlük tolerans için kaba olabilir (daha ince seçin) ya da aralık çok dar (genişletin).');
  }

  function nitelKontrol(o) {
    var k = Number(o.altGrup), n = Number(o.n);
    if (o.tur !== 'binomial' && o.tur !== 'poisson') return 'Dağılım Binomial ya da Poisson olmalı.';
    if (!(Number.isInteger(k) && k >= 2 && k <= 500)) return 'Alt grup sayısı 2 ile 500 arasında olmalı.';
    if (o.tur === 'binomial' ? !(Number.isInteger(n) && n >= 1) : !(n > 0)) return 'Örnek boyutu (n) pozitif olmalı.';
    return cpkAraligi(o);
  }
  // Cpk eşdeğeri → hatalı oranı: Binomial p = 1 − Φ(3·Cpk); Poisson DPU = −ln Φ(3·Cpk). Φ, normInv'in tersi (ikiye bölme).
  function hataOrani(cpk, normInv) {
    var lo = Math.log(1e-15), hi = Math.log(0.5);              // log p üzerinde
    for (var i = 0; i < 80; i++) { var m = (lo + hi) / 2; if (normInv(1 - Math.exp(m)) > 3 * cpk) lo = m; else hi = m; }
    return Math.exp((lo + hi) / 2);
  }
  function binomCek(n, p, rnd) {
    if (n * p > 30) return Math.min(n, Math.max(0, Math.round(n * p + Math.sqrt(n * p * (1 - p)) * normal(rnd))));
    var u = rnd(), k = 0, f = Math.exp(n * Math.log1p(-p)), F = f;
    while (u > F && k < n) { f *= (n - k) / (k + 1) * p / (1 - p); k++; F += f; }
    return k;
  }
  function poisCek(l, rnd) {
    if (l > 30) return Math.max(0, Math.round(l + Math.sqrt(l) * normal(rnd)));
    var u = rnd(), k = 0, f = Math.exp(-l), F = f;
    while (u > F && k < 1000) { k++; f *= l / k; F += f; }
    return k;
  }
  /** Cpk eşdeğeri (Süreç Z / 3) — R: attrCapCalculations sonucu; hiç hata yoksa ölçülemez (null) */
  function nitelCpk(R, normInv) {
    if (R.type === 'binomial') return R.totalD > 0 ? R.Zbench / 3 : null;
    return R.totalC > 0 ? normInv(Math.exp(-R.ubar)) / 3 : null;
  }

  /** o = { tur:'binomial'|'poisson', altGrup, n, cpkAlt, cpkUst }; A = attrCapCalculations */
  function nitel(o, A, rnd) {
    var neden = nitelKontrol(o); if (neden) throw new Error(neden);
    rnd = rnd || Math.random;
    var a = parseFloat(o.cpkAlt), b = parseFloat(o.cpkUst), k = Number(o.altGrup), n = Number(o.n), bin = o.tur === 'binomial';
    var toplam = k * n, pOrta = hataOrani((a + b) / 2, A.normInv);
    if (pOrta * toplam < 5) {
      var gerek = Math.ceil(5 / pOrta);
      throw new Error('Cpk ' + ((a + b) / 2).toFixed(2) + ' için beklenen ' + (bin ? 'kusurlu oranı' : 'DPU') + ' ' + +(pOrta * 1e6).toPrecision(3)
        + ' ppm; ölçülebilir sonuç için toplam en az ' + gerek.toLocaleString('tr-TR') + ' ' + (bin ? 'parça' : 'birim')
        + ' gerekir (şu an ' + toplam.toLocaleString('tr-TR') + '). Örnek boyutunu ya da alt grup sayısını artırın.');
    }
    for (var deneme = 1; deneme <= 5000; deneme++) {
      var p = hataOrani(hedefCpk(a, b, rnd), A.normInv), rows = [];
      for (var i = 0; i < k; i++) rows.push(bin ? { n: n, d: binomCek(n, p, rnd) } : { n: n, c: poisCek(n * p, rnd) });
      var R = bin ? A.binomialCapability(rows) : A.poissonCapability(rows), c = nitelCpk(R, A.normInv);
      if (ara(c, a, b) && !R.anyOOC) return { rows: rows.map(function (x) { return [x.n, bin ? x.d : x.c]; }), cpk: c, deneme: deneme };
    }
    throw new Error('Bu ayarlarla Cpk ' + a + '–' + b + ' aralığında kararlı veri üretilemedi; aralığı genişletin ya da örnek boyutunu artırın.');
  }

  // Cihaz önerileri: Proses Yeterliliği ekipman listesi (msa_equipment, aktif) → <datalist>
  async function cihazListesi(datalist) {
    try {
      var q = await window.MSA.db.from(window.MSA.T.equipment).select('name,device_number,location').eq('is_active', true).order('name');
      datalist.innerHTML = (q.data || []).map(function (e) {
        var esc = function (t) { return String(t || '').replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;'); };
        return '<option value="' + esc(e.name) + '" label="' + esc([e.device_number, e.location].filter(Boolean).join(' · ')) + '">';
      }).join('');
    } catch (e) { console.warn('cihaz listesi alınamadı', e); }
  }

  var api = { nicel: nicel, nicelKontrol: nicelKontrol, nitel: nitel, nitelKontrol: nitelKontrol, nitelCpk: nitelCpk, hataOrani: hataOrani,
    cihazListesi: cihazListesi, COZUNURLUKLER: COZUNURLUKLER };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  if (typeof window !== 'undefined') window.SimVeri = api;
})();
