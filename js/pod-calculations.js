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
  function normCdf(z){ const js=_jStat(); if(js&&js.normal) return js.normal.cdf(z,0,1);
    // Abramowitz-Stegun yaklaşımı
    const t=1/(1+0.2316419*Math.abs(z)); const d=0.3989423*Math.exp(-z*z/2);
    let p=d*t*(0.3193815+t*(-0.3565638+t*(1.781478+t*(-1.821256+t*1.330274))));
    return z>0 ? 1-p : p; }
  function normPdf(z){ return 0.3989422804*Math.exp(-z*z/2); }
  function normInv(p){ const js=_jStat(); if(js&&js.normal) return js.normal.inv(p,0,1);
    // Acklam yaklaşık ters
    const a=[-39.6968302866538,220.946098424521,-275.928510446969,138.357751867269,-30.6647980661472,2.50662827745924];
    const b=[-54.4760987982241,161.585836858041,-155.698979859887,66.8013118877197,-13.2806815528857];
    const c=[-7.78489400243029e-3,-0.322396458041136,-2.40075827716184,-2.54973253934373,4.37466414146497,2.93816398269878];
    const d=[7.78469570904146e-3,0.32246712907004,2.445134137143,3.75440866190742];
    const pl=0.02425,ph=1-pl; let q,r;
    if(p<pl){q=Math.sqrt(-2*Math.log(p));return (((((c[0]*q+c[1])*q+c[2])*q+c[3])*q+c[4])*q+c[5])/((((d[0]*q+d[1])*q+d[2])*q+d[3])*q+1);}
    if(p<=ph){q=p-0.5;r=q*q;return (((((a[0]*r+a[1])*r+a[2])*r+a[3])*r+a[4])*r+a[5])*q/(((((b[0]*r+b[1])*r+b[2])*r+b[3])*r+b[4])*r+1);}
    q=Math.sqrt(-2*Math.log(1-p));return -(((((c[0]*q+c[1])*q+c[2])*q+c[3])*q+c[4])*q+c[5])/((((d[0]*q+d[1])*q+d[2])*q+d[3])*q+1); }

  // Bağ (link) fonksiyonları: p=inv(eta), türev dmu/deta
  function linkFns(link){
    if(link==='probit') return { inv:e=>normCdf(e), deriv:e=>Math.max(normPdf(e),1e-9), invert:p=>normInv(Math.min(Math.max(p,1e-6),1-1e-6)) };
    return { inv:e=>sigmoid(e), deriv:e=>{ const p=sigmoid(e); return Math.max(p*(1-p),1e-9); }, invert:p=>Math.log(p/(1-p)) };
  }

  // 2 parametreli GLM (IRLS) — b0 + b1·x, logit ya da probit bağ
  function fitGLM(xs, ys, link, maxIter) {
    maxIter = maxIter || 100; const L=linkFns(link);
    let b0=0, b1=0; const n=xs.length;
    for (let it=0; it<maxIter; it++) {
      let s00=0,s01=0,s11=0, t0=0,t1=0;
      for (let i=0;i<n;i++){
        const eta=b0+b1*xs[i]; const mu=L.inv(eta); const g=L.deriv(eta);
        const V=Math.max(mu*(1-mu),1e-9); const w=g*g/V;
        const z=eta+(ys[i]-mu)/g;                 // working response
        s00+=w; s01+=w*xs[i]; s11+=w*xs[i]*xs[i]; t0+=w*z; t1+=w*xs[i]*z;
      }
      const det=s00*s11-s01*s01; if(Math.abs(det)<1e-12) break;
      const nb0=( s11*t0 - s01*t1)/det;
      const nb1=(-s01*t0 + s00*t1)/det;
      const conv=Math.abs(nb0-b0)<1e-9 && Math.abs(nb1-b1)<1e-9;
      b0=nb0; b1=nb1; if(conv) break;
    }
    // Kovaryans matrisi (X'WX)^-1
    let s00=0,s01=0,s11=0;
    for(let i=0;i<n;i++){ const eta=b0+b1*xs[i]; const mu=L.inv(eta); const g=L.deriv(eta); const V=Math.max(mu*(1-mu),1e-9); const w=g*g/V; s00+=w; s01+=w*xs[i]; s11+=w*xs[i]*xs[i]; }
    const det=s00*s11-s01*s01;
    const v00=det>0?s11/det:null, v11=det>0?s00/det:null, v01=det>0?-s01/det:null;
    return { b0, b1, se0:v00!=null?Math.sqrt(v00):null, se1:v11!=null?Math.sqrt(v11):null, cov01:v01, link };
  }
  function fitLogistic(xs, ys, maxIter){ return fitGLM(xs, ys, 'logit', maxIter); }

  function calculatePOD(measurements, options) {
    options = options || {};
    const link = options.link==='probit' ? 'probit' : 'logit';
    const logCov = !!options.logTransform;
    const ciLevel = (options.ci!=null && isFinite(parseFloat(options.ci))) ? parseFloat(options.ci) : 0.95;
    if(!measurements || !measurements.length) throw new Error('Veri bulunamadı');
    let rows = measurements.map(m=>({ size:parseFloat(m.size), detected: (String(m.detected).trim()==='1'||m.detected===1||String(m.detected).toLowerCase()==='true')?1:0 }))
      .filter(m=>isFinite(m.size));
    if(rows.length<4) throw new Error('Yetersiz veri');
    if(logCov && rows.some(r=>r.size<=0)) throw new Error('Logaritmik dönüşüm için tüm boyutlar > 0 olmalı');
    const n=rows.length;
    const ys=rows.map(r=>r.detected);
    if(ys.every(y=>y===ys[0])) throw new Error('Tüm sonuçlar aynı (hepsi tespit veya hepsi kaçırma) — model kurulamaz');
    // model kovaryatı (opsiyonel log)
    const tx = s => logCov ? Math.log(s) : s;
    const xs = rows.map(r=>tx(r.size));
    const L = linkFns(link);

    const fit = fitGLM(xs, ys, link);
    const {b0,b1,se0,se1,cov01}=fit;

    // logLik ve AIC (bağa göre)
    let ll=0;
    for(let i=0;i<n;i++){ const p=Math.min(Math.max(L.inv(b0+b1*xs[i]),1e-12),1-1e-12); ll+=ys[i]*Math.log(p)+(1-ys[i])*Math.log(1-p); }
    const k=2; const AIC=2*k-2*ll; const BIC=k*Math.log(n)-2*ll; const deviance=-2*ll;
    const z0 = se0? b0/se0:null, z1 = se1? b1/se1:null;

    // Belirli POD seviyeleri için boyut: eta = link(P) => x = (link(P)-b0)/b1 ; log ise geri dönüştür
    const sizeAt = P => { if(b1===0) return null; const xv=(L.invert(P)-b0)/b1; return logCov?Math.exp(xv):xv; };
    const a50=sizeAt(0.5), a90=sizeAt(0.9), a95=sizeAt(0.95);

    // POD eğrisi + güven bandı (delta yöntemi: Var(eta)=se0²+2x·cov01+x²·se1²)
    const zc = normInv(1-(1-ciLevel)/2);
    const sizesRaw=rows.map(r=>r.size);
    const smin=Math.min.apply(null,sizesRaw), smax=Math.max.apply(null,sizesRaw); const pad=(smax-smin)*0.05||1;
    const lo = logCov ? Math.max(smin*0.5, 1e-6) : smin-pad, hi = smax+pad;
    const curve=[]; const steps=80;
    for(let i=0;i<=steps;i++){ const sVal=lo+(hi-lo)*i/steps; const xv=tx(sVal); const eta=b0+b1*xv;
      const ve=(se0!=null&&se1!=null&&cov01!=null)?Math.max(se0*se0+2*xv*cov01+xv*xv*se1*se1,0):0;
      const half=zc*Math.sqrt(ve);
      curve.push({ x:sVal, y:L.inv(eta), yLo:L.inv(eta-half), yHi:L.inv(eta+half) }); }

    const bySize={}; rows.forEach(r=>{ if(!bySize[r.size])bySize[r.size]={n:0,h:0}; bySize[r.size].n++; bySize[r.size].h+=r.detected; });
    const observed=Object.keys(bySize).map(s=>({ x:parseFloat(s), y:bySize[s].h/bySize[s].n, n:bySize[s].n, hits:bySize[s].h })).sort((a,b)=>a.x-b.x);
    const rug = rows.map(r=>({ x:r.size, y:r.detected }));

    // Yoğunluk eğrileri (JASP "Show density"): kovaryatın hit ve miss gruplarındaki KDE'si
    const hitX = rows.filter(r=>r.detected===1).map(r=>r.size);
    const missX = rows.filter(r=>r.detected===0).map(r=>r.size);
    function kde(dat, gx){ if(!dat.length) return gx.map(()=>0);
      const mm=dat.reduce((a,b)=>a+b,0)/dat.length;
      const sd=Math.sqrt(dat.reduce((s,v)=>s+(v-mm)*(v-mm),0)/Math.max(dat.length-1,1))||1;
      const h=(1.06*sd*Math.pow(dat.length,-0.2))||1;
      return gx.map(x=>{ let s=0; for(let i=0;i<dat.length;i++){ const u=(x-dat[i])/h; s+=Math.exp(-0.5*u*u); } return s/(dat.length*h*2.5066282746); }); }
    const gridX = curve.map(p=>p.x);
    const dH=kde(hitX,gridX), dM=kde(missX,gridX);
    const dmax=Math.max(Math.max.apply(null,dH), Math.max.apply(null,dM), 1e-9);
    curve.forEach((p,i)=>{ p.dHit=dH[i]/dmax; p.dMiss=dM[i]/dmax; });

    return {
      studyInfo:{ n, positives:ys.reduce((a,b)=>a+b,0), sizes:observed.length, link, logTransform:logCov, ciLevel },
      parameters:{
        intercept:{ estimate:b0, se:se0, z:z0, p:z0!=null?normP(z0):null },
        slope:{ estimate:b1, se:se1, z:z1, p:z1!=null?normP(z1):null }
      },
      fit:{ AIC, BIC, deviance, logLik:ll },
      pod:{ a50, a90, a95 },
      graph:{ curve, observed, rug },
      equation: (link==='probit'?'probit(P) = ':'logit(P) = ') + b0.toFixed(3) + (b1<0?' - ':' + ') + Math.abs(b1).toFixed(3) + ' × ' + (logCov?'ln(Boyut)':'Boyut'),
      interpretation:{ a90 }
    };
  }

  const api={ calculatePOD, fitLogistic };
  if(typeof module!=='undefined'&&module.exports) module.exports=api;
  if(typeof window!=='undefined') window.podCalculations=api;
})();
