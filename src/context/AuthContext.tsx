import React, { createContext, useContext, useEffect, useState, useCallback } from 'react';
import { supabase } from '../lib/supabase';
import { Profile, TeamMember } from '../types/database';

export const OFFICIAL_TEAM_MEMBERS: TeamMember[] = [
  { id: '98a3255a-239c-4b08-b266-902dd12c2f66', display_name: 'Carlos Diaz', username: 'carlos', profile_id: '98a3255a-239c-4b08-b266-902dd12c2f66', role: 'ADMIN', is_active: true, created_at: '', updated_at: '' },
  { id: 'f04029fd-30d8-4212-a67a-f7a8bb9f3765', display_name: 'Ariel', username: 'ariel', profile_id: 'f04029fd-30d8-4212-a67a-f7a8bb9f3765', role: 'COLLECTOR', is_active: true, created_at: '', updated_at: '' },
  { id: '573553c9-4b0d-4cf7-bb83-efaec8536fef', display_name: 'Lucia', username: 'lucia', profile_id: '573553c9-4b0d-4cf7-bb83-efaec8536fef', role: 'COLLECTOR', is_active: true, created_at: '', updated_at: '' },
  { id: '48082c38-28fe-4e0a-bb1a-6149aa8ff9f5', display_name: 'Emilce', username: 'emilce', profile_id: '48082c38-28fe-4e0a-bb1a-6149aa8ff9f5', role: 'COLLECTOR', is_active: true, created_at: '', updated_at: '' },
  { id: '06af96dd-039e-49e0-972b-251300682fe9', display_name: 'Selena', username: 'selena', profile_id: '06af96dd-039e-49e0-972b-251300682fe9', role: 'COLLECTOR', is_active: true, created_at: '', updated_at: '' },
  { id: '68bff83d-b7a3-4a5e-a3ec-25fac405e2a3', display_name: 'Brenda', username: 'brenda', profile_id: '68bff83d-b7a3-4a5e-a3ec-25fac405e2a3', role: 'COLLECTOR', is_active: true, created_at: '', updated_at: '' },
  { id: 'beff4824-7d07-441a-8fa4-85b8ca26bda8', display_name: 'Rosario', username: 'rosario', profile_id: 'beff4824-7d07-441a-8fa4-85b8ca26bda8', role: 'COLLECTOR', is_active: true, created_at: '', updated_at: '' },
  { id: '6857cf6e-2dd3-4bca-9e20-35e55671928c', display_name: 'Nicolas', username: 'nicolas', profile_id: '6857cf6e-2dd3-4bca-9e20-35e55671928c', role: 'COLLECTOR', is_active: true, created_at: '', updated_at: '' },
];

interface AuthContextType {
  user: any | null;
  profile: Profile | null;
  currentMember: TeamMember | null;
  teamMembers: TeamMember[];
  isAdmin: boolean;
  isAuthenticated: boolean;
  loading: boolean;
  showLoginModal: boolean;
  openLoginModal: () => void;
  closeLoginModal: () => void;
  signInWithCredentials: (username: string, pass: string) => Promise<{ error: any }>;
  signOut: () => Promise<void>;
  simulateSelectMember: (memberId: string) => void;
}

const AuthContext = createContext<AuthContextType>({} as AuthContextType);

export function normalizeUsername(raw: string): string {
  const clean = raw
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
  if (clean.includes('@')) return clean;
  return `${clean}@msfc-user.invalid`;
}

function mapDbProfileToTeamMember(row: any): TeamMember {
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

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<any | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [teamMembers, setTeamMembers] = useState<TeamMember[]>(OFFICIAL_TEAM_MEMBERS);
  const [currentMember, setCurrentMember] = useState<TeamMember | null>(null);
  const [isAuthenticated, setIsAuthenticated] = useState<boolean>(false);
  const [isAdmin, setIsAdmin] = useState<boolean>(false);
  const [loading, setLoading] = useState<boolean>(true);
  const [showLoginModal, setShowLoginModal] = useState<boolean>(false);

  const clearLocalSessionState = useCallback(() => {
    localStorage.removeItem('msf_active_member_id');
    localStorage.removeItem('msf_is_authenticated');
    localStorage.removeItem('msf_is_admin_session');
    setUser(null);
    setProfile(null);
    setCurrentMember(null);
    setIsAuthenticated(false);
    setIsAdmin(false);
  }, []);

  const hydrateFromSession = useCallback(
    async (session: any): Promise<{ ok: boolean; error?: string }> => {
      if (!session?.user) {
        clearLocalSessionState();
        return { ok: false };
      }

      try {
        if (session.access_token) {
          supabase.realtime.setAuth(session.access_token);
        }

        const { data: ownRow, error: ownErr } = await supabase
          .from('profiles')
          .select('user_id, username, full_name, role, is_active, created_at')
          .eq('user_id', session.user.id)
          .maybeSingle();

        if (ownErr) {
          clearLocalSessionState();
          return { ok: false, error: 'No se pudo verificar el perfil de usuario.' };
        }

        if (!ownRow || !ownRow.is_active) {
          await supabase.auth.signOut().catch(() => {});
          clearLocalSessionState();
          return { ok: false, error: 'Esta cuenta no se encuentra habilitada. Consultá al administrador.' };
        }

        // Cargar lista actualizada de integrantes activos desde PostgreSQL
        const { data: activeRows } = await supabase
          .from('profiles')
          .select('user_id, username, full_name, role, is_active, created_at')
          .eq('is_active', true);

        let resolvedTeam = OFFICIAL_TEAM_MEMBERS;
        if (activeRows && activeRows.length > 0) {
          resolvedTeam = activeRows
            .filter((r: any) => r.username !== 'morena' && r.is_active)
            .map(mapDbProfileToTeamMember)
            .sort((a, b) => {
              if (a.role === 'ADMIN' && b.role !== 'ADMIN') return -1;
              if (b.role === 'ADMIN' && a.role !== 'ADMIN') return 1;
              return a.display_name.localeCompare(b.display_name, 'es');
            });
          setTeamMembers(resolvedTeam);
        }

        const isUserAdmin = ownRow.role === 'admin';
        const ownMember =
          resolvedTeam.find((m) => m.id === ownRow.user_id) || mapDbProfileToTeamMember(ownRow);

        let activeMember = ownMember;
        if (isUserAdmin) {
          const savedImpersonatedId = localStorage.getItem('msf_active_member_id');
          const foundImpersonated = savedImpersonatedId
            ? resolvedTeam.find((m) => m.id === savedImpersonatedId)
            : null;
          if (foundImpersonated) {
            activeMember = foundImpersonated;
          }
        }

        setUser(session.user);
        setProfile({
          id: ownRow.user_id,
          user_id: ownRow.user_id,
          username: ownRow.username,
          auth_user_id: ownRow.user_id,
          email: session.user.email || null,
          full_name: ownRow.full_name,
          role: isUserAdmin ? 'ADMIN' : 'COLLECTOR',
          is_active: true,
          created_at: ownRow.created_at || '',
          updated_at: ownRow.created_at || '',
        });
        setIsAdmin(isUserAdmin);
        setCurrentMember(activeMember);
        setIsAuthenticated(true);

        localStorage.setItem('msf_active_member_id', activeMember.id);
        localStorage.setItem('msf_is_authenticated', 'true');
        localStorage.setItem('msf_is_admin_session', isUserAdmin ? 'true' : 'false');

        return { ok: true };
      } catch (err: any) {
        clearLocalSessionState();
        return { ok: false, error: err?.message || 'Error al validar sesión' };
      }
    },
    [clearLocalSessionState]
  );

  useEffect(() => {
    let mounted = true;

    supabase.auth
      .getSession()
      .then(async ({ data: { session } }) => {
        if (!mounted) return;
        if (session?.user) {
          await hydrateFromSession(session);
        } else {
          clearLocalSessionState();
        }
        if (mounted) setLoading(false);
      })
      .catch(() => {
        if (mounted) {
          clearLocalSessionState();
          setLoading(false);
        }
      });

    const { data: authListener } = supabase.auth.onAuthStateChange(async (event, session) => {
      if (!mounted) return;
      if (event === 'SIGNED_OUT' || !session?.user) {
        clearLocalSessionState();
      } else if (event === 'TOKEN_REFRESHED' && session.access_token) {
        supabase.realtime.setAuth(session.access_token);
        setUser(session.user);
      }
    });

    return () => {
      mounted = false;
      authListener?.subscription?.unsubscribe();
    };
  }, [hydrateFromSession, clearLocalSessionState]);

  const signInWithCredentials = async (username: string, pass: string) => {
    const email = usernameToEmail(username);

    try {
      const res = await supabase.auth.signInWithPassword({ email, password: pass });
      if (res.error || !res.data?.session) {
        return { error: 'Usuario o contraseña incorrectos.' };
      }

      const hydrated = await hydrateFromSession(res.data.session);
      if (!hydrated.ok) {
        return { error: hydrated.error || 'No se pudo iniciar sesión.' };
      }

      setShowLoginModal(false);
      return { error: null };
    } catch (err: any) {
      return { error: err?.message || 'Error de conexión con el servidor.' };
    }
  };

  const signOut = async () => {
    clearLocalSessionState();
    try {
      await supabase.auth.signOut();
    } catch {}
  };

  const simulateSelectMember = (memberId: string) => {
    if (!isAdmin) return;
    const mem = teamMembers.find((m) => m.id === memberId);
    if (mem) {
      setCurrentMember(mem);
      localStorage.setItem('msf_active_member_id', mem.id);
    }
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        profile,
        currentMember,
        teamMembers,
        isAdmin,
        isAuthenticated,
        loading,
        showLoginModal,
        openLoginModal: () => setShowLoginModal(true),
        closeLoginModal: () => setShowLoginModal(false),
        signInWithCredentials,
        signOut,
        simulateSelectMember,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => useContext(AuthContext);
