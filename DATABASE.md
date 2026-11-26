# Estructura de Base de Datos — MSF Control de Jornada 3.0 (v3.1)

Todas las tablas, funciones, triggers, RPCs y políticas RLS están definidas en PostgreSQL 17 (Supabase) y versionadas de forma aditiva en `supabase/migrations/`:

- `20261026205605_initial_collaborative_calculator_schema.sql`
- `20261026205715_index_user_foreign_keys.sql`
- `20261026210056_shared_day_admin_reset_and_cleanup.sql`
- `20261026210506_clear_current_day_use_invoker.sql`
- `20261026211325_revoke_excess_browser_table_privileges.sql`
- `20261026211336_revoke_browser_default_table_grants.sql`
- `20261026234908_preserve_daily_history.sql`
- `20261106121047_add_captor_daily_individual_hours.sql`
- `20261107153100_msf3_audit_hardening_and_weekly_reports.sql`
- `20261124224800_msf3_v31_moves_attendance_audit.sql`

- **Zona horaria operativa oficial:** `America/Argentina/Buenos_Aires` (UTC-3).
- **Entornos Supabase:** Staging `msf3-staging` (`tfggfeaszonentggtnfy`, `sa-east-1`) y Producción `msfc` (`brvwhnyjemxqsnuwqwwt`, `sa-east-1`).

---

## 1. Tablas en `public`

### 1. `public.profiles`
Directorio oficial vinculado 1:1 con `auth.users(id)`.
- `user_id` (`uuid` PK, FK `auth.users(id)`)
- `username` (`text` UNIQUE, normalizado en minúsculas sin acentos)
- `full_name` (`text` NOT NULL)
- `role` (`text` NOT NULL: `'admin'` | `'captador'`)
- `is_active` (`boolean` NOT NULL DEFAULT `true`)
- `created_at` (`timestamptz` NOT NULL)

### 2. `public.socios`
Registros de socios captados por fecha operativa (`operational_date`).
- `id` (`uuid` PK DEFAULT `gen_random_uuid()`)
- `operational_date` (`date` NOT NULL)
- `age` (`integer` NOT NULL, `CHECK (age BETWEEN 1 AND 99)`; UI valida `16..99`)
- `amount` (`numeric(12,2)` NOT NULL, `CHECK (amount > 0)`)
- `payment_method_id` (`text` NOT NULL: `'credito'` | `'debito'` | `'cbu'` | `'prepaga'`)
- `payment_method_name` (`text` NOT NULL, asignado en servidor por trigger)
- `points` (`numeric(4,2)` NOT NULL, asignado en servidor por trigger)
- `created_at` (`timestamptz` NOT NULL)
- `created_by` (`uuid` NOT NULL FK `public.profiles(user_id)`)
- `created_by_name` (`text` NOT NULL)
- `updated_at` (`timestamptz` NOT NULL)
- `updated_by` (`uuid` FK `public.profiles(user_id)`)
- `client_request_id` (`uuid` UNIQUE NULL — clave de idempotencia v3.1 para reintentos de cola offline)
- **Índices relevantes:** `socios_operational_date_created_by_idx (operational_date, created_by)` y constraint único `socios_client_request_id_key`.
- **Realtime:** habilitado en `supabase_realtime`.

### 3. `public.captor_daily_hours`
Horas trabajadas individuales por captador y jornada.
- `operational_date` (`date` NOT NULL)
- `user_id` (`uuid` NOT NULL FK `public.profiles(user_id)`)
- `hours_worked` (`numeric(4,2)` NOT NULL DEFAULT `0`, `CHECK (hours_worked BETWEEN 0 AND 24)`)
- `updated_at` (`timestamptz` NOT NULL)
- **Primary Key:** `(operational_date, user_id)`
- **Índice FK:** `captor_daily_hours_user_id_idx (user_id)`
- **Realtime:** habilitado en `supabase_realtime`.

### 4. `public.daily_settings`
Configuración compartida y observaciones de la jornada.
- `operational_date` (`date` PK)
- `hours_worked` (`numeric(4,2)` NULL)
- `captor_count` (`integer` NULL — cantidad de captadores presentes declarados)
- `notes` (`text` NULL — observaciones de jornada agregadas en v3.1)
- `updated_at` (`timestamptz` NOT NULL)
- `updated_by` (`uuid` NULL FK `public.profiles(user_id)`)
- **Realtime:** habilitado en `supabase_realtime`.

### 5. `public.weekly_reports`
Planilla Semanal consolidada por año ISO, semana ISO y captador.
- `year` (`integer` NOT NULL, `CHECK (year BETWEEN 2026 AND 2100)`)
- `week_number` (`integer` NOT NULL, `CHECK (week_number BETWEEN 1 AND 53)`)
- `user_id` (`uuid` NOT NULL FK `public.profiles(user_id)`)
- `member_name` (`text` NOT NULL)
- `points_earned` (`numeric(10,2)` NOT NULL)
- `invalid_and_cancellations` (`numeric(10,2)` NOT NULL DEFAULT `0`)
- `final_points` (`numeric(10,2)` NOT NULL, recalculado en servidor)
- `hours` (`numeric(6,2)` NOT NULL)
- `points_per_hour` (`numeric(10,2)` NULL, recalculado en servidor)
- `total_amount` (`numeric(14,2)` NOT NULL)
- `final_partners` (`integer` NOT NULL)
- `average_amount` (`numeric(14,2)` NULL, recalculado en servidor)
- `notes` (`text` NULL)
- `updated_at` (`timestamptz` NOT NULL)
- `updated_by` (`uuid` NULL FK `public.profiles(user_id)`)
- **Primary Key:** `(year, week_number, user_id)`
- **Realtime:** habilitado en `supabase_realtime`.

### 6. `public.daily_attendance` *(v3.1)*
Asistencia diaria explícita de integrantes activos para controlar qué bloques individuales se incluyen en el Cierre WhatsApp.
- `operational_date` (`date` NOT NULL)
- `user_id` (`uuid` NOT NULL FK `public.profiles(user_id)`)
- `is_present` (`boolean` NOT NULL DEFAULT `true`)
- `updated_at` (`timestamptz` NOT NULL DEFAULT `statement_timestamp()`)
- `updated_by` (`uuid` NULL FK `public.profiles(user_id)`)
- **Primary Key:** `(operational_date, user_id)`
- **Índices:** `daily_attendance_user_id_idx`, `daily_attendance_updated_by_idx`
- **Realtime:** habilitado en `supabase_realtime`.

### 7. `public.daily_closures` *(v3.1)*
Cierres oficiales persistidos por jornada con snapshot numérico, mensaje WhatsApp y lista de presentes.
- `operational_date` (`date` PK)
- `summary_data` (`jsonb` NOT NULL)
- `whatsapp_message` (`text` NOT NULL)
- `present_user_ids` (`uuid[]` NOT NULL DEFAULT `'{}'::uuid[]`)
- `notes` (`text` NULL)
- `status` (`text` NOT NULL DEFAULT `'CLOSED'`, `CHECK (status IN ('OPEN', 'CLOSED'))`)
- `closed_by` (`uuid` NOT NULL FK `public.profiles(user_id)`)
- `closed_at` (`timestamptz` NOT NULL DEFAULT `statement_timestamp()`)
- **Índice:** `daily_closures_closed_by_idx`
- **Realtime:** habilitado en `supabase_realtime`.

### 8. `public.audit_log` *(v3.1)*
Bitácora inmutable de auditoría para acciones sobre socios, horas, cierres y administración de usuarios.
- `id` (`uuid` PK DEFAULT `gen_random_uuid()`)
- `created_at` (`timestamptz` NOT NULL DEFAULT `statement_timestamp()`)
- `actor_id` (`uuid` NULL)
- `actor_name` (`text` NOT NULL)
- `entity_type` (`text` NOT NULL: `'socio'`, `'captor_daily_hours'`, `'daily_closure'`, `'profile'`)
- `entity_id` (`text` NOT NULL)
- `action` (`text` NOT NULL: `'INSERT'`, `'UPDATE'`, `'MOVE_DATE'`, `'DELETE'`, `'USER_ADMIN'`)
- `old_data` (`jsonb` NULL)
- `new_data` (`jsonb` NULL)
- `summary` (`text` NOT NULL)
- **Índices:** `audit_log_created_at_idx (created_at DESC)`, `audit_log_action_idx`, `audit_log_actor_id_idx`.

---

## 2. Esquema `private` y Triggers de Servidor

- `private.bootstrap_state`: tabla interna de arranque inicial con **RLS habilitado** y sin privilegios para clientes.
- `private.current_user_is_active()` / `private.current_user_is_admin()`: helpers `SECURITY DEFINER` con `search_path = ''`.
- `private.prepare_socio_record()` (`BEFORE INSERT OR UPDATE ON public.socios`):
  - Exige sesión autenticada activa (`is_active = true`).
  - Acepta cualquier `operational_date <= v_today` (Buenos Aires) en `INSERT` y `UPDATE`; rechaza fechas futuras con `errcode = '22023'` (`'No podés registrar ni mover socios a una fecha futura.'`).
  - En `UPDATE`, permite cambiar `operational_date` si el usuario es `admin` o si `old.created_by = auth.uid()`.
  - Mantiene inmutables `id`, `created_at`, `created_by`, `created_by_name` y `client_request_id`.
  - Recalcula en servidor `payment_method_name` y `points`.
- `private.prepare_daily_settings()` (`BEFORE INSERT OR UPDATE ON public.daily_settings`): valida `operational_date <= v_today` y fija `updated_at`/`updated_by`.
- `private.prepare_captor_daily_hours()` (`BEFORE INSERT OR UPDATE ON public.captor_daily_hours`): valida `operational_date <= v_today`, perfil activo y ownership (`user_id = auth.uid()` o `admin`).
- `private.prepare_weekly_report()` (`BEFORE INSERT OR UPDATE ON public.weekly_reports`): recalcula `final_points`, `points_per_hour` y `average_amount` en servidor.
- `private.prepare_daily_attendance()` (`BEFORE INSERT OR UPDATE ON public.daily_attendance`): rechaza `is_present = false` si el captador posee socios o `hours_worked > 0` en esa `operational_date`.
- `private.sync_attendance_on_activity()` (`AFTER INSERT OR UPDATE ON public.socios` / `public.captor_daily_hours`): reactiva `is_present = true` si existía fila previa en `false` al registrar actividad.
- `private.prepare_daily_closure()` (`BEFORE INSERT OR UPDATE ON public.daily_closures`): valida `operational_date <= v_today`, fija `closed_by` y `closed_at`.
- `private.audit_trigger_fn()` (`AFTER INSERT OR UPDATE OR DELETE` en `socios`, `captor_daily_hours`, `daily_closures`): registra cada cambio en `public.audit_log`, diferenciando `MOVE_DATE` cuando cambia `operational_date`.
- `private.purge_expired_data()`: función inerte (`return 0`) sin cron programado — el historial nunca se purga automáticamente.

---

## 3. RPCs Públicas

- `public.get_operational_date()` (`STABLE`, `authenticated`): devuelve la fecha actual oficial en `America/Argentina/Buenos_Aires`.
- `public.get_available_operational_dates()` (`SECURITY INVOKER`, `authenticated`): devuelve `date[]` ordenado descendente con todas las fechas que tienen actividad (`socios`, `captor_daily_hours`, `daily_settings` o `daily_closures`), evitando el tope de 1000 filas de PostgREST.
- `public.get_stats_by_range(p_start date, p_end date, p_user_id uuid default null)` (`SECURITY INVOKER`, `authenticated`): devuelve `jsonb` con `summary`, `by_member`, `by_date`, `hours` y `socios` para estadísticas por rango y exportación CSV sin truncamiento.
- `public.consume_initial_admin(...)`: restringida exclusivamente a `service_role`.

---

## 4. Reglas de Puntuación Oficiales

| `payment_method_id` | Nombre oficial (`payment_method_name`) | Puntos (`points`) |
|---|---|---|
| `credito` | Tarjeta de crédito | `1.00` |
| `debito` | Tarjeta de débito | `0.70` |
| `cbu` | CBU bancario | `0.60` |
| `prepaga` | Tarjeta prepaga / Billetera virtual | `0.40` |
