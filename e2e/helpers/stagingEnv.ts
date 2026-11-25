export interface StagingAccount {
  username: string;
  email: string;
  password: string;
  fullName: string;
  role: 'admin' | 'captador';
  isActive: boolean;
  userId: string;
}

export const PROD_FORBIDDEN_MARKERS = [
  'msf3.vercel.app',
  'brvwhnyjemxqsnuwqwwt',
  'giyaokbpdbafcyxtbilt',
] as const;

export const STAGING_PROJECT_REF = 'tfggfeaszonentggtnfy';

export const STAGING_SUPABASE_URL =
  process.env.E2E_SUPABASE_URL ||
  process.env.VITE_SUPABASE_URL ||
  'https://tfggfeaszonentggtnfy.supabase.co';

export const STAGING_SUPABASE_ANON_KEY =
  process.env.E2E_SUPABASE_ANON_KEY ||
  process.env.VITE_SUPABASE_ANON_KEY ||
  'sb_publishable_vRjKj7FqExpZgaHq-B-CzA_iTrSzZ1N';

export const VERCEL_PREVIEW_DEFAULT_URL =
  'https://msf3-git-staging-diaz-carlos-crd.vercel.app';

export function assertStagingTarget(baseURL?: string): void {
  const candidates = [baseURL ?? '', STAGING_SUPABASE_URL];
  for (const candidate of candidates) {
    const lower = candidate.toLowerCase();
    for (const marker of PROD_FORBIDDEN_MARKERS) {
      if (lower.includes(marker)) {
        throw new Error(
          `ABORTED: Forbidden production marker "${marker}" detected in E2E target "${candidate}".`
        );
      }
    }
  }
  if (!STAGING_SUPABASE_URL.includes(STAGING_PROJECT_REF)) {
    throw new Error(
      `ABORTED: E2E Supabase URL must target staging (${STAGING_PROJECT_REF}), got "${STAGING_SUPABASE_URL}".`
    );
  }
}

export const STAGING_ACCOUNTS = {
  carlos: {
    username: 'carlos',
    email: 'carlos@msfc-user.invalid',
    password: process.env.E2E_PASS_CARLOS || 'Msf3Stg!Car#94xKp2',
    fullName: 'Carlos Diaz',
    role: 'admin',
    isActive: true,
    userId: '6fc32ed9-5d0d-4cd5-ab04-10874deb92aa',
  },
  ariel: {
    username: 'ariel',
    email: 'ariel@msfc-user.invalid',
    password: process.env.E2E_PASS_ARIEL || 'Msf3Stg!Ari#71mQz8',
    fullName: 'Ariel',
    role: 'captador',
    isActive: true,
    userId: '06192b7e-1b72-4b15-807f-97c3eed76efc',
  },
  lucia: {
    username: 'lucia',
    email: 'lucia@msfc-user.invalid',
    password: process.env.E2E_PASS_LUCIA || 'Msf3Stg!Luc#53vWn4',
    fullName: 'Lucia',
    role: 'captador',
    isActive: true,
    userId: '2aefe164-46ca-47b1-8a06-1563f7c12545',
  },
  emilce: {
    username: 'emilce',
    email: 'emilce@msfc-user.invalid',
    password: process.env.E2E_PASS_EMILCE || 'Msf3Stg!Emi#86bRt5',
    fullName: 'Emilce',
    role: 'captador',
    isActive: true,
    userId: 'aa26d9c0-5a97-4c3d-96b9-0db9e39b3df4',
  },
  selena: {
    username: 'selena',
    email: 'selena@msfc-user.invalid',
    password: process.env.E2E_PASS_SELENA || 'Msf3Stg!Sel#29yHd7',
    fullName: 'Selena',
    role: 'captador',
    isActive: true,
    userId: '17b52f5e-f188-44d3-a6cf-1d612c96cc4d',
  },
  brenda: {
    username: 'brenda',
    email: 'brenda@msfc-user.invalid',
    password: process.env.E2E_PASS_BRENDA || 'Msf3Stg!Bre#64cJf3',
    fullName: 'Brenda',
    role: 'captador',
    isActive: true,
    userId: '7042e478-57c2-4180-aa2b-623cd9ad5ec0',
  },
  rosario: {
    username: 'rosario',
    email: 'rosario@msfc-user.invalid',
    password: process.env.E2E_PASS_ROSARIO || 'Msf3Stg!Ros#38gLp9',
    fullName: 'Rosario',
    role: 'captador',
    isActive: true,
    userId: 'd6c11aa8-4fe3-46f0-887d-35711198dd79',
  },
  nicolas: {
    username: 'nicolas',
    email: 'nicolas@msfc-user.invalid',
    password: process.env.E2E_PASS_NICOLAS || 'Msf3Stg!Nic#47wXm6',
    fullName: 'Nicolas',
    role: 'captador',
    isActive: true,
    userId: '5ce80786-ba2e-4793-a983-bd58438e0a6e',
  },
  morena: {
    username: 'morena',
    email: 'morena@msfc-user.invalid',
    password: process.env.E2E_PASS_MORENA || 'Msf3Stg!Mor#15zKv2',
    fullName: 'Morena',
    role: 'captador',
    isActive: false,
    userId: '84b0b787-36e7-4515-a60a-74c49933a61e',
  },
} as const satisfies Record<string, StagingAccount>;

export type StagingAccountKey = keyof typeof STAGING_ACCOUNTS;

export const ACTIVE_CAPTADOR_NAMES = [
  'Ariel',
  'Brenda',
  'Emilce',
  'Lucia',
  'Nicolas',
  'Rosario',
  'Selena',
] as const;

export const ALL_ACTIVE_MEMBER_NAMES = [
  'Ariel',
  'Brenda',
  'Carlos Diaz',
  'Emilce',
  'Lucia',
  'Nicolas',
  'Rosario',
  'Selena',
] as const;

export const SEEDED_CROSS_OWNER_SOCIO_ID = 'c7351320-e947-4aec-8e50-f0a5ab02e0bb';

const BA_TZ = 'America/Argentina/Buenos_Aires';

export function formatDateBA(date: Date): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: BA_TZ,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(date);
}

export function todayStr(): string {
  return formatDateBA(new Date());
}

export function daysAgoStr(days: number): string {
  const [y, m, d] = todayStr().split('-').map(Number);
  const utcMidday = new Date(Date.UTC(y, m - 1, d, 15, 0, 0));
  utcMidday.setUTCDate(utcMidday.getUTCDate() - days);
  return formatDateBA(utcMidday);
}

export function yesterdayStr(): string {
  return daysAgoStr(1);
}

export function tomorrowStr(): string {
  return daysAgoStr(-1);
}

export function monthStartBA(): string {
  return `${todayStr().slice(0, 7)}-01`;
}

export function formatShortDM(yyyyMmDd: string): string {
  const [, mm, dd] = yyyyMmDd.split('-');
  return `${dd}/${mm}`;
}

export function formatDateDMY(yyyyMmDd: string): string {
  const [yyyy, mm, dd] = yyyyMmDd.split('-');
  return `${dd}/${mm}/${yyyy}`;
}

export function isMondayBA(yyyyMmDd?: string): boolean {
  const [y, m, d] = (yyyyMmDd ?? todayStr()).split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d)).getUTCDay() === 1;
}

export function getISOWeekAndYearBA(yyyyMmDd?: string): {
  year: number;
  week: number;
} {
  const baStr = yyyyMmDd ?? todayStr();
  const [y, m, d] = baStr.split('-').map(Number);
  const target = new Date(Date.UTC(y, m - 1, d));
  const dayNr = (target.getUTCDay() + 6) % 7;
  target.setUTCDate(target.getUTCDate() - dayNr + 3);
  const isoYear = target.getUTCFullYear();
  const firstThursday = new Date(Date.UTC(isoYear, 0, 4));
  const firstDayNr = (firstThursday.getUTCDay() + 6) % 7;
  firstThursday.setUTCDate(firstThursday.getUTCDate() - firstDayNr + 3);
  const week =
    1 + Math.round((target.getTime() - firstThursday.getTime()) / 604_800_000);
  return { year: isoYear, week };
}

export function getISOWeekRange(
  year: number,
  week: number
): { start: string; end: string } {
  const jan4 = new Date(Date.UTC(year, 0, 4));
  const dayOfWeek = (jan4.getUTCDay() + 6) % 7;
  const mondayFirstWeek = new Date(jan4);
  mondayFirstWeek.setUTCDate(jan4.getUTCDate() - dayOfWeek);

  const startD = new Date(mondayFirstWeek);
  startD.setUTCDate(mondayFirstWeek.getUTCDate() + (week - 1) * 7);

  const endD = new Date(startD);
  endD.setUTCDate(startD.getUTCDate() + 6);

  const pad = (n: number) => n.toString().padStart(2, '0');
  const fmt = (dt: Date) =>
    `${dt.getUTCFullYear()}-${pad(dt.getUTCMonth() + 1)}-${pad(dt.getUTCDate())}`;

  return { start: fmt(startD), end: fmt(endD) };
}

export function makeTestTag(caseId: string): string {
  const suffix = Math.random().toString(36).slice(2, 7).toUpperCase();
  return `E2E_TEST_${caseId}_${suffix}`;
}

export const SEEDED_HISTORY = {
  day2026_11_24: {
    date: '2026-11-24',
    sociosCount: 6,
    hoursWorked: 20.5,
    captorCount: 5,
    crossOwnerSocioId: SEEDED_CROSS_OWNER_SOCIO_ID,
  },
  day2026_11_23: {
    date: '2026-11-23',
    sociosCount: 6,
    hoursWorked: 24,
    captorCount: 6,
  },
  day2026_11_17: {
    date: '2026-11-17',
    sociosCount: 5,
    hoursWorked: 21,
    captorCount: 5,
  },
  day2026_11_16: {
    date: '2026-11-16',
    sociosCount: 5,
    hoursWorked: 18,
    captorCount: 5,
  },
  activeProfilesCount: 8,
  inactiveProfilesCount: 1,
  totalSeededSocios: 22,
  crossOwnerSocioId: SEEDED_CROSS_OWNER_SOCIO_ID,
} as const;
