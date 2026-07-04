/**
 * Non-replicable (Nested) Gage R&R — Tahribatlı ölçüm için iç-içe (nested) tasarım
 * AIAG MSA 4th Edition / JASP metodolojisi ile birebir.
 *
 * Girdi: measurements = [{ operator, part, measurement }]
 *   Parçalar operatörlere NESTED'dir: her parça yalnızca tek operatör tarafından ölçülür.
 * options.toleranceWidth, options.studyVarMultiplier (varsayılan 6)
 */
(function () {
  'use strict';
  function _jStat(){ if(typeof window!=='undefined'&&window.jStat)return window.jStat; if(typeof jStat!=='undefined')return jStat; try{return require('jstat');}catch(e){return null;} }
  function fPValue(F, df1, df2){ if(!isFinite(F)||F<=0)return 1; const js=_jStat(); if(js&&js.centralF&&js.centralF.cdf){ let p=1-js.centralF.cdf(F,df1,df2); if(p<0)p=0; if(p>1)p=1; return p;} return null; }
  function fmtP(p){ if(p==null)return '—'; return p<0.001?'< .001':p.toFixed(3); }
  function mean(a){ return a.reduce((x,y)=>x+y,0)/a.length; }

  // Kontrol grafiği sabitleri (alt grup boyutu n = tekrar sayısı r)
  const D3D4 = {2:[0,3.267],3:[0,2.574],4:[0,2.282],5:[0,2.114],6:[0,2.004],
    7:[0.076,1.924],8:[0.136,1.864],9:[0.184,1.816],10:[0.223,1.777]};
  const A2 = {2:1.880,3:1.023,4:0.729,5:0.577,6:0.483,7:0.419,8:0.373,9:0.337,10:0.308};
  function quantile(sorted, q){ if(!sorted.length) return null; const pos=(sorted.length-1)*q, base=Math.floor(pos), rest=pos-base;
    return sorted[base+1]!==undefined ? sorted[base]+rest*(sorted[base+1]-sorted[base]) : sorted[base]; }
  function boxStats(vals){ const s=vals.slice().sort((a,b)=>a-b);
    return { min:s[0], q1:quantile(s,0.25), median:quantile(s,0.5), q3:quantile(s,0.75), max:s[s.length-1], mean:mean(s), n:s.length }; }

  function calculateNestedGaugeRR(measurements, options){
    options = options || {};
    const mult = options.studyVarMultiplier || 6;
    if(!measurements || !measurements.length) throw new Error('Ölçüm verisi bulunamadı');

    const rows = measurements.map(m=>({ operator:String(m.operator).trim(), part:String(m.part).trim(), measurement:parseFloat(m.measurement) }))
      .filter(m=>m.operator!==''&&m.part!==''&&isFinite(m.measurement));
    if(rows.length<6) throw new Error('Yetersiz veri');

    const operators = [...new Set(rows.map(r=>r.operator))].sort();
    const a = operators.length;
    // her operatörün parçaları (nested)
    const partsByOp = {};
    operators.forEach(o=>{ partsByOp[o] = [...new Set(rows.filter(r=>r.operator===o).map(r=>r.part))].sort(); });
    const b = partsByOp[operators[0]].length;              // operatör başına parça (dengeli varsayım)
    const totalParts = operators.reduce((s,o)=>s+partsByOp[o].length,0);
    // tekrar sayısı (parça başına ölçüm)
    const cellCount = (o,p)=> rows.filter(r=>r.operator===o&&r.part===p).length;
    const r = cellCount(operators[0], partsByOp[operators[0]][0]);
    if(a<2) throw new Error('En az 2 operatör gerekli');
    if(r<2) throw new Error('Her parça için en az 2 ölçüm gerekli (tekrarlanabilirlik)');

    const allVals = rows.map(x=>x.measurement);
    const N = allVals.length;
    const grand = mean(allVals);

    const opMean = {}; operators.forEach(o=>{ opMean[o]=mean(rows.filter(x=>x.operator===o).map(x=>x.measurement)); });
    const partMean = {}; // key op|part
    rows.forEach(x=>{ const k=x.operator+'|'+x.part; if(partMean[k]===undefined){ partMean[k]=mean(rows.filter(y=>y.operator===x.operator&&y.part===x.part).map(y=>y.measurement)); } });

    // Sum of squares (nested)
    let SS_op=0; operators.forEach(o=>{ const n_o=rows.filter(x=>x.operator===o).length; SS_op += n_o*Math.pow(opMean[o]-grand,2); });
    let SS_partOp=0; operators.forEach(o=>{ partsByOp[o].forEach(p=>{ const n_p=cellCount(o,p); SS_partOp += n_p*Math.pow(partMean[o+'|'+p]-opMean[o],2); }); });
    let SS_rep=0; rows.forEach(x=>{ SS_rep += Math.pow(x.measurement - partMean[x.operator+'|'+x.part],2); });
    const SS_total = allVals.reduce((s,v)=>s+Math.pow(v-grand,2),0);

    const df_op = a-1;
    const df_partOp = totalParts - a;          // Σ(b_o - 1) = totalParts - a
    const df_rep = N - totalParts;
    const df_total = N-1;

    const MS_op = SS_op/df_op;
    const MS_partOp = SS_partOp/df_partOp;
    const MS_rep = SS_rep/df_rep;

    const F_op = MS_op/MS_partOp;
    const F_partOp = MS_partOp/MS_rep;
    const p_op = fPValue(F_op, df_op, df_partOp);
    const p_partOp = fPValue(F_partOp, df_partOp, df_rep);

    // Varyans bileşenleri (JASP nested)
    const Var_rep = MS_rep;
    const Var_part = Math.max(0, (MS_partOp - MS_rep)/r);
    const Var_op = Math.max(0, (MS_op - MS_partOp)/(totalParts * r));   // reproducibility (JASP: toplam parça × tekrar)
    const Var_repro = Var_op;
    const Var_grr = Var_rep + Var_repro;
    const Var_total = Var_grr + Var_part;

    function pack(varc){ const sd=Math.sqrt(varc); return { variance:varc, contribution:Var_total>0?varc/Var_total*100:0, stdDev:sd, studyVar:mult*sd }; }
    const totalGRR=pack(Var_grr), rep=pack(Var_rep), repro=pack(Var_repro), part=pack(Var_part), total=pack(Var_total);
    const totalStudyVar = total.studyVar;
    [totalGRR,rep,repro,part,total].forEach(o=>{ o.pctStudyVar = totalStudyVar>0? o.studyVar/totalStudyVar*100 : 0; });

    // %Tolerance
    const tol = (options.toleranceWidth!=null&&isFinite(parseFloat(options.toleranceWidth))&&parseFloat(options.toleranceWidth)>0)?parseFloat(options.toleranceWidth):null;
    if(tol){ [totalGRR,rep,repro,part].forEach(o=>{ o.pctTolerance=o.studyVar/tol*100; }); }

    // ---- Kontrol grafiği verileri (operatöre göre) ----
    const seq = []; let sIdx = 0;
    operators.forEach(o => { partsByOp[o].forEach(p => { sIdx++;
      const vals = rows.filter(x => x.operator===o && x.part===p).map(x => x.measurement);
      seq.push({ sample: sIdx, operator: o, part: p, values: vals, range: Math.max.apply(null,vals)-Math.min.apply(null,vals), mean: mean(vals) }); }); });
    const Rbar = mean(seq.map(s => s.range));
    const Xbarbar = mean(seq.map(s => s.mean));
    const dd = D3D4[r] || D3D4[2]; const a2 = A2[r] || A2[2];
    const rangeChart = { UCL: dd[1]*Rbar, CL: Rbar, LCL: dd[0]*Rbar,
      points: seq.map(s => ({ sample:s.sample, operator:s.operator, part:s.part, range:s.range })),
      violations: seq.filter(s => s.range>dd[1]*Rbar+1e-12 || s.range<dd[0]*Rbar-1e-12).map(s => s.sample) };
    const xbarChart = { UCL: Xbarbar+a2*Rbar, CL: Xbarbar, LCL: Xbarbar-a2*Rbar,
      points: seq.map(s => ({ sample:s.sample, operator:s.operator, part:s.part, mean:s.mean })),
      violations: seq.filter(s => s.mean>Xbarbar+a2*Rbar || s.mean<Xbarbar-a2*Rbar).map(s => ({ operator:s.operator, sample:s.sample, part:s.part })) };
    const opBounds = operators.map(o => { const ss=seq.filter(x=>x.operator===o); return { operator:o, start:ss[0].sample, end:ss[ss.length-1].sample }; });
    // ölçüm dağılımları
    const measByPart = operators.map(o => ({ operator:o, points: partsByOp[o].map(p => ({ part:p, values: rows.filter(x=>x.operator===o&&x.part===p).map(x=>x.measurement), mean: partMean[o+'|'+p] })) }));
    const measByOperator = operators.map(o => ({ operator:o, box: boxStats(rows.filter(x=>x.operator===o).map(x=>x.measurement)) }));
    const charts = { seq, opBounds, rangeChart, xbarChart, measByPart, measByOperator, Rbar, Xbarbar };

    // Trafik ışığı: GRR'nin proses (çalışma) varyasyonu ve tolerans yüzdeleri
    const traffic = { process: totalGRR.pctStudyVar, tolerance: (totalGRR.pctTolerance!=null ? totalGRR.pctTolerance : null) };

    const ndc = Math.max(1, Math.floor(1.41*(part.stdDev/(totalGRR.stdDev||1e-9))));
    const grrSV = totalGRR.pctStudyVar;
    let acceptability = grrSV<10?'Acceptable':(grrSV<=30?'Marginal':'Unacceptable');
    const cls = grrSV<10?'good':(grrSV<=30?'marginal':'bad');
    const label = grrSV<10?'Kabul edilebilir':(grrSV<=30?'Marjinal':'Kabul edilemez');

    return {
      studyInfo:{ numOperators:a, partsPerOperator:b, totalParts, numTrials:r, N },
      anovaTable:{
        operator:{ df:df_op, ss:SS_op, ms:MS_op, f:F_op, p:fmtP(p_op) },
        partOperator:{ df:df_partOp, ss:SS_partOp, ms:MS_partOp, f:F_partOp, p:fmtP(p_partOp) },
        repeatability:{ df:df_rep, ss:SS_rep, ms:MS_rep },
        total:{ df:df_total, ss:SS_total }
      },
      varianceComponents:{ totalGRR, repeatability:rep, reproducibility:repro, partToPart:part, totalVariation:total },
      gaugeEvaluation:{ totalGRR, repeatability:rep, reproducibility:repro, partToPart:part, totalVariation:total, toleranceWidth:tol },
      charts, traffic,
      interpretation:{ ndc, acceptability, acceptabilityLabel:label, acceptabilityClass:cls, grrPercentage:grrSV },
      fmtP
    };
  }

  const api = { calculateNestedGaugeRR, fmtP };
  if(typeof module!=='undefined'&&module.exports) module.exports=api;
  if(typeof window!=='undefined') window.ngrrCalculations=api;
})();
