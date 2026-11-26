import React, { createContext, useContext, useEffect, useState, useCallback } from 'react';
import { supabase } from '../lib/supabase';
import { DbProfileRow, Profile, TeamMember } from '../types/database';
import {
  getLastUsername,
  mapDbProfileToProfile,
  mapDbProfileToTeamMember,
  normalizeUsername,
  setLastUsername,
  sortTeamMembers,
  usernameToEmail,
} from '../lib/authUtils';

interface AuthContextType {
  user: any | null;
  profile: Profile | null;
  currentMember: TeamMember | null;
  teamMembers: TeamMember[];
  allProfiles: TeamMember[];
  lastUsername: string;
  isAdmin: boolean;
  isAuthenticated: boolean;
  loading: boolean;
  showLoginModal: boolean;
  openLoginModal: () => void;
  closeLoginModal: () => void;
  signInWithCredentials: (username: string, pass: string) => Promise<{ error: any }>;
  signOut: () => Promise<void>;
  login: (username: string, pass: string) => Promise<{ error: any }>;
  logout: () => Promise<void>;
  simulateSelectMember: (memberId: string) => void;
  refreshTeamMembers: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType>({} as AuthContextType);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<any | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [teamMembers, setTeamMembers] = useState<TeamMember[]>([]);
  const [allProfiles, setAllProfiles] = useState<TeamMember[]>([]);
  const [currentMember, setCurrentMember] = useState<TeamMember | null>(null);
  const [lastUsername, setLastUsernameState] = useState<string>(() => getLastUsername());
  const [isAuthenticated, setIsAuthenticated] = useState<boolean>(false);
  const [isAdmin, setIsAdmin] = useState<boolean>(false);
  const [loading, setLoading] = useState<boolean>(true);
  const [showLoginModal, setShowLoginModal] = useState<boolean>(false);

  const clearLocalSessionState = useCallback(() => {
    try {
      localStorage.removeItem('msf_active_member_id');
      localStorage.removeItem('msf_is_authenticated');
      localStorage.removeItem('msf_is_admin_session');
    } catch {
      // Ignore storage errors
    }
    setUser(null);
    setProfile(null);
    setCurrentMember(null);
    setTeamMembers([]);
    setAllProfiles([]);
    setIsAuthenticated(false);
    setIsAdmin(false);
  }, []);

  const fetchAndApplyProfiles = useCallback(
    async (
      ownFallback?: DbProfileRow
    ): Promise<{ activeOnly: TeamMember[]; allMapped: TeamMember[] } | null> => {
      const { data: rows, error } = await supabase
        .from('profiles')
        .select('user_id, username, full_name, role, is_active, created_at');

      if (error || !rows) {
        if (ownFallback) {
          const mappedOwn = mapDbProfileToTeamMember(ownFallback);
          setAllProfiles([mappedOwn]);
          const activeFallback = mappedOwn.is_active ? [mappedOwn] : [];
          setTeamMembers(activeFallback);
          return { activeOnly: activeFallback, allMapped: [mappedOwn] };
        }
        return null;
      }

      if (rows.length === 0) {
        if (ownFallback) {
          const mappedOwn = mapDbProfileToTeamMember(ownFallback);
          setAllProfiles([mappedOwn]);
          const activeFallback = mappedOwn.is_active ? [mappedOwn] : [];
          setTeamMembers(activeFallback);
          return { activeOnly: activeFallback, allMapped: [mappedOwn] };
        }
        setAllProfiles([]);
        setTeamMembers([]);
        return { activeOnly: [], allMapped: [] };
      }

      const mappedAll = sortTeamMembers(
        (rows as DbProfileRow[]).map(mapDbProfileToTeamMember),
        { adminsFirst: true }
      );
      const activeOnly = mappedAll.filter((m) => m.is_active);
      setAllProfiles(mappedAll);
      setTeamMembers(activeOnly);
      return { activeOnly, allMapped: mappedAll };
    },
    []
  );

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
          .maybeSingle<DbProfileRow>();

        if (ownErr) {
          clearLocalSessionState();
          return { ok: false, error: 'No se pudo verificar el perfil de usuario.' };
        }

        if (!ownRow || !ownRow.is_active) {
          await supabase.auth.signOut().catch(() => {});
          clearLocalSessionState();
          return {
            ok: false,
            error: 'Esta cuenta no se encuentra habilitada. Consultá al administrador.',
          };
        }

        setLastUsername(ownRow.username);
        setLastUsernameState(normalizeUsername(ownRow.username));

        const profileResult = await fetchAndApplyProfiles(ownRow);
        const resolvedTeam =
          profileResult && profileResult.activeOnly.length > 0
            ? profileResult.activeOnly
            : [mapDbProfileToTeamMember(ownRow)];

        const isUserAdmin = ownRow.role === 'admin';
        const ownMember =
          resolvedTeam.find((m) => m.id === ownRow.user_id) ||
          mapDbProfileToTeamMember(ownRow);

        let activeMember = ownMember;
        if (isUserAdmin) {
          try {
            const savedImpersonatedId = localStorage.getItem('msf_active_member_id');
            const foundImpersonated = savedImpersonatedId
              ? resolvedTeam.find((m) => m.id === savedImpersonatedId)
              : null;
            if (foundImpersonated) {
              activeMember = foundImpersonated;
            }
          } catch {
            // Ignore storage errors
          }
        }

        setUser(session.user);
        setProfile(mapDbProfileToProfile(ownRow, session.user.email || null));
        setIsAdmin(isUserAdmin);
        setCurrentMember(activeMember);
        setIsAuthenticated(true);

        try {
          localStorage.setItem('msf_active_member_id', activeMember.id);
          localStorage.setItem('msf_is_authenticated', 'true');
          localStorage.setItem('msf_is_admin_session', isUserAdmin ? 'true' : 'false');
        } catch {
          // Ignore storage errors
        }

        return { ok: true };
      } catch (err: any) {
        clearLocalSessionState();
        return { ok: false, error: err?.message || 'Error al validar sesión' };
      }
    },
    [clearLocalSessionState, fetchAndApplyProfiles]
  );

  const refreshTeamMembers = useCallback(async () => {
    const result = await fetchAndApplyProfiles();
    if (!result) return;

    const { activeOnly, allMapped } = result;
    const signedInUserId = user?.id ?? profile?.id ?? null;

    if (signedInUserId) {
      const ownRow = allMapped.find((m) => m.id === signedInUserId);
      if (!ownRow || !ownRow.is_active) {
        await supabase.auth.signOut().catch(() => {});
        clearLocalSessionState();
        return;
      }
    }

    setCurrentMember((prev) => {
      if (!prev) return prev;
      const updated = activeOnly.find((m) => m.id === prev.id);
      if (updated) return updated;
      if (profile) {
        const ownActive = activeOnly.find((m) => m.id === profile.id);
        if (ownActive) return ownActive;
      }
      return prev;
    });
  }, [fetchAndApplyProfiles, clearLocalSessionState, user?.id, profile]);

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

    const { data: authListener } = supabase.auth.onAuthStateChange(
      async (event, session) => {
        if (!mounted) return;
        if (event === 'SIGNED_OUT' || !session?.user) {
          clearLocalSessionState();
        } else if (event === 'TOKEN_REFRESHED' && session.access_token) {
          supabase.realtime.setAuth(session.access_token);
          setUser(session.user);
        }
      }
    );

    return () => {
      mounted = false;
      authListener?.subscription?.unsubscribe();
    };
  }, [hydrateFromSession, clearLocalSessionState]);

  const signInWithCredentials = useCallback(
    async (username: string, pass: string) => {
      const normalized = normalizeUsername(username);
      const email = usernameToEmail(normalized);
      if (!email) {
        return { error: 'Ingresá tu nombre de usuario.' };
      }

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
    },
    [hydrateFromSession]
  );

  const signOut = useCallback(async () => {
    clearLocalSessionState();
    try {
      await supabase.auth.signOut();
    } catch {
      // Ignore network errors on signOut
    }
  }, [clearLocalSessionState]);

  const simulateSelectMember = useCallback(
    (memberId: string) => {
      if (!isAdmin) return;
      const mem = teamMembers.find((m) => m.id === memberId);
      if (mem) {
        setCurrentMember(mem);
        try {
          localStorage.setItem('msf_active_member_id', mem.id);
        } catch {
          // Ignore storage errors
        }
      }
    },
    [isAdmin, teamMembers]
  );

  return (
    <AuthContext.Provider
      value={{
        user,
        profile,
        currentMember,
        teamMembers,
        allProfiles,
        lastUsername,
        isAdmin,
        isAuthenticated,
        loading,
        showLoginModal,
        openLoginModal: () => setShowLoginModal(true),
        closeLoginModal: () => setShowLoginModal(false),
        signInWithCredentials,
        signOut,
        login: signInWithCredentials,
        logout: signOut,
        simulateSelectMember,
        refreshTeamMembers,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => useContext(AuthContext);
