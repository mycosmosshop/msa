-- ============================================================================
-- MSA Modulu - Supabase Kurulum SQL'i (ortak Kalite projesi)
-- Kaynak: C:\Users\User\Desktop\Yazılım\MSA\migrations (knex) -> nihai sema
-- Kurallar:
--   * Tablo adlari: equipment -> msa_equipment, capa_actions -> msa_capa_actions,
--     type1_measurements -> msa_type1_measurements, type1_results -> msa_type1_results
--   * Kullanici sistemi YOK: users / study_permissions / activity_logs / app_settings
--     olusturulmaz (asagida drop edilir). user-id FK kolonlari yerine *_email text.
--   * id: bigint generated always as identity primary key
--   * Idempotent: create table if not exists / create index if not exists /
--     drop policy if exists + create policy / drop constraint if exists + add.
--   * RLS: her tabloda acik; anon + authenticated icin tam erisim (kardes ERP
--     modulleri deseni).
-- Not: msa_capa tablosu (migration 20251026000001) BILEREK dahil edilmedi —
--   kaynak kodda tek referansi msaRoutes.js:5109'daki salt-okunur "legacy"
--   fallback'tir (try/catch tablo-yok durumunu zaten tolere eder); hicbir rota
--   yazmaz, taze kurulumda sonsuza dek bos kalirdi.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 0) Kullanici-sistemi tablolari (users / study_permissions / activity_logs /
--    app_settings) HIC OLUSTURULMAZ — eski VPS PostgreSQL'ine aitlerdi ve bu
--    ortak projede hicbir zaman var olmadilar. Ortak projede baska modullerin
--    tablolarina dokunulmamasi icin DROP komutlari bilinçli olarak YOKTUR.
-- ---------------------------------------------------------------------------

-- ---------------------------------------------------------------------------
-- 1) msa_studies
--    (create 20251014000003 + analysis_options 20251014000007 + metadata
--     20251015000001 + is_acceptable text 20251017000001 + schedule alanlari
--     20251019000003 + copied_from_id 20251022000001 + reference_value/
--     tolerance 20251023000001; user_id -> owner_email)
--    schedule_id FK'si dongusel bagimlilik nedeniyle asagida ALTER ile eklenir.
-- ---------------------------------------------------------------------------
create table if not exists public.msa_studies (
  id                  bigint generated always as identity primary key,
  owner_email         text,                                   -- eski user_id (int FK) yerine
  study_name          varchar(255) not null,
  study_type          varchar(50) default 'type2',            -- type1 / type2 / type3
  description         text,

  -- calisma parametreleri
  num_operators       integer not null,
  num_parts           integer not null,
  num_trials          integer not null,

  -- analiz sonuclari (OBJE olarak yazilir, JSON.stringify edilmez)
  anova_results       jsonb,
  variance_components jsonb,
  gauge_evaluation    jsonb,
  analysis_options    jsonb,

  -- durum
  status              varchar(50) default 'draft',            -- draft, calculated, completed
  is_acceptable       text,                                   -- acceptable / marginal / unacceptable (20251017000001 ile boolean->text)

  -- plan takibi (20251019000003)
  is_from_schedule    boolean default false,
  schedule_id         bigint,                                 -- FK asagida (msa_schedule) - on delete set null

  -- kopya takibi (20251022000001)
  copied_from_id      bigint references public.msa_studies(id) on delete set null,

  -- metadata (20251015000001)
  gauge_name          varchar(255),
  gauge_number        varchar(100),
  location            varchar(255),
  study_date          date,
  part_name           varchar(255),
  characteristic      varchar(255),
  tolerance_spec      varchar(100),
  performed_by        varchar(255),

  -- Tip 1 alanlari (20251023000001)
  reference_value     numeric(15,6),
  tolerance           numeric(15,6),

  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);

create index if not exists idx_msa_studies_owner_email      on public.msa_studies (owner_email);      -- eski user_id indeksinin karsiligi
create index if not exists idx_msa_studies_status           on public.msa_studies (status);
create index if not exists idx_msa_studies_created_at       on public.msa_studies (created_at);
create index if not exists idx_msa_studies_is_from_schedule on public.msa_studies (is_from_schedule);
create index if not exists idx_msa_studies_schedule_id      on public.msa_studies (schedule_id);
create index if not exists idx_msa_studies_copied_from_id   on public.msa_studies (copied_from_id);

-- ---------------------------------------------------------------------------
-- 2) msa_measurements (20251014000004)
-- ---------------------------------------------------------------------------
create table if not exists public.msa_measurements (
  id          bigint generated always as identity primary key,
  study_id    bigint not null references public.msa_studies(id) on delete cascade,

  operator    varchar(100) not null,
  part        varchar(100) not null,
  trial       integer not null,
  measurement numeric(10,4) not null,

  measured_at timestamptz default now(),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),

  -- ayni calismada ayni operator+parca+tekrar bir kez (orijinal unique)
  constraint msa_measurements_study_operator_part_trial_key
    unique (study_id, operator, part, trial)
);

create index if not exists idx_msa_measurements_study_id      on public.msa_measurements (study_id);
create index if not exists idx_msa_measurements_study_op      on public.msa_measurements (study_id, operator);
create index if not exists idx_msa_measurements_study_part    on public.msa_measurements (study_id, part);
create index if not exists idx_msa_measurements_study_op_part on public.msa_measurements (study_id, operator, part);

-- ---------------------------------------------------------------------------
-- 3) msa_operators (20251014000005)
-- ---------------------------------------------------------------------------
create table if not exists public.msa_operators (
  id              bigint generated always as identity primary key,
  study_id        bigint not null references public.msa_studies(id) on delete cascade,

  operator_name   varchar(100) not null,
  operator_number integer not null,
  notes           text,

  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),

  constraint msa_operators_study_operator_number_key unique (study_id, operator_number)
);

create index if not exists idx_msa_operators_study_id on public.msa_operators (study_id);

-- ---------------------------------------------------------------------------
-- 4) msa_parts (20251014000006)
-- ---------------------------------------------------------------------------
create table if not exists public.msa_parts (
  id            bigint generated always as identity primary key,
  study_id      bigint not null references public.msa_studies(id) on delete cascade,

  part_name     varchar(100) not null,
  part_number   integer not null,
  nominal_value numeric(10,4),
  notes         text,

  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),

  constraint msa_parts_study_part_number_key unique (study_id, part_number)
);

create index if not exists idx_msa_parts_study_id on public.msa_parts (study_id);

-- ---------------------------------------------------------------------------
-- 5) msa_capa_actions (orijinal: capa_actions, 20251017000002
--    + tolerance_grr_value 20251019000002;
--    responsible_user_id -> responsible_email, created_by -> created_by_email)
-- ---------------------------------------------------------------------------
create table if not exists public.msa_capa_actions (
  id                     bigint generated always as identity primary key,
  study_id               bigint not null references public.msa_studies(id) on delete cascade,

  -- DOF bilgileri
  capa_number            varchar(50) not null unique,            -- CAPA-2025-001
  issue_type             varchar(100) not null,                  -- grr_unacceptable, ndc_low, bias_high, ...
  issue_description      text not null,
  grr_value              numeric(5,2),
  ndc_value              numeric(5,2),
  tolerance_grr_value    numeric(5,2),                           -- 20251019000002
  acceptance_criteria    varchar(50),                            -- unacceptable / marginal / acceptable

  -- kok neden analizi
  root_cause             text,
  root_cause_date        date,

  -- aksiyon plani
  corrective_action      text,
  preventive_action      text,

  -- sorumluluk ve tarihler
  responsible_email      text,                                   -- eski responsible_user_id (int FK) yerine
  responsible_name       varchar(255),                           -- manuel isim girisi (orijinalde de vardi)
  due_date               date,
  completed_date         date,

  -- durum takibi
  status                 varchar(50) default 'open',             -- open, in_progress, completed, closed, overdue
  status_notes           text,
  reminder_days          integer default 15,
  last_reminder_sent     timestamptz,

  -- etkinlik degerlendirmesi
  effectiveness_verified boolean default false,
  effectiveness_notes    text,
  verification_date      date,

  -- metadata
  created_by_email       text,                                   -- eski created_by (int FK) yerine
  created_at             timestamptz not null default now(),
  updated_at             timestamptz not null default now()
);

create index if not exists idx_msa_capa_actions_study_id          on public.msa_capa_actions (study_id);
create index if not exists idx_msa_capa_actions_status            on public.msa_capa_actions (status);
create index if not exists idx_msa_capa_actions_due_date          on public.msa_capa_actions (due_date);
create index if not exists idx_msa_capa_actions_responsible_email on public.msa_capa_actions (responsible_email); -- eski responsible_user_id indeksi
create index if not exists idx_msa_capa_actions_created_at        on public.msa_capa_actions (created_at);

-- ---------------------------------------------------------------------------
-- 6) msa_schedule (20251019000001 + reminder_time/reminder_days_before
--    20251020000005 + last_reminder_sent 20251020000006 + study_type
--    20251020000006; planned_by -> planned_by_email,
--    responsible_user_id -> responsible_email)
-- ---------------------------------------------------------------------------
create table if not exists public.msa_schedule (
  id                   bigint generated always as identity primary key,

  -- iliskili CAPA (DOF'ten kaynaklaniyorsa)
  capa_id              bigint references public.msa_capa_actions(id) on delete set null,
  -- iliskili onceki MSA calismasi
  previous_study_id    bigint references public.msa_studies(id) on delete set null,

  planned_by_email     text,                                     -- eski planned_by (int FK, cascade) yerine
  responsible_email    text,                                     -- eski responsible_user_id (int FK, set null) yerine

  -- plan detaylari
  title                varchar(500) not null,
  description          text,
  planned_date         date not null,
  reminder_date        date,
  reminder_time        time,                                     -- 20251020000005
  reminder_days_before integer default 7,                        -- 20251020000005
  last_reminder_sent   timestamptz,                              -- 20251020000006

  -- MSA detaylari (onceden doldurulabilir)
  gauge_name           varchar(255),
  gauge_number         varchar(100),
  part_name            varchar(255),
  characteristic       varchar(255),
  tolerance            varchar(100),
  location             varchar(255),

  -- durum (orijinalde enum idi)
  status               text default 'planned'
                       constraint msa_schedule_status_check
                       check (status in ('planned','reminded','in_progress','completed','cancelled')),

  -- tamamlaninca olusturulan study
  completed_study_id   bigint references public.msa_studies(id) on delete set null,

  study_type           varchar(50),                              -- 20251020000006 (hedef MSA tipi)
  notes                text,

  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now(),
  completed_at         timestamptz
);

create index if not exists idx_msa_schedule_capa_id           on public.msa_schedule (capa_id);
create index if not exists idx_msa_schedule_previous_study_id on public.msa_schedule (previous_study_id);
create index if not exists idx_msa_schedule_planned_by_email  on public.msa_schedule (planned_by_email);  -- eski planned_by indeksi
create index if not exists idx_msa_schedule_responsible_email on public.msa_schedule (responsible_email); -- eski responsible_user_id indeksi
create index if not exists idx_msa_schedule_planned_date      on public.msa_schedule (planned_date);
create index if not exists idx_msa_schedule_status            on public.msa_schedule (status);

-- msa_studies.schedule_id FK'si (dongusel bagimlilik: tablo simdi mevcut)
alter table public.msa_studies drop constraint if exists msa_studies_schedule_id_fkey;
alter table public.msa_studies
  add constraint msa_studies_schedule_id_fkey
  foreign key (schedule_id) references public.msa_schedule(id) on delete set null;

-- ---------------------------------------------------------------------------
-- 7) msa_equipment (orijinal: equipment, 20251020000001 + location
--    20251020000002 + created_by 20251020000003 -> created_by_email
--    + auto_schedule_interval 20251020000004 + auto_schedule_types
--    20251020000005 + auto_schedule_start_date 20251125000001)
-- ---------------------------------------------------------------------------
create table if not exists public.msa_equipment (
  id                       bigint generated always as identity primary key,
  name                     varchar(255) not null,                -- cihaz adi
  serial_number            varchar(100) not null,                -- seri no
  device_number            varchar(100) not null,                -- cihaz no
  location                 varchar(255),                         -- 20251020000002
  description              text,
  is_active                boolean default true,
  created_by_email         text,                                 -- eski created_by (int FK) yerine
  auto_schedule_interval   integer default 12,                   -- MSA planlama araligi (ay)
  auto_schedule_types      text,                                 -- JSON dizi metni: hangi MSA tipleri otomatik planlanir
  auto_schedule_start_date date,                                 -- kullanicinin sectigi ilk plan tarihi

  created_at               timestamptz not null default now(),
  updated_at               timestamptz not null default now(),

  constraint msa_equipment_serial_device_key unique (serial_number, device_number)
);

-- ---------------------------------------------------------------------------
-- 8) msa_type1_measurements (orijinal: type1_measurements, 20251023000001)
-- ---------------------------------------------------------------------------
create table if not exists public.msa_type1_measurements (
  id                 bigint generated always as identity primary key,
  study_id           bigint not null references public.msa_studies(id) on delete cascade,
  observation_number integer not null,                           -- 1, 2, 3, ..., n
  measurement_value  numeric(15,6) not null,
  created_at         timestamptz not null default now(),

  constraint msa_type1_measurements_study_observation_key unique (study_id, observation_number)
);

create index if not exists idx_msa_type1_measurements_study_id on public.msa_type1_measurements (study_id);

-- ---------------------------------------------------------------------------
-- 9) msa_type1_results (orijinal: type1_results, 20251023000001)
-- ---------------------------------------------------------------------------
create table if not exists public.msa_type1_results (
  id                              bigint generated always as identity primary key,
  study_id                        bigint not null unique references public.msa_studies(id) on delete cascade,

  -- temel istatistikler
  reference_value                 numeric(15,6) not null,
  mean                            numeric(15,6),
  bias                            numeric(15,6),
  std_dev                         numeric(15,6),
  instrument_variation            numeric(15,6),                 -- 6 * std_dev

  -- yeterlilik indeksleri
  cg                              numeric(15,6),
  cgk                             numeric(15,6),
  percent_var_repeatability       numeric(15,6),
  percent_var_repeatability_bias  numeric(15,6),

  -- tolerans sinirlari
  tolerance                       numeric(15,6),
  lower_bound                     numeric(15,6),
  upper_bound                     numeric(15,6),
  percent_bias                    numeric(15,6),                 -- (Bias / Tolerance) * 100

  -- bias icin t-testi
  degrees_of_freedom              integer,
  t_statistic                     numeric(15,6),
  p_value                         numeric(15,6),
  ci_lower                        numeric(15,6),                 -- %95 GA alt
  ci_upper                        numeric(15,6),                 -- %95 GA ust
  bias_significant                boolean,                       -- p < 0.001

  calculated_at                   timestamptz not null default now(),
  updated_at                      timestamptz not null default now()
);

create index if not exists idx_msa_type1_results_study_id on public.msa_type1_results (study_id);

-- ---------------------------------------------------------------------------
-- 10) RLS: her tabloda acik + anon/authenticated icin tam erisim
--     (kardes ERP modullerinin deseni; guvenlik erp-guard + anon key ile)
-- ---------------------------------------------------------------------------
alter table public.msa_studies            enable row level security;
alter table public.msa_measurements       enable row level security;
alter table public.msa_operators          enable row level security;
alter table public.msa_parts              enable row level security;
alter table public.msa_capa_actions       enable row level security;
alter table public.msa_schedule           enable row level security;
alter table public.msa_equipment          enable row level security;
alter table public.msa_type1_measurements enable row level security;
alter table public.msa_type1_results      enable row level security;

drop policy if exists "msa_studies_all"            on public.msa_studies;
create policy "msa_studies_all"            on public.msa_studies
  for all to anon, authenticated using (true) with check (true);

drop policy if exists "msa_measurements_all"       on public.msa_measurements;
create policy "msa_measurements_all"       on public.msa_measurements
  for all to anon, authenticated using (true) with check (true);

drop policy if exists "msa_operators_all"          on public.msa_operators;
create policy "msa_operators_all"          on public.msa_operators
  for all to anon, authenticated using (true) with check (true);

drop policy if exists "msa_parts_all"              on public.msa_parts;
create policy "msa_parts_all"              on public.msa_parts
  for all to anon, authenticated using (true) with check (true);

drop policy if exists "msa_capa_actions_all"       on public.msa_capa_actions;
create policy "msa_capa_actions_all"       on public.msa_capa_actions
  for all to anon, authenticated using (true) with check (true);

drop policy if exists "msa_schedule_all"           on public.msa_schedule;
create policy "msa_schedule_all"           on public.msa_schedule
  for all to anon, authenticated using (true) with check (true);

drop policy if exists "msa_equipment_all"          on public.msa_equipment;
create policy "msa_equipment_all"          on public.msa_equipment
  for all to anon, authenticated using (true) with check (true);

drop policy if exists "msa_type1_measurements_all" on public.msa_type1_measurements;
create policy "msa_type1_measurements_all" on public.msa_type1_measurements
  for all to anon, authenticated using (true) with check (true);

drop policy if exists "msa_type1_results_all"      on public.msa_type1_results;
create policy "msa_type1_results_all"      on public.msa_type1_results
  for all to anon, authenticated using (true) with check (true);

-- ============================================================================
-- SON. Notlar:
-- * updated_at otomatik guncellenmez (orijinal knex kurulumunda da uygulama
--   katmani yonetiyordu); istemci yazarken updated_at gondersin ya da moddan
--   bagimsiz birakilsin.
-- * msa_studies.study_type: 20251023000001'deki "yoksa type3 default'u ile
--   ekle" kosulu gercek DB'lerde hic calismadi (kolon 20251014000003'te
--   'type2' default'u ile zaten vardi) — nihai sekil: varchar(50) default
--   'type2'. Ayni nedenle o migration'daki study_type indeksi de olusmamisti;
--   burada da eklenmedi.
-- ============================================================================
