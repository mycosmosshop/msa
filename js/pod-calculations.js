/**
 * Probability of Detection (POD) — Tespit Olasılığı (hit/miss)
 * AIAG / JASP metodolojisi: lojistik regresyon (logit).
 *
 * Girdi: measurements = [{ size, detected }]
 *   - size:     kusur/özellik boyutu (sürekli ölçüm)
 *   - detected: 1 = tespit edildi (hit), 0 = edilemedi (miss)
 *
 * P(tespit | size) = 1 / (1 + exp(-(b0 + b1·size)))
 */
(function () {
  'use strict';

  function _jStat(){ if(typeof window!=='undefined'&&window.jStat)return window.jStat; if(typeof jStat!=='undefined')return jStat; try{return require('jstat');}catch(e){return null;} }
  function normP(z){ // standart normal iki-yön p
    const js=_jStat(); if(js&&js.normal) return 2*(1-js.normal.cdf(Math.abs(z),0,1));
    // yaklaşık
    const t=1/(1+0.2316419*Math.abs(z)); const d=0.3989423*Math.exp(-z*z/2);
    let p=d*t*(0.3193815+t*(-0.3565638+t*(1.781478+t*(-1.821256+t*1.330274))));
    return 2*p;
  }
  const sigmoid = e => 1/(1+Math.exp(-e));

  // 2 parametreli lojistik regresyon (IRLS) — b0 (sabit) + b1·x
  function fitLogistic(xs, ys, maxIter) {
    maxIter = maxIter || 50;
    let b0=0, b1=0;
    const n=xs.length;
    for (let it=0; it<maxIter; it++) {
      let s00=0,s01=0,s11=0, g0=0,g1=0;
      for (let i=0;i<n;i++){
        const eta=b0+b1*xs[i]; const p=sigmoid(eta); const w=Math.max(p*(1-p),1e-9);
        s00+=w; s01+=w*xs[i]; s11+=w*xs[i]*xs[i];
        g0+=(ys[i]-p); g1+=(ys[i]-p)*xs[i];
      }
      // (X'WX) delta = X'(y-p);  2x2 çöz
      const det=s00*s11-s01*s01; if(Math.abs(det)<1e-12) break;
      const d0=( s11*g0 - s01*g1)/det;
      const d1=(-s01*g0 + s00*g1)/det;
      b0+=d0; b1+=d1;
      if(Math.abs(d0)<1e-9 && Math.abs(d1)<1e-9) break;
    }
    // Kovaryans = (X'WX)^-1
    let s00=0,s01=0,s11=0;
    for(let i=0;i<n;i++){ const p=sigmoid(b0+b1*xs[i]); const w=Math.max(p*(1-p),1e-9); s00+=w; s01+=w*xs[i]; s11+=w*xs[i]*xs[i]; }
    const det=s00*s11-s01*s01;
    const se0=det>0?Math.sqrt(s11/det):null, se1=det>0?Math.sqrt(s00/det):null;
    return { b0, b1, se0, se1 };
  }

  function calculatePOD(measurements, options) {
    options = options || {};
    if(!measurements || !measurements.length) throw new Error('Veri bulunamadı');
    const rows = measurements.map(m=>({ size:parseFloat(m.size), detected: (String(m.detected).trim()==='1'||m.detected===1||String(m.detected).toLowerCase()==='true')?1:0 }))
      .filter(m=>isFinite(m.size));
    if(rows.length<4) throw new Error('Yetersiz veri');
    const xs=rows.map(r=>r.size), ys=rows.map(r=>r.detected);
    const n=rows.length;
    if(ys.every(y=>y===ys[0])) throw new Error('Tüm sonuçlar aynı (hepsi tespit veya hepsi kaçırma) — model kurulamaz');

    const fit = fitLogistic(xs, ys);
    const {b0,b1,se0,se1}=fit;

    // logLik ve AIC
    let ll=0;
    for(let i=0;i<n;i++){ const p=Math.min(Math.max(sigmoid(b0+b1*xs[i]),1e-12),1-1e-12); ll+=ys[i]*Math.log(p)+(1-ys[i])*Math.log(1-p); }
    const k=2;
    const AIC=2*k-2*ll;
    const BIC=k*Math.log(n)-2*ll;
    const deviance=-2*ll;

    const z0 = se0? b0/se0:null, z1 = se1? b1/se1:null;

    // Belirli POD seviyeleri için boyut: logit(P)=b0+b1·a => a=(logit(P)-b0)/b1
    const sizeAt = P => b1!==0 ? (Math.log(P/(1-P)) - b0)/b1 : null;
    const a50=sizeAt(0.5), a90=sizeAt(0.9), a95=sizeAt(0.95);

    // POD eğrisi (grafik)
    const xmin=Math.min(...xs), xmax=Math.max(...xs); const pad=(xmax-xmin)*0.08||1;
    const curve=[]; const steps=60;
    for(let i=0;i<=steps;i++){ const x=xmin-pad+(xmax-xmin+2*pad)*i/steps; curve.push({x, y:sigmoid(b0+b1*x)}); }

    // Boyuta göre gözlenen tespit oranı (grafikte referans noktaları)
    const bySize={}; rows.forEach(r=>{ if(!bySize[r.size])bySize[r.size]={n:0,h:0}; bySize[r.size].n++; bySize[r.size].h+=r.detected; });
    const observed=Object.keys(bySize).map(s=>({ x:parseFloat(s), y:bySize[s].h/bySize[s].n, n:bySize[s].n, hits:bySize[s].h })).sort((a,b)=>a.x-b.x);

    // hit/miss ham noktalar (rug)
    const rug = rows.map(r=>({ x:r.size, y:r.detected }));

    return {
      studyInfo:{ n, positives:ys.reduce((a,b)=>a+b,0), sizes:observed.length },
      parameters:{
        intercept:{ estimate:b0, se:se0, z:z0, p:z0!=null?normP(z0):null },
        slope:{ estimate:b1, se:se1, z:z1, p:z1!=null?normP(z1):null }
      },
      fit:{ AIC, BIC, deviance, logLik:ll },
      pod:{ a50, a90, a95 },
      graph:{ curve, observed, rug },
      equation: 'logit(P) = ' + b0.toFixed(3) + (b1<0?' - ':' + ') + Math.abs(b1).toFixed(3) + ' × Boyut',
      interpretation:{ a90 }
    };
  }

  const api={ calculatePOD, fitLogistic };
  if(typeof module!=='undefined'&&module.exports) module.exports=api;
  if(typeof window!=='undefined') window.podCalculations=api;
})();
