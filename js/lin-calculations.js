/**
 * Type 4 Linearity Study (Doğrusallık ve Bias Çalışması)
 * AIAG MSA 4th Edition / JASP metodolojisi ile birebir.
 *
 * Girdi: measurements = [{ part, reference, measurement }]
 *   - part:        parça no
 *   - reference:   parçanın bilinen referans (standart) değeri
 *   - measurement: ölçülen değer
 * options.processVariation: opsiyonel proses varyasyonu (6σ). Verilmezse
 *   6 × (tüm bias değerlerinin standart sapması) kullanılır (JASP varsayılanı).
 */
(function () {
  'use strict';

  function _jStat() {
    if (typeof window !== 'undefined' && window.jStat) return window.jStat;
    if (typeof jStat !== 'undefined') return jStat;
    try { return require('jstat'); } catch (e) { return null; }
  }
  function tPValue(t, df) {
    if (!isFinite(t) || !isFinite(df) || df <= 0) return null;
    const js = _jStat();
    if (js && js.studentt && js.studentt.cdf) {
      let p = 2 * (1 - js.studentt.cdf(Math.abs(t), df));
      if (p < 0) p = 0; if (p > 1) p = 1;
      return p;
    }
    return null;
  }
  function fmtP(p) { if (p == null) return '—'; return p < 0.001 ? '< .001' : p.toFixed(3); }
  function mean(a) { return a.reduce((x, y) => x + y, 0) / a.length; }
  function sd(a) { if (a.length < 2) return 0; const m = mean(a); return Math.sqrt(a.reduce((s, v) => s + (v - m) * (v - m), 0) / (a.length - 1)); }

  function calculateLinearity(measurements, options) {
    options = options || {};
    if (!measurements || !measurements.length) throw new Error('Ölçüm verisi bulunamadı');

    const rows = measurements.map(m => ({
      part: String(m.part).trim(),
      reference: parseFloat(m.reference),
      measurement: parseFloat(m.measurement)
    })).filter(m => isFinite(m.reference) && isFinite(m.measurement));
    if (rows.length < 4) throw new Error('Yetersiz veri (en az birkaç referans ve ölçüm gerekli)');

    // Parçalara göre grupla (part -> {reference, measurements[]})
    const partOrder = [];
    const byPart = {};
    rows.forEach(r => {
      if (!byPart[r.part]) { byPart[r.part] = { part: r.part, reference: r.reference, values: [] }; partOrder.push(r.part); }
      byPart[r.part].values.push(r.measurement);
    });

    // ---- Gauge bias (parça başına) ----
    const biasTable = partOrder.map(p => {
      const g = byPart[p];
      const obsMean = mean(g.values);
      const meanBias = obsMean - g.reference;
      const s = sd(g.values);
      const n = g.values.length;
      const se = s / Math.sqrt(n);
      const t = se > 0 ? meanBias / se : null;
      const p_ = t != null ? tPValue(t, n - 1) : null;
      return { part: g.part, reference: g.reference, observedMean: obsMean, meanBias, n, pValue: p_ };
    });

    // Tüm bias değerleri (her gözlem: measurement - reference)
    const allBias = rows.map(r => r.measurement - r.reference);
    const allRef = rows.map(r => r.reference);
    const nAll = rows.length;
    const totalBias = mean(allBias);
    const seTotal = sd(allBias) / Math.sqrt(nAll);
    const tTotal = seTotal > 0 ? totalBias / seTotal : null;
    const totalP = tTotal != null ? tPValue(tTotal, nAll - 1) : null;

    // ---- Regresyon: bias ~ reference (tüm gözlemler) ----
    const xbar = mean(allRef), ybar = mean(allBias);
    let Sxx = 0, Sxy = 0, Syy = 0;
    for (let i = 0; i < nAll; i++) {
      const dx = allRef[i] - xbar, dy = allBias[i] - ybar;
      Sxx += dx * dx; Sxy += dx * dy; Syy += dy * dy;
    }
    const slope = Sxy / Sxx;
    const intercept = ybar - slope * xbar;
    // Artıklar
    let SSE = 0;
    for (let i = 0; i < nAll; i++) { const pred = intercept + slope * allRef[i]; SSE += Math.pow(allBias[i] - pred, 2); }
    const SST = Syy;
    const R2 = SST > 0 ? 1 - SSE / SST : null;
    const dfReg = nAll - 2;
    const residualSE = Math.sqrt(SSE / dfReg);              // regresyon std hatası
    const seSlope = residualSE / Math.sqrt(Sxx);
    const seIntercept = residualSE * Math.sqrt(1 / nAll + (xbar * xbar) / Sxx);
    const tSlope = slope / seSlope, tIntercept = intercept / seIntercept;
    const pSlope = tPValue(tSlope, dfReg), pIntercept = tPValue(tIntercept, dfReg);

    // ---- Gauge linearity ----
    const pctLinearity = Math.abs(slope) * 100;             // = |eğim| × 100 (JASP)

    // Proses varyasyonu: JASP/Minitab — belirtilmezse 1 alınır (o zaman %Bias = |ort.bias|×100).
    // Kullanıcı gerçek 6σ proses varyasyonunu girerse %Bias ona göre ölçeklenir.
    const pvGiven = (options.processVariation != null && isFinite(parseFloat(options.processVariation)) && parseFloat(options.processVariation) > 0)
      ? parseFloat(options.processVariation) : null;
    const processVariation = pvGiven != null ? pvGiven : 1;
    const pctBias = processVariation > 0 ? Math.abs(totalBias) / processVariation * 100 : null;

    // Kabul yorumu (AIAG): %Linearity düşükse ve bias anlamsızsa iyi
    const linVerdict = pctLinearity < 5 ? { label: 'İyi', cls: 'good' }
      : pctLinearity <= 10 ? { label: 'Kabul edilebilir', cls: 'marginal' }
      : { label: 'Zayıf', cls: 'bad' };
    const biasSignificant = (totalP != null && totalP < 0.05);

    // Grafik için bias noktaları (birey) + parça ortalamaları + regresyon çizgisi
    const points = rows.map(r => ({ x: r.reference, y: r.measurement - r.reference }));
    const refValues = [...new Set(allRef)].sort((a, b) => a - b);
    const meanPoints = biasTable.map(b => ({ x: b.reference, y: b.meanBias }));
    const lineX = [Math.min(...refValues), Math.max(...refValues)];
    const linePts = lineX.map(x => ({ x, y: intercept + slope * x }));
    // %95 güven bandı (regresyon çizgisi için)
    const js = _jStat();
    const tCrit = (js && js.studentt) ? js.studentt.inv(0.975, dfReg) : 2;
    const band = refValues.map(x => {
      const seMean = residualSE * Math.sqrt(1 / nAll + Math.pow(x - xbar, 2) / Sxx);
      const yh = intercept + slope * x;
      return { x, lower: yh - tCrit * seMean, upper: yh + tCrit * seMean };
    });

    return {
      studyInfo: { numParts: partOrder.length, numMeasurements: nAll, references: refValues, processVariation, processVariationGiven: pvGiven != null },
      biasTable,
      total: { meanBias: totalBias, pValue: totalP },
      regression: {
        intercept: { coef: intercept, se: seIntercept, t: tIntercept, p: pIntercept },
        slope: { coef: slope, se: seSlope, t: tSlope, p: pSlope },
        equation: 'Bias = ' + intercept.toFixed(3) + (slope < 0 ? ' - ' : ' + ') + Math.abs(slope).toFixed(3) + ' × Referans'
      },
      linearity: { stdError: residualSE, r2: R2, pctLinearity, pctBias },
      graph: { points, meanPoints, linePts, band, refValues },
      interpretation: {
        linVerdict, biasSignificant,
        acceptability: linVerdict.label, acceptabilityClass: linVerdict.cls
      },
      fmtP
    };
  }

  const api = { calculateLinearity, fmtP };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  if (typeof window !== 'undefined') window.linCalculations = api;
})();
