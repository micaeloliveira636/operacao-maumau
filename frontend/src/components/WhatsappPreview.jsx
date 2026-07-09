// Renderiza um texto no estilo de balão do WhatsApp,
// interpretando o negrito (*texto*) usado nas campanhas.
function formatar(texto) {
  const linhas = String(texto).split('\n');
  return linhas.map((linha, i) => {
    const partes = linha.split(/(\*[^*]+\*)/g).filter(Boolean);
    return (
      <span key={i}>
        {partes.map((p, j) =>
          p.startsWith('*') && p.endsWith('*') && p.length > 2 ? (
            <strong key={j} className="font-semibold text-white">{p.slice(1, -1)}</strong>
          ) : (
            <span key={j}>{p}</span>
          )
        )}
        {i < linhas.length - 1 && <br />}
      </span>
    );
  });
}

export function WhatsappPreview({ texto }) {
  const hora = new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
  return (
    <div
      className="rounded-xl p-3"
      style={{
        backgroundImage:
          'linear-gradient(rgba(10,10,14,0.4),rgba(10,10,14,0.4)), repeating-linear-gradient(45deg,#0c1410,#0c1410 8px,#0e1712 8px,#0e1712 16px)',
      }}
    >
      <div className="relative max-w-[85%] rounded-lg rounded-tl-none bg-[#005c4b] px-3 py-2 text-sm leading-relaxed text-[#e9edef] shadow">
        <div className="whitespace-pre-wrap break-words">{formatar(texto)}</div>
        <div className="mt-1 flex items-center justify-end gap-1 text-[10px] text-[#e9edef]/60">
          {hora}
          <svg viewBox="0 0 16 11" className="h-3 w-4 fill-current text-[#53bdeb]">
            <path d="M11.07.65a.5.5 0 0 0-.7.02L5.3 6.03 3.4 4.1a.5.5 0 1 0-.72.7l2.26 2.3a.5.5 0 0 0 .72 0l5.4-5.75a.5.5 0 0 0-.02-.7Z" />
            <path d="M15.07.65a.5.5 0 0 0-.7.02L9.3 6.03l-.4-.4a.5.5 0 0 0-.72.7l.76.78a.5.5 0 0 0 .72 0l5.4-5.75a.5.5 0 0 0-.02-.7Z" />
          </svg>
        </div>
      </div>
    </div>
  );
}
