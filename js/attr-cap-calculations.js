/**
 * Nitel / Sayılabilir Veriler için Yeterlilik (Attributes Capability)
 * - Binomial: Geçti/Kaldı (kusurlu oranı p, PPM, Süreç Z)   → P kartı
 * - Poisson : Birim başına hata sayısı (DPU)                → U kartı
 * Minitab metodolojisi.
 */
(function () {
  'use strict';
  // Normal ters (Acklam) — Süreç Z için
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
  const sum=(a)=>a.reduce((x,y)=>x+y,0);

  // rows = [{ n:örnek boyutu, d:kusurlu sayısı }]
  function binomialCapability(rows, opts){
    opts=opts||{};
    rows=(rows||[]).filter(r=>r.n>0 && r.d>=0 && r.d<=r.n);
    if(rows.length<2) throw new Error('En az 2 alt grup gerekli');
    const N=rows.length;
    const totalN=sum(rows.map(r=>r.n)), totalD=sum(rows.map(r=>r.d));
    const pbar=totalD/totalN;
    // P kartı (alt gruba göre değişen sınırlar)
    const pchart=rows.map((r,i)=>{ const p=r.d/r.n; const se=Math.sqrt(pbar*(1-pbar)/r.n);
      return { x:i+1, p:p*100, n:r.n, ucl:(pbar+3*se)*100, lcl:Math.max(0,pbar-3*se)*100, cl:pbar*100, ooc:(p>pbar+3*se||p<pbar-3*se) }; });
    // Kümülatif %kusurlu (tahminin yakınsaması)
    let cd=0,cn=0; const cum=rows.map((r,i)=>{ cd+=r.d; cn+=r.n; return { x:i+1, cum:(cd/cn)*100 }; });
    // Örnek boyutuna göre %kusurlu (binom varsayımı: ilişki olmamalı)
    const bySize=rows.map(r=>({ x:r.n, y:(r.d/r.n)*100 }));
    const ps=rows.map(r=>(r.d/r.n)*100);
    // Özet
    const pct=pbar*100, ppm=pbar*1e6;
    const se=Math.sqrt(pbar*(1-pbar)/totalN);
    const ciLo=Math.max(0,(pbar-1.96*se))*100, ciHi=Math.min(100,(pbar+1.96*se)*100);
    const Zbench=normInv(Math.min(Math.max(1-pbar,1e-12),1-1e-12));
    const anyOOC=pchart.some(p=>p.ooc);
    return { type:'binomial', N, totalN, totalD, pbar, pct, ppm, ciLo, ciHi, Zbench, anyOOC, pchart, cum, bySize, ps, target:opts.target!=null?parseFloat(opts.target):null };
  }

  // rows = [{ n:incelenen birim/alan, c:hata sayısı }]
  function poissonCapability(rows, opts){
    opts=opts||{};
    rows=(rows||[]).filter(r=>r.n>0 && r.c>=0);
    if(rows.length<2) throw new Error('En az 2 alt grup gerekli');
    const N=rows.length;
    const totalN=sum(rows.map(r=>r.n)), totalC=sum(rows.map(r=>r.c));
    const ubar=totalC/totalN; // DPU (birim başına hata)
    // U kartı
    const uchart=rows.map((r,i)=>{ const u=r.c/r.n; const se=Math.sqrt(ubar/r.n);
      return { x:i+1, u:u, n:r.n, ucl:ubar+3*se, lcl:Math.max(0,ubar-3*se), cl:ubar, ooc:(u>ubar+3*se||u<ubar-3*se) }; });
    let cc=0,cn=0; const cum=rows.map((r,i)=>{ cc+=r.c; cn+=r.n; return { x:i+1, cum:cc/cn }; });
    const bySize=rows.map(r=>({ x:r.n, y:r.c/r.n }));
    const us=rows.map(r=>r.c/r.n);
    const se=Math.sqrt(ubar/totalN);
    const ciLo=Math.max(0,ubar-1.96*se), ciHi=ubar+1.96*se;
    const minDPU=Math.min.apply(null,us), maxDPU=Math.max.apply(null,us);
    const anyOOC=uchart.some(u=>u.ooc);
    // DPMO (milyon fırsatta hata) — birim=fırsat kabulüyle
    const dpmo=ubar*1e6;
    return { type:'poisson', N, totalN, totalC, ubar, ciLo, ciHi, minDPU, maxDPU, dpmo, anyOOC, uchart, cum, bySize, us, target:opts.target!=null?parseFloat(opts.target):null };
  }

  const api={ binomialCapability, poissonCapability, normInv };
  if(typeof module!=='undefined'&&module.exports) module.exports=api;
  if(typeof window!=='undefined') window.attrCapCalculations=api;
})();
