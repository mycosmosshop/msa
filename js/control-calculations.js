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
    let groups=[];
    if(options.groups && options.groups.length===values.length){
      const order=[], map={};
      for(let i=0;i<values.length;i++){ const g=String(options.groups[i]); if(!map[g]){map[g]=[];order.push(g);} map[g].push(values[i]); }
      groups=order.map(g=>({label:g, values:map[g]}));
    } else {
      const sz=Math.max(2, parseInt(options.subgroupSize,10)||5);
      for(let i=0;i<values.length;i+=sz){ const v=values.slice(i,i+sz); if(v.length>=1) groups.push({label:String(groups.length+1), values:v}); }
    }
    groups=groups.filter(g=>g.values.length>=1);
    if(groups.length<2) throw new Error('En az 2 alt grup gerekli');

    const sizes=groups.map(g=>g.values.length);
    const nConst=Math.round(mean(sizes));                       // sabitler için ort. alt grup boyutu
    const equal=sizes.every(s=>s===sizes[0]);
    const n=sizes[0];
    const [A2,A3,d2,d3,D3,D4,c4,B3,B4]=konst(equal?n:nConst);

    const gmeans=groups.map(g=>mean(g.values));
    const granges=groups.map(g=>Math.max.apply(null,g.values)-Math.min.apply(null,g.values));
    const gsds=groups.map(g=>sd(g.values));
    const totalN=sizes.reduce((a,b)=>a+b,0);
    const Xbarbar = groups.reduce((s,g)=>s+mean(g.values)*g.values.length,0)/totalN;   // ağırlıklı grand ort
    const Rbar=mean(granges), sbar=mean(gsds);

    // sigma tahmini
    let sigma;
    if(known && known.sd!=null && isFinite(parseFloat(known.sd))) sigma=parseFloat(known.sd);
    else sigma = chartType==='xbar-r' ? Rbar/d2 : sbar/c4;
    const center = (known && known.mean!=null && isFinite(parseFloat(known.mean))) ? parseFloat(known.mean) : Xbarbar;

    // X̄ grafiği limitleri
    const nn = equal?n:nConst;
    const xUCL = center + 3*sigma/Math.sqrt(nn);
    const xLCL = center - 3*sigma/Math.sqrt(nn);
    const xbar = { points:gmeans, CL:center, UCL:xUCL, LCL:xLCL,
      warnUCL: warning? center+2*sigma/Math.sqrt(nn):null, warnLCL: warning? center-2*sigma/Math.sqrt(nn):null };

    // Yayılım grafiği (R veya s)
    let spread;
    if(chartType==='xbar-r'){
      const cl = known? d2*sigma : Rbar;
      const ucl = known? (d2+3*d3)*sigma : D4*Rbar;
      const lcl = known? Math.max(0,(d2-3*d3)*sigma) : D3*Rbar;
      spread = { kind:'R', label:'Menzil (R)', points:granges, CL:cl, UCL:ucl, LCL:lcl };
    } else {
      const cl = known? c4*sigma : sbar;
      const ucl = known? (c4+3*Math.sqrt(1-c4*c4))*sigma : B4*sbar;
      const lcl = known? Math.max(0,(c4-3*Math.sqrt(1-c4*c4))*sigma) : B3*sbar;
      spread = { kind:'s', label:'Std. Sapma (s)', points:gsds, CL:cl, UCL:ucl, LCL:lcl };
    }

    const xTests = runTests(gmeans, xbar.CL, xbar.UCL, xbar.LCL);
    // yayılım için sadece limit-dışı (Test 1)
    const sSig=(spread.UCL-spread.CL)/3; const sBeyond=[];
    spread.points.forEach((p,i)=>{ if(p>spread.UCL+1e-12||p<spread.LCL-1e-12) sBeyond.push(i+1); });

    const anyOut = (xTests[1]&&xTests[1].length) || sBeyond.length;
    const inControl = !anyOut;

    return {
      chartType, warning, known: known||null, equal,
      studyInfo:{ numSubgroups:groups.length, subgroupSize: equal?n:('~'+nConst+' (eşit değil)'), totalN, sigma, Xbarbar, Rbar, sbar, c4, d2 },
      groups: groups.map((g,i)=>({ label:g.label, n:g.values.length, mean:gmeans[i], range:granges[i], sd:gsds[i] })),
      xbar, spread,
      tests:{ xbar:xTests, spreadBeyond:sBeyond },
      interpretation:{ inControl, nOut:(xTests[1]?xTests[1].length:0)+sBeyond.length }
    };
  }

  const api={ calculateSubgroupChart, konst };
  if(typeof module!=='undefined'&&module.exports) module.exports=api;
  if(typeof window!=='undefined') window.controlCalculations=api;
})();
