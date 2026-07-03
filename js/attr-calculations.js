/**
 * Attributes Agreement Analysis (Öznitelik Uyum Analizi)
 * AIAG MSA 4th Edition / JASP metodolojisi ile birebir.
 *
 * Girdi: measurements = [{ part, appraiser, trial, rating, standard }]
 *   - part:      parça no (string/number)
 *   - appraiser: değerlendirici (string)
 *   - trial:     tekrar no (number)
 *   - rating:    değerlendirme sonucu (kategorik: '0'/'1', 'Kabul'/'Ret', ...)
 *   - standard:  parçanın bilinen referans değeri (kategorik) — opsiyonel
 *
 * Çıktı JASP ile aynı: within/between/each-vs-standard/all-vs-standard tabloları
 *   (%uyum + Clopper-Pearson %95 GA) ve Fleiss/Cohen kappa tablosu.
 */
(function () {
  'use strict';

  function _jStat() {
    if (typeof window !== 'undefined' && window.jStat) return window.jStat;
    if (typeof jStat !== 'undefined') return jStat;
    try { return require('jstat'); } catch (e) { return null; }
  }

  // Clopper-Pearson kesin binom %95 güven aralığı (JASP ile aynı)
  function clopperPearson(x, n, alpha) {
    alpha = alpha || 0.05;
    if (!n) return { lower: null, upper: null };
    const js = _jStat();
    let lower, upper;
    if (x <= 0) lower = 0;
    else lower = js.beta.inv(alpha / 2, x, n - x + 1);
    if (x >= n) upper = 1;
    else upper = js.beta.inv(1 - alpha / 2, x + 1, n - x);
    return { lower: lower * 100, upper: upper * 100 };
  }

  const S = v => (v === null || v === undefined) ? '' : String(v).trim();

  // Cohen's kappa — 2 değerlendirici, eşleştirilmiş gözlemler havuzu
  function cohenKappa(pairs) {
    const n = pairs.length;
    if (!n) return null;
    const cats = [...new Set(pairs.flatMap(p => [p[0], p[1]]))];
    const m1 = {}, m2 = {};
    cats.forEach(c => { m1[c] = 0; m2[c] = 0; });
    let observed = 0;
    pairs.forEach(([a, b]) => {
      if (a === b) observed++;
      m1[a]++; m2[b]++;
    });
    const po = observed / n;
    let pe = 0;
    cats.forEach(c => { pe += (m1[c] / n) * (m2[c] / n); });
    if (pe >= 1) return 1;
    return (po - pe) / (1 - pe);
  }

  // Fleiss' kappa — N özne (parça), her özne n değerlendirme, k kategori
  function fleissKappa(subjects, cats) {
    const N = subjects.length;
    if (!N) return null;
    const n = cats.reduce((a, c) => a + (subjects[0][c] || 0), 0);
    if (n < 2) return null;
    const pj = {};
    cats.forEach(c => { pj[c] = 0; });
    subjects.forEach(s => cats.forEach(c => { pj[c] += (s[c] || 0); }));
    cats.forEach(c => { pj[c] /= (N * n); });
    let Pbar = 0;
    subjects.forEach(s => {
      let sum = 0;
      cats.forEach(c => { const nij = s[c] || 0; sum += nij * nij; });
      Pbar += (sum - n) / (n * (n - 1));
    });
    Pbar /= N;
    let Pe = 0;
    cats.forEach(c => { Pe += pj[c] * pj[c]; });
    if (Pe >= 1) return 1;
    return (Pbar - Pe) / (1 - Pe);
  }

  // Kappa yorumu (AIAG): ≥0.9 çok iyi, ≥0.75 iyi, ≥0.40 kabul edilebilir, <0.40 zayıf
  function kappaVerdict(k) {
    if (k === null || k === undefined || isNaN(k)) return { label: '—', cls: 'neutral' };
    if (k >= 0.90) return { label: 'Çok iyi', cls: 'good' };
    if (k >= 0.75) return { label: 'İyi', cls: 'good' };
    if (k >= 0.40) return { label: 'Kabul edilebilir', cls: 'marginal' };
    return { label: 'Zayıf', cls: 'bad' };
  }

  // Etkinlik / kaçırma oranı / yanlış alarm oranı sınıflandırması (AIAG / JASP)
  function effVerdict(x) { if (x == null) return { label: '—', cls: 'neutral' };
    if (x > 90) return { label: 'Kabul edilebilir', cls: 'good' };
    if (x >= 80) return { label: 'Marjinal', cls: 'marginal' };
    return { label: 'Kabul edilemez', cls: 'bad' }; }
  function missVerdict(x) { if (x == null) return { label: '—', cls: 'neutral' };
    if (x <= 2) return { label: 'Kabul edilebilir', cls: 'good' };
    if (x <= 5) return { label: 'Marjinal', cls: 'marginal' };
    return { label: 'Kabul edilemez', cls: 'bad' }; }
  function faVerdict(x) { if (x == null) return { label: '—', cls: 'neutral' };
    if (x <= 5) return { label: 'Kabul edilebilir', cls: 'good' };
    if (x < 10) return { label: 'Marjinal', cls: 'marginal' };
    return { label: 'Kabul edilemez', cls: 'bad' }; }

  function calculateAttributeAgreement(measurements, options) {
    options = options || {};
    const positiveRef = (options.positiveReference === undefined || options.positiveReference === null || String(options.positiveReference).trim() === '')
      ? '1' : String(options.positiveReference).trim();
    if (!measurements || !measurements.length) {
      throw new Error('Değerlendirme verisi bulunamadı');
    }

    // Normalize
    const rows = measurements
      .map(m => ({
        part: S(m.part),
        appraiser: S(m.appraiser),
        trial: parseInt(m.trial),
        rating: S(m.rating),
        standard: (m.standard === undefined || m.standard === null || S(m.standard) === '') ? null : S(m.standard)
      }))
      .filter(m => m.part !== '' && m.appraiser !== '' && m.rating !== '' && !isNaN(m.trial));

    if (!rows.length) throw new Error('Geçerli değerlendirme verisi bulunamadı');

    const appraisers = [...new Set(rows.map(r => r.appraiser))].sort();
    const parts = [...new Set(rows.map(r => r.part))].sort((a, b) => {
      const na = parseFloat(a), nb = parseFloat(b);
      return (!isNaN(na) && !isNaN(nb)) ? na - nb : a.localeCompare(b);
    });
    const trials = [...new Set(rows.map(r => r.trial))].sort((a, b) => a - b);
    const hasStandard = rows.some(r => r.standard !== null);
    const cats = [...new Set(rows.flatMap(r => [r.rating].concat(r.standard !== null ? [r.standard] : [])))].sort();

    // İndeks: rating[appraiser][part][trial], standard[part]
    const R = {};
    appraisers.forEach(a => { R[a] = {}; parts.forEach(p => { R[a][p] = {}; }); });
    const standardOf = {};
    rows.forEach(r => {
      if (R[r.appraiser] && R[r.appraiser][r.part]) R[r.appraiser][r.part][r.trial] = r.rating;
      if (r.standard !== null && standardOf[r.part] === undefined) standardOf[r.part] = r.standard;
    });

    const numParts = parts.length;
    const numAppraisers = appraisers.length;

    const ratingsOfCell = (a, p) => trials.map(t => R[a][p][t]).filter(v => v !== undefined);
    const allEqual = arr => arr.length > 0 && arr.every(v => v === arr[0]);

    // ---- Within appraisers (öz-tutarlılık) ----
    const withinAppraisers = appraisers.map(a => {
      let matched = 0;
      parts.forEach(p => { if (allEqual(ratingsOfCell(a, p))) matched++; });
      const ci = clopperPearson(matched, numParts);
      return { appraiser: a, inspected: numParts, matched, percent: numParts ? matched / numParts * 100 : 0, ...ci };
    });

    // ---- Between appraisers (tüm değerlendirici×tekrar aynı) ----
    let betweenMatched = 0;
    parts.forEach(p => {
      const all = appraisers.flatMap(a => ratingsOfCell(a, p));
      if (allEqual(all)) betweenMatched++;
    });
    const betweenAppraisers = {
      inspected: numParts, matched: betweenMatched,
      percent: numParts ? betweenMatched / numParts * 100 : 0,
      ...clopperPearson(betweenMatched, numParts)
    };

    // ---- Each appraiser vs standard ----
    let eachVsStandard = [], allVsStandard = null;
    if (hasStandard) {
      eachVsStandard = appraisers.map(a => {
        let matched = 0;
        parts.forEach(p => {
          const cell = ratingsOfCell(a, p);
          const std = standardOf[p];
          if (std !== undefined && cell.length > 0 && cell.every(v => v === std)) matched++;
        });
        const ci = clopperPearson(matched, numParts);
        return { appraiser: a, inspected: numParts, matched, percent: numParts ? matched / numParts * 100 : 0, ...ci };
      });

      // ---- All appraisers vs standard ----
      let allMatched = 0;
      parts.forEach(p => {
        const std = standardOf[p];
        const all = appraisers.flatMap(a => ratingsOfCell(a, p));
        if (std !== undefined && all.length > 0 && all.every(v => v === std)) allMatched++;
      });
      allVsStandard = {
        inspected: numParts, matched: allMatched,
        percent: numParts ? allMatched / numParts * 100 : 0,
        ...clopperPearson(allMatched, numParts)
      };
    }

    // ---- Fleiss / Cohen kappa ----
    // within (per appraiser): parça=özne, o değerlendiricinin tekrarları=rater'lar
    const kappaWithin = {};
    appraisers.forEach(a => {
      const subjects = parts.map(p => {
        const counts = {}; cats.forEach(c => counts[c] = 0);
        ratingsOfCell(a, p).forEach(v => { counts[v] = (counts[v] || 0) + 1; });
        return counts;
      }).filter(s => cats.reduce((x, c) => x + s[c], 0) >= 2);
      kappaWithin[a] = fleissKappa(subjects, cats);
    });

    // vs standard (per appraiser): Cohen — havuzlanmış (rating, standard) çiftleri
    const kappaVsStd = {};
    if (hasStandard) {
      appraisers.forEach(a => {
        const pairs = [];
        parts.forEach(p => {
          const std = standardOf[p];
          if (std === undefined) return;
          ratingsOfCell(a, p).forEach(v => pairs.push([v, std]));
        });
        kappaVsStd[a] = cohenKappa(pairs);
      });
    }

    // between (All): parça=özne, tüm değerlendirici×tekrar=rater'lar
    const betweenSubjects = parts.map(p => {
      const counts = {}; cats.forEach(c => counts[c] = 0);
      appraisers.forEach(a => ratingsOfCell(a, p).forEach(v => { counts[v] = (counts[v] || 0) + 1; }));
      return counts;
    }).filter(s => cats.reduce((x, c) => x + s[c], 0) >= 2);
    const kappaBetween = fleissKappa(betweenSubjects, cats);

    // all vs standard (All): Cohen — tüm havuz
    let kappaAllVsStd = null;
    if (hasStandard) {
      const pairs = [];
      parts.forEach(p => {
        const std = standardOf[p];
        if (std === undefined) return;
        appraisers.forEach(a => ratingsOfCell(a, p).forEach(v => pairs.push([v, std])));
      });
      kappaAllVsStd = cohenKappa(pairs);
    }

    const fleissTable = appraisers.map(a => ({
      appraiser: a,
      within: kappaWithin[a],
      vsStandard: hasStandard ? kappaVsStd[a] : null
    }));
    fleissTable.push({
      appraiser: 'Tümü',
      within: null,
      vsStandard: hasStandard ? kappaAllVsStd : null,
      between: kappaBetween
    });

    // ---- Study effectiveness summary (Pozitif referans gerektirir) ----
    // Etkinlik = tüm tekrarları standartla eşleşen parça oranı (= vs standard %).
    // Kaçırma oranı = NEGATİF (referans-dışı) parçaları POZİTİF sayma / negatif fırsat.
    // Yanlış alarm = POZİTİF parçaları negatif sayma / pozitif fırsat.
    let effectiveness = null;
    if (hasStandard) {
      const isPos = v => v === positiveRef;
      effectiveness = appraisers.map(a => {
        const evs = eachVsStandard.find(x => x.appraiser === a);
        const eff = evs ? evs.percent : 0;
        let missNum = 0, missDen = 0, faNum = 0, faDen = 0;
        parts.forEach(p => {
          const std = standardOf[p]; if (std === undefined) return;
          const cell = ratingsOfCell(a, p);
          if (isPos(std)) { // pozitif (iyi) parça → yanlış alarm fırsatı
            cell.forEach(v => { faDen++; if (!isPos(v)) faNum++; });
          } else {          // negatif (kötü) parça → kaçırma fırsatı
            cell.forEach(v => { missDen++; if (isPos(v)) missNum++; });
          }
        });
        const miss = missDen ? missNum / missDen * 100 : 0;
        const fa = faDen ? faNum / faDen * 100 : 0;
        return {
          appraiser: a, effectiveness: eff, missRate: miss, falseAlarm: fa,
          effVerdict: effVerdict(eff), missVerdict: missVerdict(miss), faVerdict: faVerdict(fa)
        };
      });
    }

    // ---- Cohen's kappa: appraiser vs standard (ayrı tablo) ----
    let cohenVsStandard = null;
    if (hasStandard) {
      cohenVsStandard = appraisers.map(a => ({ appraiser: a, kappa: kappaVsStd[a] }));
      cohenVsStandard.push({ appraiser: 'Tümü', kappa: kappaAllVsStd });
    }

    // ---- Cohen's kappa correlations (değerlendiriciler arası ikili) ----
    const cohenPairwise = { appraisers, matrix: {} };
    appraisers.forEach(a => {
      cohenPairwise.matrix[a] = {};
      appraisers.forEach(b => {
        if (a === b) { cohenPairwise.matrix[a][b] = null; return; }
        const pairs = [];
        parts.forEach(p => { trials.forEach(t => {
          const va = R[a][p][t], vb = R[b][p][t];
          if (va !== undefined && vb !== undefined) pairs.push([va, vb]);
        }); });
        cohenPairwise.matrix[a][b] = cohenKappa(pairs);
      });
    });

    // Genel karar (vs standard varsa ona, yoksa between'e göre)
    const decisiveKappa = hasStandard ? kappaAllVsStd : kappaBetween;
    const overall = kappaVerdict(decisiveKappa);

    return {
      studyInfo: { numAppraisers, numParts, numTrials: trials.length, appraisers, parts, categories: cats, hasStandard, positiveReference: positiveRef },
      withinAppraisers,
      betweenAppraisers,
      eachVsStandard,
      allVsStandard,
      effectiveness,
      cohenVsStandard,
      cohenPairwise,
      fleissKappa: fleissTable,
      kappa: { within: kappaWithin, vsStandard: kappaVsStd, between: kappaBetween, allVsStandard: kappaAllVsStd },
      interpretation: {
        decisiveKappa,
        acceptability: overall.label,
        acceptabilityClass: overall.cls,
        kappaVerdict
      }
    };
  }

  const api = {
    calculateAttributeAgreement,
    clopperPearson,
    cohenKappa,
    fleissKappa,
    kappaVerdict
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  if (typeof window !== 'undefined') window.attrCalculations = api;
})();
