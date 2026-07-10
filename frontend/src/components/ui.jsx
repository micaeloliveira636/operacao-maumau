import { useEffect } from 'react';
import {
  STATUS, TONE_CLASSES, CATEGORIA_COR, CATEGORIA_LABEL, PRIORIDADE_COR,
} from '../lib/constants';
import { iniciais } from '../lib/format';
import { Icon } from './Icon';

export function StatusBadge({ status, className = '' }) {
  const s = STATUS[status] || { label: status, tone: 'slate' };
  return (
    <span className={`chip ${TONE_CLASSES[s.tone]} ${className}`}>
      <span className="h-1.5 w-1.5 rounded-full bg-current opacity-80" />
      {s.label}
    </span>
  );
}

// Tag de categoria com a cor do design v3 (ponto colorido + label)
export function CategoriaTag({ categoria, className = '' }) {
  const cor = CATEGORIA_COR[categoria] || '#7A7A86';
  const label = CATEGORIA_LABEL[categoria] || categoria;
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-md px-1.5 py-0.5 text-[11px] font-medium ${className}`}
      style={{ backgroundColor: `${cor}1f`, color: cor }}
    >
      <span className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: cor }} />
      {label}
    </span>
  );
}

export function PrioridadeTag({ prioridade, className = '' }) {
  const cor = PRIORIDADE_COR[prioridade] || '#7A7A86';
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[11px] font-semibold uppercase tracking-wide ${className}`}
      style={{ backgroundColor: `${cor}1f`, color: cor }}
    >
      {prioridade}
    </span>
  );
}

export function Spinner({ className = 'h-5 w-5' }) {
  return (
    <svg className={`animate-spin ${className}`} viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <circle className="opacity-20" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" />
      <path
        className="opacity-90"
        d="M22 12a10 10 0 0 1-10 10"
        stroke="currentColor"
        strokeWidth="3"
        strokeLinecap="round"
      />
    </svg>
  );
}

export function LoadingScreen({ label = 'Carregando' }) {
  return (
    <div className="flex h-full min-h-[50vh] flex-col items-center justify-center gap-3 text-slate-400">
      <Spinner className="h-7 w-7 text-brand-300" />
      <p className="text-sm">{label}…</p>
    </div>
  );
}

export function Avatar({ nome, size = 'md', role }) {
  const dims = size === 'sm' ? 'h-8 w-8 text-xs' : size === 'lg' ? 'h-12 w-12 text-base' : 'h-9 w-9 text-sm';
  return (
    <span
      className={`inline-flex ${dims} flex-none items-center justify-center rounded-full bg-gradient-to-br from-brand-500/80 to-accent-500/70 font-semibold text-white ring-1 ring-white/10`}
      title={role ? `${nome} · ${role}` : nome}
    >
      {iniciais(nome) || '?'}
    </span>
  );
}

export function EmptyState({ icon = 'layers', titulo, descricao, children }) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 rounded-2xl border border-dashed border-white/10 bg-white/[0.015] px-6 py-14 text-center">
      <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-brand-500/10 text-brand-300">
        <Icon name={icon} className="h-6 w-6" />
      </div>
      <div>
        <p className="font-medium text-slate-200">{titulo}</p>
        {descricao && <p className="mt-1 text-sm text-slate-500">{descricao}</p>}
      </div>
      {children}
    </div>
  );
}

export function Modal({ open, onClose, titulo, children, maxWidth = 'max-w-lg' }) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e) => e.key === 'Escape' && onClose?.();
    document.addEventListener('keydown', onKey);
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = '';
    };
  }, [open, onClose]);

  if (!open) return null;
  return (
    <div className="fixed inset-0 z-[90] flex items-end justify-center p-0 sm:items-center sm:p-4">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm animate-fade-in" onClick={onClose} />
      <div
        className={`relative w-full ${maxWidth} animate-scale-in rounded-t-2xl border border-white/10 bg-ink-850 p-4 shadow-2xl sm:rounded-2xl sm:p-5`}
        role="dialog"
        aria-modal="true"
      >
        {titulo && (
          <div className="mb-4 flex items-center justify-between">
            <h3 className="text-base font-semibold text-slate-100">{titulo}</h3>
            <button onClick={onClose} className="link-quiet -mr-1 p-1">
              <Icon name="x" className="h-5 w-5" />
            </button>
          </div>
        )}
        {children}
      </div>
    </div>
  );
}
