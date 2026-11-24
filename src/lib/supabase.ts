import { createClient } from '@supabase/supabase-js';

const rawUrl =
  typeof import.meta.env.VITE_SUPABASE_URL === 'string'
    ? import.meta.env.VITE_SUPABASE_URL.trim()
    : '';
const rawKey =
  typeof import.meta.env.VITE_SUPABASE_ANON_KEY === 'string'
    ? import.meta.env.VITE_SUPABASE_ANON_KEY.trim()
    : '';

const hasValidEnv = Boolean(
  rawUrl &&
    rawKey &&
    !rawUrl.includes('placeholder') &&
    !rawUrl.includes('your-project') &&
    !rawKey.includes('your-supabase-anon-key')
);

if (!hasValidEnv && import.meta.env.MODE !== 'test') {
  throw new Error(
    'Faltan variables de entorno requeridas: VITE_SUPABASE_URL y VITE_SUPABASE_ANON_KEY deben estar configuradas.'
  );
}

const SUPABASE_URL = hasValidEnv ? rawUrl : 'https://test-placeholder.supabase.co';
const SUPABASE_ANON_KEY = hasValidEnv ? rawKey : 'test-anon-key';

export const isSupabaseConfigured = hasValidEnv;

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
  },
  realtime: {
    params: {
      eventsPerSecond: 10,
    },
  },
});
