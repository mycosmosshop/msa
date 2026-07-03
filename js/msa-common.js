/**
 * MSA (GageAI) — Ortak altyapı
 * Express + PostgreSQL sunucusundan statik ERP modülüne dönüşüm katmanı.
 * Veri mantığı src/msaRoutes.js ve src/autoScheduleUtils.js'ten birebir taşınmıştır;
 * tek fark: knex/pg sorguları yerine supabase-js çağrıları.
 *
 * Kimlik: ERP Portal oturumu (erp-guard ile aynı proje) — modülün kendi login'i yoktur.
 * Veri:   Kalite ortak Supabase projesi (nnubrxbpthmkitueixbh), tablolar msa_* önekli.
 */
(function () {
  'use strict';

  // ---------------------------------------------------------------- CONFIG
  const DATA_URL = 'https://nnubrxbpthmkitueixbh.supabase.co';
  const DATA_ANON = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im5udWJyeGJwdGhta2l0dWVpeGJoIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODA1NjI2MDIsImV4cCI6MjA5NjEzODYwMn0.CHZUOylf_q8kkOQbFf9VWZ6-doUTlynmAhahM2EuImE';
  const ERP_URL = 'https://chchaielttnimuuezazb.supabase.co';
  const ERP_KEY = 'sb_publishable_S2ywbq7TkgcZKiVif3td-A_oAuQL3QT';

  // Ortak projede tablo adları (equipment genel bir ad olduğundan msa_ öneki aldı)
  const T = {
    studies: 'msa_studies',
    measurements: 'msa_measurements',
    operators: 'msa_operators',
    parts: 'msa_parts',
    schedule: 'msa_schedule',
    equipment: 'msa_equipment',
    capa: 'msa_capa_actions',
    type1Measurements: 'msa_type1_measurements',
    type1Results: 'msa_type1_results'
  };

  const VALID_MSA_TYPES = ['type1', 'type2', 'type3'];
  const TYPE_LABELS = {
    type1: 'Type 1 - Instrument Capability',
    type2: 'Type 2 - Gage R&R Studies',
    type3: 'Type 3 - Gage R&R (Automatic Equipment)'
  };

  // getBrandingSettings() portu — app_settings tablosu düştü, varsayılanlar sabitlendi
  const BRANDING = {
    company_name: 'GageAI – Smart Gage R&R Analytics',
    company_tagline: 'Intelligent Measurement System Analysis',
    logo_filename: 'gageai-logo.png',
    logo_url: 'images/gageai-logo.png',
    primary_color: '#667eea',
    secondary_color: '#764ba2'
  };

  const db = supabase.createClient(DATA_URL, DATA_ANON, {
    auth: { persistSession: false, autoRefreshToken: false, storageKey: 'sb-msa-data-anon' }
  });
  // Portal oturumunu okuyan istemci (varsayılan storageKey → portal ile paylaşımlı)
  const erp = supabase.createClient(ERP_URL, ERP_KEY);

  // ---------------------------------------------------------------- HELPERS
  function q(name, def = null) {
    const v = new URLSearchParams(location.search).get(name);
    return v === null ? def : v;
  }

  function requireQ(name) {
    const v = q(name);
    if (!v) {
      document.body.innerHTML = '<div style="padding:40px;font-family:Segoe UI,sans-serif">Eksik parametre: ' + name + '</div>';
      throw new Error('Missing query param: ' + name);
    }
    return v;
  }

  function nowIso() { return new Date().toISOString(); }

  function throwIf(error, context) {
    if (error) {
      console.error('❌ Supabase hatası [' + context + ']:', error);
      throw new Error(context + ': ' + (error.message || JSON.stringify(error)));
    }
  }

  // json kolonları string ya da obje gelebilir — orijinal kod gibi savunmacı parse
  function parseJson(value, fallback) {
    if (value === null || value === undefined) return fallback;
    if (typeof value === 'string') {
      try { return JSON.parse(value); } catch (e) { return fallback; }
    }
    return value;
  }

  async function currentUser() {
    try {
      const { data } = await erp.auth.getSession();
      const u = data && data.session && data.session.user;
      if (u) {
        return {
          id: u.id,
          email: u.email || 'no-session',
          name: (u.user_metadata && (u.user_metadata.full_name || u.user_metadata.name)) || (u.email ? u.email.split('@')[0] : 'Guest')
        };
      }
    } catch (e) {
      console.warn('ERP oturumu okunamadı:', e);
    }
    return { id: null, email: 'no-session', name: 'Guest' };
  }

  // ---------------------------------------------------------------- EJS RENDER
  async function renderPage(templateFile, locals) {
    const resp = await fetch('templates/' + templateFile + '?v=' + Date.now());
    if (!resp.ok) throw new Error('Şablon yüklenemedi: ' + templateFile + ' (' + resp.status + ')');
    const template = await resp.text();
    const html = ejs.render(template, locals, { async: false });
    // document.write ile tam sayfa değişimi: şablon içindeki <script> blokları
    // orijinal sunucu render'ındaki gibi sırayla çalışır.
    document.open();
    document.write(html);
    document.close();
  }

  function renderError(title, message) {
    document.open();
    document.write('<!DOCTYPE html><html lang="tr"><head><meta charset="UTF-8"><title>Hata</title></head>' +
      '<body style="font-family:Segoe UI,sans-serif;background:#f5f7fa;display:flex;align-items:center;justify-content:center;min-height:100vh;margin:0">' +
      '<div style="background:#fff;border-radius:12px;box-shadow:0 4px 16px rgba(0,0,0,.08);padding:36px;max-width:520px;text-align:center">' +
      '<div style="font-size:42px">⚠️</div><h2 style="margin:12px 0">' + title + '</h2>' +
      '<p style="color:#555">' + message + '</p>' +
      '<a href="index.html" style="display:inline-block;margin-top:14px;padding:10px 22px;background:#667eea;color:#fff;border-radius:8px;text-decoration:none">Panoya Dön</a>' +
      '</div></body></html>');
    document.close();
  }

  // ---------------------------------------------------------------- PORTLAR (msaRoutes.js)

  // normalizeStudyType — msaRoutes.js:16
  function normalizeStudyType(studyType) {
    if (!studyType) return 'type2';
    const value = studyType.toString().toLowerCase();
    if (value.includes('type1')) return 'type1';
    if (value.includes('type3') || value.includes('automatic')) return 'type3';
    return 'type2';
  }

  // autoScheduleUtils.js portları
  function normalizeScheduleTypes(input) {
    if (!input) return [];
    const rawList = Array.isArray(input) ? input : [input];
    const normalized = rawList
      .map(v => v && v.toString().toLowerCase().trim())
      .filter(v => VALID_MSA_TYPES.includes(v));
    return [...new Set(normalized)];
  }

  function parseStoredScheduleTypes(rawValue) {
    if (!rawValue) return [];
    if (Array.isArray(rawValue)) return normalizeScheduleTypes(rawValue);
    if (typeof rawValue === 'string') {
      try { return normalizeScheduleTypes(JSON.parse(rawValue)); }
      catch (e) { return normalizeScheduleTypes(rawValue.split(',')); }
    }
    return normalizeScheduleTypes([rawValue]);
  }

  function formatFutureDate(monthsAhead = 12) {
    const now = new Date();
    const months = Number.isFinite(monthsAhead) ? monthsAhead : 12;
    now.setMonth(now.getMonth() + months);
    return now.toISOString().split('T')[0];
  }

  function normalizeDateInput(dateInput) {
    if (!dateInput) return null;
    if (dateInput instanceof Date && !Number.isNaN(dateInput.getTime())) {
      return dateInput.toISOString().split('T')[0];
    }
    const parsed = new Date(dateInput);
    if (Number.isNaN(parsed.getTime())) return null;
    return parsed.toISOString().split('T')[0];
  }

  // createAutoScheduleDraft — autoScheduleUtils.js:83 (user_id → e-posta kolonları)
  async function createAutoScheduleDraft({ equipment, studyType = 'type2', intervalMonths = 12, plannedByEmail, responsibleEmail, context = {} }) {
    const normalizedType = VALID_MSA_TYPES.includes(studyType) ? studyType : 'type2';
    const plannedDate = normalizeDateInput(context.planned_date) || formatFutureDate(intervalMonths);

    const gaugeName = context.gauge_name ?? (equipment && equipment.name) ?? null;
    const gaugeNumber = context.gauge_number ?? (equipment && (equipment.serial_number || equipment.device_number)) ?? null;
    const location = context.location ?? (equipment && equipment.location) ?? null;
    const partName = context.part_name ?? null;
    const characteristic = context.characteristic ?? null;
    const tolerance = context.tolerance ?? context.tolerance_spec ?? null;

    const scheduleTitle = context.title || `${gaugeName || (equipment && equipment.name) || 'MSA'} - ${TYPE_LABELS[normalizedType]}`;
    const scheduleDescription = context.description || `${TYPE_LABELS[normalizedType]} için otomatik oluşturulan periyodik MSA planlaması (${intervalMonths} aylık)`;

    const schedulePayload = {
      planned_by_email: plannedByEmail || null,
      responsible_email: responsibleEmail || plannedByEmail || null,
      title: scheduleTitle,
      description: scheduleDescription,
      planned_date: plannedDate,
      gauge_name: gaugeName,
      gauge_number: gaugeNumber,
      part_name: partName,
      characteristic: characteristic,
      tolerance: tolerance,
      location: location,
      status: 'planned',
      study_type: normalizedType
    };
    if (context.previous_study_id) schedulePayload.previous_study_id = context.previous_study_id;
    if (context.capa_id) schedulePayload.capa_id = context.capa_id;

    const ins = await db.from(T.schedule).insert(schedulePayload).select('id').single();
    throwIf(ins.error, 'schedule insert');
    const scheduleId = ins.data.id;
    let draftStudyId = null;

    if (normalizedType === 'type2' || normalizedType === 'type3') {
      const defaultOperators = context.num_operators ? parseInt(context.num_operators, 10) : 3;
      const defaultParts = context.num_parts ? parseInt(context.num_parts, 10) : 10;
      const defaultTrials = context.num_trials ? parseInt(context.num_trials, 10) : 2;

      const draftStudy = {
        study_name: context.study_name || `${gaugeName || (equipment && equipment.name) || 'MSA'} - ${TYPE_LABELS[normalizedType]}`,
        part_name: partName || 'Parça 1',
        characteristic: characteristic || 'Ölçülen Özellik',
        tolerance_spec: tolerance || null,
        gauge_name: gaugeName,
        gauge_number: gaugeNumber,
        location: location,
        num_operators: defaultOperators,
        num_parts: defaultParts,
        num_trials: defaultTrials,
        owner_email: responsibleEmail || plannedByEmail || null,
        status: 'draft',
        is_from_schedule: true,
        schedule_id: scheduleId,
        study_type: normalizedType
      };

      const dIns = await db.from(T.studies).insert(draftStudy).select('id').single();
      throwIf(dIns.error, 'draft study insert');
      draftStudyId = dIns.data.id;

      const operators = [];
      for (let i = 1; i <= defaultOperators; i += 1) {
        operators.push({ study_id: draftStudyId, operator_name: `Operatör ${i}`, operator_number: i });
      }
      if (operators.length > 0) {
        const r = await db.from(T.operators).insert(operators);
        throwIf(r.error, 'operators insert');
      }

      const parts = [];
      for (let i = 1; i <= defaultParts; i += 1) {
        parts.push({ study_id: draftStudyId, part_number: i, part_name: `Parça ${i}` });
      }
      if (parts.length > 0) {
        const r = await db.from(T.parts).insert(parts);
        throwIf(r.error, 'parts insert');
      }

      const upd = await db.from(T.schedule).update({ completed_study_id: draftStudyId }).eq('id', scheduleId);
      throwIf(upd.error, 'schedule draft link');
    }

    return { scheduleId, draftStudyId, plannedDate, studyType: normalizedType };
  }

  // applyEquipmentScheduleMatch — msaRoutes.js:30 (knex OR bloğu → PostgREST .or filtresi)
  function equipmentScheduleOrFilter(equipmentData = {}) {
    const { name, serial_number, device_number } = equipmentData;
    const parts = [];
    const escape = v => String(v).replace(/,/g, '\\,'); // PostgREST or() virgül ayracı
    if (name) parts.push(`gauge_name.eq.${escape(name)}`);
    if (serial_number) parts.push(`gauge_number.eq.${escape(serial_number)}`);
    if (device_number) parts.push(`gauge_number.eq.${escape(device_number)}`);
    return parts.length ? parts.join(',') : null;
  }

  // cancelAutoSchedulesForEquipment — msaRoutes.js:57
  async function cancelAutoSchedulesForEquipment(equipmentData = {}, noteMessage = 'Otomatik plan devre dışı bırakıldı') {
    try {
      const orFilter = equipmentScheduleOrFilter(equipmentData);
      if (!orFilter) return 0;
      let query = db.from(T.schedule)
        .select('id, notes, description')
        .in('status', ['planned', 'reminded'])
        .or(orFilter);
      const { data, error } = await query;
      throwIf(error, 'cancel auto schedules select');
      const targets = (data || []).filter(s => (s.description || '').toLowerCase().includes('otomatik'));
      for (const s of targets) {
        const notes = (s.notes || '') === '' ? noteMessage : s.notes + '\n' + noteMessage;
        const r = await db.from(T.schedule)
          .update({ status: 'cancelled', updated_at: nowIso(), notes })
          .eq('id', s.id);
        throwIf(r.error, 'cancel auto schedule update');
      }
      return targets.length;
    } catch (error) {
      console.error('Failed to cancel auto schedules for equipment:', error.message);
      return 0;
    }
  }

  // upsertAutoSchedulesForEquipment — msaRoutes.js:75
  async function upsertAutoSchedulesForEquipment({ equipmentData, scheduleTypes = [], plannedDate, intervalMonths = 12, userEmail }) {
    try {
      const orFilter = equipmentScheduleOrFilter(equipmentData);
      let pendingSchedules = [];
      if (orFilter) {
        const { data, error } = await db.from(T.schedule)
          .select('id, planned_date, study_type, description, notes')
          .in('status', ['planned', 'reminded'])
          .or(orFilter);
        throwIf(error, 'upsert auto schedules select');
        pendingSchedules = (data || []).filter(s => (s.description || '').toLowerCase().includes('otomatik'));
      }

      const targetTypes = scheduleTypes.length > 0 ? scheduleTypes : ['type2'];
      const matchedTypes = new Set();

      for (const schedule of pendingSchedules) {
        const currentType = schedule.study_type ? normalizeStudyType(schedule.study_type) : 'type2';
        if (!targetTypes.includes(currentType)) {
          const notes = (schedule.notes || '') === '' ? 'MSA tipi listeden çıkarıldı' : schedule.notes + '\nMSA tipi listeden çıkarıldı';
          const r = await db.from(T.schedule)
            .update({ status: 'cancelled', updated_at: nowIso(), notes })
            .eq('id', schedule.id);
          throwIf(r.error, 'auto schedule cancel (type removed)');
          continue;
        }
        matchedTypes.add(currentType);
        if (plannedDate) {
          const scheduleDate = schedule.planned_date ? new Date(schedule.planned_date).toISOString().split('T')[0] : null;
          if (scheduleDate !== plannedDate) {
            const r = await db.from(T.schedule)
              .update({ planned_date: plannedDate, updated_at: nowIso() })
              .eq('id', schedule.id);
            throwIf(r.error, 'auto schedule date update');
          }
        }
      }

      for (const type of targetTypes) {
        if (matchedTypes.has(type)) continue;
        await createAutoScheduleDraft({
          equipment: equipmentData,
          studyType: type,
          intervalMonths,
          plannedByEmail: userEmail,
          responsibleEmail: userEmail,
          context: {
            planned_date: plannedDate,
            gauge_name: equipmentData.name,
            gauge_number: equipmentData.serial_number,
            location: equipmentData.location
          }
        });
      }
    } catch (error) {
      console.error('Failed to sync auto schedules for equipment:', error);
    }
  }

  // generateCapaNumber — msaRoutes.js:257
  async function generateCapaNumber() {
    const year = new Date().getFullYear();
    const prefix = `CAPA-${year}-`;
    const { data, error } = await db.from(T.capa)
      .select('capa_number')
      .like('capa_number', `${prefix}%`)
      .order('capa_number', { ascending: false })
      .limit(1);
    throwIf(error, 'capa number select');
    let nextNumber = 1;
    if (data && data.length > 0) {
      const lastNum = parseInt(data[0].capa_number.split('-')[2]);
      nextNumber = lastNum + 1;
    }
    return `${prefix}${String(nextNumber).padStart(3, '0')}`;
  }

  // createAutoCapaIfNeeded — msaRoutes.js:278 (kriterler ve metinler birebir)
  async function createAutoCapaIfNeeded(studyId, results, userEmail) {
    try {
      const { data: study, error } = await db.from(T.studies).select('*').eq('id', studyId).maybeSingle();
      throwIf(error, 'capa study select');
      if (!study) return null;

      const grrPercent = (results.gaugeEvaluation && results.gaugeEvaluation.totalGaugeRR && results.gaugeEvaluation.totalGaugeRR.pctStudyVar) || 0;
      const grrTolerance = (results.gaugeEvaluation && results.gaugeEvaluation.totalGaugeRR && results.gaugeEvaluation.totalGaugeRR.pctTolerance != null)
        ? results.gaugeEvaluation.totalGaugeRR.pctTolerance : null;
      const ndc = (results.interpretation && results.interpretation.ndc) || 0;
      const acceptance = study.is_acceptable;

      const issues = [];
      if (grrPercent > 30) {
        issues.push({
          type: 'grr_unacceptable',
          severity: 'critical',
          description: `%GRR (Study Variation) = ${grrPercent.toFixed(2)}% (>30%) - Kabul Edilemez! Ölçüm sistemi iyileştirme zorunludur. MSA 4th Edition'a göre bu ölçüm sistemi kullanıma uygun değildir.`,
          value: grrPercent,
          autoCapaRequired: true
        });
      }
      if (grrTolerance !== null && grrTolerance > 30) {
        issues.push({
          type: 'tolerance_unacceptable',
          severity: 'critical',
          description: `%GRR (Tolerance) = ${grrTolerance.toFixed(2)}% (>30%) - Kabul Edilemez! Ölçüm varyasyonu toleransın ${grrTolerance.toFixed(0)}%'sini kaplıyor. Ölçüm sistemi spesifikasyon sınırlarına göre kullanılamaz.`,
          value: grrTolerance,
          autoCapaRequired: true
        });
      }

      const criticalIssues = issues.filter(i => i.autoCapaRequired === true);
      if (criticalIssues.length === 0) {
        console.log('✅ Kritik sorun yok, otomatik CAPA açılmadı');
        return null;
      }

      const { data: existingCapa, error: exErr } = await db.from(T.capa)
        .select('id, capa_number')
        .eq('study_id', studyId)
        .in('status', ['open', 'in_progress'])
        .maybeSingle();
      throwIf(exErr, 'existing capa select');
      if (existingCapa) {
        console.log('⚠️ Bu çalışma için zaten açık CAPA var:', existingCapa.capa_number);
        return null;
      }

      const mainIssue = criticalIssues[0];
      const capaNumber = await generateCapaNumber();
      const allCriticalDescriptions = criticalIssues.map(i => i.description).join('\n\n');

      const insertRes = await db.from(T.capa).insert({
        study_id: studyId,
        capa_number: capaNumber,
        issue_type: mainIssue.type,
        issue_description: allCriticalDescriptions,
        grr_value: grrPercent,
        ndc_value: ndc,
        tolerance_grr_value: grrTolerance,
        acceptance_criteria: acceptance,
        status: 'open',
        created_by_email: userEmail || null,
        reminder_days: 15
      }).select('*').single();
      throwIf(insertRes.error, 'capa insert');

      console.log('🔴 Otomatik CAPA oluşturuldu:', capaNumber);
      return insertRes.data;
    } catch (error) {
      console.error('CAPA oluşturma hatası:', error);
      return null;
    }
  }

  // Ölçümleri operatör/parça adlarıyla getir — msaRoutes.js:1912 LEFT JOIN portu (JS tarafında birleştirme)
  async function getMeasurementsWithNames(studyId) {
    const [mRes, opRes, pRes] = await Promise.all([
      db.from(T.measurements).select('*').eq('study_id', studyId),
      db.from(T.operators).select('*').eq('study_id', studyId).order('operator_number'),
      db.from(T.parts).select('*').eq('study_id', studyId).order('part_number')
    ]);
    throwIf(mRes.error, 'measurements select');
    throwIf(opRes.error, 'operators select');
    throwIf(pRes.error, 'parts select');

    const opByNumber = {};
    (opRes.data || []).forEach(o => { opByNumber[String(o.operator_number)] = o.operator_name; });
    const partByNumber = {};
    (pRes.data || []).forEach(p => { partByNumber[String(p.part_number)] = p.part_name; });

    const measurements = (mRes.data || []).map(m => ({
      ...m,
      operator_name: opByNumber[String(m.operator)] || null,
      part_name: partByNumber[String(m.part)] || null
    }));
    return { measurements, operators: opRes.data || [], parts: pRes.data || [] };
  }

  // save-measurement — msaRoutes.js:1633 (upsert)
  async function saveMeasurement(studyId, { operator, part, trial, measurement }) {
    const { data: existing, error: selErr } = await db.from(T.measurements)
      .select('id')
      .eq('study_id', studyId).eq('operator', operator).eq('part', part).eq('trial', parseInt(trial))
      .maybeSingle();
    throwIf(selErr, 'measurement select');
    if (existing) {
      const r = await db.from(T.measurements)
        .update({ measurement: parseFloat(measurement) })
        .eq('id', existing.id);
      throwIf(r.error, 'measurement update');
    } else {
      const r = await db.from(T.measurements).insert({
        study_id: studyId,
        operator: String(operator),
        part: String(part),
        trial: parseInt(trial),
        measurement: parseFloat(measurement)
      });
      throwIf(r.error, 'measurement insert');
    }
    return { success: true };
  }

  // save-measurements (toplu, sil+ekle) — msaRoutes.js:1758
  async function saveMeasurements(studyId, measurements) {
    const validMeasurements = [];
    const errors = [];
    (measurements || []).forEach((m, index) => {
      const measurement = parseFloat(m.measurement);
      const trial = parseInt(m.trial);
      if (isNaN(measurement)) { errors.push(`Satır ${index + 1}: Geçersiz ölçüm değeri ("${m.measurement}")`); return; }
      if (isNaN(trial) || trial < 1) { errors.push(`Satır ${index + 1}: Geçersiz tekrar numarası`); return; }
      if (!m.operator || !m.part) { errors.push(`Satır ${index + 1}: Operatör veya parça bilgisi eksik`); return; }
      validMeasurements.push({
        study_id: studyId,
        operator: String(m.operator),
        part: String(m.part),
        trial: trial,
        measurement: measurement
      });
    });

    if (errors.length > 0) {
      return { success: false, message: `Veri hatası: ${errors.length} satırda problem var`, errors: errors.slice(0, 5) };
    }
    if (validMeasurements.length === 0) {
      return { success: false, message: 'Geçerli ölçüm verisi bulunamadı' };
    }

    const del = await db.from(T.measurements).delete().eq('study_id', studyId);
    throwIf(del.error, 'measurements delete');
    const ins = await db.from(T.measurements).insert(validMeasurements);
    throwIf(ins.error, 'measurements insert');
    return { success: true, message: `${validMeasurements.length} ölçüm kaydedildi`, count: validMeasurements.length };
  }

  // update-draft-settings — msaRoutes.js:1677
  async function updateDraftSettings(studyId, { num_operators, num_parts, num_trials }) {
    const { data: study, error } = await db.from(T.studies).select('*').eq('id', studyId).maybeSingle();
    throwIf(error, 'study select');
    if (!study) return { success: false, error: 'Çalışma bulunamadı' };
    if (!study.is_from_schedule || study.status !== 'draft') {
      return { success: false, error: 'Sadece planlamadan oluşturulan taslak çalışmalarda ayarlar değiştirilebilir' };
    }
    if (num_operators < 2 || num_operators > 10) return { success: false, error: 'Operatör sayısı 2-10 arasında olmalıdır' };
    if (num_parts < 2 || num_parts > 50) return { success: false, error: 'Parça sayısı 2-50 arasında olmalıdır' };
    if (num_trials < 2 || num_trials > 10) return { success: false, error: 'Tekrar sayısı 2-10 arasında olmalıdır' };

    let r = await db.from(T.studies).update({ num_operators, num_parts, num_trials }).eq('id', studyId);
    throwIf(r.error, 'study update');
    r = await db.from(T.operators).delete().eq('study_id', studyId); throwIf(r.error, 'operators delete');
    r = await db.from(T.parts).delete().eq('study_id', studyId); throwIf(r.error, 'parts delete');
    r = await db.from(T.measurements).delete().eq('study_id', studyId); throwIf(r.error, 'measurements delete');

    const newOperators = [];
    for (let i = 1; i <= num_operators; i++) newOperators.push({ study_id: studyId, operator_name: `Operatör ${i}`, operator_number: i });
    r = await db.from(T.operators).insert(newOperators); throwIf(r.error, 'operators insert');

    const newParts = [];
    for (let i = 1; i <= num_parts; i++) newParts.push({ study_id: studyId, part_number: i, part_name: `Parça ${i}` });
    r = await db.from(T.parts).insert(newParts); throwIf(r.error, 'parts insert');

    return { success: true, message: 'Ayarlar başarıyla güncellendi' };
  }

  // GET /msa/:id/calculate — msaRoutes.js:1861 tam orkestrasyon portu.
  // Dönüş: results şablonunun beklediği locals ya da {redirect:{page,params}} (eksik veri vb.)
  async function calculateStudy(studyId, options = {}) {
    const user = await currentUser();

    const { data: study, error: stErr } = await db.from(T.studies).select('*').eq('id', studyId).maybeSingle();
    throwIf(stErr, 'study select');
    if (!study) throw new Error('Study not found');

    const { measurements, operators, parts } = await getMeasurementsWithNames(studyId);

    const numericMeasurements = measurements.map(m => ({
      ...m,
      measurement: parseFloat(m.measurement),
      trial: parseInt(m.trial)
    }));

    const requiredMeasurements = study.num_operators * study.num_parts * study.num_trials;
    if (numericMeasurements.length === 0) {
      return { redirect: { page: 'data-entry.html', params: { id: studyId, error: 'Önce veri girişi yapmalısınız!' } } };
    }
    if (numericMeasurements.length < requiredMeasurements && !options.allowIncomplete) {
      return { redirect: { page: 'data-entry.html', params: { id: studyId, warning: `Sadece ${numericMeasurements.length}/${requiredMeasurements} ölçüm girildi. Devam edilsin mi?` } } };
    }

    // analysis_options savunmacı parse + varsayılanlar (msaRoutes.js:1959-2037 birebir)
    let analysisOptions = parseJson(study.analysis_options, {}) || {};
    if (!analysisOptions.interaction_pooling) analysisOptions.interaction_pooling = 'auto';
    if (!analysisOptions.plots) {
      analysisOptions.plots = {
        anova_table: true, components_contribution: true, components_variance: true,
        gauge_evaluation: true, xbar_r_chart: true, by_operator: true, by_part: true,
        operator_part_interaction: true, scatter_plots: true, fit_line: true,
        show_origin_line: true, measurements_part: true, measurements_op: true,
        display_all: false, traffic_light: true
      };
    } else {
      let needsUpdate = false;
      if (analysisOptions.plots.scatter === undefined) { analysisOptions.plots.scatter = true; needsUpdate = true; }
      if (analysisOptions.plots.measurements_part === undefined && analysisOptions.plots.measurements_by_part === undefined) { analysisOptions.plots.measurements_part = true; needsUpdate = true; }
      if (analysisOptions.plots.measurements_op === undefined && analysisOptions.plots.measurements_by_op === undefined) { analysisOptions.plots.measurements_op = true; needsUpdate = true; }
      if (needsUpdate) {
        const r = await db.from(T.studies)
          .update({ analysis_options: analysisOptions, updated_at: nowIso() })
          .eq('id', studyId);
        throwIf(r.error, 'analysis_options backfill');
      }
    }

    const toleranceWidth = (analysisOptions && analysisOptions.tolerance && analysisOptions.tolerance.width) || null;

    // Hesaplama — birebir korunan çekirdek
    const { calculateGaugeRR, calculateControlCharts } = window.msaCalculations;
    let results, controlCharts;
    try {
      results = calculateGaugeRR(numericMeasurements, toleranceWidth, analysisOptions);
      controlCharts = calculateControlCharts(numericMeasurements);
    } catch (calcError) {
      return { redirect: { page: 'data-entry.html', params: { id: studyId, error: 'Hesaplama hatası: ' + calcError.message } } };
    }

    if (!results || !results.gaugeEvaluation || !results.gaugeEvaluation.totalGaugeRR) {
      return { redirect: { page: 'data-entry.html', params: { id: studyId, error: 'Hesaplama sonucu alınamadı' } } };
    }

    let acceptabilityValue = null;
    if (results.interpretation.acceptability === 'Acceptable') acceptabilityValue = 'acceptable';
    else if (results.interpretation.acceptability === 'Marginal') acceptabilityValue = 'marginal';
    else if (results.interpretation.acceptability === 'Unacceptable') acceptabilityValue = 'unacceptable';

    const upd = await db.from(T.studies).update({
      anova_results: results.anovaTable,
      variance_components: results.varianceComponents,
      gauge_evaluation: results.gaugeEvaluation,
      status: 'calculated',
      is_acceptable: acceptabilityValue
    }).eq('id', studyId);
    throwIf(upd.error, 'results save');

    const capa = await createAutoCapaIfNeeded(studyId, results, user.email);

    // İlk hesaplamada otomatik sonraki plan — msaRoutes.js:2109 (kontrol: kayıtlı eski sonuç yoktu)
    if (study.gauge_name && study.gauge_number && !study.anova_results) {
      try {
        const { data: eqList, error: eqErr } = await db.from(T.equipment)
          .select('*')
          .eq('name', study.gauge_name)
          .or(`serial_number.eq.${String(study.gauge_number).replace(/,/g, '\\,')},device_number.eq.${String(study.gauge_number).replace(/,/g, '\\,')}`)
          .limit(1);
        throwIf(eqErr, 'equipment select');
        const equipment = eqList && eqList[0];
        if (equipment && equipment.auto_schedule_interval) {
          const scheduleTypes = parseStoredScheduleTypes(equipment.auto_schedule_types);
          const studyType = normalizeStudyType(study.study_type);
          const shouldCreateSchedule = scheduleTypes.length === 0 || scheduleTypes.includes(studyType);
          if (shouldCreateSchedule) {
            await createAutoScheduleDraft({
              equipment,
              studyType,
              intervalMonths: equipment.auto_schedule_interval,
              plannedByEmail: user.email,
              responsibleEmail: study.owner_email || user.email,
              context: {
                previous_study_id: studyId,
                title: `${study.study_name} - Tekrar ${studyType === 'type3' ? 'Type 3' : 'Type 2'} MSA`,
                description: `${study.gauge_name} için otomatik oluşturulan periyodik ${studyType.toUpperCase()} MSA planlaması`,
                part_name: study.part_name,
                characteristic: study.characteristic,
                tolerance: study.tolerance_spec,
                gauge_name: study.gauge_name,
                gauge_number: study.gauge_number,
                location: study.location
              }
            });
          }
        }
      } catch (scheduleError) {
        console.error('⚠️ Failed to create auto-schedule:', scheduleError);
      }
    }

    // Açık CAPA (results şablonu banner'ı için)
    const { data: studyCapa } = await db.from(T.capa)
      .select('*')
      .eq('study_id', studyId)
      .in('status', ['open', 'in_progress'])
      .maybeSingle();

    // Güncel study'yi yeniden oku (status/is_acceptable değişti)
    const { data: freshStudy } = await db.from(T.studies).select('*').eq('id', studyId).maybeSingle();

    return {
      user,
      study: freshStudy || study,
      results,
      controlCharts,
      measurements: numericMeasurements,
      analysisOptions,
      operators,
      parts,
      capa: studyCapa || null,
      branding: BRANDING
    };
  }

  // ---------------------------------------------------------------- EXPORT
  window.MSA = {
    db, erp, T,
    BRANDING,
    VALID_MSA_TYPES, TYPE_LABELS,
    q, requireQ, nowIso, throwIf, parseJson,
    currentUser,
    renderPage, renderError,
    normalizeStudyType,
    normalizeScheduleTypes, parseStoredScheduleTypes, normalizeDateInput, formatFutureDate,
    createAutoScheduleDraft, cancelAutoSchedulesForEquipment, upsertAutoSchedulesForEquipment,
    equipmentScheduleOrFilter,
    generateCapaNumber, createAutoCapaIfNeeded,
    getMeasurementsWithNames, saveMeasurement, saveMeasurements, updateDraftSettings,
    calculateStudy
  };
})();
