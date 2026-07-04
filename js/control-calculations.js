/**
 * Control Charts — Variables Charts for Subgroups (X̄ & R, X̄ & s)
 * JASP Quality Control / qcc (R) metodolojisi ile birebir; standart Shewhart sabitleri.
 *
 * Girdi: values = [sayı...] (tek sütun ölçüm), + subgroupSize VEYA groups = [etiket...]
 * options: { chartType:'xbar-r'|'xbar-s', warningLimits:bool, known:{mean,sd}|null }
 */
(function () {
  'use strict';

  // Shewhart sabitleri (alt grup boyutu n): A2,A3,d2,d3,D3,D4,c4,B3,B4
  const K = {
    2:[1.880,2.659,1.128,0.853,0,3.267,0.7979,0,3.267],
    3:[1.023,1.954,1.693,0.888,0,2.574,0.8862,0,2.568],
    4:[0.729,1.628,2.059,0.880,0,2.282,0.9213,0,2.266],
    5:[0.577,1.427,2.326,0.864,0,2.114,0.9400,0,2.089],
    6:[0.483,1.287,2.534,0.848,0,2.004,0.9515,0.030,1.970],
    7:[0.419,1.182,2.704,0.833,0.076,1.924,0.9594,0.118,1.882],
    8:[0.373,1.099,2.847,0.820,0.136,1.864,0.9650,0.185,1.815],
    9:[0.337,1.032,2.970,0.808,0.184,1.816,0.9693,0.239,1.761],
    10:[0.308,0.975,3.078,0.797,0.223,1.777,0.9727,0.284,1.716],
    11:[0.285,0.927,3.173,0.787,0.256,1.744,0.9754,0.321,1.679],
    12:[0.266,0.886,3.258,0.778,0.283,1.717,0.9776,0.354,1.646],
    13:[0.249,0.850,3.336,0.770,0.307,1.693,0.9794,0.382,1.618],
    14:[0.235,0.817,3.407,0.763,0.328,1.672,0.9810,0.406,1.594],
    15:[0.223,0.789,3.472,0.756,0.347,1.653,0.9823,0.428,1.572],
    16:[0.212,0.763,3.532,0.750,0.363,1.637,0.9835,0.448,1.552],
    17:[0.203,0.739,3.588,0.744,0.378,1.622,0.9845,0.466,1.534],
    18:[0.194,0.718,3.640,0.739,0.391,1.608,0.9854,0.482,1.518],
    19:[0.187,0.698,3.689,0.734,0.403,1.597,0.9862,0.497,1.503],
    20:[0.180,0.680,3.735,0.729,0.415,1.585,0.9869,0.510,1.490],
    21:[0.173,0.663,3.778,0.724,0.425,1.575,0.9876,0.523,1.477],
    22:[0.167,0.647,3.819,0.720,0.434,1.566,0.9882,0.534,1.466],
    23:[0.162,0.633,3.858,0.716,0.443,1.557,0.9887,0.545,1.455],
    24:[0.157,0.619,3.895,0.712,0.451,1.548,0.9892,0.555,1.445],
    25:[0.153,0.606,3.931,0.708,0.459,1.541,0.9896,0.565,1.435]
  };
  function konst(n){ return K[n] || K[25]; }
  function mean(a){ return a.reduce((x,y)=>x+y,0)/a.length; }
  function sd(a){ if(a.length<2) return 0; const m=mean(a); return Math.sqrt(a.reduce((s,v)=>s+(v-m)*(v-m),0)/(a.length-1)); }

  // Nelson/WE testleri (X̄ grafiği için) — nokta indeksleri döner
  function runTests(pts, CL, UCL, LCL){
    const n=pts.length; const sig=(UCL-CL)/3; if(!(sig>0)) return {};
    const z=pts.map(p=>(p-CL)/sig);
    const res={1:[],2:[],3:[],4:[],5:[],6:[],7:[],8:[]};
    for(let i=0;i<n;i++){ if(z[i]>3||z[i]<-3) res[1].push(i+1); }            // 1: limit dışı
    for(let i=8;i<n;i++){ let side=z[i]>0; let ok=true; for(let j=i-8;j<=i;j++){ if((z[j]>0)!==side||z[j]===0){ok=false;break;} } if(ok) res[2].push(i+1); } // 2: 9 aynı taraf
    for(let i=5;i<n;i++){ let up=true,dn=true; for(let j=i-5;j<i;j++){ if(!(pts[j+1]>pts[j]))up=false; if(!(pts[j+1]<pts[j]))dn=false; } if(up||dn) res[3].push(i+1); } // 3: 6 artan/azalan
    for(let i=13;i<n;i++){ let ok=true; for(let j=i-13;j<i;j++){ if((pts[j+1]>pts[j])===(pts[j]>pts[j-1<0?0:j-1])){} } // 4 basitleştirilmiş: 14 zikzak
      let alt=true; for(let j=i-13;j<i;j++){ const a=pts[j+1]-pts[j], b=(j>0?pts[j]-pts[j-1]:0); if(j>i-13 && a*b>=0){alt=false;break;} } if(alt) res[4].push(i+1); }
    function kOfM(idx,k,m,cmp){ let c=0; for(let j=idx-m+1;j<=idx;j++){ if(j>=0&&cmp(z[j]))c++; } return c>=k; }
    for(let i=2;i<n;i++){ if(kOfM(i,2,3,x=>x>2)||kOfM(i,2,3,x=>x<-2)) res[5].push(i+1); }   // 5: 3'te 2, >2σ
    for(let i=4;i<n;i++){ if(kOfM(i,4,5,x=>x>1)||kOfM(i,4,5,x=>x<-1)) res[6].push(i+1); }   // 6: 5'te 4, >1σ
    for(let i=14;i<n;i++){ let ok=true; for(let j=i-14;j<=i;j++){ if(Math.abs(z[j])>=1){ok=false;break;} } if(ok) res[7].push(i+1); } // 7: 15 nokta ±1σ içinde
    for(let i=7;i<n;i++){ let ok=true; for(let j=i-7;j<=i;j++){ if(Math.abs(z[j])<=1){ok=false;break;} } if(ok) res[8].push(i+1); }  // 8: 8 nokta ±1σ dışında
    const out={}; Object.keys(res).forEach(k=>{ if(res[k].length) out[k]=res[k]; });
    return out;
  }

  function calculateSubgroupChart(values, options){
    options = options || {};
    const chartType = options.chartType==='xbar-r' ? 'xbar-r' : 'xbar-s';
    const warning = !!options.warningLimits;
    const known = (options.known && (options.known.mean!=null || options.known.sd!=null)) ? options.known : null;

    // alt gruplara ayır
    const groupMethod = options.groupingMethod==='change' ? 'change' : (options.groupingMethod==='same' ? 'same' : null);
    let groups=[];
    if(options.groups && options.groups.length===values.length){
      if(groupMethod==='change'){
        // ardışık değer değiştiğinde yeni alt grup
        let cur=null, lab=null;
        for(let i=0;i<values.length;i++){ const g=String(options.groups[i]);
          if(cur===null || g!==lab){ cur={label:g, values:[]}; groups.push(cur); lab=g; }
          cur.values.push(values[i]); }
      } else {
        // aynı değer = aynı alt grup (varsayılan gruplama değişkeni)
        const order=[], map={};
        for(let i=0;i<values.length;i++){ const g=String(options.groups[i]); if(!map[g]){map[g]=[];order.push(g);} map[g].push(values[i]); }
        groups=order.map(g=>({label:g, values:map[g]}));
      }
    } else {
      const sz=Math.max(2, parseInt(options.subgroupSize,10)||5);
      for(let i=0;i<values.length;i+=sz){ const v=values.slice(i,i+sz); if(v.length>=1) groups.push({label:String(groups.length+1), values:v}); }
    }
    groups=groups.filter(g=>g.values.length>=1);
    if(groups.length<2) throw new Error('En az 2 alt grup gerekli');

    const sizes=groups.map(g=>g.values.length);
    const nConst=Math.round(mean(sizes));
    const equal=sizes.every(s=>s===sizes[0]);
    const n=sizes[0];
    // Eşit olmayan boyut: 'fixed' → tek limit (sabit n), 'actual' → noktasal değişken limit
    const unequalMode = options.unequalSizes==='fixed' ? 'fixed' : 'actual';
    const fixedN = Math.max(2, parseInt(options.fixedSize||options.subgroupSize,10) || nConst);
    const nUse = equal ? n : (unequalMode==='fixed' ? fixedN : nConst);
    const kU = konst(nUse), c4U=kU[6], d2U=kU[2];

    const gmeans=groups.map(g=>mean(g.values));
    const granges=groups.map(g=>Math.max.apply(null,g.values)-Math.min.apply(null,g.values));
    const gsds=groups.map(g=>sd(g.values));
    const totalN=sizes.reduce((a,b)=>a+b,0);
    const Xbarbar = groups.reduce((s,g)=>s+mean(g.values)*g.values.length,0)/totalN;
    const Rbar=mean(granges), sbar=mean(gsds);

    const varying = !equal && unequalMode==='actual';   // noktasal değişken limit

    // sigma tahmini
    let sigma;
    if(known && known.sd!=null && isFinite(parseFloat(known.sd))) sigma=parseFloat(known.sd);
    else if(!varying) sigma = chartType==='xbar-r' ? Rbar/d2U : sbar/c4U;
    else { // eşit olmayan (actual) → havuzlanmış
      if(chartType==='xbar-r'){ let s=0; for(let i=0;i<groups.length;i++) s+=granges[i]/konst(sizes[i])[2]; sigma=s/groups.length; }
      else { let num=0,den=0; for(let i=0;i<groups.length;i++){ num+=(sizes[i]-1)*gsds[i]*gsds[i]; den+=(sizes[i]-1); } const sp=Math.sqrt(num/den); sigma=sp/konst(Math.max(2,Math.round(den/groups.length)+1))[6]; }
    }
    const center = (known && known.mean!=null && isFinite(parseFloat(known.mean))) ? parseFloat(known.mean) : Xbarbar;

    // X̄ grafiği limitleri (skaler ya da noktasal dizi)
    var xbar;
    if(varying){
      const UCLa=sizes.map(ni=>center+3*sigma/Math.sqrt(ni)), LCLa=sizes.map(ni=>center-3*sigma/Math.sqrt(ni));
      xbar={ points:gmeans, CL:center, UCL:Math.max.apply(null,UCLa), LCL:Math.min.apply(null,LCLa), UCLarr:UCLa, LCLarr:LCLa, varying:true,
        warnUCL:null, warnLCL:null };
    } else {
      const xUCL=center+3*sigma/Math.sqrt(nUse), xLCL=center-3*sigma/Math.sqrt(nUse);
      xbar={ points:gmeans, CL:center, UCL:xUCL, LCL:xLCL, varying:false,
        warnUCL: warning? center+2*sigma/Math.sqrt(nUse):null, warnLCL: warning? center-2*sigma/Math.sqrt(nUse):null };
    }

    // Yayılım grafiği (R / s)
    var spread;
    if(chartType==='xbar-r'){
      if(varying){ const CLa=sizes.map(ni=>konst(ni)[2]*sigma), UCLa=sizes.map(ni=>(konst(ni)[2]+3*konst(ni)[3])*sigma), LCLa=sizes.map(ni=>Math.max(0,(konst(ni)[2]-3*konst(ni)[3])*sigma));
        spread={ kind:'R', label:'Menzil (R)', points:granges, CL:Rbar, UCL:Math.max.apply(null,UCLa), LCL:Math.min.apply(null,LCLa), CLarr:CLa, UCLarr:UCLa, LCLarr:LCLa, varying:true }; }
      else { const kk=kU; const cl=known? kk[2]*sigma : Rbar; const ucl=known? (kk[2]+3*kk[3])*sigma : kk[5]*Rbar; const lcl=known? Math.max(0,(kk[2]-3*kk[3])*sigma) : kk[4]*Rbar;
        spread={ kind:'R', label:'Menzil (R)', points:granges, CL:cl, UCL:ucl, LCL:lcl, varying:false }; }
    } else {
      if(varying){ const CLa=sizes.map(ni=>konst(ni)[6]*sigma), UCLa=sizes.map(ni=>{const c=konst(ni)[6];return (c+3*Math.sqrt(1-c*c))*sigma;}), LCLa=sizes.map(ni=>{const c=konst(ni)[6];return Math.max(0,(c-3*Math.sqrt(1-c*c))*sigma);});
        spread={ kind:'s', label:'Std. Sapma (s)', points:gsds, CL:sbar, UCL:Math.max.apply(null,UCLa), LCL:Math.min.apply(null,LCLa), CLarr:CLa, UCLarr:UCLa, LCLarr:LCLa, varying:true }; }
      else { const kk=kU; const cl=known? kk[6]*sigma : sbar; const ucl=known? (kk[6]+3*Math.sqrt(1-kk[6]*kk[6]))*sigma : kk[8]*sbar; const lcl=known? Math.max(0,(kk[6]-3*Math.sqrt(1-kk[6]*kk[6]))*sigma) : kk[7]*sbar;
        spread={ kind:'s', label:'Std. Sapma (s)', points:gsds, CL:cl, UCL:ucl, LCL:lcl, varying:false }; }
    }

    // Testler: değişken limitte sadece noktasal limit-dışı (zone testleri sabit limit ister)
    let xTests;
    if(varying){ const b=[]; gmeans.forEach((p,i)=>{ if(p>xbar.UCLarr[i]+1e-12||p<xbar.LCLarr[i]-1e-12) b.push(i+1); }); xTests = b.length?{1:b}:{}; }
    else xTests = runTests(gmeans, xbar.CL, xbar.UCL, xbar.LCL);
    // seçili testlere göre süz (varsayılan: hepsi)
    if(options.activeTests && options.activeTests.length){
      const set={}; options.activeTests.forEach(t=>{ set[String(t)]=1; });
      const f={}; Object.keys(xTests).forEach(k=>{ if(set[k]) f[k]=xTests[k]; }); xTests=f;
    }
    const sBeyond=[];
    spread.points.forEach((p,i)=>{ const u=spread.varying?spread.UCLarr[i]:spread.UCL, l=spread.varying?spread.LCLarr[i]:spread.LCL; if(p>u+1e-12||p<l-1e-12) sBeyond.push(i+1); });

    const inControl = !((xTests[1]&&xTests[1].length) || sBeyond.length);

    return {
      chartType, warning, known: known||null, equal, varying, groupMethod:(options.groups?(groupMethod||'same'):null), unequalMode:(!equal?unequalMode:null),
      studyInfo:{ numSubgroups:groups.length, subgroupSize: equal?n:(unequalMode==='fixed'?(fixedN+' (sabit)'):('değişken '+Math.min.apply(null,sizes)+'–'+Math.max.apply(null,sizes))), totalN, sigma, Xbarbar, Rbar, sbar, c4:c4U, d2:d2U },
      groups: groups.map((g,i)=>({ label:g.label, n:g.values.length, mean:gmeans[i], range:granges[i], sd:gsds[i] })),
      xbar, spread,
      tests:{ xbar:xTests, spreadBeyond:sBeyond },
      interpretation:{ inControl, nOut:(xTests[1]?xTests[1].length:0)+sBeyond.length }
    };
  }

  // ── Variables Charts for Individuals (I-MR / X-mR) ──────────────────────
  function calculateIndividualsChart(values, options){
    options = options || {};
    const vals = (values||[]).map(Number).filter(v=>isFinite(v));
    if(vals.length<4) throw new Error('En az birkaç ölçüm gerekli');
    const w = Math.max(2, parseInt(options.movingRangeLength,10)||2);   // ≥2 (menzil için)
    const known = (options.known && (options.known.mean!=null || options.known.sd!=null)) ? options.known : null;
    const n = vals.length;

    // Hareketli menziller: i=w..n için w ardışık gözlemin menzili
    const mr=[]; const mrIndex=[];
    for(let i=w-1;i<n;i++){ const win=vals.slice(i-w+1,i+1); mr.push(Math.max.apply(null,win)-Math.min.apply(null,win)); mrIndex.push(i+1); }
    const xbar = mean(vals);
    const MRbar = mean(mr);
    const kk = konst(w); const d2=kk[2], d3=kk[3], D3=kk[4], D4=kk[5];
    let sigma = (known && known.sd!=null && isFinite(parseFloat(known.sd))) ? parseFloat(known.sd) : MRbar/d2;
    const center = (known && known.mean!=null && isFinite(parseFloat(known.mean))) ? parseFloat(known.mean) : xbar;

    const iChart = { points:vals, CL:center, UCL:center+3*sigma, LCL:center-3*sigma, varying:false,
      warnUCL: options.warningLimits? center+2*sigma:null, warnLCL: options.warningLimits? center-2*sigma:null };
    const mrCL = known? d2*sigma : MRbar;
    const mrUCL = known? (d2+3*d3)*sigma : D4*MRbar;
    const mrLCL = known? Math.max(0,(d2-3*d3)*sigma) : D3*MRbar;
    const mrChart = { kind:'MR', label:'Hareketli Menzil (MR-'+w+')', points:mr, index:mrIndex, CL:mrCL, UCL:mrUCL, LCL:mrLCL, varying:false };

    let iTests = runTests(vals, iChart.CL, iChart.UCL, iChart.LCL);
    if(options.activeTests && options.activeTests.length){ const set={}; options.activeTests.forEach(t=>set[String(t)]=1); const f={}; Object.keys(iTests).forEach(k=>{ if(set[k]) f[k]=iTests[k]; }); iTests=f; }
    const mrBeyond=[]; mr.forEach((p,i)=>{ if(p>mrUCL+1e-12||p<mrLCL-1e-12) mrBeyond.push(mrIndex[i]); });

    // Otokorelasyon (ACF) — opsiyonel
    let acf=null;
    if(options.autocorrelation){
      const L=Math.min(Math.max(1,parseInt(options.lags,10)||25), n-1);
      const ci=(options.ciLevel!=null&&isFinite(parseFloat(options.ciLevel)))?parseFloat(options.ciLevel):0.95;
      let denom=0; for(let i=0;i<n;i++) denom+=(vals[i]-xbar)*(vals[i]-xbar);
      const r=[]; for(let k=1;k<=L;k++){ let num=0; for(let i=0;i<n-k;i++) num+=(vals[i]-xbar)*(vals[i+k]-xbar); r.push({lag:k, r:denom>0?num/denom:0}); }
      const zc = (function(p){ const js=_jStat&&_jStat(); return 1.959963985; })(); // ~%95 için 1.96; genel: normInv
      const z = ci===0.95?1.959963985:(ci===0.99?2.5758293:1.959963985);
      const bound = z/Math.sqrt(n);
      acf={ points:r, bound, ci };
    }

    const inControl = !((iTests[1]&&iTests[1].length) || mrBeyond.length);
    return {
      chartType:'individuals', movingRangeLength:w, warning:!!options.warningLimits, known:known||null,
      studyInfo:{ numPoints:n, movingRangeLength:w, xbar, MRbar, sigma, d2 },
      iChart, mrChart, acf,
      tests:{ i:iTests, mrBeyond },
      interpretation:{ inControl, nOut:(iTests[1]?iTests[1].length:0)+mrBeyond.length }
    };
  }
  function _jStat(){ if(typeof window!=='undefined'&&window.jStat)return window.jStat; if(typeof jStat!=='undefined')return jStat; return null; }

  // ── Control Charts for Attributes (p, np, c, u, Laney p'/u') ─────────────
  function calculateAttributeChart(defects, sizes, options){
    options = options || {};
    const type = options.chartType || 'p';   // p, np, c, u, pprime, uprime
    const d = (defects||[]).map(Number);
    let nArr = (sizes||[]).map(Number);
    const m = d.length;
    if(m<2) throw new Error('En az 2 alt grup gerekli');
    if(!nArr.length || nArr.length!==m){ nArr = d.map(()=>1); }   // c/u için Total yoksa 1
    if(d.some(v=>!isFinite(v)||v<0)) throw new Error('Kusur/hata sayıları ≥ 0 olmalı');

    const sumD = d.reduce((a,b)=>a+b,0), sumN = nArr.reduce((a,b)=>a+b,0);
    const equalN = nArr.every(x=>x===nArr[0]);
    const idx = d.map((_,i)=>i+1);
    let points, CL, UCL, LCL, UCLarr=null, LCLarr=null, varying=false, label, ylabel, note='';

    if(type==='p' || type==='pprime'){
      const pbar = sumD/sumN;
      points = d.map((v,i)=>v/nArr[i]);
      CL = pbar; label = (type==='pprime'?"Laney p′ grafiği":"p grafiği"); ylabel='Oran (p)';
      let sz=1;
      if(type==='pprime'){ // aşırı dağılım düzeltmesi: z_i standartlaştır, MR(z)/d2
        const z = points.map((pi,i)=>{ const s=Math.sqrt(pbar*(1-pbar)/nArr[i]); return s>0?(pi-pbar)/s:0; });
        let mr=0; for(let i=1;i<m;i++) mr+=Math.abs(z[i]-z[i-1]); mr/=(m-1); sz=mr/1.128; if(!(sz>0)) sz=1;
        note='σ_z (aşırı dağılım) = '+sz.toFixed(3);
      }
      UCLarr = nArr.map(ni=>{ const s=Math.sqrt(pbar*(1-pbar)/ni)*sz; return pbar+3*s; });
      LCLarr = nArr.map(ni=>{ const s=Math.sqrt(pbar*(1-pbar)/ni)*sz; return Math.max(0,pbar-3*s); });
      varying = !equalN || type==='pprime';
      if(!varying){ UCL=UCLarr[0]; LCL=LCLarr[0]; }
    } else if(type==='np'){
      if(!equalN) throw new Error('np grafiği sabit örneklem boyutu gerektirir (Total sabit olmalı). Değişken boyut için p grafiği kullanın.');
      const n0=nArr[0]; const pbar=sumD/sumN; const cl=n0*pbar; const s=Math.sqrt(cl*(1-pbar));
      points=d.slice(); CL=cl; UCL=cl+3*s; LCL=Math.max(0,cl-3*s); label='np grafiği'; ylabel='Kusurlu sayısı (np)';
    } else if(type==='c'){
      const cbar=sumD/m; points=d.slice(); CL=cbar; const s=Math.sqrt(cbar); UCL=cbar+3*s; LCL=Math.max(0,cbar-3*s);
      label='c grafiği'; ylabel='Hata sayısı (c)';
      if(!equalN) note='Not: c grafiği sabit inceleme birimi varsayar; birim değişkense u grafiği önerilir.';
    } else if(type==='u' || type==='uprime'){
      const ubar=sumD/sumN; points=d.map((v,i)=>v/nArr[i]); CL=ubar; label=(type==='uprime'?"Laney u′ grafiği":"u grafiği"); ylabel='Birim başına hata (u)';
      let sz=1;
      if(type==='uprime'){ const z=points.map((ui,i)=>{ const s=Math.sqrt(ubar/nArr[i]); return s>0?(ui-ubar)/s:0; });
        let mr=0; for(let i=1;i<m;i++) mr+=Math.abs(z[i]-z[i-1]); mr/=(m-1); sz=mr/1.128; if(!(sz>0)) sz=1; note='σ_z (aşırı dağılım) = '+sz.toFixed(3); }
      UCLarr=nArr.map(ni=>{ const s=Math.sqrt(ubar/ni)*sz; return ubar+3*s; });
      LCLarr=nArr.map(ni=>{ const s=Math.sqrt(ubar/ni)*sz; return Math.max(0,ubar-3*s); });
      varying=!equalN || type==='uprime'; if(!varying){ UCL=UCLarr[0]; LCL=LCLarr[0]; }
    } else throw new Error('Bilinmeyen grafik tipi: '+type);

    // testler
    let tests;
    if(varying){ const b=[]; points.forEach((p,i)=>{ if(p>UCLarr[i]+1e-12||p<LCLarr[i]-1e-12) b.push(i+1); }); tests = b.length?{1:b}:{}; }
    else tests = runTests(points, CL, UCL, LCL);
    if(options.activeTests && options.activeTests.length){ const set={}; options.activeTests.forEach(t=>set[String(t)]=1); const f={}; Object.keys(tests).forEach(k=>{ if(set[k]) f[k]=tests[k]; }); tests=f; }

    const inControl = !(tests[1]&&tests[1].length);
    return {
      chartType:type, kind:(type==='c'||type==='u'||type==='uprime')?'defects':'defectives', varying, note, equalN,
      studyInfo:{ numSubgroups:m, totalDefects:sumD, totalN:sumN, pbar:(type[0]==='p'?sumD/sumN:null), cbar:(type==='c'?sumD/m:null), ubar:((type==='u'||type==='uprime')?sumD/sumN:null) },
      chart:{ points, index:idx, CL, UCL, LCL, UCLarr, LCLarr, varying, label, ylabel },
      tests, interpretation:{ inControl, nOut:(tests[1]?tests[1].length:0) }
    };
  }

  const api={ calculateSubgroupChart, calculateIndividualsChart, calculateAttributeChart, konst };
  if(typeof module!=='undefined'&&module.exports) module.exports=api;
  if(typeof window!=='undefined') window.controlCalculations=api;
})();
