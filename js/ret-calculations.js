/**
 * Test-retest (Range Method) — Kısa mastar çalışması
 * AIAG MSA 4th Edition / JASP metodolojisi ile birebir.
 *
 * Girdi: measurements = [{ part, trial, measurement }]  (genelde her parça 2 ölçüm)
 * options.tolerance, options.processStdDev: opsiyonel (%GRR için)
 *
 * Yöntem: her parça için menzil R = maks - min; R-bar = ortalama menzil;
 *   GRR (ölçüm hatası σ) = R-bar / d2*, d2* = alt grup boyutu (tekrar) ve
 *   alt grup sayısına (parça) göre bias-düzeltilmiş sabit.
 */
(function () {
  'use strict';

  // d2* — bias düzeltilmiş (Duncan). Alt grup boyutu n=2 için, alt grup sayısı m'e göre.
  const D2STAR_N2 = {1:1.41421,2:1.27931,3:1.23105,4:1.20621,5:1.19105,6:1.18083,7:1.17348,
    8:1.16794,9:1.16361,10:1.16014,11:1.15729,12:1.15490,13:1.15289,14:1.15115,15:1.14965,
    16:1.14833,17:1.14717,18:1.14613,19:1.14520,20:1.14435,21:1.14358,22:1.14288,23:1.14224,
    24:1.14164,25:1.14109};
  // Standart d2 (m→∞) çeşitli alt grup boyutları için (n≠2 durumları)
  const D2_INF = {2:1.12838,3:1.69257,4:2.05875,5:2.32593,6:2.53441,7:2.70436,8:2.84720,9:2.97003,10:3.07751};

  function d2Star(n, m) {
    if (n === 2) {
      if (m <= 0) return D2STAR_N2[1];
      if (D2STAR_N2[m] != null) return D2STAR_N2[m];
      return 1.12838; // m çok büyük → asimptotik d2
    }
    return D2_INF[n] || D2_INF[2];
  }

  // R kontrol grafiği sabitleri (alt grup boyutu n): [D3, D4]
  const D3D4 = {2:[0,3.267],3:[0,2.575],4:[0,2.282],5:[0,2.114],6:[0,2.004],
    7:[0.076,1.924],8:[0.136,1.864],9:[0.184,1.816],10:[0.223,1.777]};

  function mean(a){ return a.reduce((x,y)=>x+y,0)/a.length; }

  function calculateTestRetest(measurements, options) {
    options = options || {};
    if (!measurements || !measurements.length) throw new Error('Ölçüm verisi bulunamadı');

    const rows = measurements.map(m => ({
      part: String(m.part).trim(),
      trial: parseInt(m.trial),
      measurement: parseFloat(m.measurement)
    })).filter(m => m.part !== '' && isFinite(m.measurement) && !isNaN(m.trial));
    if (!rows.length) throw new Error('Geçerli ölçüm verisi bulunamadı');

    const partOrder = [];
    const byPart = {};
    rows.forEach(r => { if (!byPart[r.part]) { byPart[r.part] = []; partOrder.push(r.part); } byPart[r.part].push(r); });

    const trials = [...new Set(rows.map(r => r.trial))].sort((a,b)=>a-b);
    const nSub = trials.length;                 // alt grup boyutu (tekrar sayısı)

    // Parça başına menzil + ortalama
    const partRows = partOrder.map(p => {
      const vals = byPart[p].sort((a,b)=>a.trial-b.trial).map(x=>x.measurement);
      const range = Math.max(...vals) - Math.min(...vals);
      return { part: p, values: vals, range, mean: mean(vals) };
    });

    const m = partRows.length;
    const Rbar = mean(partRows.map(pr => pr.range));
    const d2 = d2Star(nSub, m);
    const grr = Rbar / d2;                       // ölçüm hatası (repeatability σ)
    const studyVar = 6 * grr;

    // Opsiyonel %GRR
    const tolerance = (options.tolerance != null && isFinite(parseFloat(options.tolerance)) && parseFloat(options.tolerance) > 0) ? parseFloat(options.tolerance) : null;
    const processStdDev = (options.processStdDev != null && isFinite(parseFloat(options.processStdDev)) && parseFloat(options.processStdDev) > 0) ? parseFloat(options.processStdDev) : null;
    const pctTolerance = tolerance ? studyVar / tolerance * 100 : null;
    const pctProcess = processStdDev ? grr / processStdDev * 100 : null;

    // Scatter: 1. vs 2. ölçüm (n=2 ise)
    const scatter = partRows.filter(pr => pr.values.length >= 2).map(pr => ({ x: pr.values[0], y: pr.values[1], part: pr.part }));
    // Fit çizgisi (1.ölçüm -> 2.ölçüm) + 45° referans
    let fit = null, diag = null;
    if (scatter.length >= 2) {
      const xs = scatter.map(s=>s.x), ys = scatter.map(s=>s.y);
      const xb = mean(xs), yb = mean(ys);
      let sxx=0, sxy=0; for (let i=0;i<xs.length;i++){ sxx+=(xs[i]-xb)*(xs[i]-xb); sxy+=(xs[i]-xb)*(ys[i]-yb); }
      const slope = sxx>0? sxy/sxx : 0; const intc = yb - slope*xb;
      const allV = xs.concat(ys); const lo = Math.min(...allV), hi = Math.max(...allV);
      fit = [{x:lo,y:intc+slope*lo},{x:hi,y:intc+slope*hi}];
      diag = [{x:lo,y:lo},{x:hi,y:hi}];
    }

    // Menzil kontrol grafiği (R chart): UCL = D4·R̄, LCL = D3·R̄, CL = R̄
    const dd = D3D4[nSub] || D3D4[2];
    const rUCL = dd[1] * Rbar, rLCL = dd[0] * Rbar, rCL = Rbar;
    const rangePoints = partRows.map((pr, i) => ({ sample: i + 1, part: pr.part, range: pr.range }));
    const rangeViolations = rangePoints.filter(p => p.range > rUCL + 1e-12 || p.range < rLCL - 1e-12).map(p => p.sample);
    const rangeChart = { UCL: rUCL, CL: rCL, LCL: rLCL, points: rangePoints, violations: rangeViolations };

    // Traffic light: GRR'nin çalışma varyasyonu yüzdesi. Tolerans/proses verildiyse ona göre;
    // hiçbiri yoksa JASP gibi proses std sapması = 1 varsayılır → %GRR = GRR·100.
    let trafficPct, trafficBasis;
    if (pctTolerance != null) { trafficPct = pctTolerance; trafficBasis = 'tolerans'; }
    else if (pctProcess != null) { trafficPct = pctProcess; trafficBasis = 'proses σ'; }
    else { trafficPct = grr * 100; trafficBasis = 'proses σ = 1 (varsayılan)'; }

    // Değerlendirme: %GRR (tolerans varsa) yoksa nötr
    let verdict = { label: 'Bilgi', cls: 'neutral' };
    const decisivePct = pctTolerance != null ? pctTolerance : (pctProcess != null ? pctProcess : null);
    if (decisivePct != null) {
      verdict = decisivePct < 10 ? { label: 'Kabul edilebilir', cls: 'good' }
        : decisivePct <= 30 ? { label: 'Marjinal', cls: 'marginal' }
        : { label: 'Kabul edilemez', cls: 'bad' };
    }

    return {
      studyInfo: { numParts: m, numTrials: nSub },
      shortGauge: { sampleSize: m, rBar: Rbar, d2, grr, studyVar, pctTolerance, pctProcess },
      partRows,
      rangeChart,
      traffic: { pct: trafficPct, basis: trafficBasis },
      graph: { scatter, fit, diag, runChart: partRows.map((pr,i)=>({ x:i+1, part:pr.part, values:pr.values, range:pr.range })) },
      interpretation: { verdict, decisivePct, acceptability: verdict.label, acceptabilityClass: verdict.cls }
    };
  }

  const api = { calculateTestRetest, d2Star };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  if (typeof window !== 'undefined') window.retCalculations = api;
})();
