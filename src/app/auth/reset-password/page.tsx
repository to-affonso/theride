'use client';

/**
 * Password-reset landing page.
 *
 * Supabase emails a magic link with `?type=recovery&code=...`. The middleware
 * exchanges the code for a session, so by the time this page mounts the user
 * is authenticated and can call `updateUser({ password })`.
 */

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/client';
import { ElevationBg } from '@/components/auth/ElevationBg';

export default function ResetPasswordPage() {
  const router = useRouter();
  const [password, setPassword] = useState('');
  const [confirm,  setConfirm]  = useState('');
  const [error,    setError]    = useState('');
  const [info,     setInfo]     = useState('');
  const [loading,  setLoading]  = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(''); setInfo('');
    if (password.length < 6) { setError('Use no mínimo 6 caracteres.'); return; }
    if (password !== confirm) { setError('As senhas não coincidem.'); return; }
    setLoading(true);

    const supabase = createClient();
    const { error } = await supabase.auth.updateUser({ password });

    setLoading(false);
    if (error) { setError(error.message); return; }
    setInfo('Senha atualizada. Redirecionando…');
    setTimeout(() => { router.push('/route'); router.refresh(); }, 1200);
  }

  return (
    <div className="auth-stage">
      <ElevationBg/>

      <div className="auth-card">
        <div className="brand" style={{ marginBottom: 28 }}>
          <span className="brand-name">The <em>Ride</em></span>
        </div>

        <h1>Nova senha</h1>
        <p className="sub">Escolha uma senha forte para acessar a sua conta.</p>

        <form onSubmit={handleSubmit}>
          {error && <div className="auth-error">{error}</div>}
          {info  && <div className="auth-info">{info}</div>}

          <div className="field">
            <label htmlFor="password">Nova senha</label>
            <input
              id="password" type="password"
              placeholder="••••••••"
              value={password}
              onChange={e => setPassword(e.target.value)}
              required autoFocus
            />
          </div>

          <div className="field">
            <label htmlFor="confirm">Confirme a senha</label>
            <input
              id="confirm" type="password"
              placeholder="••••••••"
              value={confirm}
              onChange={e => setConfirm(e.target.value)}
              required
            />
          </div>

          <button
            type="submit"
            className="btn primary"
            style={{ width: '100%', justifyContent: 'center', marginTop: 8 }}
            disabled={loading}
          >
            {loading ? 'Atualizando…' : 'Salvar nova senha'}
          </button>
        </form>

        <p style={{ marginTop: 20, fontSize: 13, color: 'var(--fg-3)', textAlign: 'center' }}>
          <Link href="/auth/login" style={{ color: 'var(--accent)', textDecoration: 'none', fontWeight: 600 }}>
            Voltar para o login
          </Link>
        </p>
      </div>
    </div>
  );
}
