// Ripple global: em qualquer clique num elemento .btn, cria uma onda
// circular no ponto do clique e remove ao terminar. Portado do RippleBtn
// do protótipo, mas via delegação (funciona em todos os botões sem alterar cada um).
export function instalarRipple() {
  if (typeof document === 'undefined') return;

  document.addEventListener(
    'pointerdown',
    (e) => {
      const alvo = e.target.closest?.('.btn');
      if (!alvo || alvo.disabled) return;

      const rect = alvo.getBoundingClientRect();
      const tamanho = Math.max(rect.width, rect.height);
      const span = document.createElement('span');
      span.className = 'ripple-ink';
      span.style.width = span.style.height = `${tamanho}px`;
      span.style.left = `${e.clientX - rect.left - tamanho / 2}px`;
      span.style.top = `${e.clientY - rect.top - tamanho / 2}px`;
      alvo.appendChild(span);
      span.addEventListener('animationend', () => span.remove());
    },
    { passive: true }
  );
}
