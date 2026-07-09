import { createContext, useCallback, useContext, useState } from 'react';
import { Icon } from '../components/Icon';

const ToastContext = createContext(null);

let idSeq = 0;

export function ToastProvider({ children }) {
  const [toasts, setToasts] = useState([]);

  const remove = useCallback((id) => {
    setToasts((t) => t.filter((x) => x.id !== id));
  }, []);

  const push = useCallback(
    (tipo, mensagem, duracao = 4000) => {
      const id = ++idSeq;
      setToasts((t) => [...t, { id, tipo, mensagem }]);
      if (duracao) setTimeout(() => remove(id), duracao);
      return id;
    },
    [remove]
  );

  const toast = {
    sucesso: (m, d) => push('sucesso', m, d),
    erro: (m, d) => push('erro', m, d ?? 6000),
    info: (m, d) => push('info', m, d),
  };

  return (
    <ToastContext.Provider value={toast}>
      {children}
      <div className="pointer-events-none fixed inset-x-0 top-0 z-[100] flex flex-col items-center gap-2 p-4 safe-top">
        {toasts.map((t) => (
          <div
            key={t.id}
            className="animate-toast-in pointer-events-auto flex w-full max-w-sm items-start gap-3 rounded-xl border border-white/10 bg-ink-800/95 px-4 py-3 shadow-2xl backdrop-blur-xl"
          >
            <div
              className={
                'mt-0.5 flex h-6 w-6 flex-none items-center justify-center rounded-full ' +
                (t.tipo === 'sucesso'
                  ? 'bg-emerald-500/15 text-emerald-300'
                  : t.tipo === 'erro'
                  ? 'bg-rose-500/15 text-rose-300'
                  : 'bg-brand-500/15 text-brand-200')
              }
            >
              <Icon
                name={t.tipo === 'sucesso' ? 'check' : t.tipo === 'erro' ? 'alert' : 'info'}
                className="h-3.5 w-3.5"
              />
            </div>
            <p className="flex-1 text-sm text-slate-200">{t.mensagem}</p>
            <button onClick={() => remove(t.id)} className="link-quiet -mr-1 -mt-0.5 p-1">
              <Icon name="x" className="h-4 w-4" />
            </button>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast() {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error('useToast fora do ToastProvider');
  return ctx;
}
