// @vitest-environment jsdom
import { describe, it, expect, beforeEach } from 'vitest';
import {
  LAST_USERNAME_STORAGE_KEY,
  getLastUsername,
  mapDbProfileToProfile,
  mapDbProfileToTeamMember,
  normalizeUsername,
  setLastUsername,
  sortTeamMembers,
  usernameToEmail,
} from './authUtils';
import { DbProfileRow } from '../types/database';

describe('authUtils - Normalización, mapeo de perfiles, orden y msf_last_username', () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  it('normaliza tildes, espacios y correos correctamente', () => {
    expect(normalizeUsername('  Lucía ')).toBe('lucia');
    expect(normalizeUsername('Nicolás')).toBe('nicolas');
    expect(normalizeUsername('Carlos Díaz')).toBe('carlos');
    expect(normalizeUsername('Juan  Pablo')).toBe('juanpablo');
    expect(normalizeUsername('ariel@msfc-user.invalid')).toBe('ariel@msfc-user.invalid');

    expect(usernameToEmail('Emilce')).toBe('emilce@msfc-user.invalid');
    expect(usernameToEmail('Rosario')).toBe('rosario@msfc-user.invalid');
    expect(usernameToEmail('custom@example.com')).toBe('custom@example.com');
    expect(usernameToEmail('   ')).toBe('');
  });

  it('mapea DbProfileRow a TeamMember y Profile', () => {
    const row: DbProfileRow = {
      user_id: 'u-1',
      username: 'carlos',
      full_name: 'Carlos Diaz',
      role: 'admin',
      is_active: true,
      created_at: '2026-11-01T00:00:00Z',
    };

    const member = mapDbProfileToTeamMember(row);
    expect(member.id).toBe('u-1');
    expect(member.display_name).toBe('Carlos Diaz');
    expect(member.role).toBe('ADMIN');
    expect(member.is_active).toBe(true);

    const profile = mapDbProfileToProfile(row, 'carlos@msfc-user.invalid');
    expect(profile.role).toBe('ADMIN');
    expect(profile.db_role).toBe('admin');
    expect(profile.email).toBe('carlos@msfc-user.invalid');
  });

  it('ordena integrantes con adminsFirst=true o alfabético puro con adminsFirst=false', () => {
    const members = [
      mapDbProfileToTeamMember({ user_id: '1', username: 'rosario', full_name: 'Rosario', role: 'captador', is_active: true, created_at: '' }),
      mapDbProfileToTeamMember({ user_id: '2', username: 'carlos', full_name: 'Carlos Diaz', role: 'admin', is_active: true, created_at: '' }),
      mapDbProfileToTeamMember({ user_id: '3', username: 'ariel', full_name: 'Ariel', role: 'captador', is_active: true, created_at: '' }),
    ];

    const defaultSort = sortTeamMembers(members);
    expect(defaultSort.map((m) => m.display_name)).toEqual(['Carlos Diaz', 'Ariel', 'Rosario']);

    const pureAlpha = sortTeamMembers(members, { adminsFirst: false });
    expect(pureAlpha.map((m) => m.display_name)).toEqual(['Ariel', 'Carlos Diaz', 'Rosario']);
  });

  it('persiste y recupera msf_last_username en localStorage', () => {
    expect(getLastUsername()).toBe('');

    setLastUsername('  Lucía ');
    expect(window.localStorage.getItem(LAST_USERNAME_STORAGE_KEY)).toBe('lucia');
    expect(getLastUsername()).toBe('lucia');

    setLastUsername('   ');
    expect(getLastUsername()).toBe('lucia');
  });
});
