import React, { createContext, useContext, useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { Profile, TeamMember } from '../types/database';

export const OFFICIAL_TEAM_MEMBERS: TeamMember[] = [
  { id: '98a3255a-239c-4b08-b266-902dd12c2f66', display_name: 'Carlos Diaz', username: 'carlos', default_pass: 'carlosmsflatam', profile_id: null, role: 'ADMIN', is_active: true, created_at: '', updated_at: '' },
  { id: 'f04029fd-30d8-4212-a67a-f7a8bb9f3765', display_name: 'Ariel', username: 'ariel', default_pass: 'arielmsflatam', profile_id: null, role: 'COLLECTOR', is_active: true, created_at: '', updated_at: '' },
  { id: 'lucia-uuid', display_name: 'Lucia', username: 'lucia', default_pass: 'luciamsflatam', profile_id: null, role: 'COLLECTOR', is_active: true, created_at: '', updated_at: '' },
  { id: 'emilce-uuid', display_name: 'Emilce', username: 'emilce', default_pass: 'emilcemsflatam', profile_id: null, role: 'COLLECTOR', is_active: true, created_at: '', updated_at: '' },
  { id: 'selena-uuid', display_name: 'Selena', username: 'selena', default_pass: 'selenamsflatam', profile_id: null, role: 'COLLECTOR', is_active: true, created_at: '', updated_at: '' },
  { id: '68bff83d-b7a3-4a5e-a3ec-25fac405e2a3', display_name: 'Brenda', username: 'brenda', default_pass: 'brendamsflatam', profile_id: null, role: 'COLLECTOR', is_active: true, created_at: '', updated_at: '' },
  { id: 'rosario-uuid', display_name: 'Rosario', username: 'rosario', default_pass: 'rosariomsflatam', profile_id: null, role: 'COLLECTOR', is_active: true, created_at: '', updated_at: '' },
  { id: 'nicolas-uuid', display_name: 'Nicolas', username: 'nicolas', default_pass: 'nicolasmsflatam', profile_id: null, role: 'COLLECTOR', is_active: true, created_at: '', updated_at: '' },
];

interface AuthContextType {
  user: any | null;
  profile: Profile | null;
  currentMember: TeamMember | null;
  teamMembers: TeamMember[];
  isAdmin: boolean;
  loading: boolean;
  showLoginModal: boolean;
  openLoginModal: () => void;
  closeLoginModal: () => void;
  signInWithCredentials: (username: string, pass: string) => Promise<{ error: any }>;
  signOut: () => Promise<void>;
  simulateSelectMember: (memberId: string) => void;
}

const AuthContext = createContext<AuthContextType>({} as AuthContextType);

function usernameToEmail(username: string): string {
  const clean = username.trim().toLowerCase();
  if (clean.includes('@')) return clean;
  return `${clean}@msfc-user.invalid`;
}

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<any | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [teamMembers, setTeamMembers] = useState<TeamMember[]>(OFFICIAL_TEAM_MEMBERS);
  const [currentMember, setCurrentMember] = useState<TeamMember | null>(OFFICIAL_TEAM_MEMBERS[0]); // default Carlos Diaz
  const [loading, setLoading] = useState<boolean>(false);
  const [showLoginModal, setShowLoginModal] = useState<boolean>(false);

  useEffect(() => {
    // Check saved session
    const savedMemberId = localStorage.getItem('msf_active_member_id');
    if (savedMemberId) {
      const found = OFFICIAL_TEAM_MEMBERS.find((m) => m.id === savedMemberId);
      if (found) setCurrentMember(found);
    }

    supabase.auth.getSession().then(({ data: { session } }) => {
      setUser(session?.user ?? null);
      if (session?.user) {
        linkSessionUser(session.user);
      }
    });

    const { data: authListener } = supabase.auth.onAuthStateChange(async (_event, session) => {
      setUser(session?.user ?? null);
      if (session?.user) {
        linkSessionUser(session.user);
      }
    });

    return () => {
      authListener?.subscription?.unsubscribe();
    };
  }, []);

  const linkSessionUser = (sessionUser: any) => {
    const userEmail = sessionUser.email || '';
    const username = userEmail.replace('@msfc-user.invalid', '');
    const matched = OFFICIAL_TEAM_MEMBERS.find(
      (m) => m.username.toLowerCase() === username.toLowerCase() || m.id === sessionUser.id
    );
    if (matched) {
      setCurrentMember(matched);
      localStorage.setItem('msf_active_member_id', matched.id);
    }
  };

  const signInWithCredentials = async (username: string, pass: string) => {
    const cleanUser = username.trim().toLowerCase();
    const email = usernameToEmail(cleanUser);

    try {
      const res = await supabase.auth.signInWithPassword({ email, password: pass });
      if (res.error) {
        // Special case for Carlos if email is diazcarloscrd@gmail.com
        if (cleanUser === 'carlos' || cleanUser === 'carlos diaz' || cleanUser === 'diazcarloscrd@gmail.com') {
          // If admin logs in with local credentials
          const carlosMem = OFFICIAL_TEAM_MEMBERS[0];
          if (pass === 'carlosmsflatam' || pass === 'adminmsflatam') {
            setCurrentMember(carlosMem);
            localStorage.setItem('msf_active_member_id', carlosMem.id);
            setShowLoginModal(false);
            return { error: null };
          }
        }
        return { error: res.error.message || 'Usuario o contraseña incorrecta' };
      }

      if (res.data?.user) {
        linkSessionUser(res.data.user);
        setShowLoginModal(false);
      }
      return { error: null };
    } catch (err: any) {
      return { error: err.message || 'Error de conexión' };
    }
  };

  const signOut = async () => {
    localStorage.removeItem('msf_active_member_id');
    try {
      await supabase.auth.signOut();
    } catch {}
    setUser(null);
    setProfile(null);
    setCurrentMember(OFFICIAL_TEAM_MEMBERS[0]);
  };

  const simulateSelectMember = (memberId: string) => {
    const mem = teamMembers.find((m) => m.id === memberId);
    if (mem) {
      setCurrentMember(mem);
      localStorage.setItem('msf_active_member_id', mem.id);
    }
  };

  const isAdmin = Boolean(currentMember?.role === 'ADMIN' || currentMember?.display_name.toLowerCase().includes('carlos'));

  return (
    <AuthContext.Provider
      value={{
        user,
        profile,
        currentMember,
        teamMembers,
        isAdmin,
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
