# Guía de Despliegue en Vercel - MSF Control de Jornada 3.0

Esta aplicación está desarrollada con **React, TypeScript y Vite**, optimizada para publicarse de forma continua y gratuita en Vercel.

## 1. Configuración de Base de Datos (Supabase)

1. En tu proyecto de Supabase, ve a **SQL Editor**.
2. Copia y pega el contenido completo de [`supabase/migrations/20261106000000_initial_schema.sql`](file:///c:/Users/Carlos%20Diaz/Desktop/MSF3.0/supabase/migrations/20261106000000_initial_schema.sql).
3. Haz clic en **Run** para aplicar las tablas, triggers atómicos, procedimientos de cierre y políticas RLS.

## 2. Variables de Entorno

En el panel de Vercel (o en tu archivo `.env` local), configura las siguientes variables:

```env
VITE_SUPABASE_URL=https://<tu-project-id>.supabase.co
VITE_SUPABASE_ANON_KEY=<tu-supabase-anon-key>
```

## 3. Despliegue en Vercel

### Opción A: Desde el panel de Vercel (Recomendado)
1. Conecta tu cuenta de GitHub en [vercel.com](https://vercel.com).
2. Selecciona **Add New Project** e importa el repositorio: `https://github.com/diazcarloscrd/MSF3.0`.
3. Vercel detectará automáticamente que es un proyecto **Vite**:
   - **Framework Preset:** Vite
   - **Build Command:** `npm run build`
   - **Output Directory:** `dist`
4. Agrega las dos variables de entorno (`VITE_SUPABASE_URL` y `VITE_SUPABASE_ANON_KEY`).
5. Presiona **Deploy**.

### Opción B: Mediante Vercel CLI
```bash
npx vercel
```

## 4. Configuración del Cierre Automático a Medianoche (pg_cron)

En Supabase, activa la extensión `pg_cron` en **Database -> Extensions** y ejecuta el siguiente comando en el SQL Editor para automatizar el rollover exacto a las 00:00 (hora de Buenos Aires / 03:00 UTC):

```sql
SELECT cron.schedule(
    'msf_midnight_rollover',
    '0 3 * * *',
    $$ SELECT public.execute_midnight_rollover(); $$
);
```

