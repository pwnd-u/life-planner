import { useState } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { isSupabaseConfigured } from '../lib/supabase';

export default function Auth() {
  const { user, loading, signInWithMagicLink, signInWithPassword, setPassword, signOut } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPasswordInput] = useState('');
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [usePassword, setUsePassword] = useState(false);
  const [showSetPassword, setShowSetPassword] = useState(false);
  const [newPassword, setNewPassword] = useState('');
  const [newPasswordConfirm, setNewPasswordConfirm] = useState('');
  const [setPasswordError, setSetPasswordError] = useState<string | null>(null);

  if (!isSupabaseConfigured()) return null;
  if (loading) return <span className="text-sm text-[var(--adhd-text-muted)]">Loading…</span>;

  if (user) {
    return (
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-sm text-[var(--adhd-text-muted)] truncate max-w-[160px]" title={user.email ?? ''}>
          {user.email}
        </span>
        <button
          type="button"
          onClick={() => { setShowSetPassword(true); setSetPasswordError(null); setNewPassword(''); setNewPasswordConfirm(''); }}
          className="rounded-lg border border-[var(--adhd-border)] bg-[var(--adhd-bg)] px-2 py-1 text-xs font-medium text-[var(--adhd-text-muted)] hover:text-[var(--adhd-text)]"
        >
          Set password
        </button>
        <button
          type="button"
          onClick={() => signOut()}
          className="rounded-lg border border-[var(--adhd-border)] bg-[var(--adhd-bg)] px-2.5 py-1 text-xs font-medium text-[var(--adhd-text-muted)] hover:text-[var(--adhd-text)]"
        >
          Sign out
        </button>
        {showSetPassword && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={() => setShowSetPassword(false)}>
            <div className="w-full max-w-sm rounded-xl border-2 border-[var(--adhd-border)] bg-[var(--adhd-surface)] p-4 shadow-xl" onClick={(e) => e.stopPropagation()}>
              <p className="text-sm font-medium text-[var(--adhd-text)] mb-2">Set a password so you can sign in on other devices without email.</p>
              <input
                type="password"
                placeholder="New password"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                className="w-full rounded-lg border border-[var(--adhd-border)] px-3 py-2 text-sm text-[var(--adhd-text)] mb-2"
              />
              <input
                type="password"
                placeholder="Confirm password"
                value={newPasswordConfirm}
                onChange={(e) => setNewPasswordConfirm(e.target.value)}
                className="w-full rounded-lg border border-[var(--adhd-border)] px-3 py-2 text-sm text-[var(--adhd-text)] mb-2"
              />
              {setPasswordError && <p className="text-xs text-red-600 mb-2">{setPasswordError}</p>}
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={async () => {
                    if (newPassword.length < 6) { setSetPasswordError('Use at least 6 characters'); return; }
                    if (newPassword !== newPasswordConfirm) { setSetPasswordError('Passwords do not match'); return; }
                    setSetPasswordError(null);
                    const { error: err } = await setPassword(newPassword);
                    if (err) setSetPasswordError(err.message);
                    else { setShowSetPassword(false); setNewPassword(''); setNewPasswordConfirm(''); }
                  }}
                  className="rounded-lg bg-[var(--adhd-accent)] px-3 py-1.5 text-xs font-semibold text-white"
                >
                  Save password
                </button>
                <button type="button" onClick={() => setShowSetPassword(false)} className="rounded-lg border border-[var(--adhd-border)] px-3 py-1.5 text-xs text-[var(--adhd-text-muted)]">Cancel</button>
              </div>
            </div>
          </div>
        )}
      </div>
    );
  }

  if (sent && !usePassword) {
    return (
      <p className="text-sm text-[var(--adhd-success)]">Check your email for the sign-in link.</p>
    );
  }

  if (usePassword) {
    return (
      <form
        className="flex flex-wrap items-center gap-2"
        onSubmit={async (e) => {
          e.preventDefault();
          setError(null);
          const { error: err } = await signInWithPassword(email.trim(), password);
          if (err) setError(err.message);
        }}
      >
        <input
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="Email"
          required
          className="w-36 rounded-lg border border-[var(--adhd-border)] bg-[var(--adhd-bg)] px-2.5 py-1.5 text-sm text-[var(--adhd-text)]"
        />
        <input
          type="password"
          value={password}
          onChange={(e) => setPasswordInput(e.target.value)}
          placeholder="Password"
          required
          className="w-28 rounded-lg border border-[var(--adhd-border)] bg-[var(--adhd-bg)] px-2.5 py-1.5 text-sm text-[var(--adhd-text)]"
        />
        <button type="submit" className="rounded-lg bg-[var(--adhd-accent)] px-2.5 py-1.5 text-xs font-semibold text-white hover:opacity-90">
          Sign in
        </button>
        <button type="button" onClick={() => { setUsePassword(false); setError(null); setSent(false); }} className="text-xs text-[var(--adhd-text-muted)] hover:underline">
          Use magic link
        </button>
        {error && <span className="text-xs text-red-600 w-full">{error}</span>}
      </form>
    );
  }

  return (
    <form
      className="flex flex-wrap items-center gap-2"
      onSubmit={async (e) => {
        e.preventDefault();
        setError(null);
        const { error: err } = await signInWithMagicLink(email.trim());
        if (err) setError(err.message);
        else setSent(true);
      }}
    >
      <input
        type="email"
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        placeholder="Email for sign-in link"
        required
        className="w-44 rounded-lg border border-[var(--adhd-border)] bg-[var(--adhd-bg)] px-2.5 py-1.5 text-sm text-[var(--adhd-text)] placeholder:text-[var(--adhd-text-muted)]"
      />
      <button type="submit" className="rounded-lg bg-[var(--adhd-accent)] px-2.5 py-1.5 text-xs font-semibold text-white hover:opacity-90">
        Sign in (link)
      </button>
      <button type="button" onClick={() => setUsePassword(true)} className="text-xs text-[var(--adhd-text-muted)] hover:underline">
        Use password
      </button>
      {error && <span className="text-xs text-red-600 w-full">{error}</span>}
    </form>
  );
}
