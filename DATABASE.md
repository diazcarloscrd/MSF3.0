# Estructura de Base de Datos - MSF Control de Jornada 3.0

Todas las tablas están diseñadas con PostgreSQL y versionadas en `supabase/migrations/20261106000000_initial_schema.sql`.

## Tablas

### 1. `profiles`
Vínculo con `auth.users` de Supabase.
- `id` (UUID PK)
- `auth_user_id` (UUID FK auth.users)
- `email` (TEXT)
- `full_name` (TEXT)
- `role` (ENUM: 'ADMIN', 'COLLECTOR')
- `is_active` (BOOLEAN)
- `created_at`, `updated_at`

### 2. `team_members`
Listado oficial de integrantes activos precargados (Carlos Díaz + 7 captadores).
- `id` (UUID PK)
- `display_name` (TEXT UNIQUE)
- `profile_id` (UUID FK profiles)
- `role` (ENUM: 'ADMIN', 'COLLECTOR')
- `is_active` (BOOLEAN)
- `created_at`, `updated_at`

### 3. `work_days`
Jornada de captación por día calendario (zona horaria Buenos Aires).
- `id` (UUID PK)
- `work_date` (DATE UNIQUE)
- `status` (ENUM: 'OPEN', 'CLOSED')
- `declared_collectors_count` (INTEGER DEFAULT 0)
- `opened_at` (TIMESTAMPTZ)
- `closed_at` (TIMESTAMPTZ NULL)
- `auto_closed` (BOOLEAN DEFAULT false)
- `notes` (TEXT NULL)

### 4. `shift_assignments`
Horas individuales trabajadas por captador en cada jornada.
- `id` (UUID PK)
- `work_day_id` (UUID FK work_days)
- `team_member_id` (UUID FK team_members)
- `hours_worked` (NUMERIC(4,2) DEFAULT 0.00) — **ESTRICTAMENTE COMIENZA EN 0**
- `is_present` (BOOLEAN DEFAULT true)
- `declared_at` (TIMESTAMPTZ)
- UNIQUE(work_day_id, team_member_id)

### 5. `partners`
Socios dados de alta en cada jornada.
- `id` (UUID PK)
- `work_day_id` (UUID FK work_days)
- `team_member_id` (UUID FK team_members)
- `created_by` (UUID FK auth.users NULL)
- `sequence_number` (INTEGER) — Asignación atómica por trigger
- `payment_type` (ENUM: 'credit_card', 'debit_card', 'bank_cbu', 'prepaid_wallet')
- `points` (NUMERIC(4,2)) — Asignado por trigger de servidor
- `age` (INTEGER, check 16-120)
- `contribution_amount` (NUMERIC(12,2))
- `contribution_frequency` (TEXT DEFAULT 'monthly')
- `captured_at` (TIMESTAMPTZ)
- UNIQUE(work_day_id, sequence_number)

### 6. `payment_method_rules`
Puntuación oficial del sistema.
- `credit_card`: 1.00 pt
- `debit_card`: 0.70 pts
- `bank_cbu`: 0.60 pts
- `prepaid_wallet`: 0.40 pts

### 7. `daily_closures`
Resúmenes consolidados de cierre y mensaje generado de WhatsApp.
- `id` (UUID PK)
- `work_day_id` (UUID FK work_days UNIQUE)
- `work_date` (DATE)
- `summary_data` (JSONB)
- `whatsapp_message` (TEXT)
- `closed_by` (UUID FK auth.users NULL)
- `closed_at` (TIMESTAMPTZ)

### 8. `audit_log`
Bitácora de auditoría para cambios críticos (reaperturas de jornadas, correcciones).

