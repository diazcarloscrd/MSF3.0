import { DbProfileRow, Profile, TeamMember } from '../types/database';

export const LAST_USERNAME_STORAGE_KEY = 'msf_last_username';

export function normalizeUsername(raw: string): string {
  const clean = (raw || '')
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');

  if (clean.includes('@')) return clean;
  if (clean === 'carlos diaz') return 'carlos';
  return clean.replace(/\s+/g, '');
}

export function usernameToEmail(username: string): string {
  const clean = normalizeUsername(username);
  if (!clean) return '';
  if (clean.includes('@')) return clean;
  return `${clean}@msfc-user.invalid`;
}

export function mapDbProfileToTeamMember(row: DbProfileRow): TeamMember {
  const isAdm = row.role === 'admin';
  return {
    id: row.user_id,
    user_id: row.user_id,
    profile_id: row.user_id,
    display_name: row.full_name,
    username: row.username,
    role: isAdm ? 'ADMIN' : 'COLLECTOR',
    is_active: Boolean(row.is_active),
    created_at: row.created_at || '',
    updated_at: row.created_at || '',
  };
}

export function mapDbProfileToProfile(
  row: DbProfileRow,
  email: string | null = null
): Profile {
  const isAdm = row.role === 'admin';
  return {
    id: row.user_id,
    user_id: row.user_id,
    username: row.username,
    auth_user_id: row.user_id,
    email,
    full_name: row.full_name,
    role: isAdm ? 'ADMIN' : 'COLLECTOR',
    db_role: row.role,
    is_active: Boolean(row.is_active),
    created_at: row.created_at || '',
    updated_at: row.created_at || '',
  };
}

export function sortTeamMembers(
  members: TeamMember[],
  opts?: { adminsFirst?: boolean }
): TeamMember[] {
  const adminsFirst = opts?.adminsFirst ?? true;
  return [...members].sort((a, b) => {
    if (adminsFirst) {
      if (a.role === 'ADMIN' && b.role !== 'ADMIN') return -1;
      if (b.role === 'ADMIN' && a.role !== 'ADMIN') return 1;
    }
    return a.display_name.localeCompare(b.display_name, 'es');
  });
}

export function getLastUsername(): string {
  try {
    if (typeof window === 'undefined' || typeof window.localStorage === 'undefined') {
      return '';
    }
    return window.localStorage.getItem(LAST_USERNAME_STORAGE_KEY) || '';
  } catch {
    return '';
  }
}

export function setLastUsername(username: string): void {
  const clean = normalizeUsername(username);
  if (!clean) return;
  try {
    if (typeof window === 'undefined' || typeof window.localStorage === 'undefined') {
      return;
    }
    window.localStorage.setItem(LAST_USERNAME_STORAGE_KEY, clean);
  } catch {
    // Ignore storage errors (private mode / quota)
  }
}
