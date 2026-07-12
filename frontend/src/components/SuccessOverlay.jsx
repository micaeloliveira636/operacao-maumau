import { useEffect } from 'react';
import { createPortal } from 'react-dom';

// Check SVG desenhado progressivamente via stroke-dashoffset (checkDraw).
export function SuccessCheck({ size = 40 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 40 40" aria-hidden="true">
      <circle cx="20" cy="20" r="18" fill="none" stroke="#43A577" strokeWidth="2" opacity="0.3" />
      <path
        d="M12 20 l6 6 l10 -12"
        fill="none"
        stroke="#43A577"
        strokeWidth="2.5"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeDasharray="30"
        strokeDashoffset="30"
        style={{ animation: 'checkDraw 0.5s 0.2s ease forwards' }}
      />
    </svg>
  );
}

// Overlay escuro com check animado + anel pulsante. Some sozinho.
export function SuccessOverlay({ message, onDone, duracao = 1600 }) {
  useEffect(() => {
    const t = setTimeout(() => onDone?.(), duracao);
    return () => clearTimeout(t);
  }, [onDone, duracao]);

  // Portal para o body: escapa de ancestrais com transform (animate-fade-up),
  // que ancoravam o position:fixed e jogavam o overlay pro topo da página.
  return createPortal(
    <div
      className="fixed inset-0 z-[200] flex items-center justify-center bg-ink-950/85 backdrop-blur-sm"
      style={{ animation: 'slideOverlay 0.3s ease' }}
    >
      <div className="text-center animate-scale-in">
        <div className="relative mx-auto mb-4 h-[72px] w-[72px]">
          <span
            className="absolute inset-0 rounded-full border-2 border-emerald-500/30"
            style={{ animation: 'ringPulse 1s ease-out' }}
          />
          <SuccessCheck size={72} />
        </div>
        <p className="text-base font-semibold text-slate-100">{message}</p>
      </div>
    </div>,
    document.body
  );
}
