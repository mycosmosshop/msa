/**
 * İstatistiksel Tolerans Aralığı (Tolerance Intervals) — Minitab metodolojisi
 * Popülasyonun %P'sini %C güvenle içeren aralık.
 * Normal: iki-yön Howe(1969) k2, tek-yön Natrella yaklaşımı k1.
 * Parametrik-olmayan: sıra istatistikleri (yeterli n varsa).
 */
(function () {
  'use strict';
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
  function normCdf(z){ // Abramowitz-Stegun
    const t=1/(1+0.2316419*Math.abs(z)); const dd=0.3989423*Math.exp(-z*z/2);
    let p=dd*t*(0.3193815+t*(-0.3565638+t*(1.781478+t*(-1.821256+t*1.330274)))); return z>0?1-p:p; }
  function chi2Inv(p,df){ if(df<=0)return 0; const z=normInv(p); const t=1-2/(9*df)+z*Math.sqrt(2/(9*df)); return df*t*t*t; }
  function mean(a){ return a.reduce((x,y)=>x+y,0)/a.length; }
  function sd(a){ if(a.length<2)return 0; const m=mean(a); return Math.sqrt(a.reduce((s,v)=>s+(v-m)*(v-m),0)/(a.length-1)); }

  // İki-yön normal tolerans faktörü (Howe 1969)
  function k2factor(n,P,C){ const nu=n-1; const zp=normInv((1+P)/2); const chi=chi2Inv(1-C,nu); return zp*Math.sqrt(nu*(1+1/n)/chi); }
  // Tek-yön normal tolerans faktörü (Natrella yaklaşımı, noncentral t'ye eşdeğer)
  function k1factor(n,P,C){ const zp=normInv(P); const zc=normInv(C); const nu=n-1;
    const a=1-(zc*zc)/(2*nu); const b=zp*zp-(zc*zc)/n; return (zp+Math.sqrt(Math.max(0,zp*zp-a*b)))/a; }

  // Anderson-Darling normallik (p-değeriyle)
  function andersonDarling(data){ const n=data.length; const m=mean(data), s=sd(data); const x=[...data].sort((a,b)=>a-b); let S=0;
    for(let i=0;i<n;i++){ const Fi=Math.min(Math.max(normCdf((x[i]-m)/s),1e-12),1-1e-12); const Fj=Math.min(Math.max(normCdf((x[n-1-i]-m)/s),1e-12),1-1e-12); S+=(2*(i+1)-1)*(Math.log(Fi)+Math.log(1-Fj)); }
    const A2=-n-S/n; const A2s=A2*(1+0.75/n+2.25/(n*n)); let p;
    if(A2s<0.2)p=1-Math.exp(-13.436+101.14*A2s-223.73*A2s*A2s); else if(A2s<0.34)p=1-Math.exp(-8.318+42.796*A2s-59.938*A2s*A2s);
    else if(A2s<0.6)p=Math.exp(0.9177-4.279*A2s-1.38*A2s*A2s); else if(A2s<10)p=Math.exp(1.2937-5.709*A2s+0.0186*A2s*A2s); else p=0;
    return { ad:A2s, p:Math.min(Math.max(p,0),1) }; }

  function toleranceInterval(data, opts){
    opts=opts||{};
    const P=opts.P!=null?parseFloat(opts.P):0.99;   // içerilecek oran
    const C=opts.C!=null?parseFloat(opts.C):0.95;   // güven
    data=(data||[]).map(Number).filter(v=>isFinite(v));
    if(data.length<2) throw new Error('En az 2 veri gerekli');
    const n=data.length, m=mean(data), s=sd(data);
    const k2=k2factor(n,P,C), k1=k1factor(n,P,C);
    // Parametrik-olmayan (sıra istatistikleri): en küçük/en büyük ile sağlanan gerçek güven
    const sorted=[...data].sort((a,b)=>a-b);
    // (min,max) aralığının gerçek güveni: 1 - P^n - n(1-P)P^(n-1)... yaklaşık: C_np = 1 - n*P^(n-1) + (n-1)*P^n
    const npCover = 1 - n*Math.pow(P,n-1) + (n-1)*Math.pow(P,n);
    const ad=andersonDarling(data);
    return {
      n, mean:m, sd:s, P, C,
      twoSided:{ lower:m-k2*s, upper:m+k2*s, k:k2 },
      oneSidedLower:{ bound:m-k1*s, k:k1 },
      oneSidedUpper:{ bound:m+k1*s, k:k1 },
      nonparametric:{ lower:sorted[0], upper:sorted[n-1], confidence:Math.max(0,npCover) },
      normality:ad,
      data:sorted
    };
  }

  const api={ toleranceInterval, k1factor, k2factor, normInv };
  if(typeof module!=='undefined'&&module.exports) module.exports=api;
  if(typeof window!=='undefined') window.toleranceCalculations=api;
})();
