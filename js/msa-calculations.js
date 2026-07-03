/**
 * MSA (Measurement System Analysis) - Gage R&R Calculations
 * ANOVA Method for Type 2 Gauge R&R Study
 */

// Ortalama hesapla
function mean(arr) {
  return arr.reduce((sum, val) => sum + val, 0) / arr.length;
}

// Varyans hesapla
function variance(arr) {
  const avg = mean(arr);
  return arr.reduce((sum, val) => sum + Math.pow(val - avg, 2), 0) / (arr.length - 1);
}

// Standart sapma hesapla
function standardDeviation(arr) {
  return Math.sqrt(variance(arr));
}

// Sum of Squares hesapla
function sumOfSquares(arr, grandMean = null) {
  if (grandMean === null) {
    grandMean = mean(arr);
  }
  return arr.reduce((sum, val) => sum + Math.pow(val - grandMean, 2), 0);
}

// ----------------------------------------------------------------------------
// JASP-uyum düzeltmesi (kullanıcı onayıyla eklendi):
// ANOVA p-değerini gerçek F-dağılımıyla (jStat.centralF) hesaplar; JASP ile
// aynı formatta döndürür ("< .001" ya da 3 ondalık). jStat yoksa (ör. bir
// yükleyici CDN'i eklememişse) eski eşik yaklaşımına güvenli düşer.
// ----------------------------------------------------------------------------
function _getJStat() {
  if (typeof window !== 'undefined' && window.jStat) return window.jStat;
  if (typeof jStat !== 'undefined') return jStat;
  try { return require('jstat'); } catch (e) { return null; }
}

function fDistPValue(F, df1, df2) {
  if (!isFinite(F) || F <= 0 || !isFinite(df1) || !isFinite(df2) || df1 <= 0 || df2 <= 0) {
    return '1.000';
  }
  const js = _getJStat();
  if (js && js.centralF && typeof js.centralF.cdf === 'function') {
    let p = 1 - js.centralF.cdf(F, df1, df2); // sağ kuyruk (JASP ile aynı)
    if (!isFinite(p)) p = 0;
    if (p < 0) p = 0;
    if (p < 0.001) return '< .001';
    if (p > 0.9995) return '1.000';
    return p.toFixed(3);
  }
  // Güvenli düşüş: jStat yoksa eski eşik yaklaşımı
  return F > 10 ? '< .001' : (F > 5 ? '< .01' : '< .05');
}

/**
 * Two-Way ANOVA for Gage R&R (Crossed Design)
 * @param {Array} measurements - [{operator, part, trial, measurement}]
 * @returns {Object} ANOVA table and variance components
 */
function calculateGaugeRR(measurements, toleranceWidth = null, analysisOptions = {}) {
  // Validate input
  if (!measurements || measurements.length === 0) {
    throw new Error('Ölçüm verisi bulunamadı');
  }
  
  // Extract analysis options with defaults - ensure analysisOptions is an object
  const safeAnalysisOptions = analysisOptions || {};
  const interactionPooling = safeAnalysisOptions.interaction_pooling || 'auto';
  
  console.log('⚙️ Analysis Options:', safeAnalysisOptions);
  console.log('⚙️ Interaction Pooling:', interactionPooling);
  
  // Validate and clean measurements
  const validMeasurements = measurements.filter(m => {
    const measurement = parseFloat(m.measurement);
    return !isNaN(measurement) && isFinite(measurement);
  });
  
  if (validMeasurements.length === 0) {
    throw new Error('Geçerli ölçüm verisi bulunamadı (tüm değerler NaN)');
  }
  
  if (validMeasurements.length < measurements.length) {
    console.warn(`⚠️ ${measurements.length - validMeasurements.length} geçersiz ölçüm filtrelendi`);
  }
  
  // Convert measurements to numbers
  validMeasurements.forEach(m => {
    m.measurement = parseFloat(m.measurement);
    m.trial = parseInt(m.trial);
  });
  
  // Validate data types
  const firstMeasurement = validMeasurements[0];
  if (typeof firstMeasurement.measurement !== 'number') {
    throw new Error('Ölçüm değerleri sayı formatında olmalı');
  }
  
  console.log('📏 Tolerance width:', toleranceWidth);
  
  // 1. Data organization
  const operators = [...new Set(validMeasurements.map(m => m.operator))].sort();
  const parts = [...new Set(validMeasurements.map(m => m.part))].sort();
  const trials = [...new Set(validMeasurements.map(m => m.trial))].sort();
  
  const numOperators = operators.length;
  const numParts = parts.length;
  const numTrials = trials.length;
  const totalMeasurements = validMeasurements.length;
  
  console.log('📊 Calculation started:', { numOperators, numParts, numTrials, totalMeasurements });
  
  // Detect Type 3 study (automatic equipment) - single operator
  const isType3 = numOperators === 1;
  
  if (isType3) {
    console.log('🤖 Type 3 Study detected (automatic equipment) - using One-Way ANOVA');
    return calculateType3OneWayANOVA(validMeasurements, toleranceWidth);
  }
  
  // Validate minimum requirements (Type 2 only)
  if (numOperators < 2) {
    throw new Error('En az 2 operatör gerekli');
  }
  if (numParts < 5) {
    throw new Error('En az 5 parça gerekli');
  }
  if (numTrials < 2) {
    throw new Error('En az 2 tekrar gerekli');
  }
  
  // 2. Grand mean
  const allValues = validMeasurements.map(m => m.measurement);
  
  // Check for NaN values
  if (allValues.some(v => isNaN(v))) {
    throw new Error('Geçersiz ölçüm değerleri var (NaN)');
  }
  
  const grandMean = mean(allValues);
  
  // 3. Calculate means for each group
  const operatorMeans = {};
  const partMeans = {};
  const cellMeans = {}; // operator x part combinations
  
  operators.forEach(op => {
    const opValues = validMeasurements.filter(m => m.operator === op).map(m => m.measurement);
    operatorMeans[op] = mean(opValues);
  });
  
  parts.forEach(part => {
    const partValues = validMeasurements.filter(m => m.part === part).map(m => m.measurement);
    partMeans[part] = mean(partValues);
  });
  
  operators.forEach(op => {
    parts.forEach(part => {
      const cellValues = validMeasurements
        .filter(m => m.operator === op && m.part === part)
        .map(m => m.measurement);
      cellMeans[`${op}_${part}`] = mean(cellValues);
    });
  });
  
  // 4. Calculate Sum of Squares
  
  // Total SS
  const SS_Total = sumOfSquares(allValues, grandMean);
  
  // Part SS
  let SS_Part = 0;
  parts.forEach(part => {
    const partValues = validMeasurements.filter(m => m.part === part).map(m => m.measurement);
    SS_Part += partValues.length * Math.pow(partMeans[part] - grandMean, 2);
  });
  
  // Operator SS
  let SS_Operator = 0;
  operators.forEach(op => {
    const opValues = validMeasurements.filter(m => m.operator === op).map(m => m.measurement);
    SS_Operator += opValues.length * Math.pow(operatorMeans[op] - grandMean, 2);
  });
  
  // Interaction SS (Part x Operator)
  let SS_Interaction = 0;
  operators.forEach(op => {
    parts.forEach(part => {
      const cellMean = cellMeans[`${op}_${part}`];
      const cellSize = validMeasurements.filter(m => m.operator === op && m.part === part).length;
      SS_Interaction += cellSize * Math.pow(
        cellMean - operatorMeans[op] - partMeans[part] + grandMean, 2
      );
    });
  });
  
  // Repeatability SS (Error)
  let SS_Repeatability = 0;
  operators.forEach(op => {
    parts.forEach(part => {
      const cellValues = validMeasurements
        .filter(m => m.operator === op && m.part === part)
        .map(m => m.measurement);
      const cellMean = cellMeans[`${op}_${part}`];
      SS_Repeatability += sumOfSquares(cellValues, cellMean);
    });
  });
  
  // 5. Degrees of Freedom
  const df_Total = totalMeasurements - 1;
  const df_Part = numParts - 1;
  const df_Operator = numOperators - 1;
  const df_Interaction = df_Part * df_Operator;
  const df_Repeatability = numOperators * numParts * (numTrials - 1);
  
  // 6. Mean Squares
  const MS_Part = SS_Part / df_Part;
  const MS_Operator = SS_Operator / df_Operator;
  const MS_Interaction = SS_Interaction / df_Interaction;
  const MS_Repeatability = SS_Repeatability / df_Repeatability;
  
  // 7. F-values and p-values
  // JASP-uyum düzeltmesi: JASP'ın "with interaction" tablosu SABİT ETKİ modeli
  // kullanır — Part/Operator/Interaction F'lerinin PAYDASI = MS_Repeatability.
  // (Eski kod Part/Operator için MS_Interaction paydası kullanıyordu → JASP'tan
  //  farklı F. Varyans bileşenleri/%GRR/NDC bundan ETKİLENMEZ, sadece ANOVA
  //  tablosunun F ve p sütunları JASP'a hizalanır.)
  const F_Part = MS_Part / MS_Repeatability;
  const F_Operator = MS_Operator / MS_Repeatability;
  const F_Interaction = MS_Interaction / MS_Repeatability; // pooling kararında da kullanılır (değişmedi)

  // p-değerleri gerçek F-dağılımından (jStat), JASP ile aynı; payda df = df_Repeatability
  const p_Part = fDistPValue(F_Part, df_Part, df_Repeatability);
  const p_Operator = fDistPValue(F_Operator, df_Operator, df_Repeatability);
  const p_Interaction = fDistPValue(F_Interaction, df_Interaction, df_Repeatability);
  
  // 7b. ANOVA Without Interaction (pooling interaction with repeatability)
  const SS_Part_NoInt = SS_Part;
  const SS_Operator_NoInt = SS_Operator;
  const SS_Repeatability_NoInt = SS_Interaction + SS_Repeatability;
  const SS_Total_NoInt = SS_Total;
  
  const df_Part_NoInt = df_Part;
  const df_Operator_NoInt = df_Operator;
  const df_Repeatability_NoInt = df_Interaction + df_Repeatability;
  const df_Total_NoInt = df_Total;
  
  const MS_Part_NoInt = SS_Part_NoInt / df_Part_NoInt;
  const MS_Operator_NoInt = SS_Operator_NoInt / df_Operator_NoInt;
  const MS_Repeatability_NoInt = SS_Repeatability_NoInt / df_Repeatability_NoInt;
  
  const F_Part_NoInt = MS_Part_NoInt / MS_Repeatability_NoInt;
  const F_Operator_NoInt = MS_Operator_NoInt / MS_Repeatability_NoInt;
  
  // JASP-uyum: "without interaction" tablosunda F zaten MS_Repeatability_NoInt
  // paydalı (JASP ile aynı); yalnızca p-değerleri gerçek F-dağılımına çevrildi.
  const p_Part_NoInt = fDistPValue(F_Part_NoInt, df_Part_NoInt, df_Repeatability_NoInt);
  const p_Operator_NoInt = fDistPValue(F_Operator_NoInt, df_Operator_NoInt, df_Repeatability_NoInt);
  
  // 8. Variance Components
  const n = numTrials;
  const a = numOperators;
  const b = numParts;
  
  console.log('🔢 Study Parameters:');
  console.log('  n (trials):', n);
  console.log('  a (operators):', a);
  console.log('  b (parts):', b);
  console.log('  n × b:', n * b);
  
  // Check if interaction is significant based on user preference
  let useInteraction;
  if (interactionPooling === 'always') {
    useInteraction = true; // Always use interaction model
  } else if (interactionPooling === 'never') {
    useInteraction = false; // Always pool interaction
  } else {
    // Auto: Pool if F_Interaction < 1.5 (simplified criterion)
    // Default to 'auto' if interactionPooling is undefined/invalid
    useInteraction = F_Interaction > 1.5;
  }
  
  // Ensure useInteraction is always boolean (safety check)
  useInteraction = Boolean(useInteraction);
  
  console.log('🔍 Variance Components Debug:');
  console.log('  F_Interaction:', F_Interaction);
  console.log('  Interaction Pooling Mode:', interactionPooling);
  console.log('  Use Interaction Model:', useInteraction);
  console.log('  MS_Part:', MS_Part);
  console.log('  MS_Operator:', MS_Operator);
  console.log('  MS_Interaction:', MS_Interaction);
  console.log('  MS_Repeatability:', MS_Repeatability);
  console.log('  MS_Repeatability_NoInt (pooled):', MS_Repeatability_NoInt);
  
  let Var_Repeatability, Var_Operator, Var_Interaction, Var_Reproducibility, Var_Part;
  
  if (useInteraction) {
    // Standard ANOVA method with interaction
    Var_Repeatability = MS_Repeatability;
    Var_Operator = Math.max(0, (MS_Operator - MS_Interaction) / (n * b));
    Var_Interaction = Math.max(0, (MS_Interaction - MS_Repeatability) / n);
    Var_Reproducibility = Var_Operator + Var_Interaction;
    
    const Var_Part_Raw = (MS_Part - MS_Interaction) / (n * a);
    Var_Part = Math.max(0, Var_Part_Raw);
    
    console.log('  📊 With Interaction Model:');
    console.log('    Var_Operator:', Var_Operator);
    console.log('    Var_Interaction:', Var_Interaction);
    console.log('    Var_Part calculation:');
    console.log('      Formula: (MS_Part - MS_Interaction) / (n × a)');
    console.log('      = (' + MS_Part + ' - ' + MS_Interaction + ') / (' + n + ' × ' + a + ')');
    console.log('      = ' + (MS_Part - MS_Interaction) + ' / ' + (n * a));
    console.log('      = ' + Var_Part_Raw);
    console.log('      Math.max(0, ...) = ' + Var_Part);
    if (Var_Part === 0) {
      console.warn('    ⚠️ Part variance is ZERO! This is unusual.');
      console.warn('       MS_Part (' + MS_Part + ') <= MS_Interaction (' + MS_Interaction + ')');
      console.warn('       This suggests: Interaction variance is larger than Part variance.');
      console.warn('       Possible causes:');
      console.warn('       - Parts are very similar (no real variation between parts)');
      console.warn('       - Operator-Part interaction is dominant');
      console.warn('       - Data entry error (parts not properly labeled?)');
    }
  } else {
    // Pool interaction with repeatability (Minitab/JASP approach)
    // Use pooled error term
    const MS_Error_Pooled = MS_Repeatability_NoInt; // Already calculated above
    Var_Repeatability = MS_Error_Pooled;
    Var_Interaction = 0; // Pooled into repeatability
    Var_Operator = Math.max(0, (MS_Operator - MS_Error_Pooled) / (n * b));
    Var_Reproducibility = Var_Operator; // No interaction component
    
    const Var_Part_Raw = (MS_Part - MS_Error_Pooled) / (n * a);
    Var_Part = Math.max(0, Var_Part_Raw);
    
    console.log('  📊 Pooled Model (no interaction):');
    console.log('    MS_Error_Pooled:', MS_Error_Pooled);
    console.log('    Var_Operator:', Var_Operator);
    console.log('    Formula: (MS_Operator - MS_Error_Pooled) / (n × b)');
    console.log('    =', `(${MS_Operator} - ${MS_Error_Pooled}) / ${n * b}`);
    console.log('    =', (MS_Operator - MS_Error_Pooled) / (n * b));
    console.log('    Var_Part calculation:');
    console.log('      Formula: (MS_Part - MS_Error_Pooled) / (n × a)');
    console.log('      = (' + MS_Part + ' - ' + MS_Error_Pooled + ') / (' + n + ' × ' + a + ')');
    console.log('      = ' + (MS_Part - MS_Error_Pooled) + ' / ' + (n * a));
    console.log('      = ' + Var_Part_Raw);
    console.log('      Math.max(0, ...) = ' + Var_Part);
    if (Var_Part === 0) {
      console.warn('    ⚠️ Part variance is ZERO! This is unusual.');
      console.warn('       MS_Part (' + MS_Part + ') <= MS_Error_Pooled (' + MS_Error_Pooled + ')');
      console.warn('       This suggests: Error variance is larger than Part variance.');
      console.warn('       Possible causes:');
      console.warn('       - Parts are very similar (no real variation between parts)');
      console.warn('       - High measurement error masks part differences');
      console.warn('       - Data entry error (parts not properly labeled?)');
    }
  }
  
  console.log('  ✅ Final Variance Components:');
  console.log('    Var_Repeatability:', Var_Repeatability);
  console.log('    Var_Operator:', Var_Operator);
  console.log('    Var_Interaction:', Var_Interaction);
  console.log('    Var_Reproducibility:', Var_Reproducibility);
  console.log('    Var_Part:', Var_Part);
  
  // Warning if Reproducibility is suspiciously low
  if (Var_Reproducibility < 0.0001 && Var_Repeatability > 0) {
    console.warn('  ⚠️  WARNING: Reproducibility is very low or zero!');
    console.warn('      This means operators are measuring very consistently.');
    console.warn('      If unexpected, check:');
    console.warn('      - Data entry: Are operator IDs correctly assigned?');
    console.warn('      - Measurement method: Are operators truly independent?');
    console.warn('      - MS_Operator:', MS_Operator);
    console.warn('      - MS_Interaction or MS_Error_Pooled:', useInteraction ? MS_Interaction : MS_Repeatability_NoInt);
  }
  
  // Total GRR
  const Var_GRR = Var_Repeatability + Var_Reproducibility;
  
  // Total variation
  const Var_Total = Var_GRR + Var_Part;
  
  // 9. Standard Deviations (6σ for study variation)
  const SD_Repeatability = Math.sqrt(Var_Repeatability);
  const SD_Reproducibility = Math.sqrt(Var_Reproducibility);
  const SD_GRR = Math.sqrt(Var_GRR);
  const SD_Part = Math.sqrt(Var_Part);
  const SD_Total = Math.sqrt(Var_Total);
  
  const StudyVar_Repeatability = 6 * SD_Repeatability;
  const StudyVar_Reproducibility = 6 * SD_Reproducibility;
  const StudyVar_GRR = 6 * SD_GRR;
  const StudyVar_Part = 6 * SD_Part;
  const StudyVar_Total = 6 * SD_Total;
  
  // 10. Percentages
  const Pct_Contribution_Repeatability = (Var_Repeatability / Var_Total) * 100;
  const Pct_Contribution_Reproducibility = (Var_Reproducibility / Var_Total) * 100;
  const Pct_Contribution_GRR = (Var_GRR / Var_Total) * 100;
  const Pct_Contribution_Part = (Var_Part / Var_Total) * 100;
  
  const Pct_StudyVar_Repeatability = (StudyVar_Repeatability / StudyVar_Total) * 100;
  const Pct_StudyVar_Reproducibility = (StudyVar_Reproducibility / StudyVar_Total) * 100;
  const Pct_StudyVar_GRR = (StudyVar_GRR / StudyVar_Total) * 100;
  const Pct_StudyVar_Part = (StudyVar_Part / StudyVar_Total) * 100;
  
  // Tolerance-based metrics (if tolerance width provided)
  let Pct_Tolerance_GRR = null;
  let Pct_Tolerance_Repeatability = null;
  let Pct_Tolerance_Reproducibility = null;
  let Pct_Tolerance_Part = null;
  
  if (toleranceWidth && toleranceWidth > 0) {
    Pct_Tolerance_GRR = (StudyVar_GRR / toleranceWidth) * 100;
    Pct_Tolerance_Repeatability = (StudyVar_Repeatability / toleranceWidth) * 100;
    Pct_Tolerance_Reproducibility = (StudyVar_Reproducibility / toleranceWidth) * 100;
    Pct_Tolerance_Part = (StudyVar_Part / toleranceWidth) * 100;
    console.log('📊 %Tolerance calculated:', { 
      GRR: Pct_Tolerance_GRR.toFixed(2), 
      Repeatability: Pct_Tolerance_Repeatability.toFixed(2),
      Reproducibility: Pct_Tolerance_Reproducibility.toFixed(2),
      Part: Pct_Tolerance_Part.toFixed(2)
    });
  }
  
  // 11. Number of Distinct Categories
  const NDC = Math.floor(1.41 * (SD_Part / SD_GRR));
  
  // 12. Acceptability
  let acceptability = 'Unacceptable';
  if (Pct_StudyVar_GRR < 10) {
    acceptability = 'Acceptable';
  } else if (Pct_StudyVar_GRR <= 30) {
    acceptability = 'Marginal';
  }
  
  // Return comprehensive results
  return {
    studyInfo: {
      numOperators,
      numParts,
      numTrials,
      totalMeasurements,
      grandMean: grandMean.toFixed(4)
    },
    
    anovaTable: {
      part: {
        df: df_Part,
        ss: parseFloat(SS_Part.toFixed(4)),
        ms: parseFloat(MS_Part.toFixed(4)),
        f: parseFloat(F_Part.toFixed(2)),
        p: p_Part
      },
      operator: {
        df: df_Operator,
        ss: parseFloat(SS_Operator.toFixed(4)),
        ms: parseFloat(MS_Operator.toFixed(4)),
        f: parseFloat(F_Operator.toFixed(2)),
        p: p_Operator
      },
      interaction: {
        df: df_Interaction,
        ss: parseFloat(SS_Interaction.toFixed(6)),
        ms: parseFloat(MS_Interaction.toFixed(6)),
        f: parseFloat(F_Interaction.toFixed(2)),
        p: p_Interaction
      },
      repeatability: {
        df: df_Repeatability,
        ss: parseFloat(SS_Repeatability.toFixed(4)),
        ms: parseFloat(MS_Repeatability.toFixed(6)),
        f: '-',
        p: '-'
      },
      total: {
        df: df_Total,
        ss: parseFloat(SS_Total.toFixed(4)),
        ms: '-',
        f: '-',
        p: '-'
      }
    },
    
    anovaTableWithoutInteraction: {
      part: {
        df: df_Part_NoInt,
        ss: parseFloat(SS_Part_NoInt.toFixed(6)),
        ms: parseFloat(MS_Part_NoInt.toFixed(6)),
        f: parseFloat(F_Part_NoInt.toFixed(2)),
        p: p_Part_NoInt
      },
      operator: {
        df: df_Operator_NoInt,
        ss: parseFloat(SS_Operator_NoInt.toFixed(6)),
        ms: parseFloat(MS_Operator_NoInt.toFixed(6)),
        f: parseFloat(F_Operator_NoInt.toFixed(2)),
        p: p_Operator_NoInt
      },
      repeatability: {
        df: df_Repeatability_NoInt,
        ss: parseFloat(SS_Repeatability_NoInt.toFixed(6)),
        ms: parseFloat(MS_Repeatability_NoInt.toFixed(6)),
        f: '-',
        p: '-'
      },
      total: {
        df: df_Total_NoInt,
        ss: parseFloat(SS_Total_NoInt.toFixed(6)),
        ms: '-',
        f: '-',
        p: '-'
      }
    },
    
    varianceComponents: {
      useInteractionModel: useInteraction,
      totalGaugeRR: {
        variance: Var_GRR,
        contribution: Pct_Contribution_GRR
      },
      repeatability: {
        variance: Var_Repeatability,
        contribution: Pct_Contribution_Repeatability
      },
      reproducibility: {
        variance: Var_Reproducibility,
        contribution: Pct_Contribution_Reproducibility,
        operator: Var_Operator,
        interaction: Var_Interaction
      },
      partToPart: {
        variance: Var_Part,
        contribution: Pct_Contribution_Part
      },
      totalVariation: {
        variance: Var_Total
      }
    },
    
    gaugeEvaluation: {
      totalGaugeRR: {
        stdDev: SD_GRR,
        studyVar: StudyVar_GRR,
        pctStudyVar: Pct_StudyVar_GRR,
        pctContribution: Pct_Contribution_GRR,
        pctTolerance: Pct_Tolerance_GRR
      },
      repeatability: {
        stdDev: SD_Repeatability,
        studyVar: StudyVar_Repeatability,
        pctStudyVar: Pct_StudyVar_Repeatability,
        pctContribution: Pct_Contribution_Repeatability,
        pctTolerance: Pct_Tolerance_Repeatability
      },
      reproducibility: {
        stdDev: SD_Reproducibility,
        studyVar: StudyVar_Reproducibility,
        pctStudyVar: Pct_StudyVar_Reproducibility,
        pctContribution: Pct_Contribution_Reproducibility,
        pctTolerance: Pct_Tolerance_Reproducibility
      },
      partToPart: {
        stdDev: SD_Part,
        studyVar: StudyVar_Part,
        pctStudyVar: Pct_StudyVar_Part,
        pctContribution: Pct_Contribution_Part,
        pctTolerance: Pct_Tolerance_Part
      },
      totalVariation: {
        stdDev: SD_Total,
        studyVar: StudyVar_Total
      },
      toleranceWidth: toleranceWidth
    },
    
    interpretation: {
      ndc: NDC,
      acceptability,
      grrPercentage: Pct_StudyVar_GRR,
      recommendation: getRecommendation(Pct_StudyVar_GRR, NDC)
    }
  };
}

/**
 * Get recommendation based on GRR% and NDC
 */
function getRecommendation(grrPct, ndc) {
  if (grrPct < 10 && ndc >= 5) {
    return 'The measurement system is ACCEPTABLE. GRR < 10% indicates excellent gauge capability.';
  } else if (grrPct >= 10 && grrPct <= 30) {
    return 'The measurement system is MARGINAL. May be acceptable depending on application, cost of gauge, cost of repair, etc. Consider investigating sources of variation.';
  } else {
    return 'The measurement system is UNACCEPTABLE. GRR > 30% indicates the gauge contributes excessive variation. The measurement system needs improvement before use.';
  }
}

/**
 * Calculate control chart data for R-chart and X-bar chart
 */
function calculateControlCharts(measurements) {
  const operators = [...new Set(measurements.map(m => m.operator))].sort();
  const parts = [...new Set(measurements.map(m => m.part))].sort();
  
  const rChartData = [];
  const xbarChartData = [];
  
  // Calculate ranges and averages for each operator-part combination
  operators.forEach(op => {
    parts.forEach(part => {
      const cellMeasurements = measurements
        .filter(m => m.operator === op && m.part === part)
        .map(m => m.measurement);
      
      if (cellMeasurements.length > 0) {
        const avg = mean(cellMeasurements);
        const range = Math.max(...cellMeasurements) - Math.min(...cellMeasurements);
        
        // Get operator_name and part_name from first measurement (they should all be the same)
        const firstMeasurement = measurements.find(m => m.operator === op && m.part === part);
        
        rChartData.push({
          operator: op,
          part: part,
          operator_name: firstMeasurement?.operator_name || op,
          part_name: firstMeasurement?.part_name || part,
          range: range.toFixed(4)
        });
        
        xbarChartData.push({
          operator: op,
          part: part,
          operator_name: firstMeasurement?.operator_name || op,
          part_name: firstMeasurement?.part_name || part,
          average: avg.toFixed(4)
        });
      }
    });
  });
  
  // Calculate control limits
  const avgRange = mean(rChartData.map(d => parseFloat(d.range)));
  const avgXbar = mean(xbarChartData.map(d => parseFloat(d.average)));

  // JASP-uyum düzeltmesi: kontrol kartı sabitleri (d2, D3, D4, A2) alt grup
  // boyutuna göre seçilir. Gage R&R'da alt grup = tekrar sayısı (bir operatör-
  // parça hücresindeki ölçüm sayısı). Eski kod sabitleri her zaman n=10'a göre
  // sabitlemişti → tekrar ≠ 10 olduğunda R/X̄ kontrol çizgileri yanlıştı.
  // Standart AIAG/Shewhart sabitleri (alt grup boyutu n):
  const CONTROL_CONSTANTS = {
    2:  { d2: 1.128, D3: 0,     D4: 3.267, A2: 1.880 },
    3:  { d2: 1.693, D3: 0,     D4: 2.574, A2: 1.023 },
    4:  { d2: 2.059, D3: 0,     D4: 2.282, A2: 0.729 },
    5:  { d2: 2.326, D3: 0,     D4: 2.114, A2: 0.577 },
    6:  { d2: 2.534, D3: 0,     D4: 2.004, A2: 0.483 },
    7:  { d2: 2.704, D3: 0.076, D4: 1.924, A2: 0.419 },
    8:  { d2: 2.847, D3: 0.136, D4: 1.864, A2: 0.373 },
    9:  { d2: 2.970, D3: 0.184, D4: 1.816, A2: 0.337 },
    10: { d2: 3.078, D3: 0.223, D4: 1.777, A2: 0.308 }
  };
  const numTrials = new Set(measurements.map(m => m.trial)).size;
  const nSub = Math.min(10, Math.max(2, numTrials || 2)); // tablo 2..10 ile sınırlı
  const { d2, D3, D4, A2 } = CONTROL_CONSTANTS[nSub];

  return {
    rChart: {
      data: rChartData,
      centerLine: avgRange.toFixed(4),
      ucl: (D4 * avgRange).toFixed(4),
      lcl: (D3 * avgRange).toFixed(4)
    },
    xbarChart: {
      data: xbarChartData,
      centerLine: avgXbar.toFixed(4),
      ucl: (avgXbar + A2 * avgRange).toFixed(4),
      lcl: (avgXbar - A2 * avgRange).toFixed(4)
    }
  };
}

/**
 * Calculate Type 3 (Automatic Equipment) - One-Way ANOVA
 * Only Repeatability and Part-to-Part variation (no operators)
 */
function calculateType3OneWayANOVA(measurements, toleranceWidth = null) {
  console.log('🤖 Type 3 One-Way ANOVA calculation started');
  
  // Validate and clean measurements
  const validMeasurements = measurements.filter(m => {
    const measurement = parseFloat(m.measurement);
    return !isNaN(measurement) && isFinite(measurement);
  });
  
  if (validMeasurements.length === 0) {
    throw new Error('Geçerli ölçüm verisi bulunamadı');
  }
  
  // Convert to numbers
  validMeasurements.forEach(m => {
    m.measurement = parseFloat(m.measurement);
    m.trial = parseInt(m.trial);
  });
  
  // Data organization
  const parts = [...new Set(validMeasurements.map(m => m.part))].sort();
  const trials = [...new Set(validMeasurements.map(m => m.trial))].sort();
  
  const numParts = parts.length;
  const numTrials = trials.length;
  
  console.log('📊 Type 3 Data:', { numParts, numTrials, totalMeasurements: validMeasurements.length });
  
  // Validate minimum requirements
  if (numParts < 3) {
    throw new Error('Type 3 için en az 3 parça gerekli');
  }
  if (numTrials < 2) {
    throw new Error('En az 2 tekrar gerekli');
  }
  
  // Grand mean
  const allValues = validMeasurements.map(m => m.measurement);
  const grandMean = mean(allValues);
  
  // Part means
  const partMeans = {};
  parts.forEach(part => {
    const partValues = validMeasurements.filter(m => m.part === part).map(m => m.measurement);
    partMeans[part] = mean(partValues);
  });
  
  // ONE-WAY ANOVA: Part variation
  // SS_Part (Between groups)
  let SS_Part = 0;
  parts.forEach(part => {
    const partValues = validMeasurements.filter(m => m.part === part);
    SS_Part += partValues.length * Math.pow(partMeans[part] - grandMean, 2);
  });
  
  // SS_Repeatability (Within groups - equipment variation)
  let SS_Repeatability = 0;
  parts.forEach(part => {
    const partValues = validMeasurements.filter(m => m.part === part).map(m => m.measurement);
    SS_Repeatability += sumOfSquares(partValues, partMeans[part]);
  });
  
  // SS_Total
  const SS_Total = sumOfSquares(allValues, grandMean);
  
  // Degrees of freedom
  const df_Part = numParts - 1;
  const df_Repeatability = numParts * (numTrials - 1);
  const df_Total = validMeasurements.length - 1;
  
  // Mean squares
  const MS_Part = SS_Part / df_Part;
  const MS_Repeatability = SS_Repeatability / df_Repeatability;
  
  // F-statistic
  const F_Part = MS_Part / MS_Repeatability;
  
  // P-value (simplified - need jStat for accurate calculation)
  const p_Part = F_Part > 10 ? 0.001 : (F_Part > 5 ? 0.01 : 0.05);
  
  // ANOVA Table
  const anovaTable = {
    part: {  // Use 'part' instead of 'partNo' for view compatibility
      df: df_Part,
      ss: parseFloat(SS_Part.toFixed(4)),
      ms: parseFloat(MS_Part.toFixed(4)),
      f: parseFloat(F_Part.toFixed(2)),
      p: p_Part
    },
    repeatability: {
      df: df_Repeatability,
      ss: parseFloat(SS_Repeatability.toFixed(4)),
      ms: parseFloat(MS_Repeatability.toFixed(6)),
      f: '-',
      p: '-'
    },
    total: {
      df: df_Total,
      ss: parseFloat(SS_Total.toFixed(4))
    }
  };
  
  // Variance Components
  const varRepeatability = MS_Repeatability;
  const varPart = Math.max(0, (MS_Part - MS_Repeatability) / numTrials);
  const varTotal = varRepeatability + varPart;
  
  const pctContributionRepeatability = (varRepeatability / varTotal) * 100;
  const pctContributionPart = (varPart / varTotal) * 100;
  const pctContributionGRR = (varRepeatability / varTotal) * 100; // GRR ≡ repeatability for Type 3

  const varianceComponents = {
    useInteractionModel: false,
    totalGaugeRR: {
      variance: varRepeatability,
      contribution: pctContributionGRR
    },
    repeatability: {
      variance: varRepeatability,
      stdDev: Math.sqrt(varRepeatability),
      pctContribution: pctContributionRepeatability
    },
    reproducibility: {
      // Type 3: No reproducibility
      variance: 0,
      stdDev: 0,
      pctContribution: 0,
      operator: 0,
      interaction: 0
    },
    partToPart: {
      variance: varPart,
      stdDev: Math.sqrt(varPart),
      pctContribution: pctContributionPart
    },
    totalVariation: {
      variance: varTotal,
      stdDev: Math.sqrt(varTotal),
      pctContribution: 100
    }
  };
  
  // Gauge Evaluation (Study Variation)
  const studyVarMultiplier = 5.15; // For 99% coverage
  const totalGaugeRR_SV = studyVarMultiplier * Math.sqrt(varRepeatability);
  const repeatability_SV = totalGaugeRR_SV;
  const partToPart_SV = studyVarMultiplier * Math.sqrt(varPart);
  const totalVariation_SV = studyVarMultiplier * Math.sqrt(varTotal);
  
  // Percentages (Study Variation)
  const totalGaugeRR_pctSV = (totalGaugeRR_SV / totalVariation_SV) * 100;
  const repeatability_pctSV = (repeatability_SV / totalVariation_SV) * 100;
  const partToPart_pctSV = (partToPart_SV / totalVariation_SV) * 100;
  
  // Tolerance percentages (if tolerance provided)
  let totalGaugeRR_pctTol = null;
  let repeatability_pctTol = null;
  
  if (toleranceWidth && toleranceWidth > 0) {
    totalGaugeRR_pctTol = (totalGaugeRR_SV / toleranceWidth) * 100;
    repeatability_pctTol = (repeatability_SV / toleranceWidth) * 100;
  }
  
  const gaugeEvaluation = {
    totalGaugeRR: {
      stdDev: Math.sqrt(varRepeatability),
      studyVar: totalGaugeRR_SV,
      pctStudyVar: totalGaugeRR_pctSV,
      pctContribution: pctContributionGRR,
      pctTolerance: totalGaugeRR_pctTol
    },
    repeatability: {
      stdDev: Math.sqrt(varRepeatability),
      studyVar: repeatability_SV,
      pctStudyVar: repeatability_pctSV,
      pctContribution: pctContributionRepeatability,
      pctTolerance: repeatability_pctTol
    },
    reproducibility: {
      // Type 3: No reproducibility (automatic equipment)
      stdDev: 0,
      studyVar: 0,
      pctStudyVar: 0,
      pctContribution: 0,
      pctTolerance: 0
    },
    partToPart: {
      stdDev: Math.sqrt(varPart),
      studyVar: partToPart_SV,
      pctStudyVar: partToPart_pctSV,
      pctContribution: pctContributionPart,
      pctTolerance: null
    },
    totalVariation: {
      stdDev: Math.sqrt(varTotal),
      studyVar: totalVariation_SV,
      pctStudyVar: 100,
      pctTolerance: null
    }
  };
  
  // Interpretation
  const grrPct = totalGaugeRR_pctSV;
  let acceptability, recommendation;
  
  if (grrPct < 10) {
    acceptability = 'Acceptable';
    recommendation = 'Ölçüm sistemi kabul edilebilir';
  } else if (grrPct < 30) {
    acceptability = 'Marginal';
    recommendation = 'Duruma göre kabul edilebilir - iyileştirme önerilir';
  } else {
    acceptability = 'Unacceptable';
    recommendation = 'Ölçüm sistemi kabul edilemez - iyileştirme gerekli';
  }
  
  console.log('✅ Type 3 calculation completed:', { grrPct, acceptability });
  
  return {
    anovaTable,
    varianceComponents,
    gaugeEvaluation,
    interpretation: {
      acceptability,
      recommendation
    },
    isType3: true
  };
}

// Browser + CommonJS dual export (statik ERP modülü dönüşümü — hesap mantığı birebir korunmuştur)
const __msaCalcExports = {
  calculateGaugeRR,
  calculateType3OneWayANOVA,
  calculateControlCharts,
  mean,
  variance,
  standardDeviation
};
if (typeof module !== 'undefined' && module.exports) {
  module.exports = __msaCalcExports;
}
if (typeof window !== 'undefined') {
  window.msaCalculations = __msaCalcExports;
}
