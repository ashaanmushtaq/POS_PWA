import { useEffect, useState } from 'react';
import type { User } from '@supabase/supabase-js';
import { getPosProfile, getTenantBranding, onAuthStateChange, signOut } from './lib/auth';
import type { TenantBranding } from './lib/auth';
import { clearActiveTenantId, clearLocalData, setActiveTenantId } from './lib/offlineQueue';
import { PosLoginPage } from './components/PosLoginPage';
import { PosCounter } from './components/PosCounter';

type AuthState = 'loading' | 'unauthenticated' | 'authenticated';

export function App() {
  const [authState, setAuthState] = useState<AuthState>('loading');
  const [user, setUser] = useState<User | null>(null);
  const [branding, setBranding] = useState<TenantBranding | null>(null);
  const [tenantReady, setTenantReady] = useState(false);

  useEffect(() => {
    const subscription = onAuthStateChange((u) => {
      if (!u) {
        clearActiveTenantId();
        void clearLocalData();
        setTenantReady(false);
        setUser(null);
        setBranding(null);
        setAuthState('unauthenticated');
        return;
      }

      setAuthState('loading');
      setTenantReady(false);
      setUser(null);
      setBranding(null);
      void clearLocalData().then(async () => {
        const profile = await getPosProfile(u);
        if (!profile) {
          setAuthState('unauthenticated');
          return;
        }
        const b = await getTenantBranding(profile.tenant_id);
        setBranding(b);
        setActiveTenantId(profile.tenant_id);
        setUser(u);
        setTenantReady(true);
        setAuthState('authenticated');
      });
    });
    return () => subscription.unsubscribe();
  }, []);

  async function handleSignOut() {
    try {
      await signOut();
    } catch (err) {
      console.error('Sign out error:', err);
    }
  }

  if (authState === 'loading') {
    return <PosSplash />;
  }

  if (authState === 'unauthenticated' || !user || !tenantReady) {
    return <PosLoginPage onSuccess={() => setAuthState('authenticated')} />;
  }

  return <PosCounter user={user} branding={branding} onSignOut={handleSignOut} />;
}

function PosSplash() {
  return (
    <div style={{
      minHeight: '100vh',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      background: '#060b18',
      flexDirection: 'column',
      gap: '1rem',
      fontFamily: 'Inter, system-ui, sans-serif',
    }}>
      <div style={{
        fontSize: '2rem',
        filter: 'drop-shadow(0 0 20px rgba(37,99,235,0.5))',
      }}>👑</div>
      <div style={{
        width: '36px', height: '36px',
        border: '3px solid rgba(79,142,247,0.2)',
        borderTopColor: '#4f8ef7',
        borderRadius: '50%',
        animation: 'pos-spin 0.8s linear infinite',
      }} />
      <style>{`@keyframes pos-spin { to { transform: rotate(360deg); } }`}</style>
      <p style={{ color: '#4e607d', fontSize: '0.85rem', margin: 0 }}>
        Loading POS Counter…
      </p>
    </div>
  );
}

export default App;
