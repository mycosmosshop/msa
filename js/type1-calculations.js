/**
 * Type 1 Instrument Capability Study Calculations
 * MSA Fourth Edition - Type 1 Study (Bias and Capability)
 */

// Tarayıcıda jStat CDN'den global gelir; Node'da require edilir (hesap mantığı birebir korunmuştur)
const jStat = (typeof window !== 'undefined' && window.jStat) ? window.jStat : require('jstat');

/**
 * Calculate Type 1 Instrument Capability Study results
 * @param {Array} measurements - Array of measurement values
 * @param {Number} referenceValue - Known reference value (master/standard)
 * @param {Number} tolerance - Tolerance specification
 * @returns {Object} Complete Type 1 analysis results
 */
function calculateType1Study(measurements, referenceValue, tolerance) {
  const n = measurements.length;
  
  if (n < 5) {
    throw new Error('Type 1 study requires at least 5 measurements');
  }
  
  // Basic statistics
  const mean = jStat.mean(measurements);
  const bias = mean - referenceValue;
  const stdDev = jStat.stdev(measurements, true); // Sample standard deviation
  const instrumentVariation = 6 * stdDev; // 6σ
  
  // Tolerance bounds
  const toleranceHalf = tolerance / 2;
  const lowerBound = referenceValue - toleranceHalf;
  const upperBound = referenceValue + toleranceHalf;
  
  // Percentage calculations
  const percentBias = tolerance > 0 ? (Math.abs(bias) / tolerance) * 100 : null;
  
  // Capability indices
  // Cg = (Tolerance / 6σ) = Process variation capability
  const cg = tolerance > 0 ? tolerance / (6 * stdDev) : null;
  
  // Cgk = Cg * (1 - |Bias| / (Tolerance/2))
  // Cgk accounts for bias
  const cgk = (tolerance > 0 && cg !== null) 
    ? cg * (1 - Math.abs(bias) / toleranceHalf) 
    : null;
  
  // %Var(repeatability) = (Instrument Variation / Tolerance) * 100
  const percentVarRepeatability = tolerance > 0 
    ? (instrumentVariation / tolerance) * 100 
    : null;
  
  // %Var(repeatability and bias) - includes bias effect
  // This is calculated as: sqrt(variance + bias²) / tolerance * 100
  const varianceWithBias = Math.sqrt(Math.pow(stdDev * 6, 2) + Math.pow(bias, 2));
  const percentVarRepeatabilityBias = tolerance > 0 
    ? (varianceWithBias / tolerance) * 100 
    : null;
  
  // t-test for bias against 0
  // H0: μ = reference value (bias = 0)
  // H1: μ ≠ reference value (bias ≠ 0)
  const standardError = stdDev / Math.sqrt(n);
  const tStatistic = bias / standardError;
  const degreesOfFreedom = n - 1;
  
  // Two-tailed p-value
  const pValue = 2 * (1 - jStat.studentt.cdf(Math.abs(tStatistic), degreesOfFreedom));
  
  // 95% Confidence interval for bias
  const tCritical = jStat.studentt.inv(0.975, degreesOfFreedom); // 95% CI
  const ciLower = bias - tCritical * standardError;
  const ciUpper = bias + tCritical * standardError;
  
  // Bias is significant if p < 0.001 (per MSA standards)
  const biasSignificant = pValue < 0.001;
  
  // Interpretation
  const interpretation = interpretType1Results({
    cg,
    cgk,
    percentBias,
    biasSignificant,
    pValue,
    percentVarRepeatability,
    percentVarRepeatabilityBias
  });
  
  return {
    basicStatistics: {
      referenceValue,
      mean,
      bias,
      stdDev,
      instrumentVariation,
      tolerance,
      lowerBound,
      upperBound,
      percentBias
    },
    capability: {
      cg,
      cgk,
      percentVarRepeatability,
      percentVarRepeatabilityBias
    },
    biasTest: {
      degreesOfFreedom,
      tStatistic,
      pValue,
      ciLower,
      ciUpper,
      biasSignificant
    },
    interpretation,
    measurements: measurements.map((value, index) => ({
      observation: index + 1,
      value
    }))
  };
}

/**
 * Interpret Type 1 results according to MSA Fourth Edition standards
 */
function interpretType1Results(results) {
  const { cg, cgk, percentBias, biasSignificant, pValue, percentVarRepeatability } = results;
  
  let overall = 'acceptable';
  let messages = [];
  let recommendations = [];
  
  // Track worst status (unacceptable > marginal > acceptable)
  const updateOverall = (newStatus) => {
    if (newStatus === 'unacceptable') {
      overall = 'unacceptable';
    } else if (newStatus === 'marginal' && overall !== 'unacceptable') {
      overall = 'marginal';
    }
  };
  
  // Cg interpretation (repeatability capability)
  if (cg !== null) {
    if (cg >= 1.33) {
      messages.push(`✅ Cg = ${cg.toFixed(2)} ≥ 1.33: Excellent repeatability`);
    } else if (cg >= 1.0) {
      messages.push(`⚠️ Cg = ${cg.toFixed(2)} (1.0-1.33): Marginal repeatability`);
      updateOverall('marginal');
      recommendations.push('Consider improving measurement precision');
    } else {
      messages.push(`❌ Cg = ${cg.toFixed(2)} < 1.0: Unacceptable repeatability`);
      updateOverall('unacceptable');
      recommendations.push('Instrument variation too large - equipment needs improvement or replacement');
    }
  }
  
  // Cgk interpretation (capability with bias)
  if (cgk !== null) {
    if (cgk >= 1.33) {
      messages.push(`✅ Cgk = ${cgk.toFixed(2)} ≥ 1.33: Excellent capability (with bias consideration)`);
    } else if (cgk >= 1.0) {
      messages.push(`⚠️ Cgk = ${cgk.toFixed(2)} (1.0-1.33): Marginal capability`);
      updateOverall('marginal');
    } else {
      messages.push(`❌ Cgk = ${cgk.toFixed(2)} < 1.0: Unacceptable capability`);
      updateOverall('unacceptable');
      recommendations.push('Bias and/or variation too large for reliable measurements');
    }
  }
  
  // Bias interpretation
  if (biasSignificant) {
    messages.push(`⚠️ Bias is statistically significant (p = ${pValue.toFixed(4)} < 0.001)`);
    if (percentBias !== null) {
      messages.push(`   Bias = ${percentBias.toFixed(2)}% of tolerance`);
    }
    recommendations.push('Calibrate the instrument to reduce systematic bias');
  } else {
    messages.push(`✅ Bias is not statistically significant (p = ${pValue.toFixed(4)})`);
    if (percentBias !== null && percentBias > 5) {
      messages.push(`   However, bias = ${percentBias.toFixed(2)}% of tolerance (consider recalibration if > 10%)`);
    }
  }
  
  // %Var interpretation
  if (percentVarRepeatability !== null) {
    if (percentVarRepeatability < 10) {
      messages.push(`✅ %Var(repeatability) = ${percentVarRepeatability.toFixed(2)}% < 10%: Excellent`);
    } else if (percentVarRepeatability < 30) {
      messages.push(`⚠️ %Var(repeatability) = ${percentVarRepeatability.toFixed(2)}% (10-30%): Marginal`);
    } else {
      messages.push(`❌ %Var(repeatability) = ${percentVarRepeatability.toFixed(2)}% > 30%: Unacceptable`);
    }
  }
  
  // Overall recommendation
  let overallMessage = '';
  if (overall === 'acceptable') {
    overallMessage = '✅ Instrument is ACCEPTABLE for use';
  } else if (overall === 'marginal') {
    overallMessage = '⚠️ Instrument is MARGINAL - use with caution and monitor closely';
  } else {
    overallMessage = '❌ Instrument is UNACCEPTABLE - requires corrective action before use';
  }
  
  return {
    overall,
    overallMessage,
    messages,
    recommendations
  };
}

/**
 * Generate run chart data for Type 1 visualization
 */
function generateRunChartData(measurements, referenceValue, mean, tolerance) {
  const toleranceHalf = tolerance / 2;
  
  return {
    observations: measurements.map((val, idx) => idx + 1),
    values: measurements,
    referenceValue,
    mean,
    upperTolerance: referenceValue + toleranceHalf,
    lowerTolerance: referenceValue - toleranceHalf
  };
}

/**
 * Generate histogram data for bias distribution
 */
function generateHistogramData(measurements, referenceValue, mean, stdDev) {
  const binCount = Math.min(Math.ceil(Math.sqrt(measurements.length)), 10);
  const min = Math.min(...measurements);
  const max = Math.max(...measurements);
  const binWidth = (max - min) / binCount;
  
  const bins = [];
  const labels = [];
  const frequencies = [];
  
  for (let i = 0; i < binCount; i++) {
    const binStart = min + i * binWidth;
    const binEnd = binStart + binWidth;
    const binMid = (binStart + binEnd) / 2;
    const count = measurements.filter(v => v >= binStart && (i === binCount - 1 ? v <= binEnd : v < binEnd)).length;
    
    bins.push({
      start: binStart,
      end: binEnd,
      mid: binMid,
      count
    });
    labels.push(binMid.toFixed(4));
    frequencies.push(count);
  }
  
  // Add reference lines
  return {
    bins,
    labels,
    frequencies,
    referenceValue,
    mean,
    meanMinus3s: mean - 3 * stdDev,
    meanPlus3s: mean + 3 * stdDev
  };
}

// Browser + CommonJS dual export (statik ERP modülü dönüşümü — hesap mantığı birebir korunmuştur)
const __type1CalcExports = {
  calculateType1Study,
  interpretType1Results,
  generateRunChartData,
  generateHistogramData
};
if (typeof module !== 'undefined' && module.exports) {
  module.exports = __type1CalcExports;
}
if (typeof window !== 'undefined') {
  window.type1Calculations = __type1CalcExports;
}
