# Seguridad y Políticas RLS - MSF 3.0

## Políticas Implementadas

1. **Sin Registro Público:**
   - La creación de perfiles está restringida al administrador.
   - Solo los usuarios precargados y aprobados pueden tener acceso.

2. **Row Level Security (RLS) en PostgreSQL:**
   - `profiles`: Los usuarios autenticados pueden leer. Solo ADMIN puede actualizar roles o perfiles.
   - `team_members`: Visible para todos los autenticados. Modificación exclusiva de ADMIN.
   - `work_days`: Lectura general. Apertura/Cierre y edición de captadores declarados exclusiva de ADMIN.
   - `shift_assignments`: Lectura general para el cálculo de estadísticas de equipo. **Cada captador solo puede insertar o modificar su propio registro de horas.** El ADMIN puede corregir las horas de cualquiera.
   - `partners`: Lectura para todo el equipo en tiempo real. **Cada captador solo puede insertar socios asociados a su propio identificador y solo puede editar/eliminar sus propios socios.** El ADMIN puede editar o eliminar cualquier socio.
   - `daily_closures`: Lectura de históricos para todo el equipo. Creación/actualización restringida a ADMIN o triggers de sistema.
   - `audit_log`: Inserción para auditoría de acciones; lectura exclusiva de ADMIN.

3. **Inmutabilidad de Puntuación:**
   - El frontend nunca envía el puntaje arbitrario en la creación de socios.
   - El trigger `trg_partner_points_and_sequence` en PostgreSQL calcula los puntos en base a la regla oficial de la tabla `payment_method_rules`.

