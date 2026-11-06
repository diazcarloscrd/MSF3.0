import React, { createContext, useContext, useEffect, useState } from 'react';
import { supabase, isSupabaseConfigured } from '../lib/supabase';
import { Profile, TeamMember } from '../types/database';

export const DEFAULT_TEAM_MEMBERS: TeamMember[] = [
  { id: 'mem-admin-carlos', display_name: 'Carlos Díaz', profile_id: null, role: 'ADMIN', is_active: true, created_at: '', updated_at: '' },
  { id: 'mem-ariel', display_name: 'Ariel', profile_id: null, role: 'COLLECTOR', is_active: true, created_at: '', updated_at: '' },
  { id: 'mem-lucia', display_name: 'Lucía', profile_id: null, role: 'COLLECTOR', is_active: true, created_at: '', updated_at: '' },
  { id: 'mem-emilce', display_name: 'Emilce', profile_id: null, role: 'COLLECTOR', is_active: true, created_at: '', updated_at: '' },
  { id: 'mem-selena', display_name: 'Selena', profile_id: null, role: 'COLLECTOR', is_active: true, created_at: '', updated_at: '' },
  { id: 'mem-brenda', display_name: 'Brenda', profile_id: null, role: 'COLLECTOR', is_active: true, created_at: '', updated_at: '' },
  { id: 'mem-rosario', display_name: 'Rosario', profile_id: null, role: 'COLLECTOR', is_active: true, created_at: '', updated_at: '' },
  { id: 'mem-nicolas', display_name: 'Nicolás', profile_id: null, role: 'COLLECTOR', is_active: true, created_at: '', updated_at: '' },
];

interface AuthContextType {
  user: any | null;
  profile: Profile | null;
  currentMember: TeamMember | null;
  teamMembers: TeamMember[];
  isAdmin: boolean;
  loading: boolean;
  signInWithEmail: (email: string, pass: string) => Promise<{ error: any }>;
  signOut: () => Promise<void>;
  simulateSelectMember: (memberId: string) => void;
}

const AuthContext = createContext<AuthContextType>({} as AuthContextType);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<any | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [teamMembers, setTeamMembers] = useState<TeamMember[]>(DEFAULT_TEAM_MEMBERS);
  const [currentMember, setCurrentMember] = useState<TeamMember | null>(DEFAULT_TEAM_MEMBERS[0]); // default Carlos Díaz
  const [loading, setLoading] = useState<boolean>(false);

  // Load team members
  const fetchMembers = async () => {
    if (!isSupabaseConfigured) {
      setTeamMembers(DEFAULT_TEAM_MEMBERS);
      return;
    }
    try {
      const { data, error } = await supabase
        .from('team_members')
        .select('*')
        .eq('is_active', true)
        .order('display_name', { ascending: true });

      if (!error && data && data.length > 0) {
        setTeamMembers(data as TeamMember[]);
      } else {
        setTeamMembers(DEFAULT_TEAM_MEMBERS);
      }
    } catch (err) {
      console.warn('Error fetching members, using preloaded team:', err);
      setTeamMembers(DEFAULT_TEAM_MEMBERS);
    }
  };

  useEffect(() => {
    fetchMembers();

    const savedMemberId = localStorage.getItem('msf_active_member_id');
    if (savedMemberId) {
      const found = DEFAULT_TEAM_MEMBERS.find((m) => m.id === savedMemberId);
      if (found) setCurrentMember(found);
    }

    if (isSupabaseConfigured) {
      supabase.auth.getSession().then(({ data: { session } }) => {
        setUser(session?.user ?? null);
        if (session?.user) {
          fetchProfile(session.user.id);
        }
      }).catch((e) => console.warn('Supabase auth getSession bypassed', e));

      const { data: authListener } = supabase.auth.onAuthStateChange(async (_event, session) => {
        setUser(session?.user ?? null);
        if (session?.user) {
          await fetchProfile(session.user.id);
        } else {
          setProfile(null);
        }
      });

      return () => {
        authListener?.subscription?.unsubscribe();
      };
    }
  }, []);

  const fetchProfile = async (authUserId: string) => {
    try {
      const { data: prof } = await supabase
        .from('profiles')
        .select('*')
        .eq('auth_user_id', authUserId)
        .single();

      if (prof) {
        setProfile(prof as Profile);
        const { data: member } = await supabase
          .from('team_members')
          .select('*')
          .eq('profile_id', prof.id)
          .single();

        if (member) {
          setCurrentMember(member as TeamMember);
        }
      }
    } catch (e) {
      console.warn('Error fetching profile', e);
    }
  };

  const signInWithEmail = async (email: string, pass: string) => {
    if (!isSupabaseConfigured) {
      return { error: 'Supabase credentials not configured yet.' };
    }
    const res = await supabase.auth.signInWithPassword({ email, password: pass });
    return { error: res.error };
  };

  const signOut = async () => {
    localStorage.removeItem('msf_active_member_id');
    if (isSupabaseConfigured) {
      await supabase.auth.signOut();
    }
    setUser(null);
    setProfile(null);
    setCurrentMember(DEFAULT_TEAM_MEMBERS[0]);
  };

  const simulateSelectMember = (memberId: string) => {
    const mem = teamMembers.find((m) => m.id === memberId);
    if (mem) {
      setCurrentMember(mem);
      localStorage.setItem('msf_active_member_id', mem.id);
    }
  };

  const isAdmin = currentMember?.role === 'ADMIN' || profile?.role === 'ADMIN';

  return (
    <AuthContext.Provider
      value={{
        user,
        profile,
        currentMember,
        teamMembers,
        isAdmin,
        loading,
        signInWithEmail,
        signOut,
        simulateSelectMember,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => useContext(AuthContext);
