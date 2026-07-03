/**
 * MSA (GageAI) — Excel araçları
 * src/msaRoutes.js 2631-3546 portu (download-template, generate-smart-template, import-excel).
 * Sunucudaki SheetJS mantığı istemciye taşındı: XLSX.writeFile ile indirme,
 * XLSX.read ile içe aktarma. Validasyon mesajları ve matematik birebir korunmuştur.
 * Gerektirir: xlsx (CDN), js/msa-common.js (window.MSA).
 */
(function () {
  'use strict';

  // ------------------------------------------------------------------
  // GET /msa/download-template portu — msaRoutes.js:2631
  // Hata durumunda (route'taki 400 JSON karşılığı) Türkçe mesajla throw eder.
  // ------------------------------------------------------------------
  function downloadTemplate(params) {
    params = params || {};

    // Parametreleri al (query string'den)
    const numOperators = parseInt(params.operators) || 3;
    const numParts = parseInt(params.parts) || 10;
    const numTrials = parseInt(params.trials) || 3;

    // Validasyon
    if (numOperators < 2 || numOperators > 10) {
      throw new Error('Operatör sayısı 2-10 arasında olmalıdır.');
    }
    if (numParts < 2 || numParts > 50) {
      throw new Error('Parça sayısı 2-50 arasında olmalıdır.');
    }
    if (numTrials < 2 || numTrials > 10) {
      throw new Error('Tekrar sayısı 2-10 arasında olmalıdır.');
    }

    // Şablon Excel dosyası oluştur
    const workbook = XLSX.utils.book_new();

    // Data sayfası - Sadece tek ölçüm sütunu ile
    const dataHeaders = ['#', 'Operatör', 'Parça No', 'Tekrar', 'Ölçüm (mm)'];

    const dataRows = [dataHeaders];

    // Örnek veriler - gerçekçi ölçüm değerleri (10.0 ± 0.5 civarında)
    let rowNumber = 1;
    const baseValue = 10.0; // Nominal değer
    const tolerance = 0.5;

    for (let part = 1; part <= numParts; part++) {
      for (let operator = 1; operator <= numOperators; operator++) {
        // Her operatör için her trial'ı ayrı satır olarak ekle
        for (let trial = 1; trial <= numTrials; trial++) {
          // Her operatörün kendi bias'ı var
          const operatorBias = (operator - (numOperators + 1) / 2) * 0.05;

          // Her parçanın kendi gerçek değeri var
          const partValue = baseValue + ((part - (numParts + 1) / 2) * 0.02);

          // Trial varyasyonu (ölçüm tekrarlanabilirliği)
          const trialVariation = (Math.random() - 0.5) * 0.1;

          // Final değer
          const measurement = partValue + operatorBias + trialVariation;

          const row = [
            rowNumber++,
            `Operator ${operator}`,
            `Parça ${part}`,
            trial, // Tekrar numarası
            parseFloat(measurement.toFixed(3)) // Ölçüm değeri
          ];

          dataRows.push(row);
        }
      }
    }

    const dataSheet = XLSX.utils.aoa_to_sheet(dataRows);

    // Sütun genişlikleri
    dataSheet['!cols'] = [
      { width: 8 },  // #
      { width: 15 }, // Operatör
      { width: 12 }, // Parça No
      { width: 10 }, // Tekrar
      { width: 15 }  // Ölçüm (mm)
    ];

    XLSX.utils.book_append_sheet(workbook, dataSheet, 'Data');

    // Dosya adı - parametreleri içeren
    const fileName = `MSA_Template_${numOperators}Op_${numParts}Part_${numTrials}Trial.xlsx`;

    // Dosyayı indir (res.send(buffer) yerine istemci tarafı yazma)
    XLSX.writeFile(workbook, fileName);

    return { success: true, fileName };
  }

  // ------------------------------------------------------------------
  // GET /msa/generate-smart-template portu — msaRoutes.js:2731
  // Box-Muller sentezi, hedef %GRR/NDC ve ulaşılabilirlik validasyonları birebir.
  // ------------------------------------------------------------------
  function generateSmartTemplate(params) {
    params = params || {};

    // Parse parameters
    const numOperators = parseInt(params.operators) || 3;
    const numParts = parseInt(params.parts) || 10;
    const numTrials = parseInt(params.trials) || 3;
    const targetGRR = parseFloat(params.targetGRR) || 15;
    const nominalValue = parseFloat(params.nominal) || 100;
    const processTolerance = parseFloat(params.tolerance) || 1;
    const resolution = parseFloat(params.resolution) || 0.01;
    const targetNDC = parseInt(params.targetNDC) || 6;

    // Validation
    if (numOperators < 2 || numOperators > 10) {
      throw new Error('Operatör sayısı 2-10 arasında olmalıdır.');
    }
    if (numParts < 2 || numParts > 50) {
      throw new Error('Parça sayısı 2-50 arasında olmalıdır.');
    }
    if (numTrials < 2 || numTrials > 10) {
      throw new Error('Tekrar sayısı 2-10 arasında olmalıdır.');
    }
    if (targetGRR < 5 || targetGRR > 50) {
      throw new Error('Hedef %GRR 5-50 arasında olmalıdır.');
    }

    // Çözünürlük ve tolerans uyumluluğu kontrolü
    const toleranceRange = processTolerance * 2; // ±1 = 2 birimlik range
    const possibleValues = Math.floor(toleranceRange / resolution);

    if (possibleValues < 10) {
      const minResolution = toleranceRange / 20; // En az 20 farklı değer
      throw new Error(
        `Çözünürlük (${resolution}) toleransa (±${processTolerance}) göre çok kaba! ` +
        `Bu kombinasyon ile yeterli varyasyon üretilemez ve hesaplama hatası oluşur.\n\n` +
        `Önerilen minimum çözünürlük: ${minResolution.toFixed(3)}\n\n` +
        `Alternatifler:\n` +
        `• Çözünürlüğü azaltın (örn: 0.01 veya 0.02)\n` +
        `• Toleransı artırın (örn: ±${(processTolerance * 5).toFixed(0)})\n` +
        `• Nominal değeri artırın (örn: ${(nominalValue * 10).toFixed(0)})`
      );
    }

    // Hedef GRR ve NDC'nin ulaşılabilirliğini kontrol et
    // MSA 4th Edition formülleri:
    // %GRR = (σ_gauge / σ_total) × 100
    // σ_total² = σ_part² + σ_gauge²
    // NDC = 1.41 × (σ_part / σ_gauge)

    const validateGrrRatio = targetGRR / 100;
    const validateTotalStdDev = processTolerance / 3; // 6σ = 2×tolerance
    const validateGaugeStdDev = validateGrrRatio * validateTotalStdDev;

    // Çözünürlük kontrolü: Ölçüm sisteminin hassasiyeti yeterli mi?
    // Kuantizasyon hatası için çözünürlük ≤ σ_gauge / 5 olmalı
    const maxRecommendedResolution = validateGaugeStdDev / 5;

    if (resolution > maxRecommendedResolution) {
      const recommendedResolution = Math.min(maxRecommendedResolution, toleranceRange / 100);
      const achievableGRR = (resolution * 5 / validateTotalStdDev * 100);

      throw new Error(
        `⚠️ Hedef %GRR (${targetGRR}%) bu çözünürlük ile ULAŞILAMAZ!\n\n` +
        `📊 Teknik Analiz:\n` +
        `• Hedef için gerekli ölçüm hassasiyeti (σ_gauge): ${validateGaugeStdDev.toFixed(4)}\n` +
        `• Mevcut çözünürlük: ${resolution} → Çok kaba!\n` +
        `• Çözünürlük ≤ σ_gauge/5 olmalı (kuantizasyon hatası)\n` +
        `• Maximum önerilen çözünürlük: ${maxRecommendedResolution.toFixed(4)}\n\n` +
        `💡 ÇÖZÜM SEÇENEKLERİ:\n\n` +
        `1️⃣ Çözünürlüğü İyileştir (ÖNERİLEN)\n` +
        `   → Çözünürlük: ${recommendedResolution.toFixed(4)} veya daha ince\n` +
        `   → Bu hedef %GRR ${targetGRR}%'e ulaşmanızı sağlar\n\n` +
        `2️⃣ Hedef %GRR'ı Artır\n` +
        `   → Bu çözünürlükle (${resolution}) ulaşılabilir: ~%${achievableGRR.toFixed(1)}\n` +
        `   → Daha gerçekçi bir hedef belirleyin\n\n` +
        `3️⃣ Toleransı Genişlet\n` +
        `   → Önerilen tolerans: ±${(processTolerance * 3).toFixed(2)} veya daha geniş\n` +
        `   → Daha geniş tolerans = daha kolay hedefler\n\n` +
        `📖 MSA 4th Edition:\n` +
        `Ölçüm cihazının çözünürlüğü, beklenen ölçüm varyansının\n` +
        `en az 1/10'u kadar ince olmalıdır (Otomotiv Std: 1/5).`
      );
    }

    // NDC kontrolü: Hedef GRR ile bu NDC matematiksel olarak mümkün mü?
    // σ_total² = σ_part² + σ_gauge²  →  σ_part² = σ_total² - σ_gauge²
    const validatePartVariance = Math.max(0, validateTotalStdDev ** 2 - validateGaugeStdDev ** 2);
    const validatePartStdDev = Math.sqrt(validatePartVariance);
    const expectedNDC = validatePartStdDev > 0 ? 1.41 * (validatePartStdDev / validateGaugeStdDev) : 0;

    // NDC'nin %50'den fazla sapması kabul edilemez
    if (targetNDC > expectedNDC * 1.5) {
      const achievableNDC = Math.floor(expectedNDC);
      const requiredGRR = (1.41 / targetNDC * 100);

      throw new Error(
        `⚠️ Hedef NDC (${targetNDC}) bu %GRR ile ULAŞILAMAZ!\n\n` +
        `📊 Teknik Analiz:\n` +
        `• Hedef %GRR: ${targetGRR}%\n` +
        `• Hesaplanan σ_gauge: ${validateGaugeStdDev.toFixed(4)}\n` +
        `• Hesaplanan σ_part: ${validatePartStdDev.toFixed(4)}\n` +
        `• Bu parametrelerle beklenen NDC: ~${expectedNDC.toFixed(1)}\n` +
        `• Hedef NDC: ${targetNDC} → ${((targetNDC / expectedNDC - 1) * 100).toFixed(0)}% daha yüksek!\n\n` +
        `💡 ÇÖZÜM SEÇENEKLERİ:\n\n` +
        `1️⃣ NDC Hedefini Düşür (ÖNERİLEN)\n` +
        `   → Ulaşılabilir NDC: ${achievableNDC} veya daha az\n` +
        `   → Bu %GRR ${targetGRR}% ile tutarlı\n\n` +
        `2️⃣ %GRR Hedefini Düşür\n` +
        `   → NDC ${targetNDC} için gereken %GRR: ~${requiredGRR.toFixed(1)}% veya daha az\n` +
        `   → Daha iyi bir ölçüm sistemi gerekir\n\n` +
        `3️⃣ Her İkisini de Dengele\n` +
        `   → Örnek: %GRR ${Math.round(targetGRR * 0.7)}% + NDC ${Math.round(targetNDC * 0.7)}\n` +
        `   → Daha gerçekçi ve dengeli hedefler\n\n` +
        `📖 MSA İlişkisi:\n` +
        `• Düşük %GRR (iyi ölçüm) → Yüksek NDC mümkün\n` +
        `• Yüksek %GRR (zayıf ölçüm) → Düşük NDC\n` +
        `• NDC = 1.41 × (σ_part / σ_gauge)\n` +
        `• σ_total² = σ_part² + σ_gauge² (varyans toplama)`
      );
    }

    if (possibleValues < 20) {
      console.warn(`⚠️ UYARI: Çözünürlük/Tolerans kombinasyonu sınırda (${possibleValues} farklı değer)`);
    }

    console.log('🎯 Smart Template Validation Passed:', {
      numOperators, numParts, numTrials,
      targetGRR: targetGRR + '%',
      targetNDC,
      nominalValue,
      processTolerance: '±' + processTolerance,
      resolution,
      toleranceRange: '±' + toleranceRange,
      possibleValues: `~${possibleValues} farklı değer`,
      expectedNDC: expectedNDC.toFixed(2),
      validateGaugeStdDev: validateGaugeStdDev.toFixed(4),
      validatePartStdDev: validatePartStdDev.toFixed(4),
      maxRecommendedResolution: maxRecommendedResolution.toFixed(4)
    });

    // ====================================================================
    // DOĞRU VARYANS HESAPLAMALARI (MSA 4th Edition)
    // ====================================================================
    // Temel formüller:
    // 1. %GRR = (σ_gauge / σ_total) × 100  → σ_gauge = (%GRR/100) × σ_total
    // 2. σ_total² = σ_part² + σ_gauge²     → Varyans toplama kuralı
    // 3. NDC = 1.41 × (σ_part / σ_gauge)   → σ_part = (NDC/1.41) × σ_gauge
    //
    // Çözüm stratejisi:
    // - Toleranstan başla: σ_total = Tolerans/6 (6 sigma = tolerans aralığı)
    // - Hedef GRR'den gauge hesapla: σ_gauge = (%GRR/100) × σ_total
    // - Kalan varyans part'a ait: σ_part = sqrt(σ_total² - σ_gauge²)
    // - NDC kontrolü yap ve gerekirse ayarla
    // ====================================================================

    const grrRatio = targetGRR / 100;  // Örn: 15% → 0.15

    // Total process variation from tolerance (6σ process capability assumption)
    const totalStdDev = processTolerance / 3; // 6σ = 2×tolerance, so σ = tolerance/3

    // Gauge variation from target GRR
    // %GRR = σ_gauge / σ_total × 100
    const gaugeStdDev = grrRatio * totalStdDev;

    // Part variation from remaining variance
    // σ_total² = σ_part² + σ_gauge²
    // σ_part = sqrt(σ_total² - σ_gauge²)
    const partVariance = Math.max(0, totalStdDev * totalStdDev - gaugeStdDev * gaugeStdDev);
    let partStdDev = Math.sqrt(partVariance);

    // Check calculated NDC
    // NDC = 1.41 × (σ_part / σ_gauge)
    const calculatedNDC = partStdDev > 0 ? 1.41 * (partStdDev / gaugeStdDev) : 0;

    // If calculated NDC is less than target, we need to adjust
    // This means we need MORE part variation
    if (calculatedNDC < targetNDC) {
      // From NDC formula: σ_part = (NDC / 1.41) × σ_gauge
      partStdDev = (targetNDC / 1.41) * gaugeStdDev;

      // This will increase total variation beyond tolerance
      // Recalculate total for info purposes
      const adjustedTotalStdDev = Math.sqrt(partStdDev * partStdDev + gaugeStdDev * gaugeStdDev);
      console.log(`ℹ️  NDC ${targetNDC} hedefi için parça varyansı artırıldı:`);
      console.log(`   - Orijinal σ_total: ${totalStdDev.toFixed(4)}`);
      console.log(`   - Ayarlanmış σ_total: ${adjustedTotalStdDev.toFixed(4)}`);
      console.log(`   - Yeni σ_part: ${partStdDev.toFixed(4)}`);
    }

    // Breakdown gauge variation into repeatability and reproducibility
    // Typically: Repeatability ≈ 70%, Reproducibility ≈ 30% of total gauge error
    // σ_gauge² = σ_repeatability² + σ_reproducibility²
    const repeatabilityStdDev = gaugeStdDev * 0.7;
    const reproducibilityStdDev = gaugeStdDev * 0.3;

    // Final NDC after adjustments
    const finalNDC = 1.41 * (partStdDev / gaugeStdDev);
    const finalGRR = (gaugeStdDev / Math.sqrt(partStdDev * partStdDev + gaugeStdDev * gaugeStdDev)) * 100;

    console.log('📊 Calculated Standard Deviations:', {
      totalStdDev: totalStdDev.toFixed(4),
      gaugeStdDev: gaugeStdDev.toFixed(4),
      partStdDev: partStdDev.toFixed(4),
      repeatabilityStdDev: repeatabilityStdDev.toFixed(4),
      reproducibilityStdDev: reproducibilityStdDev.toFixed(4),
      calculatedNDC: calculatedNDC.toFixed(2),
      finalNDC: finalNDC.toFixed(2),
      finalGRR: finalGRR.toFixed(2) + '%',
      targetGRR: targetGRR + '%',
      targetNDC: targetNDC
    });

    // Generate part true values with proper variation
    const partTrueValues = [];
    for (let i = 0; i < numParts; i++) {
      // Normal distribution around nominal using Box-Muller transform
      const u1 = Math.random();
      const u2 = Math.random();
      const z = Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
      const partValue = nominalValue + z * partStdDev;
      partTrueValues.push(partValue);
    }

    // Sort part values for better spread
    partTrueValues.sort((a, b) => a - b);

    // Create workbook
    const workbook = XLSX.utils.book_new();
    const dataHeaders = ['#', 'Operatör', 'Parça No', 'Tekrar', 'Ölçüm (mm)'];
    const dataRows = [dataHeaders];

    let rowNumber = 1;

    // Generate measurements
    for (let part = 0; part < numParts; part++) {
      const truePartValue = partTrueValues[part];

      for (let operator = 0; operator < numOperators; operator++) {
        // Each operator has a bias (reproducibility error)
        const u1 = Math.random();
        const u2 = Math.random();
        const z = Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
        const operatorBias = z * reproducibilityStdDev;

        for (let trial = 0; trial < numTrials; trial++) {
          // Each measurement has repeatability error
          const u1_r = Math.random();
          const u2_r = Math.random();
          const z_r = Math.sqrt(-2 * Math.log(u1_r)) * Math.cos(2 * Math.PI * u2_r);
          const repeatabilityError = z_r * repeatabilityStdDev;

          // Final measurement
          const measurement = truePartValue + operatorBias + repeatabilityError;

          // Round to resolution
          const rounded = Math.round(measurement / resolution) * resolution;
          const finalValue = parseFloat(rounded.toFixed(10)); // Remove floating point errors

          const row = [
            rowNumber++,
            `Operator ${operator + 1}`,
            `Parça ${part + 1}`,
            trial + 1,
            finalValue
          ];

          dataRows.push(row);
        }
      }
    }

    const dataSheet = XLSX.utils.aoa_to_sheet(dataRows);

    // Column widths
    dataSheet['!cols'] = [
      { width: 8 },  // #
      { width: 15 }, // Operatör
      { width: 12 }, // Parça No
      { width: 10 }, // Tekrar
      { width: 15 }  // Ölçüm
    ];

    XLSX.utils.book_append_sheet(workbook, dataSheet, 'Data');

    // Add info sheet with parameters
    const infoData = [
      ['🎯 Akıllı MSA Şablon Bilgileri'],
      [''],
      ['Parametre', 'Değer'],
      ['Operatör Sayısı', numOperators],
      ['Parça Sayısı', numParts],
      ['Tekrar Sayısı', numTrials],
      [''],
      ['Hedef %GRR', `${targetGRR}%`],
      ['Hedef NDC', targetNDC],
      ['Nominal Değer', nominalValue],
      ['Proses Toleransı (±)', processTolerance],
      ['Çözünürlük', resolution],
      [''],
      ['Hesaplanan Değerler', ''],
      ['Total Std. Sapma (σ_total)', totalStdDev.toFixed(4)],
      ['Ölçüm Sistemi Std. Sapma (σ_gauge)', gaugeStdDev.toFixed(4)],
      ['Parça Std. Sapma (σ_part)', partStdDev.toFixed(4)],
      ['Tekrarlanabilirlik (σ_repeatability)', repeatabilityStdDev.toFixed(4)],
      ['Yeniden Üretilebilirlik (σ_reproducibility)', reproducibilityStdDev.toFixed(4)],
      [''],
      ['Beklenen Sonuçlar', ''],
      ['Beklenen %GRR', finalGRR.toFixed(2) + '%'],
      ['Beklenen NDC', finalNDC.toFixed(2)],
      [''],
      ['⚠️ Not:', 'Bu değerler teorik hesaplamalara dayanır.'],
      ['', 'Gerçek sonuçlar rastgele varyasyon nedeniyle'],
      ['', '±10% farklılık gösterebilir.'],
      ['', ''],
      ['📖 Formüller:', ''],
      ['', 'σ_total² = σ_part² + σ_gauge²'],
      ['', '%GRR = (σ_gauge / σ_total) × 100'],
      ['', 'NDC = 1.41 × (σ_part / σ_gauge)']
    ];

    const infoSheet = XLSX.utils.aoa_to_sheet(infoData);
    infoSheet['!cols'] = [{ width: 30 }, { width: 20 }];

    XLSX.utils.book_append_sheet(workbook, infoSheet, 'Bilgi');

    const fileName = `MSA_Smart_GRR${targetGRR}_NDC${targetNDC}_${numOperators}Op_${numParts}Part.xlsx`;

    // Dosyayı indir (res.send(buffer) yerine istemci tarafı yazma)
    XLSX.writeFile(workbook, fileName);

    return { success: true, fileName };
  }

  // ------------------------------------------------------------------
  // POST /msa/import-excel portu — msaRoutes.js:3091
  // Dönüş: rota ile aynı gövdeler:
  //   { success:false, error, details? }  (validasyon hataları — 400 karşılığı)
  //   { success:true, message, study_id, study_name, warnings }
  // Operatör/parça isimleri İLK GÖRÜLME sırası ile oluşturulur ve ölçüm
  // anahtarları olarak İSİMLER saklanır (orijinal davranış korunur).
  // ------------------------------------------------------------------
  async function importExcel(file) {
    try {
      if (!file) {
        return { success: false, error: 'Dosya yüklenmedi.' };
      }

      // Excel dosyasını oku
      const buffer = await file.arrayBuffer();
      const workbook = XLSX.read(buffer, { type: 'array' });

      // Data sayfasını bul
      const dataSheetName = workbook.SheetNames.find(name =>
        name.toLowerCase() === 'data' || name.toLowerCase() === 'sheet1'
      );

      if (!dataSheetName) {
        return {
          success: false,
          error: 'Excel dosyasında "Data" sayfası bulunamadı.'
        };
      }

      const worksheet = workbook.Sheets[dataSheetName];
      const data = XLSX.utils.sheet_to_json(worksheet, { header: 1 });

      // Başlıkları kontrol et
      const headers = data[0];
      if (!headers || headers.length < 5) {
        return {
          success: false,
          error: 'Geçersiz Excel formatı. Beklenen sütunlar: #, Operatör, Parça No, Tekrar, Ölçüm (mm)'
        };
      }

      // Yeni format: #, Operatör, Parça No, Tekrar, Ölçüm (mm)
      // Her satırda bir ölçüm var, tekrarlar ayrı satırlarda
      const measurements = {}; // { partName: { operatorName: [trial1, trial2, ...] } }
      const operatorsMap = new Map(); // Sırayı korumak için Map kullan
      const partsMap = new Map(); // Sırayı korumak için Map kullan
      const trialCounts = {}; // Her part-operator kombinasyonu için trial sayısı

      console.log('📊 Excel Import - Başlıklar:', headers);
      console.log('📊 Excel Import - Toplam satır sayısı:', data.length - 1);

      for (let i = 1; i < data.length; i++) {
        const row = data[i];
        if (!row || row.length < 4) continue; // En az 4 sütun olmalı

        const operator = String(row[1] || '').trim();
        const part = String(row[2] || '').trim();
        const trialNum = parseInt(row[3]);

        // Ölçüm değeri - boş ise 0 olarak al
        let measurement = 0;
        const rawMeasurement = row[4];

        if (rawMeasurement !== undefined && rawMeasurement !== null && rawMeasurement !== '') {
          const parsedValue = parseFloat(rawMeasurement);
          if (!isNaN(parsedValue)) {
            measurement = parsedValue;
          }
        }

        // Debug: İlk 5 ve son 2 satırı detaylı logla
        if (i <= 5 || i >= data.length - 2) {
          console.log(`📊 Satır ${i}:`, {
            rawRow: row.slice(0, 5),
            operator,
            part,
            trialNum,
            measurement,
            rawMeasurement,
            rawType: typeof rawMeasurement,
            isEmpty: rawMeasurement === '' || rawMeasurement === undefined || rawMeasurement === null
          });
        }

        // Operatör, parça ve trial numarası geçerli olmalı
        if (!part || !operator || isNaN(trialNum)) {
          console.log(`⚠️ Satır ${i} atlandı - geçersiz veri:`, { operator, part, trialNum });
          continue;
        }

        // Map'e ekle (ilk görülme sırasını korur)
        if (!partsMap.has(part)) {
          partsMap.set(part, partsMap.size + 1); // 1, 2, 3...
        }
        if (!operatorsMap.has(operator)) {
          operatorsMap.set(operator, operatorsMap.size + 1); // 1, 2, 3...
        }

        // measurements yapısını oluştur
        if (!measurements[part]) {
          measurements[part] = {};
        }
        if (!measurements[part][operator]) {
          measurements[part][operator] = [];
        }

        // Trial numarasına göre ölçümü ekle (index = trialNum - 1)
        measurements[part][operator][trialNum - 1] = measurement;

        // Debug: İlk eklenen ölçümü logla
        if (i <= 3) {
          console.log(`✅ Ölçüm eklendi: measurements["${part}"]["${operator}"][${trialNum - 1}] = ${measurement}`);
        }

        // Trial sayısını takip et
        const key = `${part}_${operator}`;
        trialCounts[key] = Math.max(trialCounts[key] || 0, trialNum);
      }

      // Set'lere dönüştür (uyumluluk için)
      const operators = new Set(operatorsMap.keys());
      const parts = new Set(partsMap.keys());

      // Max trial sayısını bul
      const maxTrials = Math.max(...Object.values(trialCounts), 0);

      console.log('📊 Excel Import Özeti:', {
        operatorSayisi: operators.size,
        parcaSayisi: parts.size,
        maxTrials,
        operators: Array.from(operators),
        parts: Array.from(parts)
      });

      // Measurements yapısını kontrol et
      const firstPart = Array.from(parts)[0];
      const firstOperator = Array.from(operators)[0];
      console.log('📊 İlk kombinasyonun ölçümleri:', {
        part: firstPart,
        operator: firstOperator,
        measurements: measurements[firstPart]?.[firstOperator]
      });

      // ============================================
      // KAPSAMLI VERİ VALİDASYONU
      // ============================================

      const errors = [];
      const warnings = [];

      // Validasyon 1: Temel veri kontrolü
      if (operators.size === 0 || parts.size === 0) {
        return {
          success: false,
          error: '❌ Excel dosyasında veri bulunamadı. Operatör ve parça bilgileri eksik.'
        };
      }

      if (maxTrials === 0) {
        return {
          success: false,
          error: '❌ Excel dosyasında geçerli tekrar sayısı bulunamadı.'
        };
      }

      // Validasyon 2: Operatör ve Parça Sayısı Kontrolü
      const operatorList = Array.from(operators);
      const partList = Array.from(parts);

      console.log('📊 Operatör listesi:', operatorList);
      console.log('📊 Parça listesi:', partList);

      // Operatör ve parça sayısı makul aralıkta olmalı
      if (operators.size < 2 || operators.size > 10) {
        errors.push(`❌ Operatör sayısı hatalı: ${operators.size} (2-10 arasında olmalı)`);
      }

      if (parts.size < 2 || parts.size > 50) {
        errors.push(`❌ Parça sayısı hatalı: ${parts.size} (2-50 arasında olmalı)`);
      }

      if (maxTrials < 2 || maxTrials > 10) {
        errors.push(`❌ Tekrar sayısı hatalı: ${maxTrials} (2-10 arasında olmalı)`);
      }

      // Validasyon 3: Simetri - Her operatör-parça kombinasyonu için AYNI trial sayısı
      const expectedCombinations = operators.size * parts.size;
      const actualCombinations = Object.keys(trialCounts).length;

      if (actualCombinations !== expectedCombinations) {
        errors.push(`❌ Veri eksik! Beklenen: ${expectedCombinations} kombinasyon (${operators.size} op × ${parts.size} parça), Bulunan: ${actualCombinations}`);
      }

      // Her kombinasyon için trial sayısı aynı olmalı
      const missingTrials = [];
      const inconsistentTrials = [];

      parts.forEach(part => {
        operators.forEach(operator => {
          const key = `${part}_${operator}`;
          const trialCount = trialCounts[key] || 0;

          if (trialCount === 0) {
            missingTrials.push(`${operator} - ${part}: 0 trial`);
          } else if (trialCount !== maxTrials) {
            inconsistentTrials.push(`${operator} - ${part}: ${trialCount}/${maxTrials} trial`);
          }
        });
      });

      if (missingTrials.length > 0) {
        errors.push(`❌ ${missingTrials.length} kombinasyonda hiç ölçüm yok:\n${missingTrials.slice(0, 5).join('\n')}${missingTrials.length > 5 ? '\n...' : ''}`);
      }

      if (inconsistentTrials.length > 0) {
        warnings.push(`⚠️ ${inconsistentTrials.length} kombinasyonda eksik tekrar:\n${inconsistentTrials.slice(0, 5).join('\n')}${inconsistentTrials.length > 5 ? '\n...' : ''}`);
      }

      // Validasyon 3.5: Tekrar numaraları sıralı mı kontrol et (1, 2, 3...)
      const invalidTrialSequences = [];

      parts.forEach(part => {
        operators.forEach(operator => {
          const trials = measurements[part]?.[operator] || [];
          const key = `${part}_${operator}`;
          const trialCount = trialCounts[key] || 0;

          if (trialCount > 0) {
            // Her trial numarası (1, 2, 3...) için ölçüm var mı kontrol et
            for (let i = 0; i < trialCount; i++) {
              if (trials[i] === undefined) {
                invalidTrialSequences.push(`${operator} - ${part}: Tekrar ${i + 1} eksik (${trialCount} tekrar bekleniyor)`);
                break; // Bu kombinasyon için sadece ilk eksik olanı göster
              }
            }
          }
        });
      });

      if (invalidTrialSequences.length > 0) {
        errors.push(`❌ Tekrar numaraları sıralı değil! Her operatör-parça için tekrarlar 1, 2, 3... şeklinde olmalı:\n${invalidTrialSequences.slice(0, 5).join('\n')}${invalidTrialSequences.length > 5 ? '\n...' : ''}`);
      }

      // Validasyon 4: Ölçüm değerleri kontrolü
      let totalMeasurements = 0;
      let zeroMeasurements = 0;
      let validMeasurements = 0;

      parts.forEach(part => {
        operators.forEach(operator => {
          const trials = measurements[part]?.[operator] || [];
          for (let i = 0; i < maxTrials; i++) {
            totalMeasurements++;
            const value = trials[i];
            if (value === undefined || value === null) {
              // Eksik
            } else if (value === 0) {
              zeroMeasurements++;
            } else {
              validMeasurements++;
            }
          }
        });
      });

      // Eğer tüm ölçümler 0 ise ciddi hata
      if (validMeasurements === 0 && totalMeasurements > 0) {
        errors.push(`❌ TÜM ÖLÇÜMLER 0! Excel'de "Ölçüm (mm)" sütunu boş veya hatalı.\nLütfen ölçüm değerlerini kontrol edin.`);
      } else if (zeroMeasurements > totalMeasurements * 0.5) {
        warnings.push(`⚠️ Ölçümlerin %${(zeroMeasurements / totalMeasurements * 100).toFixed(0)}'si 0 değerinde (${zeroMeasurements}/${totalMeasurements})`);
      }

      console.log('📊 Validasyon Detayları:', {
        operatorSayisi: operators.size,
        parcaSayisi: parts.size,
        maxTrials,
        beklenenKombinasyon: expectedCombinations,
        bulunanKombinasyon: actualCombinations,
        toplamOlcum: totalMeasurements,
        gecerliOlcum: validMeasurements,
        sifirOlcum: zeroMeasurements,
        eksikTrial: missingTrials.length,
        tutarsizTrial: inconsistentTrials.length
      });

      // HATA VARSA YÜKLEME YAPMA
      if (errors.length > 0) {
        console.error('❌ Excel Validasyon Hataları:', errors);
        return {
          success: false,
          error: '📋 Excel dosyası geçersiz:\n\n' + errors.join('\n\n'),
          details: {
            operators: operatorList,
            parts: partList,
            maxTrials,
            totalMeasurements,
            validMeasurements
          }
        };
      }

      // Kullanıcı — ERP Portal oturumu (users tablosu / fallback user düştü)
      const user = await MSA.currentUser();

      // Yeni MSA çalışması oluştur
      const studyName = `Excel Import - ${new Date().toLocaleString('tr-TR')}`;

      // Default analysis options for Excel import
      const defaultAnalysisOptions = {
        interaction_pooling: 'auto',
        plots: {
          anova_table: true,
          components_contribution: true,
          components_variance: true,
          gauge_evaluation: true,
          xbar_r_chart: true,
          by_operator: true,
          by_part: true,
          operator_part_interaction: true,
          scatter_plots: true,
          fit_line: true,
          show_origin_line: true,
          measurements_by_part: true,
          display_all: false,
          traffic_light: true
        },
        show_tooltips: true,
        show_recommendations: true,
        show_capa_banner: true
      };

      const studyIns = await MSA.db.from(MSA.T.studies)
        .insert({
          owner_email: user.email !== 'no-session' ? user.email : null,
          study_name: studyName,
          description: `Excel'den aktarılan çalışma (${operators.size} operatör, ${parts.size} parça, ${maxTrials} tekrar)`,
          study_date: MSA.nowIso(),
          performed_by: user.name || user.email || 'Excel Import',
          num_operators: operators.size,
          num_parts: parts.size,
          num_trials: maxTrials,
          status: 'pending',
          analysis_options: defaultAnalysisOptions
        })
        .select('*')
        .single();
      MSA.throwIf(studyIns.error, 'study insert');
      const study = studyIns.data;

      // Operatörleri kaydet
      const operatorNames = Array.from(operators);
      const operatorInserts = operatorNames.map((name, index) => ({
        study_id: study.id,
        operator_number: index + 1,
        operator_name: name
      }));

      if (operatorInserts.length > 0) {
        const r = await MSA.db.from(MSA.T.operators).insert(operatorInserts);
        MSA.throwIf(r.error, 'operators insert');
      }

      // Ölçümleri kaydet
      const measurementInserts = [];
      const partNames = Array.from(parts);

      console.log('🔍 Measurements yapısı kontrol:', {
        partNames,
        operatorNames,
        ilkPartOlcumleri: measurements[partNames[0]]
      });

      partNames.forEach((partName, partIndex) => {
        operatorNames.forEach((operatorName, operatorIndex) => {
          const trials = measurements[partName]?.[operatorName] || [];

          // Debug: İlk kombinasyon için detaylı log
          if (partIndex === 0 && operatorIndex === 0) {
            console.log(`🔍 "${operatorName}" - "${partName}" için trials:`, trials);
          }

          for (let trial = 0; trial < maxTrials; trial++) {
            // Ölçüm değeri - yoksa 0 kullan
            const measurementValue = trials[trial] !== undefined ? trials[trial] : 0;

            // Debug: İlk 3 ölçüm için detaylı log
            if (measurementInserts.length < 3) {
              console.log(`🔍 Ölçüm ${measurementInserts.length + 1}:`, {
                operator: operatorName,
                part: partName,
                trial: trial + 1,
                trialsArray: trials,
                trialsIndex: trial,
                value: trials[trial],
                finalValue: measurementValue
              });
            }

            measurementInserts.push({
              study_id: study.id,
              operator: operatorName,
              part: partName,
              trial: trial + 1,
              measurement: measurementValue
            });
          }
        });
      });

      console.log('📊 Veritabanına yazılacak ölçüm sayısı:', measurementInserts.length);
      console.log('📊 İlk 5 ölçüm kaydı:', measurementInserts.slice(0, 5));
      console.log('📊 Son 2 ölçüm kaydı:', measurementInserts.slice(-2));

      if (measurementInserts.length > 0) {
        const r = await MSA.db.from(MSA.T.measurements).insert(measurementInserts);
        MSA.throwIf(r.error, 'measurements insert');
        console.log('✅ Ölçümler veritabanına yazıldı');
      }

      // Parça isimlerini kaydet
      const partInserts = partNames.map((name, index) => ({
        study_id: study.id,
        part_number: index + 1,
        part_name: name
      }));

      if (partInserts.length > 0) {
        const r = await MSA.db.from(MSA.T.parts).insert(partInserts);
        MSA.throwIf(r.error, 'parts insert');
      }

      // Başarı mesajı + uyarılar
      let successMessage = `✅ Çalışma başarıyla oluşturuldu!\n\n📊 ${operators.size} operatör, ${parts.size} parça, ${maxTrials} tekrar\n📝 ${measurementInserts.length} ölçüm kaydedildi`;

      if (warnings.length > 0) {
        successMessage += '\n\n⚠️ Uyarılar:\n' + warnings.map(w => '• ' + w).join('\n');
      }

      return {
        success: true,
        message: successMessage,
        study_id: study.id,
        study_name: studyName,
        warnings: warnings
      };

    } catch (error) {
      console.error('Excel import error:', error);
      return {
        success: false,
        error: 'Excel dosyası işlenirken bir hata oluştu: ' + error.message
      };
    }
  }

  // ---------------------------------------------------------------- EXPORT
  window.MSAExcel = {
    downloadTemplate,
    generateSmartTemplate,
    importExcel
  };
})();
