# MSF Argentina – Control de Jornada & Captación F2F 3.0

**Producción (Vercel):** https://msf3.vercel.app/  
**Instructivo Integrado:** https://msf3.vercel.app/instructivo.html  
**Base de Datos & Realtime:** Supabase PostgreSQL 17 (`msfc` · `brvwhnyjemxqsnuwqwwt`, región `sa-east-1`)  
**Zona Horaria Operativa Oficial:** `America/Argentina/Buenos_Aires` (UTC-3)

---

## 1. Resumen Ejecutivo de la Auditoría Integral (Pre-Semana 46)

Se ejecutó una auditoría exhaustiva de punta a punta sobre **arquitectura frontend, diseño responsive multi-dispositivo, base de datos PostgreSQL, políticas RLS, triggers del servidor, sincronización Realtime y ciclo de medianoche (`00:00 hs`)**, realizando la comparativa directa contra el código y las migraciones de la aplicación anterior (`diazcarloscrd/MSFC`).

El sistema se encuentra **100% verificado, limpio de datos de prueba y listo para iniciar la Semana 46 (Lunes 09/11/2026 al Domingo 15/11/2026)**.

---

## 2. Comparativa con `MSFC` y Funcionamiento del Reinicio a las `00:00 hs`

Al inspeccionar el repositorio original `MSFC` y la base de datos compartida `brvwhnyjemxqsnuwqwwt`, se verificó y replicó con exactitud su arquitectura de separación por fecha operativa (`operational_date`):

1. **Fecha Operativa Autorizada por el Servidor (`public.get_operational_date()`):**
   - La fecha activa se determina directamente en PostgreSQL mediante `(statement_timestamp() AT TIME ZONE 'America/Argentina/Buenos_Aires')::date` (evitando errores si el reloj de un teléfono está desconfigurado).
2. **Persistencia Histórica Permanente (Sin Pérdida de Datos):**
   - Cada socio (`public.socios`), cada registro de horas individuales (`public.captor_daily_hours`) y la cantidad de captadores presentes (`public.daily_settings`) se almacenan asociados a su `operational_date` (`YYYY-MM-DD`).
   - La función `private.purge_expired_data()` se mantiene desactivada (`return 0`), garantizando que **ninguna jornada anterior se borre jamás**. Todas las jornadas previas (`94` socios históricos entre el `28/10/2026` y el `06/11/2026`) permanecen intactas y consultables desde **Socios & Calendario**.
3. **Limpieza y Apertura Automática de Nueva Jornada después de las `00:00 hs`:**
   - `WorkDayContext` monitorea el cambio de fecha operativa cada **20 segundos** y también de forma instantánea cuando el celular vuelve de segundo plano (`visibilitychange`, `focus`, `online`).
   - Al cruzar las `00:00:00 hs` de Argentina:
     - Los datos del día que acaba de terminar quedan resguardados automáticamente en PostgreSQL bajo la fecha anterior.
     - El panel principal (**Carga & Horas**, **Estadísticas** y **Cierre WhatsApp**) avanza automáticamente al nuevo día en curso con **0 socios cargados y 0 horas trabajadas** para todos los integrantes.
     - Además, al tocar la pestaña **Carga & Horas**, el sistema siempre regresa automáticamente a la fecha activa del día en curso para evitar que alguien intente cargar socios sobre una fecha histórica consultada previamente en el calendario.

---

## 3. Hallazgos Críticos Detectados y Corregidos en la Auditoría

Durante la auditoría técnica profunda se detectaron y resolvieron **6 puntos críticos** que habrían afectado la operación real en la Semana 46:

| # | Hallazgo Detectado | Solución Aplicada y Verificada |
|---|---|---|
| **1** | **UUIDs inválidos en `AuthContext` para Emilce y Rosario** (`'emilce-uuid'` y `'rosario-uuid'`): provocaban rechazo de tipo `uuid` en PostgreSQL al insertar socios. | Se vincularon los UUIDs reales de `auth.users` / `public.profiles` para los 8 integrantes activos y se hidratan dinámicamente desde `public.profiles`. |
| **2** | **Sesión local simulada y ocultamiento de errores de red/RLS:** si expiraba el token de Supabase, la app permitía entrar localmente y mostraba éxito sin guardar en la BD. | Se eliminó todo bypass local y toda contraseña del bundle cliente. Ahora el acceso exige un JWT válido de Supabase Auth + cuenta `is_active = true`, y toda escritura verifica confirmación real de PostgreSQL antes de mostrar éxito. |
| **3** | **Horas individuales guardadas solo en `localStorage`:** las horas cargadas en un celular no se veían en otros teléfonos ni en la computadora del administrador. | Se conectaron `WorkDayContext` y `WeeklyClosingSection` directamente a la tabla real `public.captor_daily_hours` de PostgreSQL con suscripción **Supabase Realtime**. |
| **4** | **Planilla Semanal guardada solo en `localStorage` y límite en Semana 52:** los cierres semanales no se compartían entre dispositivos y faltaba la Semana 53 de 2026. | Se creó `public.weekly_reports` en PostgreSQL con trigger de cálculo exacto (`final_points`, `points_per_hour`, `average_amount`), RLS, Realtime y soporte completo para las **53 semanas ISO de 2026** (iniciando en Semana 46). |
| **5** | **Selector de Captador del Administrador (`Carlos Diaz`) sobrescrito por trigger:** al elegir un captador en el Header para cargarle un socio, el trigger forzaba la autoría a Carlos. | Se actualizó `private.prepare_socio_record()` y la política `socios_insert_own`: los captadores siguen estrictamente bloqueados a su propio `auth.uid()` y fecha del día, mientras que el Administrador puede registrar/editar en nombre de cualquier captador activo manteniendo trazabilidad en `updated_by`. |
| **6** | **Cuenta `morena` figuraba con `is_active = true` en `public.profiles` y faltaba índice FK en `captor_daily_hours`:** | Se estableció `is_active = false` para `morena` en PostgreSQL (bloqueando login y el 100% de RLS sin alterar el historial antiguo) y se creó `captor_daily_hours_user_id_idx`. |

---

## 4. Arquitectura de Base de Datos y Seguridad RLS (`brvwhnyjemxqsnuwqwwt`)

### Tablas Productivas en `public` (todas con RLS activo y Realtime habilitado)

1. **`public.profiles`**
   - Directorio oficial vinculado 1:1 con `auth.users(id)`.
   - **8 cuentas activas (`is_active = true`):**
     - **Administrador:** `Carlos Diaz` (`carlos`)
     - **7 Captadores:** `Ariel` (`ariel`), `Lucia` (`lucia`), `Emilce` (`emilce`), `Selena` (`selena`), `Brenda` (`brenda`), `Rosario` (`rosario`), `Nicolas` (`nicolas`).
   - **Cuenta deshabilitada (`is_active = false`):** `Morena` (`morena`) — bloqueada en Auth y en todas las políticas RLS.

2. **`public.socios`**
   - Almacena edad (`1..99`, validado `16..99` en UI), aporte mensual (`> 0`), medio de pago (`credito`, `debito`, `cbu`, `prepaga`), puntaje recalculado en servidor por el trigger `private.prepare_socio_record()` (`1.00`, `0.70`, `0.60`, `0.40`), `operational_date` y autoría (`created_by`, `created_by_name`, `updated_by`).
   - **Permisos RLS:** Todos los integrantes activos ven el tablero compartido; cada captador solo puede insertar, editar o eliminar sus propios registros; el Administrador puede auditar, crear, corregir o eliminar cualquier registro.

3. **`public.captor_daily_hours`**
   - Clave primaria `(operational_date, user_id)`, rango `0..24` horas (admite decimales como `3.5` y `0` para francos rotativos).
   - **Permisos RLS:** Lectura para el equipo activo; escritura únicamente sobre las propias horas (`user_id = auth.uid()`) o por el Administrador.

4. **`public.daily_settings`**
   - Clave primaria `(operational_date)`. Guarda `captor_count` (cantidad de captadores presentes en el equipo para esa jornada; valor inicial inteligente: `7` de Lunes a Viernes, `2` los Sábados rotativos).

5. **`public.weekly_reports`**
   - Clave primaria `(year, week_number, user_id)`. Consolida la **Planilla Semanal Individual** desde la **Semana 46 (`2026-11-09` al `2026-11-15`)**.
   - El trigger `private.prepare_weekly_report()` recalcula automáticamente en servidor:
     - `final_points = points_earned - invalid_and_cancellations`
     - `points_per_hour = final_points / hours` (o `NULL` si `hours = 0`)
     - `average_amount = total_amount / final_partners` (o `NULL` si `final_partners = 0`)

> **Nota opcional de panel Supabase:** En Supabase Dashboard -> *Authentication -> Providers / Attack Protection*, puede activarse la opción **Leaked Password Protection** ([documentación oficial](https://supabase.com/docs/guides/auth/password-security#password-strength-and-leaked-password-protection)) como refuerzo adicional sobre contraseñas de Auth.

---

## 5. Resultados de Pruebas Multiusuario E2E y Limpieza Pre-Producción

Se ejecutaron dos suites completas de verificación antes de dejar el entorno listo para la Semana 46:

1. **Prueba E2E Real contra Supabase (`@supabase/supabase-js` + PostgreSQL):**
   - **Bloqueo anónimo (`anon`):** Rechazo del 100% en las 5 tablas sin sesión autenticada.
   - **Bloqueo de cuenta inactiva (`morena`):** Rechazo inmediato por `is_active = false` y bloqueo RLS total en lectura y escritura.
   - **Ciclo completo real con los 7 captadores (`ariel`, `lucia`, `emilce`, `selena`, `brenda`, `rosario`, `nicolas`):**
     - Inicio de sesión real con JWT, consulta de `get_operational_date()`, carga de horas individuales (`4h`, `3.5h`, `2h`, `0h`), alta de socios en los 4 medios de pago (`1.0`, `0.7`, `0.6`, `0.4` pts), edición de socio propio, prueba de anti-spoofing de fecha/autor y guardado de Planilla Semanal 46.
   - **Aislamiento RLS cruzado:** Verificado que ningún captador puede modificar ni borrar socios, horas ni planillas semanales de otro compañero.
   - **Rol Administrador (`Carlos Diaz`) y Cambio de Medianoche (`00:00 hs`):** Verificada la carga delegada mediante el selector de captador, edición/baja administrativa y el aislamiento exacto entre `2026-11-09` (jornada cerrada con datos preservados) y `2026-11-10` (nueva jornada limpia en `0`).
2. **Limpieza Total Verificada en Producción:**
   - `socios` desde `2026-11-07` en adelante: **`0` registros** (historial previo `2026-10-28` al `2026-11-06` intacto con **`94` socios**).
   - `captor_daily_hours` desde `2026-11-07` en adelante: **`0` registros** (historial del `2026-11-06` intacto con **`8` registros**).
   - `weekly_reports`: **`0` registros** (lista en blanco para estrenar el **Lunes 09/11/2026 – Semana 46**).

---

## 6. Comandos de Desarrollo y Verificación Local

```bash
# Instalar dependencias
npm install

# Ejecutar suite de tests unitarios (Vitest)
npx vitest run

# Compilar verificación estricta TypeScript + bundle de producción
npm run build

# Levantar entorno local de desarrollo
npm run dev
```
