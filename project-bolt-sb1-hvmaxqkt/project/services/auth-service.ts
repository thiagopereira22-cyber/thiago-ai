import type { User, AuthChangeEvent, Session } from '@supabase/supabase-js';
import { createSupabaseBrowserClient } from '@/lib/supabase-browser';

export interface Profile {
  id: string;
  nome: string;
  email: string;
  telefone: string | null;
  empresa: string | null;
}

export interface SignUpData {
  nome: string;
  email: string;
  password: string;
  telefone?: string;
  empresa?: string;
}

export interface AuthResult {
  user: User | null;
  error: string | null;
}

const supabase = createSupabaseBrowserClient();

export const authService = {
  async signIn(email: string, password: string): Promise<AuthResult> {
    const { data, error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });
    return {
      user: data.user,
      error: error
        ? error.message === 'Invalid login credentials'
          ? 'E-mail ou senha incorretos.'
          : error.message
        : null,
    };
  },

  async signUp(data: SignUpData): Promise<AuthResult> {
    const { data: signUpData, error } = await supabase.auth.signUp({
      email: data.email,
      password: data.password,
      options: { data: { nome: data.nome } },
    });

    if (error) {
      return {
        user: null,
        error:
          error.message === 'User already registered'
            ? 'Este e-mail já está cadastrado.'
            : error.message,
      };
    }

    if (signUpData.user) {
      await supabase.from('profiles').upsert({
        id: signUpData.user.id,
        nome: data.nome,
        email: data.email,
        telefone: data.telefone || null,
        empresa: data.empresa || null,
      });
    }

    return { user: signUpData.user, error: null };
  },

  async resetPassword(email: string): Promise<string | null> {
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}/login`,
    });
    return error ? error.message : null;
  },

  async signOut(): Promise<void> {
    await supabase.auth.signOut();
  },

  async getCurrentUser(): Promise<User | null> {
    const {
      data: { user },
    } = await supabase.auth.getUser();
    return user;
  },

  async getProfile(userId: string): Promise<Profile | null> {
    const { data } = await supabase
      .from('profiles')
      .select('id, nome, email, telefone, empresa')
      .eq('id', userId)
      .maybeSingle();
    return data as Profile | null;
  },

  onAuthStateChange(
    callback: (event: AuthChangeEvent, session: Session | null) => void
  ) {
    return supabase.auth.onAuthStateChange(callback);
  },
};
