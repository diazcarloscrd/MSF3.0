import {
  STAGING_ACCOUNTS,
  STAGING_SUPABASE_ANON_KEY,
  STAGING_SUPABASE_URL,
  assertStagingTarget,
  type StagingAccountKey,
} from './stagingEnv.ts';

interface AuthTokenResponse {
  access_token: string;
  user: { id: string; email?: string };
}

export type DbPaymentMethodId = 'credito' | 'debito' | 'cbu' | 'prepaga';
export type UiOrDbPaymentType =
  | DbPaymentMethodId
  | 'credit_card'
  | 'debit_card'
  | 'bank_cbu'
  | 'prepaid_wallet';

export interface DayStateSnapshot {
  operationalDate: string;
  dailySettings: Record<string, unknown> | null;
  captorHours: Array<Record<string, unknown>>;
  dailyAttendance: Array<Record<string, unknown>> | null;
  dailyAttendanceAvailable: boolean;
  dailyClosure: Record<string, unknown> | null;
  dailyClosuresAvailable: boolean;
}

export interface RestoreDayStateOptions {
  deleteSocioIds?: readonly string[];
  deleteSentinelRange?: { minAmount?: number; maxAmount?: number };
}

async function assertOk(res: Response, action: string): Promise<void> {
  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(
      `[stagingCleanup] ${action} failed: HTTP ${res.status} ${body}`
    );
  }
}

function normalizePaymentMethodId(
  paymentType: UiOrDbPaymentType
): DbPaymentMethodId {
  switch (paymentType) {
    case 'credit_card':
    case 'credito':
      return 'credito';
    case 'debit_card':
    case 'debito':
      return 'debito';
    case 'bank_cbu':
    case 'cbu':
      return 'cbu';
    case 'prepaid_wallet':
    case 'prepaga':
      return 'prepaga';
  }
}

export async function getJwtForAccount(
  email: string,
  password: string
): Promise<AuthTokenResponse> {
  assertStagingTarget();
  const res = await fetch(
    `${STAGING_SUPABASE_URL}/auth/v1/token?grant_type=password`,
    {
      method: 'POST',
      headers: {
        apikey: STAGING_SUPABASE_ANON_KEY,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ email, password }),
    }
  );
  await assertOk(res, `staging auth for ${email}`);
  return (await res.json()) as AuthTokenResponse;
}

export async function getAdminJwt(): Promise<string> {
  const { access_token } = await getJwtForAccount(
    STAGING_ACCOUNTS.carlos.email,
    STAGING_ACCOUNTS.carlos.password
  );
  return access_token;
}

async function restFetch(
  pathAndQuery: string,
  jwt: string,
  init: RequestInit = {}
): Promise<Response> {
  assertStagingTarget();
  return fetch(`${STAGING_SUPABASE_URL}/rest/v1/${pathAndQuery}`, {
    ...init,
    headers: {
      apikey: STAGING_SUPABASE_ANON_KEY,
      Authorization: `Bearer ${jwt}`,
      'Content-Type': 'application/json',
      ...(init.headers || {}),
    },
  });
}

export async function createTestSocioAsAccount(
  accountKey: StagingAccountKey,
  input: {
    operationalDate?: string;
    age: number;
    amount: number;
    paymentType: UiOrDbPaymentType;
    clientRequestId?: string;
    createdByUserId?: string;
  }
): Promise<Record<string, unknown>> {
  const account = STAGING_ACCOUNTS[accountKey];
  const { access_token } = await getJwtForAccount(
    account.email,
    account.password
  );
  const payload: Record<string, unknown> = {
    age: input.age,
    amount: input.amount,
    payment_method_id: normalizePaymentMethodId(input.paymentType),
  };
  if (input.operationalDate) {
    payload.operational_date = input.operationalDate;
  }
  if (input.clientRequestId) {
    payload.client_request_id = input.clientRequestId;
  }
  if (input.createdByUserId) {
    payload.created_by = input.createdByUserId;
  }

  const res = await restFetch('socios', access_token, {
    method: 'POST',
    headers: { Prefer: 'return=representation' },
    body: JSON.stringify(payload),
  });
  await assertOk(res, `createTestSocioAsAccount(${accountKey})`);
  const rows = (await res.json()) as Array<Record<string, unknown>>;
  if (!rows[0]) {
    throw new Error('[stagingCleanup] createTestSocioAsAccount returned empty row');
  }
  return rows[0];
}

export async function deleteTestSociosBySentinel(
  minAmount = 99000,
  maxAmount = 99999
): Promise<void> {
  const jwt = await getAdminJwt();
  const res = await restFetch(
    `socios?amount=gte.${minAmount}&amount=lte.${maxAmount}`,
    jwt,
    { method: 'DELETE' }
  );
  await assertOk(res, `deleteTestSociosBySentinel(${minAmount}..${maxAmount})`);
}

export async function deleteSocioById(id: string): Promise<void> {
  const jwt = await getAdminJwt();
  const res = await restFetch(`socios?id=eq.${encodeURIComponent(id)}`, jwt, {
    method: 'DELETE',
  });
  await assertOk(res, `deleteSocioById(${id})`);
}

export async function deleteSocioByClientRequestId(
  clientRequestId: string
): Promise<void> {
  const jwt = await getAdminJwt();
  const res = await restFetch(
    `socios?client_request_id=eq.${encodeURIComponent(clientRequestId)}`,
    jwt,
    { method: 'DELETE' }
  );
  await assertOk(res, `deleteSocioByClientRequestId(${clientRequestId})`);
}

export async function getSociosByClientRequestId(
  clientRequestId: string
): Promise<Array<Record<string, unknown>>> {
  const jwt = await getAdminJwt();
  const res = await restFetch(
    `socios?client_request_id=eq.${encodeURIComponent(clientRequestId)}&select=*`,
    jwt
  );
  await assertOk(res, `getSociosByClientRequestId(${clientRequestId})`);
  return (await res.json()) as Array<Record<string, unknown>>;
}

export async function deleteSociosNotInIds(
  operationalDate: string,
  keepIds: readonly string[]
): Promise<void> {
  const rows = await getSociosForDate(operationalDate);
  const keepSet = new Set(keepIds);
  for (const row of rows) {
    const id = String(row.id ?? '');
    if (id && !keepSet.has(id)) {
      await deleteSocioById(id);
    }
  }
}

export async function getSociosForDate(
  operationalDate: string
): Promise<Array<Record<string, unknown>>> {
  const jwt = await getAdminJwt();
  const res = await restFetch(
    `socios?operational_date=eq.${operationalDate}&select=*`,
    jwt
  );
  await assertOk(res, `getSociosForDate(${operationalDate})`);
  return (await res.json()) as Array<Record<string, unknown>>;
}

export async function getSociosForRange(
  startDate: string,
  endDate: string
): Promise<Array<Record<string, unknown>>> {
  const jwt = await getAdminJwt();
  const res = await restFetch(
    `socios?operational_date=gte.${startDate}&operational_date=lte.${endDate}&select=*`,
    jwt
  );
  await assertOk(res, `getSociosForRange(${startDate}..${endDate})`);
  return (await res.json()) as Array<Record<string, unknown>>;
}

export async function getProfiles(): Promise<
  Array<{
    user_id: string;
    username: string;
    full_name: string;
    role: string;
    is_active: boolean;
  }>
> {
  const jwt = await getAdminJwt();
  const res = await restFetch(
    'profiles?select=user_id,username,full_name,role,is_active&order=username',
    jwt
  );
  await assertOk(res, 'getProfiles');
  return (await res.json()) as Array<{
    user_id: string;
    username: string;
    full_name: string;
    role: string;
    is_active: boolean;
  }>;
}

export async function getAuditLogEntries(opts?: {
  entityId?: string;
  action?: string;
  actorName?: string;
  limit?: number;
}): Promise<Array<Record<string, unknown>>> {
  const jwt = await getAdminJwt();
  const params = new URLSearchParams({
    select: '*',
    order: 'created_at.desc',
    limit: String(opts?.limit ?? 100),
  });
  if (opts?.entityId) {
    params.set('entity_id', `eq.${opts.entityId}`);
  }
  if (opts?.action) {
    params.set('action', `eq.${opts.action}`);
  }
  if (opts?.actorName) {
    params.set('actor_name', `ilike.*${opts.actorName}*`);
  }
  const res = await restFetch(`audit_log?${params.toString()}`, jwt);
  if (res.status === 404) {
    return [];
  }
  await assertOk(res, 'getAuditLogEntries');
  return (await res.json()) as Array<Record<string, unknown>>;
}

export async function snapshotDayState(
  operationalDate: string
): Promise<DayStateSnapshot> {
  const jwt = await getAdminJwt();
  const [settingsRes, hoursRes, attRes, closureRes] = await Promise.all([
    restFetch(
      `daily_settings?operational_date=eq.${operationalDate}&select=*`,
      jwt
    ),
    restFetch(
      `captor_daily_hours?operational_date=eq.${operationalDate}&select=*`,
      jwt
    ),
    restFetch(
      `daily_attendance?operational_date=eq.${operationalDate}&select=*`,
      jwt
    ),
    restFetch(
      `daily_closures?operational_date=eq.${operationalDate}&select=*`,
      jwt
    ),
  ]);

  await assertOk(settingsRes, `snapshot daily_settings(${operationalDate})`);
  await assertOk(hoursRes, `snapshot captor_daily_hours(${operationalDate})`);

  if (!attRes.ok && attRes.status !== 404) {
    await assertOk(attRes, `snapshot daily_attendance(${operationalDate})`);
  }
  if (!closureRes.ok && closureRes.status !== 404) {
    await assertOk(closureRes, `snapshot daily_closures(${operationalDate})`);
  }

  const settingsRows = (await settingsRes.json()) as Array<
    Record<string, unknown>
  >;
  const hoursRows = (await hoursRes.json()) as Array<Record<string, unknown>>;
  const dailyAttendanceAvailable = attRes.ok;
  const attRows = dailyAttendanceAvailable
    ? ((await attRes.json()) as Array<Record<string, unknown>>)
    : null;
  const dailyClosuresAvailable = closureRes.ok;
  const closureRows = dailyClosuresAvailable
    ? ((await closureRes.json()) as Array<Record<string, unknown>>)
    : [];

  return {
    operationalDate,
    dailySettings: settingsRows[0] ?? null,
    captorHours: hoursRows,
    dailyAttendance: attRows,
    dailyAttendanceAvailable,
    dailyClosure: closureRows[0] ?? null,
    dailyClosuresAvailable,
  };
}

export async function restoreDayState(
  snapshot: DayStateSnapshot,
  opts?: RestoreDayStateOptions
): Promise<void> {
  const jwt = await getAdminJwt();
  const date = snapshot.operationalDate;

  // 1. Ensure test socios are deleted FIRST so prepare_daily_attendance does not throw 22023
  if (opts?.deleteSocioIds && opts.deleteSocioIds.length > 0) {
    for (const id of opts.deleteSocioIds) {
      await deleteSocioById(id);
    }
  }
  if (opts?.deleteSentinelRange) {
    await deleteTestSociosBySentinel(
      opts.deleteSentinelRange.minAmount ?? 99000,
      opts.deleteSentinelRange.maxAmount ?? 99999
    );
  }

  // 2. Restore captor_daily_hours (restore snapshot rows; delete newly inserted test rows)
  const currentHoursRes = await restFetch(
    `captor_daily_hours?operational_date=eq.${date}&select=user_id,operational_date,hours_worked`,
    jwt
  );
  await assertOk(currentHoursRes, `list captor_daily_hours(${date})`);
  const currentHours = (await currentHoursRes.json()) as Array<{
    user_id: string;
    operational_date: string;
    hours_worked: number;
  }>;
  const snapshotHourUserIds = new Set(
    snapshot.captorHours.map((r) => String(r.user_id))
  );
  for (const row of currentHours) {
    if (!snapshotHourUserIds.has(row.user_id)) {
      const delRes = await restFetch(
        `captor_daily_hours?operational_date=eq.${date}&user_id=eq.${encodeURIComponent(row.user_id)}`,
        jwt,
        { method: 'DELETE' }
      );
      await assertOk(
        delRes,
        `delete test captor_daily_hours(${date}, ${row.user_id})`
      );
    }
  }
  if (snapshot.captorHours.length > 0) {
    const upsertHoursRes = await restFetch('captor_daily_hours', jwt, {
      method: 'POST',
      headers: { Prefer: 'resolution=merge-duplicates' },
      body: JSON.stringify(
        snapshot.captorHours.map((r) => ({
          operational_date: r.operational_date,
          user_id: r.user_id,
          hours_worked: r.hours_worked,
        }))
      ),
    });
    await assertOk(upsertHoursRes, `restore captor_daily_hours(${date})`);
  }

  // 3. Restore daily_attendance (only if available; M2 revokes DELETE so newly added rows are PATCHed to is_present: false)
  if (snapshot.dailyAttendanceAvailable && snapshot.dailyAttendance !== null) {
    if (snapshot.dailyAttendance.length > 0) {
      const upsertAttRes = await restFetch('daily_attendance', jwt, {
        method: 'POST',
        headers: { Prefer: 'resolution=merge-duplicates' },
        body: JSON.stringify(
          snapshot.dailyAttendance.map((r) => ({
            operational_date: r.operational_date,
            user_id: r.user_id,
            is_present: r.is_present,
          }))
        ),
      });
      await assertOk(upsertAttRes, `upsert daily_attendance(${date})`);
    }
    const currentAttRes = await restFetch(
      `daily_attendance?operational_date=eq.${date}&select=user_id,is_present`,
      jwt
    );
    await assertOk(currentAttRes, `list daily_attendance(${date})`);
    const currentAtt = (await currentAttRes.json()) as Array<{
      user_id: string;
      is_present: boolean;
    }>;
    const snapshotAttUsers = new Set(
      snapshot.dailyAttendance.map((r) => String(r.user_id))
    );
    for (const row of currentAtt) {
      if (!snapshotAttUsers.has(row.user_id) && row.is_present !== false) {
        const patchAttRes = await restFetch(
          `daily_attendance?operational_date=eq.${date}&user_id=eq.${encodeURIComponent(row.user_id)}`,
          jwt,
          {
            method: 'PATCH',
            body: JSON.stringify({ is_present: false }),
          }
        );
        await assertOk(
          patchAttRes,
          `reset test daily_attendance(${date}, ${row.user_id})`
        );
      }
    }
  }

  // 4. Restore daily_settings
  if (snapshot.dailySettings === null) {
    const delSettingsRes = await restFetch(
      `daily_settings?operational_date=eq.${date}`,
      jwt,
      { method: 'DELETE' }
    );
    await assertOk(delSettingsRes, `delete daily_settings(${date})`);
  } else {
    const patchBody: Record<string, unknown> = {
      hours_worked: snapshot.dailySettings.hours_worked,
      captor_count: snapshot.dailySettings.captor_count,
    };
    if ('notes' in snapshot.dailySettings) {
      patchBody.notes = snapshot.dailySettings.notes ?? null;
    }
    const patchSettingsRes = await restFetch(
      `daily_settings?operational_date=eq.${date}`,
      jwt,
      {
        method: 'PATCH',
        body: JSON.stringify(patchBody),
      }
    );
    await assertOk(patchSettingsRes, `restore daily_settings(${date})`);
  }

  // 5. Restore daily_closures (only if available; try admin DELETE first, fall back to PATCH OPEN on 401/403)
  if (snapshot.dailyClosuresAvailable) {
    if (snapshot.dailyClosure !== null) {
      const upsertClosureRes = await restFetch('daily_closures', jwt, {
        method: 'POST',
        headers: { Prefer: 'resolution=merge-duplicates' },
        body: JSON.stringify({
          operational_date: snapshot.dailyClosure.operational_date,
          summary_data: snapshot.dailyClosure.summary_data,
          whatsapp_message: snapshot.dailyClosure.whatsapp_message,
          present_user_ids: snapshot.dailyClosure.present_user_ids ?? [],
          notes: snapshot.dailyClosure.notes ?? null,
          status: snapshot.dailyClosure.status ?? 'CLOSED',
        }),
      });
      await assertOk(upsertClosureRes, `restore daily_closures(${date})`);
    } else {
      const existingClosureRes = await restFetch(
        `daily_closures?operational_date=eq.${date}&select=operational_date`,
        jwt
      );
      await assertOk(existingClosureRes, `check daily_closures(${date})`);
      const existingRows = (await existingClosureRes.json()) as Array<{
        operational_date: string;
      }>;
      if (existingRows.length > 0) {
        const delClosureRes = await restFetch(
          `daily_closures?operational_date=eq.${date}`,
          jwt,
          { method: 'DELETE' }
        );
        if (delClosureRes.status === 401 || delClosureRes.status === 403) {
          const resetClosureRes = await restFetch(
            `daily_closures?operational_date=eq.${date}`,
            jwt,
            {
              method: 'PATCH',
              body: JSON.stringify({
                status: 'OPEN',
                notes: null,
                present_user_ids: [],
                whatsapp_message: '',
                summary_data: {},
              }),
            }
          );
          await assertOk(resetClosureRes, `reset daily_closures(${date})`);
        } else {
          await assertOk(delClosureRes, `delete daily_closures(${date})`);
        }
      }
    }
  }
}

export async function setCaptorHoursAdmin(
  userId: string,
  operationalDate: string,
  hoursWorked: number
): Promise<void> {
  const jwt = await getAdminJwt();
  const res = await restFetch('captor_daily_hours', jwt, {
    method: 'POST',
    headers: { Prefer: 'resolution=merge-duplicates' },
    body: JSON.stringify({
      user_id: userId,
      operational_date: operationalDate,
      hours_worked: hoursWorked,
    }),
  });
  await assertOk(
    res,
    `setCaptorHoursAdmin(${userId}, ${operationalDate}, ${hoursWorked})`
  );
}

export async function deactivateTestUsersByPrefix(
  prefixes: readonly string[] = ['e2e_test_', 'e2e_life_']
): Promise<void> {
  const jwt = await getAdminJwt();
  const profiles = await getProfiles();
  for (const p of profiles) {
    if (!p.is_active) continue;
    if (!prefixes.some((pref) => p.username.startsWith(pref))) continue;
    const res = await fetch(
      `${STAGING_SUPABASE_URL}/functions/v1/admin-team-manager`,
      {
        method: 'POST',
        headers: {
          apikey: STAGING_SUPABASE_ANON_KEY,
          Authorization: `Bearer ${jwt}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          action: 'update_member',
          user_id: p.user_id,
          is_active: false,
        }),
      }
    );
    await assertOk(res, `deactivateTestUsersByPrefix(${p.username})`);
  }
}

export async function snapshotWeeklyReports(
  year: number,
  weekNumber: number
): Promise<Array<Record<string, unknown>>> {
  const jwt = await getAdminJwt();
  const res = await restFetch(
    `weekly_reports?year=eq.${year}&week_number=eq.${weekNumber}&select=*`,
    jwt
  );
  await assertOk(res, `snapshotWeeklyReports(${year}, W${weekNumber})`);
  return (await res.json()) as Array<Record<string, unknown>>;
}

export async function deleteWeeklyReportsForWeek(
  year: number,
  weekNumber: number
): Promise<void> {
  const jwt = await getAdminJwt();
  const res = await restFetch(
    `weekly_reports?year=eq.${year}&week_number=eq.${weekNumber}`,
    jwt,
    { method: 'DELETE' }
  );
  await assertOk(res, `deleteWeeklyReportsForWeek(${year}, W${weekNumber})`);
}

export async function restoreWeeklyReports(
  year: number,
  weekNumber: number,
  rows: Array<Record<string, unknown>>
): Promise<void> {
  await deleteWeeklyReportsForWeek(year, weekNumber);
  if (rows.length === 0) return;
  const jwt = await getAdminJwt();
  const res = await restFetch('weekly_reports', jwt, {
    method: 'POST',
    headers: { Prefer: 'resolution=merge-duplicates' },
    body: JSON.stringify(
      rows.map((r) => ({
        year: r.year,
        week_number: r.week_number,
        user_id: r.user_id,
        member_name: r.member_name,
        points_earned: r.points_earned,
        invalid_and_cancellations: r.invalid_and_cancellations,
        hours: r.hours,
        total_amount: r.total_amount,
        final_partners: r.final_partners,
        notes: r.notes ?? null,
      }))
    ),
  });
  await assertOk(res, `restoreWeeklyReports(${year}, W${weekNumber})`);
}

export const deleteWeeklyClosure = deleteWeeklyReportsForWeek;
