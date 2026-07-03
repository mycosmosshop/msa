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
      interpretation:{ ndc, acceptability, acceptabilityLabel:label, acceptabilityClass:cls, grrPercentage:grrSV },
      fmtP
    };
  }

  const api = { calculateNestedGaugeRR, fmtP };
  if(typeof module!=='undefined'&&module.exports) module.exports=api;
  if(typeof window!=='undefined') window.ngrrCalculations=api;
})();
