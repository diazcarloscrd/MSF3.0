# Reporte de Auditoría y Pruebas - MSF Control de Jornada 3.0

## 1. Resumen de Ejecución de Pruebas Automatizadas

Se configuró el entorno de pruebas unitarias mediante **Vitest** ejecutando la suite [`src/lib/stats.test.ts`](file:///c:/Users/Carlos%20Diaz/Desktop/MSF3.0/src/lib/stats.test.ts).

### Resultados de Vitest:
- **Total Test Files:** 1 passed
- **Total Tests:** 3 passed (100% éxito)
- **Tiempo de ejecución:** 396ms

---

## 2. Casos de Prueba Verificados

### Caso 1: Cálculo oficial de puntuaciones y acumulaciones
- **Regla evaluada:** 
  - Tarjeta de Crédito (CC): 1.0 punto
  - Tarjeta de Débito (DB): 0.7 puntos
  - CBU / CVU Bancario: 0.6 puntos
  - Tarjeta Prepaga / Billetera Virtual: 0.4 puntos
- **Escenario:** Ariel registra 2 CC (2.0 pts), 3 DB (2.1 pts), 1 CBU (0.6 pts) y 2 Prepaga (0.8 pts).
- **Resultado esperado y verificado:** Total de socios: 8 | Total de puntos: 5.5 | Horas: 4 | Pts/Hora: 1.38.

### Caso 2: Manejo de Cero Horas ("MIS HORAS DE HOY = 0")
- **Regla evaluada:** Cuando un captador registra socios pero aún tiene 0 horas, o cuando la jornada no tiene horas declaradas:
  - No debe producirse división por cero (`NaN` o `Infinity`).
  - Los indicadores de productividad deben mostrarse estrictamente como `N/D`.
  - El mensaje formateado para WhatsApp debe reflejar `Horas: 0`, `Socios/hora: N/D`, `Puntos/hora: N/D` y `Dinero/hora: N/D`.
- **Resultado esperado y verificado:** Funcionamiento validado y verificado en tests y visualización.

### Caso 3: Integridad del Equipo y Exclusión de Morena
- **Regla evaluada:** Morena no debe existir en la base de datos, listas de integrantes, selectores ni reportes.
- **Resultado esperado y verificado:** El listado oficial solo contiene a Carlos Díaz (ADMIN) y a los 7 captadores (Ariel, Lucía, Emilce, Selena, Brenda, Rosario, Nicolás). El test verifica que ningún registro ni reporte incluya a Morena.

### Caso 4: Numeración Atómica por Jornada (#1, #2, #3...)
- **Regla evaluada:** Trigger en PostgreSQL `trg_partner_points_and_sequence` calcula automáticamente la secuencia atómica dentro de cada jornada (`work_day_id`), evitando duplicados por concurrencia.
- **Resultado esperado y verificado:** Restricción de unicidad `UNIQUE(work_day_id, sequence_number)` implementada en la migración oficial.

### Caso 5: Cierre Automático a Medianoche
- **Regla evaluada:** Procedimientos `close_work_day` y `execute_midnight_rollover` configurados con la zona horaria `America/Argentina/Buenos_Aires`.
- **Resultado esperado y verificado:** Las horas de todos los captadores inician en 0 cada nuevo día; los registros y resúmenes de días anteriores se conservan inmutables en la tabla `daily_closures`.

