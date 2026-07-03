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
    // σ_within (kısa dönem): alt grup≥2 → JASP pooled/S-kartı yöntemi (s̄/c4); alt grup=1 → hareketli açıklık (MR̄/1.128)
    const sigmaWithin = n>=2 ? sbar / c4n : (mrbar>0 ? mrbar/1.128 : sdOverall);
    const sigmaWithinR = n>=2 ? rbar / d2n : sigmaWithin;   // alternatif (R̄/d₂)
    const sigmaOverall = sdOverall;
    // Serbestlik dereceleri (güven aralığı için): total = N−1 (JASP kesin); within = Σ(n_g−1)=N−k, alt grup=1 ise MR sayısı
    const dfTotal = Math.max(1, N-1);
    const dfWithin = n>=2 ? Math.max(1, N-subs.length) : Math.max(1, N-1);

    // Spesifikasyon
    const lsl = (options.lsl!=null&&isFinite(parseFloat(options.lsl)))?parseFloat(options.lsl):null;
    const usl = (options.usl!=null&&isFinite(parseFloat(options.usl)))?parseFloat(options.usl):null;
    const target = (options.target!=null&&isFinite(parseFloat(options.target)))?parseFloat(options.target):null;

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
    // %90 güven aralıkları (JASP ile aynı: Cp/Pp ki-kare, Cpk/Ppk Bissell normal-yaklaşım)
    const ALPHA=0.10;
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

    // Histogram
    const bins = options.bins || Math.min(Math.max(Math.ceil(Math.sqrt(N)),8),20);
    const minV=Math.min(...all), maxV=Math.max(...all);
    const lo=Math.min(minV, lsl!=null?lsl:minV), hi=Math.max(maxV, usl!=null?usl:maxV);
    const bw=(hi-lo)/bins; const hist=[];
    for(let i=0;i<bins;i++){ const a=lo+i*bw, b=a+bw; const cnt=all.filter(v=>v>=a&&(i===bins-1?v<=b:v<b)).length; hist.push({ x0:a, x1:b, mid:(a+b)/2, count:cnt }); }
    // normal eğri (overall)
    const curve=[]; const steps=80;
    for(let i=0;i<=steps;i++){ const x=lo+(hi-lo)*i/steps; const pdf=Math.exp(-0.5*Math.pow((x-grandMean)/sigmaOverall,2))/(sigmaOverall*Math.sqrt(2*Math.PI)); curve.push({x, y:pdf*N*bw}); }

    // Kontrol kartı (X-bar & s)
    const A3={2:2.659,3:1.954,4:1.628,5:1.427,6:1.287,7:1.182,8:1.099,9:1.032,10:0.975}[n]||1.427;
    const B3={2:0,3:0,4:0,5:0,6:0.030,7:0.118,8:0.185,9:0.239,10:0.284}[n]||0;
    const B4={2:3.267,3:2.568,4:2.266,5:2.089,6:1.970,7:1.882,8:1.815,9:1.761,10:1.716}[n]||2.089;
    let xbarChart, sChart, chartLabels;
    if(n>=2){
      xbarChart={ points:subs.map((s,i)=>({x:i+1,y:s.mean})), cl:xbarbar, ucl:xbarbar+A3*sbar, lcl:xbarbar-A3*sbar };
      sChart={ points:subs.map((s,i)=>({x:i+1,y:s.sd})), cl:sbar, ucl:B4*sbar, lcl:B3*sbar };
      chartLabels={ top:'X̄ Kartı (alt grup ortalaması)', bottom:'S Kartı (alt grup std sapması)', topAxis:'X̄', bottomAxis:'S', xAxis:'Alt grup' };
    } else {
      // Bireysel & Hareketli Açıklık (I-MR) — alt grup boyutu 1
      const mrPts=[]; for(let i=1;i<all.length;i++) mrPts.push(Math.abs(all[i]-all[i-1]));
      xbarChart={ points:all.map((v,i)=>({x:i+1,y:v})), cl:grandMean, ucl:grandMean+2.66*mrbar, lcl:grandMean-2.66*mrbar };
      sChart={ points:mrPts.map((v,i)=>({x:i+2,y:v})), cl:mrbar, ucl:3.267*mrbar, lcl:0 };
      chartLabels={ top:'Bireysel Değerler (I)', bottom:'Hareketli Açıklık (MR)', topAxis:'Değer', bottomAxis:'MR', xAxis:'Gözlem' };
    }

    // Karar (Cpk within)
    const cpk = within.cpk;
    let verdict = { label:'—', cls:'neutral' };
    if(cpk!=null){ verdict = cpk>=1.33?{label:'Yeterli',cls:'good'} : cpk>=1.0?{label:'Marjinal',cls:'marginal'} : {label:'Yetersiz',cls:'bad'}; }

    return {
      studyInfo:{ N, numSubgroups:subs.length, subgroupSize:n, method:(n>=2?'subgroup':'individual'), mrbar, dfWithin, dfTotal, lsl, usl, target, mean:grandMean, sigmaWithin, sigmaOverall, sbar, rbar, c4:c4n },
      within, overall, cpm,
      performance:{ observed, expectedWithin:expWithin, expectedOverall:expOverall },
      normality:{ ad:ad.A2star, adRaw:ad.A2, p:ad.p, mean:grandMean, sd:sigmaOverall, N },
      graph:{ hist, curve, xbarChart, sChart, chartLabels, lsl, usl, target, mean:grandMean, sigmaOverall },
      interpretation:{ verdict, cpk, acceptability:verdict.label, acceptabilityClass:verdict.cls }
    };
  }

  const api={ calculateCapability, c4, andersonDarling };
  if(typeof module!=='undefined'&&module.exports) module.exports=api;
  if(typeof window!=='undefined') window.capCalculations=api;
})();
