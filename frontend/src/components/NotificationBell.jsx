import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../lib/api';
import { tempoRelativo } from '../lib/format';
import { Icon } from './Icon';

export function NotificationBell() {
  const [aberto, setAberto] = useState(false);
  const [lista, setLista] = useState([]);
  const [naoLidas, setNaoLidas] = useState(0);
  const ref = useRef(null);
  const navigate = useNavigate();

  async function carregar() {
    try {
      const data = await api.get('/notificacoes');
      setLista(data.notificacoes || []);
      setNaoLidas(data.naoLidas || 0);
    } catch {
      /* silencioso */
    }
  }

  useEffect(() => {
    carregar();
    const t = setInterval(carregar, 30000); // poll leve
    return () => clearInterval(t);
  }, []);

  useEffect(() => {
    const onClick = (e) => {
      if (ref.current && !ref.current.contains(e.target)) setAberto(false);
    };
    document.addEventListener('mousedown', onClick);
    return () => document.removeEventListener('mousedown', onClick);
  }, []);

  async function marcarTodas() {
    await api.patch('/notificacoes/todas-lidas').catch(() => {});
    setNaoLidas(0);
    setLista((l) => l.map((n) => ({ ...n, lida: true })));
  }

  async function abrir(n) {
    if (!n.lida) {
      api.patch(`/notificacoes/${n.id}/lida`).catch(() => {});
      setNaoLidas((v) => Math.max(0, v - 1));
    }
    setAberto(false);
    if (n.url && n.url !== '/') navigate(n.url);
  }

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => {
          setAberto((v) => !v);
          if (!aberto) carregar();
        }}
        className="relative flex h-10 w-10 items-center justify-center rounded-xl border border-white/10 bg-white/[0.02] text-slate-300 transition hover:bg-white/[0.06]"
        aria-label="Notificações"
      >
        <Icon name="bell" className="h-5 w-5" />
        {naoLidas > 0 && (
          <span className="absolute -right-1 -top-1 flex h-5 min-w-[1.25rem] items-center justify-center rounded-full bg-rose-500 px-1 text-[10px] font-bold text-white ring-2 ring-ink-900">
            {naoLidas > 9 ? '9+' : naoLidas}
          </span>
        )}
      </button>

      {aberto && (
        <div className="absolute right-0 z-50 mt-2 w-80 origin-top-right animate-scale-in overflow-hidden rounded-2xl border border-white/10 bg-ink-850 shadow-2xl">
          <div className="flex items-center justify-between border-b border-white/5 px-4 py-3">
            <p className="text-sm font-semibold text-slate-100">Notificações</p>
            {naoLidas > 0 && (
              <button onClick={marcarTodas} className="text-xs text-brand-300 hover:text-brand-200">
                Marcar todas
              </button>
            )}
          </div>
          <div className="max-h-96 overflow-y-auto">
            {lista.length === 0 ? (
              <p className="px-4 py-8 text-center text-sm text-slate-500">Nenhuma notificação.</p>
            ) : (
              lista.map((n) => (
                <button
                  key={n.id}
                  onClick={() => abrir(n)}
                  className={`flex w-full gap-3 border-b border-white/[0.03] px-4 py-3 text-left transition hover:bg-white/[0.03] ${
                    n.lida ? 'opacity-60' : ''
                  }`}
                >
                  <span
                    className={`mt-1.5 h-2 w-2 flex-none rounded-full ${
                      n.tipo === 'erro'
                        ? 'bg-rose-400'
                        : n.tipo === 'sucesso'
                        ? 'bg-emerald-400'
                        : n.tipo === 'alerta'
                        ? 'bg-amber-400'
                        : 'bg-brand-400'
                    }`}
                  />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium text-slate-200">{n.titulo}</p>
                    <p className="mt-0.5 line-clamp-2 text-xs text-slate-400">{n.mensagem}</p>
                    <p className="mt-1 text-[11px] text-slate-600">{tempoRelativo(n.createdAt)}</p>
                  </div>
                </button>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
}
