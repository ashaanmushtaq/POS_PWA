import { supabase } from './supabase';
import type { User } from '@supabase/supabase-js';
import { clearLocalData } from './offlineQueue';

export interface PosUserProfile {
  id: string;
  full_name: string;
  role: string;
  tenant_id: string;
}

export interface TenantBranding {
  id: string;
  name: string;
  display_name: string | null;
  company_name: string | null;
  address: string | null;
  phone: string | null;
  email: string | null;
  logo_url: string | null;
}

export async function getTenantBranding(tenantId: string): Promise<TenantBranding | null> {
  const { data, error } = await supabase
    .from('tenants')
    .select('id, name, display_name, company_name, address, phone, email, logo_url')
    .eq('id', tenantId)
    .single();

  if (error) {
    console.warn('POS: Could not fetch tenant branding:', error.message);
    return null;
  }
  return data as TenantBranding;
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
  await clearLocalData();
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
