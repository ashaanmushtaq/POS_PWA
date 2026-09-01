import { supabase } from './supabase';
import type { User } from '@supabase/supabase-js';

export interface PosUserProfile {
  id: string;
  full_name: string;
  role: string;
  tenant_id: string;
}

/** Sign in with email + password. Throws on failure. */
export async function signIn(email: string, password: string): Promise<User> {
  const { data, error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) throw error;
  return data.user;
}

/** Sign out the current session. */
export async function signOut(): Promise<void> {
  const { error } = await supabase.auth.signOut();
  if (error) throw error;
}

/** Get the current session user synchronously (null if not logged in). */
export async function getSessionUser(): Promise<User | null> {
  const { data } = await supabase.auth.getSession();
  return data.session?.user ?? null;
}

/** Subscribe to auth state changes. Returns an unsubscribe function. */
export function onAuthStateChange(callback: (user: User | null) => void): { unsubscribe: () => void } {
  const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
    callback(session?.user ?? null);
  });
  return subscription;
}

/** Fetch the profile row for the authenticated user. */
export async function getPosProfile(user: User): Promise<PosUserProfile | null> {
  const { data, error } = await supabase
    .from('profiles')
    .select('id, full_name, role, tenant_id')
    .eq('id', user.id)
    .single();

  if (error) {
    console.warn('POS: Could not fetch user profile:', error.message);
    return null;
  }

  return {
    id: data.id,
    full_name: data.full_name ?? 'Staff User',
    role: data.role ?? 'shop_staff',
    tenant_id: data.tenant_id,
  };
}
