# MSF Argentina – Control de Jornada 3.0

Sistema integral para la administración, registro en tiempo real, contabilización de horas individuales, puntuación de socios por medio de captación y cierre automático diario de jornadas de recaudación de fondos de Médicos Sin Fronteras en Argentina.

## Características Principales

1. **Gestión de Horas Individuales ("Mis Horas de Hoy"):**
   - Todos los integrantes inician cada jornada estrictamente en **0 horas**.
   - No se aplican horas automáticas ni ficticias.
   - Cada captador ingresa manualmente sus horas (admite decimales: 0, 1, 2, 2.5, 3, 4, etc.).
   - Advertencia visible si un captador suma socios sin declarar horas.
   - Las horas de días anteriores nunca se arrastran.

2. **Formulario Rápido Mobile-First para Nuevos Socios:**
   - 3 únicos datos de entrada: Edad, Monto mensual ($ ARS) y Selección de medio de captación.
   - **4 botones grandes y siempre visibles:**
     - **Tarjeta de Crédito:** 1,0 punto
     - **Tarjeta de Débito:** 0,7 puntos
     - **CBU / CVU Bancario:** 0,6 puntos
     - **Tarjeta Prepaga / Billetera Virtual:** 0,4 puntos
   - Asignación atómica de número de socio por jornada (`sequence_number`).
   - Sin datos financieros sensibles ni formularios engorrosos.

3. **Cantidad Manual de Captadores Presentes:**
   - Campo editable por el Administrador (Carlos Díaz).
   - Base para los cálculos de promedios por captador.
   - Detección de inconsistencias entre captadores declarados y presentes con horas.

4. **Sincronización en Tiempo Real (Supabase Realtime):**
   - Actualización instantánea en todos los teléfonos y computadoras.
   - Indicador de estado de conexión online/offline.

5. **Cierre Automático a las 00:00 (Buenos Aires):**
   - Cierre programado diario que consolida estadísticas, guarda el resumen histórico y reinicia contadores a cero.
   - Sin duplicación de jornadas ni pérdida de datos históricos.

6. **Cierre de Jornada & WhatsApp:**
   - Generación de informe con formato exacto para compartir por WhatsApp con un solo clic.

7. **Historial Completo:**
   - Visualización de jornadas anteriores en modo solo lectura con opción de volver a la jornada actual.
   - Posibilidad exclusiva para el administrador de reabrir jornadas con bitácora de auditoría.

8. **Seguridad y RLS:**
   - Sin registro público.
   - Carlos Díaz precargado como ADMIN.
   - 7 Captadores precargados: Ariel, Lucía, Emilce, Selena, Brenda, Rosario, Nicolás.
   - **Morena excluida de forma total.**

## Puesta en Marcha

```bash
# Instalar dependencias
npm install

# Compilar proyecto
npm run build

# Modo desarrollo
npm run dev
```
