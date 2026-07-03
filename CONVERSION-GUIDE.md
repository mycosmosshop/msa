# GageAI MSA → Statik ERP Modülü Dönüşüm Rehberi

Kaynak uygulama: `C:\Users\User\Desktop\Yazılım\MSA` (Express + EJS + PostgreSQL).
Hedef: bu klasör (`C:\Users\User\Desktop\_erp_deploy\msa`) — GitHub Pages'te
`https://mycosmosshop.github.io/msa/` altında yayınlanacak statik çok sayfalı uygulama.

## ALTIN KURAL
**İçerik birebir korunur.** EJS şablonlarındaki HTML, CSS, inline JS (grafikler, tooltip
metinleri, öneri blokları, Türkçe metinler) DEĞİŞTİRİLMEZ. Değişen yalnızca:
1. URL'ler (aşağıdaki eşleme tablosu),
2. `fetch()`/form POST'ları → `MSA.*` veri katmanı çağrıları,
3. Sunucu değişkeni beslemesi (Express `res.render` locals → sayfa yükleyicisinin Supabase'ten kurduğu locals),
4. Düşen özellikler (aşağıda).

## Mimari
Her Express GET sayfası = bir **yükleyici HTML** + **korunmuş EJS şablonu**:

- `templates/<sayfa>.ejs` — orijinal `views/...` dosyasının kopyası; içinde SADECE
  URL/fetch/form yeniden yazımları ve düşen özellik temizliği yapılır.
  `<%- include('partials/x') %>` varsa partial içeriği yerine gömülür (inline).
- `<sayfa>.html` — küçük yükleyici:

```html
<!DOCTYPE html>
<html lang="tr">
<head>
<meta charset="UTF-8">
<script>window.ERP_GUARD_ALLOW=function(){return ['localhost','127.0.0.1'].includes(location.hostname);};</script>
<script src="https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2"></script>
<script src="https://mycosmosshop.github.io/erp-portal/erp-guard.js"></script>
<script src="https://cdn.jsdelivr.net/npm/ejs@3.1.10/ejs.min.js"></script>
<script src="js/msa-common.js"></script>
<!-- gerekiyorsa: js/msa-calculations.js, jstat + js/type1-calculations.js, xlsx -->
<title>...</title>
</head>
<body>
<div style="font-family:'Segoe UI',sans-serif;padding:40px;color:#667eea">Yükleniyor…</div>
<script>
(async () => {
  try {
    const user = await MSA.currentUser();
    // ... Express rotasındaki veri hazırlama mantığının birebir portu (supabase-js ile) ...
    await MSA.renderPage('<sayfa>.ejs', { user, /* orijinal locals aynı adlarla */ });
  } catch (e) {
    console.error(e);
    MSA.renderError('Hata', e.message);
  }
})();
</script>
</body>
</html>
```

`MSA.renderPage` şablonu `templates/` altından çeker, `ejs.render` eder ve
`document.write` ile basar → şablon içindeki `<script>`ler orijinal sunucu
render'ındaki gibi sırayla çalışır. Şablonun kendi `<head>`i (Chart.js CDN vb.)
aynen korunur ve etkin olur.

## URL Eşleme Tablosu (şablon içinde ve yükleyicilerde uygula)
| Express | Statik |
|---|---|
| `/msa` | `index.html` |
| `/msa?view=kpi` | `index.html?view=kpi` |
| `/msa/new` | `new-study.html` |
| `/msa/<id>/edit` | `edit-study.html?id=<id>` |
| `/msa/<id>/data-entry` | `data-entry.html?id=<id>` |
| `/msa/<id>/calculate` | `calculate.html?id=<id>` |
| `/msa/<id>/results` | `results.html?id=<id>` |
| `/msa/<id>` (detay) | `study-detail.html?id=<id>` |
| `/msa/capa` | `capa-list.html` |
| `/msa/<sid>/capa/<cid>` | `capa-detail.html?study=<sid>&id=<cid>` |
| `/msa/<sid>/capa/<cid>/schedule-next` | `schedule-next.html?study=<sid>&capa=<cid>` |
| `/msa/schedule` | `schedule-master.html` |
| `/msa/schedule/new` | `schedule-new.html` |
| `/msa/schedule/<id>` | `schedule-detail.html?id=<id>` |
| `/msa/schedule/<id>/edit` | `schedule-edit.html?id=<id>` |
| `/msa/equipment` | `equipment.html` |
| `/msa/all-defects` | `all-defects.html` |
| `/msa/msa-plan` | `msa-plan.html` |
| `/msa/upload-template` | `upload-template.html` |
| `/msa/smart-upload` | `smart-upload.html` |
| `/msa/type1/new` | `type1-new.html` |
| `/msa/type1/<id>/results` | `type1-results.html?id=<id>` |
| `/msa/type1/<id>/edit` | `type1-edit.html?id=<id>` |
| `/education/msa-guide` | `msa-guide.html` |
| `/css/...`, `/js/...`, `/images/...` | göreli: `css/...`, `js/...`, `images/...` |
| `/logout`, `/dashboard`, `/login` | `index.html` (modülde login yok) |

POST/fetch eşlemeleri: `POST /msa/:id/save-measurement` → `MSA.saveMeasurement(id, {...})`;
`POST /msa/:id/save-measurements` → `MSA.saveMeasurements(id, [...])`;
`POST /msa/:id/update-draft-settings` → `MSA.updateDraftSettings(id, {...})`.
Diğer POST rotaları (yeni çalışma, düzenleme, CAPA güncelle, plan CRUD, ekipman CRUD,
Tip 1 oluştur/güncelle, silmeler): rotadaki mantığı yükleyici sayfanın JS'ine
supabase-js ile birebir taşı (form `onsubmit` yakala, sonra orijinal redirect'in
statik karşılığına `location.href` ile git).

## Hazır API (js/msa-common.js — `window.MSA`)
- `MSA.db` — veri projesi supabase istemcisi (oturumsuz/anon); `MSA.T` tablo adları.
- `MSA.currentUser()` → `{id,email,name}` (ERP Portal oturumundan).
- `MSA.renderPage(templateFile, locals)`, `MSA.renderError(title,msg)`.
- `MSA.q(name,def)`, `MSA.requireQ(name)`, `MSA.parseJson(v,fallback)`, `MSA.nowIso()`.
- `MSA.normalizeStudyType`, `MSA.normalizeScheduleTypes`, `MSA.parseStoredScheduleTypes`,
  `MSA.normalizeDateInput`, `MSA.formatFutureDate`, `MSA.TYPE_LABELS`, `MSA.VALID_MSA_TYPES`.
- `MSA.createAutoScheduleDraft`, `MSA.upsertAutoSchedulesForEquipment`,
  `MSA.cancelAutoSchedulesForEquipment`, `MSA.equipmentScheduleOrFilter`.
- `MSA.generateCapaNumber`, `MSA.createAutoCapaIfNeeded`.
- `MSA.getMeasurementsWithNames(studyId)` → `{measurements(+operator_name/part_name), operators, parts}`.
- `MSA.saveMeasurement`, `MSA.saveMeasurements`, `MSA.updateDraftSettings`.
- `MSA.calculateStudy(studyId, {allowIncomplete})` → results şablonu locals'ı
  (`{user,study,results,controlCharts,measurements,analysisOptions,operators,parts,capa,branding}`)
  ya da `{redirect:{page,params}}`. Otomatik CAPA + otomatik plan dahil.
- `MSA.BRANDING` — `branding` locals'ı için sabit obje.

## Veritabanı (Supabase, ortak Kalite projesi)
Tablolar `supabase_msa_setup.sql`de tanımlı — kolon adları orijinal migrations ile
birebir aynı, şu farklarla:
- `equipment` → **`msa_equipment`**; `capa_actions` → **`msa_capa_actions`**;
  `type1_measurements` → **`msa_type1_measurements`**; `type1_results` → **`msa_type1_results`**.
- Kullanıcı kimliği e-postadır: `users` tablosu YOK. `user_id`/`created_by`/`planned_by`/
  `responsible_user_id` int kolonları yerine: `msa_studies.owner_email`,
  `msa_capa_actions.created_by_email`, `msa_capa_actions.responsible_email`,
  `msa_schedule.planned_by_email`, `msa_schedule.responsible_email`,
  `msa_equipment.created_by_email` (text). users JOIN'leri bu alanların doğrudan
  gösterimiyle değiştirilir.
- json kolonlarına OBJE yaz (JSON.stringify etme); okurken `MSA.parseJson` kullan
  (orijinal kod da savunmacı parse yapıyordu).

## Düşen özellikler (şablonlardan temizlenir, yapı bozulmaz)
- Login/register/şifre sıfırlama, `requireAuth` — erp-guard karşılıyor.
- Admin panel, study_permissions (paylaşım/yetki butonları, "İzin Yönetimi"),
  activity_logs, app_settings (branding = `MSA.BRANDING` sabiti).
- SMTP/e-posta hatırlatma, cron — plan hatırlatmaları sayfa içi rozet/uyarı olarak kalır
  (varsa şablondaki gösterim korunur, mail gönderimi yoktur).
- Navbar'daki kullanıcı adı gösterimi kalır (`user.name`/`user.email` locals'tan);
  logout linki `index.html`e gider.
- Dashboard'daki "paylaşılan çalışmalar" bölümü "diğer kullanıcıların çalışmaları"
  olur (owner_email != benimki); herkes her şeyi görebilir/düzenleyebilir.

## Excel (upload-template / şablon üretimi)
Sunucudaki SheetJS mantığı (template üretimi msaRoutes.js:2631-3090, import+validasyon
3091-3555) istemciye taşınır: CDN `https://cdn.jsdelivr.net/npm/xlsx@0.18.5/dist/xlsx.full.min.js`,
`XLSX.writeFile` ile indir, `XLSX.read` ile içe aktar. Validasyon mesajları birebir korunur.

## Test notu
Yerelde `python -m http.server` benzeri sunucuyla `http://localhost:PORT/...` açıldığında
guard bypass olur (`ERP_GUARD_ALLOW` localhost istisnası). Veri canlı Supabase'e gider.
