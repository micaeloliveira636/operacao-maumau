import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import {
  STATUS, TONE_CLASSES, CATEGORIA_COR, CATEGORIA_LABEL,
} from '../lib/constants';
import { iniciais } from '../lib/format';
import { Icon } from './Icon';

/**
 * Select customizado. O painel é renderizado num PORTAL (document.body) e
 * posicionado com position:fixed — assim ele escapa do stacking context dos
 * cards (que usam backdrop-blur) e NÃO fica transparente/atrás do conteúdo.
 */
export function Select({ value, onChange, options = [], placeholder = 'Selecione…', className = '', disabled }) {
  const [aberto, setAberto] = useState(false);
  const [pos, setPos] = useState(null);
  const btnRef = useRef(null);
  const panelRef = useRef(null);
  const opts = options.map((o) => (typeof o === 'string' ? { value: o, label: o } : o));
  const atual = opts.find((o) => String(o.value) === String(value));

  const medir = () => {
    if (!btnRef.current) return;
    const r = btnRef.current.getBoundingClientRect();
    setPos({ left: r.left, top: r.bottom + 6, width: r.width });
  };

  function toggle() {
    if (disabled) return;
    if (!aberto) medir();
    setAberto((a) => !a);
  }

  useLayoutEffect(() => {
    if (aberto) medir();
  }, [aberto]);

  useEffect(() => {
    if (!aberto) return;
    const onDoc = (e) => {
      if (btnRef.current?.contains(e.target) || panelRef.current?.contains(e.target)) return;
      setAberto(false);
    };
    const fechar = () => setAberto(false);
    const onKey = (e) => e.key === 'Escape' && setAberto(false);
    document.addEventListener('mousedown', onDoc);
    window.addEventListener('scroll', fechar, true);
    window.addEventListener('resize', fechar);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDoc);
      window.removeEventListener('scroll', fechar, true);
      window.removeEventListener('resize', fechar);
      document.removeEventListener('keydown', onKey);
    };
  }, [aberto]);

  function escolher(v) {
    onChange?.(v);
    setAberto(false);
  }

  return (
    <div className={`relative ${className}`}>
      <button
        ref={btnRef}
        type="button"
        disabled={disabled}
        onClick={toggle}
        className={`flex w-full items-center justify-between gap-2 rounded-xl border bg-ink-900 px-3.5 py-2.5 text-left text-[15px] transition-all duration-200 sm:text-sm
          ${aberto ? 'border-brand-400/60 ring-2 ring-brand-400/25' : 'border-white/10 hover:border-white/20'}
          ${disabled ? 'cursor-not-allowed opacity-50' : ''}`}
      >
        <span className={`min-w-0 flex-1 truncate ${atual ? 'text-slate-100' : 'text-slate-500'}`}>
          {atual ? atual.label : placeholder}
        </span>
        <Icon
          name="chevronDown"
          className={`h-4 w-4 flex-none text-slate-400 transition-transform duration-200 ${aberto ? 'rotate-180 text-brand-300' : ''}`}
        />
      </button>

      {aberto && pos && createPortal(
        <div
          ref={panelRef}
          style={{ position: 'fixed', left: pos.left, top: pos.top, width: pos.width, maxHeight: '15rem' }}
          className="animate-fade-down z-[120] overflow-auto rounded-xl border border-white/15 bg-[#1b1b23] p-1.5 shadow-2xl ring-1 ring-black/50"
        >
          {opts.length === 0 && <p className="px-3 py-2 text-sm text-slate-500">Sem opções.</p>}
          {opts.map((o) => {
            const on = String(o.value) === String(value);
            return (
              <button
                key={String(o.value)}
                type="button"
                onClick={() => escolher(o.value)}
                className={`flex w-full items-center justify-between gap-2 rounded-lg px-3 py-2.5 text-left text-[15px] transition sm:text-sm active:scale-[0.98]
                  ${on ? 'bg-brand-500/20 text-white' : 'text-slate-200 hover:bg-white/[0.07]'}`}
              >
                <span className="min-w-0 flex-1 truncate">{o.label}</span>
                {on && <Icon name="check" className="h-4 w-4 flex-none text-brand-300" />}
              </button>
            );
          })}
        </div>,
        document.body
      )}
    </div>
  );
}

/**
 * Seletor de MODELO de texto: abre um painel (bottom-sheet no mobile) com o
 * TEXTO COMPLETO de cada opção — como as pastas do SendFlow. options:
 * [{ value, label, texto }].
 */
export function ModelPicker({ value, onChange, options = [], placeholder = 'Escolher texto…', titulo = 'Escolher texto', disabled }) {
  const [open, setOpen] = useState(false);
  const atual = options.find((o) => String(o.value) === String(value));

  useEffect(() => {
    if (!open) return;
    document.body.style.overflow = 'hidden';
    const onKey = (e) => e.key === 'Escape' && setOpen(false);
    document.addEventListener('keydown', onKey);
    return () => { document.body.style.overflow = ''; document.removeEventListener('keydown', onKey); };
  }, [open]);

  return (
    <>
      <button
        type="button"
        disabled={disabled}
        onClick={() => !disabled && setOpen(true)}
        className={`flex w-full items-center justify-between gap-2 rounded-xl border bg-ink-900 px-3.5 py-2.5 text-left text-[15px] transition sm:text-sm
          ${disabled ? 'cursor-not-allowed opacity-50 border-white/10' : 'border-white/10 hover:border-white/20'}`}
      >
        <span className={`min-w-0 flex-1 truncate ${atual ? 'text-slate-100' : 'text-slate-500'}`}>
          {atual ? atual.label : placeholder}
        </span>
        <Icon name="chevronDown" className="h-4 w-4 flex-none text-slate-400" />
      </button>

      {open && createPortal(
        <div className="fixed inset-0 z-[130] flex items-end justify-center sm:items-center sm:p-4">
          <div className="absolute inset-0 bg-black/70 animate-fade-in" onClick={() => setOpen(false)} />
          <div className="relative flex max-h-[85vh] w-full max-w-lg animate-scale-in flex-col rounded-t-2xl border border-white/10 bg-[#141419] sm:rounded-2xl">
            <div className="flex items-center justify-between border-b border-white/10 px-4 py-3">
              <h3 className="text-base font-semibold text-slate-100">{titulo}</h3>
              <button onClick={() => setOpen(false)} className="link-quiet -mr-1 p-1"><Icon name="x" className="h-5 w-5" /></button>
            </div>
            <div className="min-h-0 flex-1 space-y-2 overflow-auto p-3">
              {options.length === 0 && <p className="px-2 py-4 text-sm text-slate-500">Sem opções.</p>}
              {options.map((o) => {
                const on = String(o.value) === String(value);
                return (
                  <button
                    key={String(o.value)}
                    type="button"
                    onClick={() => { onChange?.(o.value); setOpen(false); }}
                    className={`block w-full rounded-xl border p-3 text-left transition active:scale-[0.99]
                      ${on ? 'border-brand-400/50 bg-brand-500/10' : 'border-white/10 bg-white/[0.02] hover:bg-white/[0.05]'}`}
                  >
                    <div className="mb-1 flex items-center justify-between gap-2">
                      <span className="text-[11px] font-medium uppercase tracking-wide text-slate-400">{o.label}</span>
                      {on && <Icon name="check" className="h-4 w-4 flex-none text-brand-300" />}
                    </div>
                    <p className="whitespace-pre-wrap break-words text-sm leading-snug text-slate-100">{o.texto}</p>
                  </button>
                );
              })}
            </div>
          </div>
        </div>,
        document.body
      )}
    </>
  );
}

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
