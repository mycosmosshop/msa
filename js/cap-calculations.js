/**
 * Process Capability Study (Proses Yeterliliği)
 * AIAG / ISO / JASP metodolojisi ile birebir.
 *
 * Girdi: measurements = [{ value, subgroup }]  (subgroup opsiyonel; yoksa subgroupSize'a göre bölünür)
 * options: { lsl, usl, target, subgroupSize (varsayılan 5) }
 *
 * σ_within  = s̄ / c4(n)   (X-bar & s) — kısa dönem
 * σ_overall = örneklem std sapması      — uzun dönem
 * Cp/Cpk (within) ; Pp/Ppk (overall) ; Cpm (hedefe göre)
 */
(function () {
  'use strict';
  function _jStat(){ if(typeof window!=='undefined'&&window.jStat)return window.jStat; if(typeof jStat!=='undefined')return jStat; try{return require('jstat');}catch(e){return null;} }
  const js0 = _jStat();
  function normCdf(z){ const js=_jStat(); if(js&&js.normal) return js.normal.cdf(z,0,1);
    // Abramowitz-Stegun
    const t=1/(1+0.2316419*Math.abs(z)); const d=0.3989423*Math.exp(-z*z/2);
    let p=d*t*(0.3193815+t*(-0.3565638+t*(1.781478+t*(-1.821256+t*1.330274))));
    return z>0?1-p:p;
  }
  function mean(a){ return a.reduce((x,y)=>x+y,0)/a.length; }
  function sampSd(a){ if(a.length<2)return 0; const m=mean(a); return Math.sqrt(a.reduce((s,v)=>s+(v-m)*(v-m),0)/(a.length-1)); }
  // Normal ters (Acklam) — jStat'siz
  function normInv(p){ if(p<=0)return -Infinity; if(p>=1)return Infinity;
    const a=[-3.969683028665376e+01,2.209460984245205e+02,-2.759285104469687e+02,1.383577518672690e+02,-3.066479806614716e+01,2.506628277459239e+00];
    const b=[-5.447609879822406e+01,1.615858368580409e+02,-1.556989798598866e+02,6.680131188771972e+01,-1.328068155288572e+01];
    const c=[-7.784894002430293e-03,-3.223964580411365e-01,-2.400758277161838e+00,-2.549732539343734e+00,4.374664141464968e+00,2.938163982698783e+00];
    const d=[7.784695709041462e-03,3.224671290700398e-01,2.445134137142996e+00,3.754408661907416e+00];
    const pl=0.02425,ph=1-pl; let q,r;
    if(p<pl){ q=Math.sqrt(-2*Math.log(p)); return (((((c[0]*q+c[1])*q+c[2])*q+c[3])*q+c[4])*q+c[5])/((((d[0]*q+d[1])*q+d[2])*q+d[3])*q+1); }
    if(p<=ph){ q=p-0.5; r=q*q; return (((((a[0]*r+a[1])*r+a[2])*r+a[3])*r+a[4])*r+a[5])*q/(((((b[0]*r+b[1])*r+b[2])*r+b[3])*r+b[4])*r+1); }
    q=Math.sqrt(-2*Math.log(1-p)); return -(((((c[0]*q+c[1])*q+c[2])*q+c[3])*q+c[4])*q+c[5])/((((d[0]*q+d[1])*q+d[2])*q+d[3])*q+1);
  }
  // Ki-kare ters (Wilson-Hilferty) — orta/büyük df için tam isabetli
  function chi2Inv(p,df){ if(df<=0)return 0; const z=normInv(p); const t=1-2/(9*df)+z*Math.sqrt(2/(9*df)); return df*t*t*t; }
  // %(1-alpha) güven aralıkları
  function cpCI(cp,df,alpha){ if(cp==null||df<=0)return null; return { lo:cp*Math.sqrt(chi2Inv(alpha/2,df)/df), hi:cp*Math.sqrt(chi2Inv(1-alpha/2,df)/df) }; }
  function cpkCI(cpk,df,N,alpha){ if(cpk==null||df<=0)return null; const z=normInv(1-alpha/2); const hw=z*Math.sqrt(1/(9*N)+cpk*cpk/(2*df)); return { lo:cpk-hw, hi:cpk+hw }; }
  // Kontrol kartı testleri (Nelson kuralları — yaygın alt küme: 1,2,3,5)
  function controlTests(pts, cl, ucl, lcl){
    const y=pts.map(p=>p.y); const n=y.length; const sig=(ucl-cl)/3; const viol=[];
    let t1=[]; y.forEach((v,i)=>{ if(v>ucl||v<lcl) t1.push(i+1); }); if(t1.length) viol.push({rule:1,desc:'Kontrol sınırları dışında nokta (3σ)',pts:t1});
    { let run=0,side=0,hit=[]; for(let i=0;i<n;i++){ const s=y[i]>cl?1:(y[i]<cl?-1:0); if(s!==0&&s===side)run++; else {run=(s!==0?1:0);side=s;} if(run>=9)hit.push(i+1); } if(hit.length) viol.push({rule:2,desc:'9 ardışık nokta merkez çizgisinin aynı tarafında',pts:hit}); }
    { let inc=1,dec=1,hit=[]; for(let i=1;i<n;i++){ if(y[i]>y[i-1]){inc++;dec=1;} else if(y[i]<y[i-1]){dec++;inc=1;} else {inc=1;dec=1;} if(inc>=6||dec>=6)hit.push(i+1); } if(hit.length) viol.push({rule:3,desc:'6 ardışık nokta sürekli artan/azalan',pts:hit}); }
    { const u2=cl+2*sig,l2=cl-2*sig; let hit=[]; for(let i=2;i<n;i++){ const w=[i-2,i-1,i]; const au=w.filter(j=>y[j]>u2).length, al=w.filter(j=>y[j]<l2).length; if(au>=2||al>=2)hit.push(i+1); } if(hit.length) viol.push({rule:5,desc:'3 noktadan 2si 2σ ötesinde (aynı taraf)',pts:hit}); }
    return viol;
  }
  // c4 sabiti (alt grup boyutu n)
  function c4(n){ if(n<2)return 1; // c4 = sqrt(2/(n-1)) * Γ(n/2)/Γ((n-1)/2)
    const g=(x)=> js0&&js0.gammafn? js0.gammafn(x) : Math.exp(lgamma(x));
    return Math.sqrt(2/(n-1))*g(n/2)/g((n-1)/2);
  }
  function lgamma(x){ // Lanczos
    const g=7, c=[0.99999999999980993,676.5203681218851,-1259.1392167224028,771.32342877765313,-176.61502916214059,12.507343278686905,-0.13857109526572012,9.9843695780195716e-6,1.5056327351493116e-7];
    if(x<0.5) return Math.log(Math.PI/Math.sin(Math.PI*x))-lgamma(1-x);
    x-=1; let a=c[0]; const t=x+g+0.5;
    for(let i=1;i<g+2;i++)a+=c[i]/(x+i);
    return 0.5*Math.log(2*Math.PI)+(x+0.5)*Math.log(t)-t+Math.log(a);
  }
  const d2tab={2:1.128,3:1.693,4:2.059,5:2.326,6:2.534,7:2.704,8:2.847,9:2.970,10:3.078};

  // Anderson-Darling normallik testi
  function andersonDarling(data, mu, sd){
    const n=data.length; const x=[...data].sort((a,b)=>a-b);
    let S=0;
    for(let i=0;i<n;i++){
      const zi=(x[i]-mu)/sd; const zj=(x[n-1-i]-mu)/sd;
      const Fi=Math.min(Math.max(normCdf(zi),1e-12),1-1e-12);
      const Fj=Math.min(Math.max(normCdf(zj),1e-12),1-1e-12);
      S+=(2*(i+1)-1)*(Math.log(Fi)+Math.log(1-Fj));
    }
    const A2=-n-S/n;
    const A2star=A2*(1+0.75/n+2.25/(n*n));
    // p-değeri (D'Agostino-Stephens)
    let p;
    if(A2star<0.2) p=1-Math.exp(-13.436+101.14*A2star-223.73*A2star*A2star);
    else if(A2star<0.34) p=1-Math.exp(-8.318+42.796*A2star-59.938*A2star*A2star);
    else if(A2star<0.6) p=Math.exp(0.9177-4.279*A2star-1.38*A2star*A2star);
    else if(A2star<10) p=Math.exp(1.2937-5.709*A2star+0.0186*A2star*A2star);
    else p=0;
    return { A2, A2star, p:Math.min(Math.max(p,0),1) };
  }

  function ppm(frac){ return frac*1e6; }

  function calculateCapability(measurements, options){
    options=options||{};
    if(!measurements||!measurements.length) throw new Error('Ölçüm verisi bulunamadı');
    const subSize = options.subgroupSize || 5;
    const rows = measurements.map((m,i)=>({ value:parseFloat(m.value!==undefined?m.value:m.measurement),
      subgroup: (m.subgroup!==undefined&&m.subgroup!==null&&String(m.subgroup)!=='')?String(m.subgroup):String(Math.floor(i/subSize)+1) }))
      .filter(m=>isFinite(m.value));
    if(rows.length<subSize*2) throw new Error('Yetersiz veri');

    // ---- Ayarlar (JASP Process Capability seçenekleri) ----
    const withinMethod = String(options.withinMethod||'sbar').toLowerCase();      // sbar | rbar | pooled
    const useUnbiasing = options.useUnbiasing!==false && options.useUnbiasing!=='false'; // c4/sapmasızlık sabiti
    let ciLevel = options.ciLevel!=null ? parseFloat(options.ciLevel) : 90; if(ciLevel>1) ciLevel=ciLevel/100; if(!(ciLevel>0&&ciLevel<1)) ciLevel=0.90;
    const ALPHA = 1 - ciLevel;
    const sigmaMult = options.sigmaMult!=null ? (parseFloat(options.sigmaMult)||3) : 3;
    const distReq = String(options.distribution||'normal').toLowerCase();         // normal | boxcox | lognormal
    const chartType = String(options.controlChart||'auto').toLowerCase();         // xbars | xbarr | imr | auto
    const binsOpt = options.bins!=null ? parseInt(options.bins,10) : null;

    // ---- Normalizasyon (Box-Cox / Lognormal) — veri + spesifikasyon aynı dönüşümden geçer ----
    let transform = { applied:false, method:'normal', lambda:null, shift:0 };
    let TF = function(x){ return x; };   // spesifikasyon dönüştürücü (varsayılan: kimlik)
    (function(){
      if(distReq!=='boxcox' && distReq!=='lognormal') return;
      const orig = rows.map(r=>r.value);
      const specVals=['lsl','usl','target'].map(k=>options[k]).filter(v=>v!=null&&isFinite(parseFloat(v))).map(parseFloat);
      const minAll = Math.min.apply(null, orig.concat(specVals.length?specVals:[Infinity]));
      const shift = minAll<=0 ? (1-minAll) : 0;             // tüm değerleri pozitife kaydır
      const pos = orig.map(v=>v+shift);
      let lam;
      if(distReq==='lognormal'){ lam=0; }
      else {
        const sumLog = pos.reduce((a,v)=>a+Math.log(v),0);
        function ll(l){ const y=pos.map(x=> l===0?Math.log(x):(Math.pow(x,l)-1)/l); const m=mean(y); const s2=y.reduce((a,v)=>a+(v-m)*(v-m),0)/y.length; if(!(s2>0))return -1e18; return -pos.length/2*Math.log(s2)+(l-1)*sumLog; }
        let best=1,bl=-1e18;
        for(let l=-5;l<=5.0001;l+=0.01){ const v=ll(l); if(v>bl){bl=v;best=l;} }
        for(let l=best-0.01;l<=best+0.01;l+=0.001){ const v=ll(l); if(v>bl){bl=v;best=l;} }
        lam=Math.round(best*1000)/1000 || 0;
      }
      TF = function(x){ const p=x+shift; if(!(p>0)) return null; return lam===0?Math.log(p):(Math.pow(p,lam)-1)/lam; };
      rows.forEach(r=>{ const t=TF(r.value); if(t!=null) r.value=t; });
      transform = { applied:true, method:distReq, lambda:lam, shift };
    })();

    const all=rows.map(r=>r.value);
    const N=all.length;
    const grandMean=mean(all);
    const sdOverall=sampSd(all);

    // Alt gruplar
    const groupOrder=[]; const groups={};
    rows.forEach(r=>{ if(!groups[r.subgroup]){groups[r.subgroup]=[];groupOrder.push(r.subgroup);} groups[r.subgroup].push(r.value); });
    const subs=groupOrder.map(g=>({ g, vals:groups[g], mean:mean(groups[g]), sd:sampSd(groups[g]), range:Math.max(...groups[g])-Math.min(...groups[g]), n:groups[g].length }));
    const n = Math.round(mean(subs.map(s=>s.n)));   // tipik alt grup boyutu
    const sbar = mean(subs.map(s=>s.sd));
    const rbar = mean(subs.map(s=>s.range));
    const xbarbar = mean(subs.map(s=>s.mean));
    const c4n = c4(n);
    const d2n = d2tab[n] || 2.326;
    // Hareketli açıklık (alt grup boyutu 1 → I-MR): MR̄ = ardışık farkların ortalaması
    let mrbar=0; { let s=0,c=0; for(let i=1;i<all.length;i++){ s+=Math.abs(all[i]-all[i-1]); c++; } mrbar=c?s/c:0; }
    // Pooled std sapma (sapmasızlık düzeltmeli)
    let sPooled=0,dfPool=0; subs.forEach(s=>{ sPooled+=(s.n-1)*s.sd*s.sd; dfPool+=s.n-1; });
    sPooled = dfPool>0 ? Math.sqrt(sPooled/dfPool) : 0;
    const cbar = useUnbiasing ? c4n : 1;
    // σ_within yöntemleri (JASP Advanced options: subgroup size >1 için S-bar/R-bar/Pooled + sapmasızlık sabiti)
    const sigmaWithinS = n>=2 ? sbar / cbar : (mrbar>0 ? mrbar/1.128 : sdOverall);   // S-bar (s̄/c4)
    const sigmaWithinR = n>=2 ? rbar / d2n : sigmaWithinS;                            // R-bar (R̄/d₂)
    const sigmaWithinP = n>=2 ? (useUnbiasing ? sPooled / c4(dfPool+1) : sPooled) : sigmaWithinS; // Pooled
    const sigmaWithin = n<2 ? sigmaWithinS
                       : (withinMethod==='rbar' ? sigmaWithinR
                       : (withinMethod==='pooled' ? sigmaWithinP : sigmaWithinS));
    const sigmaOverall = sdOverall;
    // Serbestlik dereceleri (güven aralığı için): total = N−1 (JASP kesin); within = Σ(n_g−1)=N−k, alt grup=1 ise MR sayısı
    const dfTotal = Math.max(1, N-1);
    const dfWithin = n>=2 ? Math.max(1, N-subs.length) : Math.max(1, N-1);

    // Spesifikasyon (dönüşüm uygulandıysa aynı dönüşümden geçer; orijinal değerler saklanır)
    const origLsl = (options.lsl!=null&&isFinite(parseFloat(options.lsl)))?parseFloat(options.lsl):null;
    const origUsl = (options.usl!=null&&isFinite(parseFloat(options.usl)))?parseFloat(options.usl):null;
    const origTarget = (options.target!=null&&isFinite(parseFloat(options.target)))?parseFloat(options.target):null;
    const lsl = origLsl!=null ? TF(origLsl) : null;
    const usl = origUsl!=null ? TF(origUsl) : null;
    const target = origTarget!=null ? TF(origTarget) : null;

    function indices(sigma){
      const cp = (lsl!=null&&usl!=null&&sigma>0)? (usl-lsl)/(6*sigma):null;
      const cpu = (usl!=null&&sigma>0)? (usl-grandMean)/(3*sigma):null;
      const cpl = (lsl!=null&&sigma>0)? (grandMean-lsl)/(3*sigma):null;
      let cpk=null;
      if(cpu!=null&&cpl!=null) cpk=Math.min(cpu,cpl);
      else if(cpu!=null) cpk=cpu; else if(cpl!=null) cpk=cpl;
      return { cp, cpk, cpu, cpl };
    }
    const within = indices(sigmaWithin);   // Cp, Cpk
    const overall = indices(sigmaOverall); // Pp, Ppk
    // Güven aralıkları (JASP: Cp/Pp ki-kare, Cpk/Ppk Bissell normal-yaklaşım) — seviye ayarlanabilir
    within.ci  = { cp:cpCI(within.cp, dfWithin, ALPHA),  cpk:cpkCI(within.cpk, dfWithin, N, ALPHA) };
    overall.ci = { cp:cpCI(overall.cp, dfTotal, ALPHA),  cpk:cpkCI(overall.cpk, dfTotal, N, ALPHA) };
    // Cpm (hedefe göre, overall sigma)
    let cpm=null;
    if(lsl!=null&&usl!=null&&target!=null){ const denom=6*Math.sqrt(sigmaOverall*sigmaOverall+Math.pow(grandMean-target,2)); cpm= denom>0?(usl-lsl)/denom:null; }

    // Performans (PPM)
    let obsBelow=0, obsAbove=0;
    all.forEach(v=>{ if(lsl!=null&&v<lsl)obsBelow++; if(usl!=null&&v>usl)obsAbove++; });
    const observed={ below:lsl!=null?ppm(obsBelow/N):null, above:usl!=null?ppm(obsAbove/N):null, total:ppm((obsBelow+obsAbove)/N) };
    function expected(sigma){
      const below=lsl!=null?ppm(normCdf((lsl-grandMean)/sigma)):null;
      const above=usl!=null?ppm(1-normCdf((usl-grandMean)/sigma)):null;
      const total=(below||0)+(above||0);
      return { below, above, total:(lsl!=null||usl!=null)?total:null };
    }
    const expWithin=expected(sigmaWithin), expOverall=expected(sigmaOverall);

    // Normallik
    const ad = andersonDarling(all, grandMean, sigmaOverall);

    // Histogram (LSL/USL/hedef görünür kalsın diye kenar payı eklenir)
    const bins = (binsOpt && binsOpt>0) ? binsOpt : Math.min(Math.max(Math.ceil(Math.sqrt(N)),8),20);
    const minV=Math.min(...all), maxV=Math.max(...all);
    const specLo = Math.min(minV, lsl!=null?lsl:minV, target!=null?target:minV);
    const specHi = Math.max(maxV, usl!=null?usl:maxV, target!=null?target:maxV);
    const pad = (specHi-specLo)*0.06 || 1;
    const lo=specLo-pad, hi=specHi+pad;
    const bw=(hi-lo)/bins; const hist=[];
    for(let i=0;i<bins;i++){ const a=lo+i*bw, b=a+bw; const cnt=all.filter(v=>v>=a&&(i===bins-1?v<=b:v<b)).length; hist.push({ x0:a, x1:b, mid:(a+b)/2, count:cnt }); }
    // normal eğriler (Minitab tarzı: overall + within)
    const curveOverall=[], curveWithin=[]; const steps=120;
    for(let i=0;i<=steps;i++){ const x=lo+(hi-lo)*i/steps;
      const po=Math.exp(-0.5*Math.pow((x-grandMean)/sigmaOverall,2))/(sigmaOverall*Math.sqrt(2*Math.PI));
      const pw=(sigmaWithin>0)?Math.exp(-0.5*Math.pow((x-grandMean)/sigmaWithin,2))/(sigmaWithin*Math.sqrt(2*Math.PI)):0;
      curveOverall.push({x, y:po*N*bw}); curveWithin.push({x, y:pw*N*bw}); }
    const curve=curveOverall;   // geriye dönük uyum

    // Kontrol kartı — tip seçilebilir: X̄&S / X̄&R / I-MR (auto: alt grup 1 → I-MR)
    const B3={2:0,3:0,4:0,5:0,6:0.030,7:0.118,8:0.185,9:0.239,10:0.284}[n]||0;
    const B4={2:3.267,3:2.568,4:2.266,5:2.089,6:1.970,7:1.882,8:1.815,9:1.761,10:1.716}[n]||2.089;
    const D3={2:0,3:0,4:0,5:0,6:0,7:0.076,8:0.136,9:0.184,10:0.223}[n]||0;
    const D4={2:3.267,3:2.574,4:2.282,5:2.114,6:2.004,7:1.924,8:1.864,9:1.816,10:1.777}[n]||2.114;
    let xbarChart, sChart, chartLabels, ctrlKind;
    // Kart tipi: auto → alt grup boyutuna göre (n=1 I-MR, 2–8 X̄-R, ≥9 X̄-S); manuel seçim öncelikli (n=1 daima I-MR)
    let kind;
    if(n<2) kind='imr';
    else if(chartType==='imr') kind='imr';
    else if(chartType==='xbarr') kind='xbarr';
    else if(chartType==='xbars') kind='xbars';
    else kind = (n<=8 ? 'xbarr' : 'xbars');   // auto
    const f = sigmaMult/3;   // 3σ dışı katsayı için bant ölçekleme
    if(kind==='imr'){
      ctrlKind='imr';
      const mrPts=[]; for(let i=1;i<all.length;i++) mrPts.push(Math.abs(all[i]-all[i-1]));
      const halfI=sigmaMult*(mrbar/1.128);
      xbarChart={ points:all.map((v,i)=>({x:i+1,y:v})), cl:grandMean, ucl:grandMean+halfI, lcl:grandMean-halfI };
      sChart={ points:mrPts.map((v,i)=>({x:i+2,y:v})), cl:mrbar, ucl:mrbar+(3.267*mrbar-mrbar)*f, lcl:0 };
      chartLabels={ top:'Bireysel Değerler (I)', bottom:'Hareketli Açıklık (MR)', topAxis:'Değer', bottomAxis:'MR', xAxis:'Gözlem', kind:'I-MR' };
    } else if(kind==='xbarr'){
      ctrlKind='xbarr';
      const half=sigmaMult*((rbar/d2n)/Math.sqrt(n));   // X̄ limitleri R-kartı σ'sından (A₂·R̄)
      xbarChart={ points:subs.map((s,i)=>({x:i+1,y:s.mean})), cl:xbarbar, ucl:xbarbar+half, lcl:xbarbar-half };
      sChart={ points:subs.map((s,i)=>({x:i+1,y:s.range})), cl:rbar, ucl:rbar+(D4*rbar-rbar)*f, lcl:Math.max(0, rbar+(D3*rbar-rbar)*f) };
      chartLabels={ top:'X̄ Kartı (alt grup ortalaması)', bottom:'R Kartı (alt grup açıklığı)', topAxis:'X̄', bottomAxis:'R', xAxis:'Alt grup', kind:'X̄ & R' };
    } else {
      ctrlKind='xbars';
      const half=sigmaMult*((sbar/c4n)/Math.sqrt(n));   // X̄ limitleri S-kartı σ'sından (A₃·s̄)
      xbarChart={ points:subs.map((s,i)=>({x:i+1,y:s.mean})), cl:xbarbar, ucl:xbarbar+half, lcl:xbarbar-half };
      sChart={ points:subs.map((s,i)=>({x:i+1,y:s.sd})), cl:sbar, ucl:sbar+(B4*sbar-sbar)*f, lcl:Math.max(0, sbar+(B3*sbar-sbar)*f) };
      chartLabels={ top:'X̄ Kartı (alt grup ortalaması)', bottom:'S Kartı (alt grup std sapması)', topAxis:'X̄', bottomAxis:'S', xAxis:'Alt grup', kind:'X̄ & S' };
    }
    // Kontrol kartı testleri (her iki kart için)
    xbarChart.tests = controlTests(xbarChart.points, xbarChart.cl, xbarChart.ucl, xbarChart.lcl);
    sChart.tests    = controlTests(sChart.points,    sChart.cl,    sChart.ucl,    sChart.lcl);

    // Q-Q normal olasılık grafiği (Benard medyan rank) + %95 pointwise bant
    const sortedQ=[...all].sort((a,b)=>a-b);
    const qqPts=sortedQ.map((v,i)=>{ const p=(i+0.7)/(N+0.4); const z=normInv(p); return { x:v, z, p }; });
    const qqLine=[{ x:grandMean-4*sigmaOverall, z:-4 },{ x:grandMean+4*sigmaOverall, z:4 }]; // z=(x-μ)/σ
    const qqBandLo=[], qqBandHi=[];
    qqPts.forEach(pt=>{ const phi=Math.exp(-0.5*pt.z*pt.z)/Math.sqrt(2*Math.PI); const se=(phi>1e-6)?(Math.sqrt(pt.p*(1-pt.p)/N)/phi):null; if(se!=null){ qqBandLo.push({ x:grandMean+(pt.z-1.96*se)*sigmaOverall, z:pt.z }); qqBandHi.push({ x:grandMean+(pt.z+1.96*se)*sigmaOverall, z:pt.z }); } });

    // Karar (Cpk within)
    const cpk = within.cpk;
    let verdict = { label:'—', cls:'neutral' };
    if(cpk!=null){ verdict = cpk>=1.33?{label:'Yeterli',cls:'good'} : cpk>=1.0?{label:'Marjinal',cls:'marginal'} : {label:'Yetersiz',cls:'bad'}; }

    const withinLabel = withinMethod==='rbar'?'R̄/d₂':(withinMethod==='pooled'?'Pooled/c₄':'s̄/c₄');
    return {
      studyInfo:{ N, numSubgroups:subs.length, subgroupSize:n, method:(n>=2?'subgroup':'individual'), mrbar, dfWithin, dfTotal,
        lsl, usl, target, origLsl, origUsl, origTarget, mean:grandMean, sigmaWithin, sigmaOverall, sbar, rbar, c4:c4n,
        sigmaWithinS, sigmaWithinR, sigmaWithinP, withinLabel },
      options:{ withinMethod, useUnbiasing, ciLevel, sigmaMult, distribution:distReq, controlChart:chartType, bins, ctrlKind },
      transform,
      within, overall, cpm,
      performance:{ observed, expectedWithin:expWithin, expectedOverall:expOverall },
      normality:{ ad:ad.A2star, adRaw:ad.A2, p:ad.p, mean:grandMean, sd:sigmaOverall, N },
      graph:{ hist, curve, curveOverall, curveWithin, xbarChart, sChart, chartLabels, qq:{ points:qqPts, line:qqLine, bandLo:qqBandLo, bandHi:qqBandHi }, lsl, usl, target, mean:grandMean, sigmaOverall, sigmaWithin },
      interpretation:{ verdict, cpk, acceptability:verdict.label, acceptabilityClass:verdict.cls }
    };
  }

  const api={ calculateCapability, c4, andersonDarling };
  if(typeof module!=='undefined'&&module.exports) module.exports=api;
  if(typeof window!=='undefined') window.capCalculations=api;
})();
