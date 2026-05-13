'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/client';
import { AuthSplitLayout } from '@/components/auth/AuthSplitLayout';

type Mode = 'login' | 'reset';

export default function LoginPage() {
  const router = useRouter();
  const [email,    setEmail]    = useState('');
  const [password, setPassword] = useState('');
  const [error,    setError]    = useState('');
  const [info,     setInfo]     = useState('');
  const [loading,  setLoading]  = useState(false);
  const [mode,     setMode]     = useState<Mode>('login');

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault();
    setError(''); setInfo('');
    setLoading(true);

    const supabase = createClient();
    const { error } = await supabase.auth.signInWithPassword({ email, password });

    if (error) {
      setError(error.message);
      setLoading(false);
      return;
    }
    router.push('/route');
    router.refresh();
  }

  async function handleReset(e: React.FormEvent) {
    e.preventDefault();
    setError(''); setInfo('');
    if (!email) { setError('Informe seu e-mail.'); return; }
    setLoading(true);

    const supabase = createClient();
    const redirectTo = typeof window !== 'undefined'
      ? `${window.location.origin}/auth/reset-password`
      : undefined;
    const { error } = await supabase.auth.resetPasswordForEmail(email, { redirectTo });

    setLoading(false);
    if (error) { setError(error.message); return; }
    setInfo('Enviamos um link de redefinição para o seu e-mail.');
  }

  return (
    <AuthSplitLayout>
        {mode === 'login' ? (
          <>
            <h1>Bem-vindo.</h1>
            <p className="sub">Para treinar, faça o seu login abaixo.</p>

            <form onSubmit={handleLogin}>
              {error && <div className="auth-error">{error}</div>}
              {info  && <div className="auth-info">{info}</div>}

              <div className="field">
                <label htmlFor="email">E-mail</label>
                <input
                  id="email" type="email"
                  placeholder="seu@email.com"
                  value={email}
                  onChange={e => setEmail(e.target.value)}
                  required autoFocus
                />
              </div>

              <div className="field">
                <label htmlFor="password">Senha</label>
                <input
                  id="password" type="password"
                  placeholder="••••••••"
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                  required
                />
              </div>

              <button
                type="submit"
                className="btn primary"
                style={{ width: '100%', justifyContent: 'center', marginTop: 8 }}
                disabled={loading}
              >
                {loading ? 'Entrando...' : 'Entrar'}
              </button>

              <button
                type="button"
                onClick={() => { setMode('reset'); setError(''); setInfo(''); }}
                className="auth-link-btn"
              >
                Esqueci minha senha
              </button>
            </form>

            <p style={{ marginTop: 20, fontSize: 13, color: 'var(--fg-3)', textAlign: 'center' }}>
              Não tem conta?{' '}
              <Link href="/auth/signup" style={{ color: 'var(--accent)', textDecoration: 'none', fontWeight: 600 }}>
                Criar conta
              </Link>
            </p>
          </>
        ) : (
          <>
            <h1>Redefinir senha</h1>
            <p className="sub">Enviaremos um link para você redefinir a senha.</p>

            <form onSubmit={handleReset}>
              {error && <div className="auth-error">{error}</div>}
              {info  && <div className="auth-info">{info}</div>}

              <div className="field">
                <label htmlFor="email">E-mail</label>
                <input
                  id="email" type="email"
                  placeholder="seu@email.com"
                  value={email}
                  onChange={e => setEmail(e.target.value)}
                  required autoFocus
                />
              </div>

              <button
                type="submit"
                className="btn primary"
                style={{ width: '100%', justifyContent: 'center', marginTop: 8 }}
                disabled={loading}
              >
                {loading ? 'Enviando...' : 'Enviar link'}
              </button>

              <button
                type="button"
                onClick={() => { setMode('login'); setError(''); setInfo(''); }}
                className="auth-link-btn"
              >
                Voltar para login
              </button>
            </form>
          </>
        )}
    </AuthSplitLayout>
  );
}
