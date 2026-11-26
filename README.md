# MSF Argentina – Control de Jornada & Captación F2F 3.0 (v3.1)

**Producción (referencia):** https://msf3.vercel.app/ (`brvwhnyjemxqsnuwqwwt`, rama `main`)  
**Staging (entorno activo de actualización):** https://msf3-git-staging-diaz-carlos-crd.vercel.app (`msf3-staging` · `tfggfeaszonentggtnfy`, rama `staging`)  
**Instructivo Integrado:** `/instructivo.html`  
**Zona Horaria Operativa Oficial:** `America/Argentina/Buenos_Aires` (UTC-3)

---

## 1. Descripción General y Novedades v3.1

Sistema colaborativo en tiempo real para el registro de socios, control horario, estadísticas, cierre diario por WhatsApp, planilla semanal y administración de equipo F2F de Médicos Sin Fronteras Argentina.

### Capacidades clave incorporadas (Módulos A–G)
- **Layout móvil responsive & accesibilidad táctil (Módulo A):** Diseño sin desborde horizontal (`360px` / `390×844` / `1280×800`), navegación adaptable de 5 pestañas para captadores y 7 para administradores, skeletons de hidratación inicial, reset de scroll al cambiar de pestaña y controles de acción `>= 44×44 px` con separación `>= 8 px`.
- **Carga en fecha anterior y alerta de horas en 0 (Módulo B):** Selector `Hoy (DD/MM)` / `Ayer (DD/MM)` / `Otra fecha...` (`<= hoy` en hora Buenos Aires) con banner ámbar preventivo y carga rápida de horas si la fecha elegida figura en `0 h`.
- **Movimiento de fecha individual y en lote (Módulo B):** Botón `"Mover fecha"` por socio y `"Selección múltiple"` en `Carga & Horas` y `Socios & Calendario`, con `MoveDateModal`, validación de fecha pasada/hoy y aviso si el dueño tiene `0 h` en el destino.
- **Protección en campo / Cola offline (Módulo G):** Persistencia automática de borrador en `localStorage`, cola local de envíos fallidos por red con UUID v4 idempotente (`client_request_id`), banner de pendientes con botón `"Reintentar ahora"` y reenvío automático al evento `online`.
- **Cierre WhatsApp con asistencia y guardado oficial (Módulo C):** Selector `"¿Quiénes trabajaron hoy?"` persistido en `daily_attendance` (bloquea desmarcar a quien tenga socios u horas), botón de sincronización, observaciones de jornada, guardado oficial en `daily_closures`, detección de cierre desactualizado y filtro de `RENDIMIENTO INDIVIDUAL` sin bloques `N/D` de ausentes.
- **Filtros por equipo completo, Estadísticas por rango y CSV (Módulo D):** `Socios & Calendario` lista siempre a todos los integrantes activos con conteo del día (incluyendo `(0)`) y exportación CSV UTF-8 BOM compatible con Excel. `Estadísticas` permite filtrar por `Día actual`, `Semana`, `Mes`, `Rango personalizado` y captador individual usando la RPC `get_stats_by_range()`.
- **Planilla Semanal híbrida y selector de año (Módulo E):** Soporte multi-año (`2026`, `2027`...) y 53 semanas ISO, tabla `EQUIPO COMPLETO` con estado `En vivo` / `Confirmada` / `Desactualizada — recalcular`, fila de totales, texto WhatsApp y CSV.
- **Login limpio y vistas exclusivas de Administrador (Módulo F):** Login sin botones de nombres hardcoded (autocompleta `msf_last_username`), pestaña **Equipo** conectada a la Edge Function `admin-team-manager` y pestaña **Auditoría** con los últimos 100 eventos de `audit_log`.

---

## 2. Arquitectura de Datos, Seguridad y Edge Functions

- **Tablas en PostgreSQL (`public`):** `profiles`, `socios`, `captor_daily_hours`, `daily_settings`, `weekly_reports`, `daily_attendance`, `daily_closures` y `audit_log`.
- **RPCs públicas:** `get_operational_date()`, `get_available_operational_dates()` y `get_stats_by_range(p_start, p_end, p_user_id)` (evita el límite de 1000 filas de PostgREST).
- **Edge Function:** `supabase/functions/admin-team-manager` para crear cuentas, editar rol/estado (con bloqueo Auth `ban_duration`) y restablecer contraseñas, validando JWT y `role = 'admin'` en servidor.
- **Documentación detallada:** Ver [DATABASE.md](./DATABASE.md) y [SECURITY.md](./SECURITY.md).

> **Excepción documentada de Auth (`tier_free`):** La opción **Leaked Password Protection** de Supabase Auth queda exceptuada / pospuesta porque el proyecto opera en Plan Free (`tier_free`). Ver detalle y mitigaciones en [SECURITY.md](./SECURITY.md).

---

## 3. Comandos de Desarrollo, Lint y Pruebas

```bash
# Instalar dependencias de la app
npm install

# Desarrollo local
npm run dev

# Linter estático (oxlint)
npm run lint

# Tests unitarios (Vitest)
npx vitest run

# Verificación TypeScript y build de producción
npm run build

# Verificación de tipos y tests E2E Playwright (carpeta e2e/)
npm --prefix e2e run typecheck
npm --prefix e2e run test:smoke
npx --prefix e2e playwright test -c e2e/playwright.config.ts tiers/
```
