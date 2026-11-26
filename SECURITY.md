# Seguridad, RLS y Control de Acceso — MSF 3.0 (v3.1)

## 1. Autenticación, Sin Registro Público y Gestión de Equipo (`admin-team-manager`)

- **Sin registro público:** El alta libre de cuentas está deshabilitada. El acceso requiere una sesión válida de Supabase Auth (JWT) y un registro activo (`is_active = true`) en `public.profiles`.
- **Login sin exposición de roster:** `LoginPage.tsx` no expone botones ni listados hardcoded de nombres del equipo; solo recuerda localmente el último usuario normalizado (`msf_last_username`).
- **Edge Function `supabase/functions/admin-team-manager`:**
  - Endpoint `POST` protegido por `Authorization: Bearer <jwt>`.
  - Verifica en servidor contra `public.profiles` que el invocador tenga `is_active = true` y `role = 'admin'`.
  - **Acciones soportadas:**
    - `create_member`: valida `full_name` (2..120 caracteres), `username`, `password` (>= 8 caracteres) y `role` (`'admin' | 'captador'`); crea usuario en `auth.users` + fila en `public.profiles` (con rollback automático si falla el perfil) y registra `USER_ADMIN` en `audit_log`.
    - `update_member`: actualiza nombre, rol o estado `is_active`. Impide auto-desactivarse o auto-degradarse. Al desactivar aplica `ban_duration: "876000h"` en Supabase Auth (y `"none"` al reactivar), revocando sesiones nuevas/refresco, y registra `USER_ADMIN` en `audit_log`.
    - `reset_password`: exige `password >= 8` caracteres, actualiza la contraseña en Auth y registra `USER_ADMIN` en `audit_log`.

---

## 2. Row Level Security (RLS) y Privilegios de Tabla

- Todos los permisos por defecto y los privilegios del rol `anon` están **revocados** sobre todas las tablas y funciones en `public` y `private`.
- Solo el rol `authenticated` posee `GRANT` explícito bajo evaluación obligatoria de políticas RLS con `(select private.current_user_is_active())` y `(select private.current_user_is_admin())`:

| Tabla | `SELECT` | `INSERT` | `UPDATE` | `DELETE` |
|---|---|---|---|---|
| `public.profiles` | Usuario propio o integrante activo | Solo `service_role` / Edge Function | Solo `admin` | Revocado al cliente |
| `public.socios` | Integrantes activos | Propio (`created_by = auth.uid()`) o `admin` (para captador activo), `operational_date <= today` | Propio (`created_by = auth.uid()`) o `admin`, incluye cambio de `operational_date <= today` | Propio (`created_by = auth.uid()`) o `admin` |
| `public.captor_daily_hours` | Integrantes activos | Propias (`user_id = auth.uid()`) o `admin`, `operational_date <= today` | Propias (`user_id = auth.uid()`) o `admin` | Propias (`user_id = auth.uid()`) o `admin` |
| `public.daily_settings` | Integrantes activos | Integrantes activos (`<= today`) | Integrantes activos (`<= today`) | Revocado al cliente |
| `public.weekly_reports` | Integrantes activos | Propio (`user_id = auth.uid()`) o `admin` | Propio (`user_id = auth.uid()`) o `admin` | Solo `admin` |
| `public.daily_attendance` | Integrantes activos | Integrantes activos (`<= today`) | Integrantes activos (`<= today`) | Solo `admin` |
| `public.daily_closures` | Integrantes activos | Integrantes activos (`<= today`) | Integrantes activos (`<= today`) | Solo `admin` |
| `public.audit_log` | **Solo `admin`** | **Revocado al cliente** (solo triggers `SECURITY DEFINER` y `service_role`) | **Revocado al cliente** | **Revocado al cliente** |
| `private.bootstrap_state` | RLS activo sin políticas | Bloqueado al cliente | Bloqueado al cliente | Bloqueado al cliente |

---

## 3. Inmutabilidad e Integridad en Servidor

- **Puntuación y autoría inmutables (`private.prepare_socio_record()`):** El servidor ignora puntajes arbitrarios del cliente y recalcula `points` y `payment_method_name` desde `payment_method_id`. En `UPDATE`, preserva intactos `id`, `created_at`, `created_by`, `created_by_name` y `client_request_id`.
- **Bloqueo de fechas futuras (`errcode = '22023'`):** Los triggers de `socios`, `daily_settings`, `captor_daily_hours`, `daily_attendance` y `daily_closures` rechazan cualquier fecha posterior a `(statement_timestamp() AT TIME ZONE 'America/Argentina/Buenos_Aires')::date`.
- **Idempotencia offline:** `socios.client_request_id` (`uuid UNIQUE`) evita duplicados ante reintentos de red o sincronización de cola offline (`23505`).
- **Consistencia de asistencia:** `private.prepare_daily_attendance()` impide marcar `is_present = false` a cualquier integrante que tenga socios u `hours_worked > 0` en esa fecha.
- **Exportación CSV segura:** `escapeCsvCell()` neutraliza inyección de fórmulas (`=`, `+`, `-`, `@`, `\t`, `\r`) preservando números negativos legítimos.

---

## 4. Excepción Documentada de Auth — Leaked Password Protection (`tier_free`)

- La protección **Leaked Password Protection** de Supabase Auth (verificación contra HaveIBeenPwned) permanece **exceptuada / pospuesta** porque la organización de Supabase opera en el **Plan Free (`tier_free`)**, donde dicha funcionalidad requiere un plan pago (Pro o superior).
- **Mitigaciones activas:**
  1. No existe auto-registro público de usuarios.
  2. La Edge Function `admin-team-manager` exige contraseñas de al menos 8 caracteres al crear cuentas o restablecer claves.
  3. Toda desactivación de usuario aplica bloqueo inmediato en Auth (`ban_duration: "876000h"`) y en todas las políticas RLS (`is_active = false`).
