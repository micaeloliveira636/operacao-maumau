import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import { Spinner } from '../components/ui';
import { Icon } from '../components/Icon';

export default function Login() {
  const { login } = useAuth();
  const toast = useToast();
  const navigate = useNavigate();
  const [email, setEmail] = useState('');
  const [senha, setSenha] = useState('');
  const [verSenha, setVerSenha] = useState(false);
  const [enviando, setEnviando] = useState(false);

  async function onSubmit(e) {
    e.preventDefault();
    if (enviando) return;
    setEnviando(true);
    try {
      await login(email.trim(), senha);
      navigate('/', { replace: true });
    } catch (err) {
      toast.erro(err.message || 'Não foi possível entrar');
    } finally {
      setEnviando(false);
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center px-4 py-10">
      {/* brilho de fundo */}
      <div className="pointer-events-none absolute inset-0 overflow-hidden">
        <div className="absolute -left-40 top-0 h-96 w-96 rounded-full bg-brand-600/20 blur-[120px]" />
        <div className="absolute -right-32 bottom-0 h-96 w-96 rounded-full bg-accent-500/10 blur-[120px]" />
      </div>

      <div className="relative w-full max-w-md animate-fade-up">
        <div className="mb-8 flex flex-col items-center text-center">
          <img src="/icon.svg" alt="Maumau" className="mb-4 h-16 w-16 rounded-2xl shadow-glow animate-pop-in" />
          <h1 className="text-2xl font-semibold tracking-tight text-white">Operação Maumau</h1>
          <p className="mt-1 text-sm text-slate-500">Acesso restrito à equipe</p>
        </div>

        <form onSubmit={onSubmit} className="card space-y-4 p-5 sm:p-6">
          <div>
            <label className="label" htmlFor="email">Email</label>
            <input
              id="email"
              type="email"
              autoComplete="username"
              className="input"
              placeholder="voce@maumau.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
            />
          </div>

          <div>
            <label className="label" htmlFor="senha">Senha</label>
            <div className="relative">
              <input
                id="senha"
                type={verSenha ? 'text' : 'password'}
                autoComplete="current-password"
                className="input pr-11"
                placeholder="••••••••"
                value={senha}
                onChange={(e) => setSenha(e.target.value)}
                required
              />
              <button
                type="button"
                onClick={() => setVerSenha((v) => !v)}
                className="absolute right-2 top-1/2 -translate-y-1/2 rounded-lg p-2 text-slate-500 hover:text-slate-300"
                tabIndex={-1}
                aria-label="Mostrar senha"
              >
                <Icon name="eye" className="h-4 w-4" />
              </button>
            </div>
          </div>

          <button type="submit" disabled={enviando} className="btn-primary w-full">
            {enviando ? <Spinner className="h-4 w-4" /> : <Icon name="logout" className="h-4 w-4 rotate-180" />}
            {enviando ? 'Entrando' : 'Entrar'}
          </button>
        </form>

        <p className="mt-6 text-center text-xs text-slate-600">
          Painel interno · uso autorizado
        </p>
      </div>
    </div>
  );
}
