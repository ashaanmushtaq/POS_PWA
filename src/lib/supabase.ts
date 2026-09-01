import { createClient } from '@supabase/supabase-js';

const getEnvVar = (key: string): string => {
  try {
    if (typeof import.meta !== 'undefined' && import.meta && (import.meta as any).env) {
      return (import.meta as any).env[key] || '';
    }
  } catch (_) {}
  return (process.env && process.env[key]) || '';
};

const supabaseUrl = getEnvVar('VITE_SUPABASE_URL') || 'https://ertmvejppdcuyonbizxb.supabase.co';
const supabaseAnonKey = getEnvVar('VITE_SUPABASE_ANON_KEY') || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImVydG12ZWpwcGRjdXlvbmJpenhiIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODgxNjkyMTcsImV4cCI6MjEwMzc0NTIxN30.aoI2Y8scb2SPiQzxLt77uwatmitbOUuxKgK_OkpAswk';

export const supabase = createClient(
  supabaseUrl || 'https://placeholder.supabase.co',
  supabaseAnonKey || 'placeholder_key'
);

export const checkSupabaseConnection = async (): Promise<{ connected: boolean; message: string }> => {
  try {
    if (!supabaseUrl || supabaseUrl.includes('your-project-ref')) {
      return {
        connected: false,
        message: 'Supabase URL not configured in .env (Using template placeholder)'
      };
    }

    const { data, error } = await supabase.auth.getSession();

    if (error) {
      return { connected: false, message: `POS Auth Ping Error: ${error.message}` };
    }

    return {
      connected: true,
      message: data.session
        ? `POS connected to Supabase endpoint: ${supabaseUrl} (session active)`
        : `POS connected to Supabase endpoint: ${supabaseUrl} (no active session)`
    };
  } catch (err: any) {
    return {
      connected: false,
      message: `POS Connection error: ${err?.message || 'Offline / unreachable'}`
    };
  }
};