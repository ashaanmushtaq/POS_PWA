import { useEffect, useState } from 'react';
import type { User } from '@supabase/supabase-js';
import { onAuthStateChange, signOut } from './lib/auth';
import { PosLoginPage } from './components/PosLoginPage';
import { PosCounter } from './components/PosCounter';

type AuthState = 'loading' | 'unauthenticated' | 'authenticated';

export function App() {
  const [authState, setAuthState] = useState<AuthState>('loading');
  const [user, setUser] = useState<User | null>(null);

  useEffect(() => {
    const subscription = onAuthStateChange((u) => {
      if (u) {
        setUser(u);
        setAuthState('authenticated');
      } else {
        setUser(null);
        setAuthState('unauthenticated');
      }
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

  if (authState === 'unauthenticated' || !user) {
    return <PosLoginPage onSuccess={() => setAuthState('authenticated')} />;
  }

  return <PosCounter user={user} onSignOut={handleSignOut} />;
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
        Loading UB Collection POS…
      </p>
    </div>
  );
}

export default App;
