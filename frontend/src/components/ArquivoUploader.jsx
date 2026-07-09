import { useRef, useState } from 'react';
import { uploadArquivo } from '../lib/upload';
import { useToast } from '../context/ToastContext';
import { Spinner } from './ui';
import { Icon } from './Icon';

// Botão/zona de upload. Sobe um ou mais arquivos em sequência,
// atribuindo ordem a partir do total já existente.
export function ArquivoUploader({ demandaId, ordemInicial, horariosSugeridos = [], onEnviado }) {
  const inputRef = useRef(null);
  const toast = useToast();
  const [fila, setFila] = useState([]); // {nome, progresso, erro}
  const [ocupado, setOcupado] = useState(false);

  async function onFiles(e) {
    const files = Array.from(e.target.files || []);
    e.target.value = '';
    if (!files.length) return;

    setOcupado(true);
    let ordem = ordemInicial;
    for (const file of files) {
      const idx = fila.length;
      setFila((f) => [...f, { nome: file.name, progresso: 0, erro: null }]);
      try {
        const horario = horariosSugeridos[ordem] || null;
        const arquivo = await uploadArquivo({
          demandaId,
          file,
          ordem,
          horario,
          onProgress: (p) =>
            setFila((f) => f.map((x, i) => (i === idx ? { ...x, progresso: p } : x))),
        });
        setFila((f) => f.map((x, i) => (i === idx ? { ...x, progresso: 100 } : x)));
        onEnviado?.(arquivo);
        ordem += 1;
      } catch (err) {
        setFila((f) => f.map((x, i) => (i === idx ? { ...x, erro: err.message } : x)));
        toast.erro(`${file.name}: ${err.message}`);
      }
    }
    setOcupado(false);
    setTimeout(() => setFila([]), 1500);
  }

  return (
    <div>
      <input
        ref={inputRef}
        type="file"
        accept="image/*,video/*"
        multiple
        className="hidden"
        onChange={onFiles}
      />
      <button
        onClick={() => inputRef.current?.click()}
        disabled={ocupado}
        className="animate-breathe flex w-full flex-col items-center justify-center gap-2 rounded-2xl border-2 border-dashed border-white/10 bg-white/[0.015] px-6 py-8 text-center transition hover:border-brand-400/40 hover:bg-brand-500/[0.04] disabled:opacity-60"
      >
        <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-brand-500/10 text-brand-300">
          {ocupado ? <Spinner className="h-5 w-5" /> : <Icon name="upload" className="h-5 w-5" />}
        </span>
        <span className="text-sm font-medium text-slate-200">
          {ocupado ? 'Enviando…' : 'Enviar mídias'}
        </span>
        <span className="text-xs text-slate-500">Imagens ou vídeos · múltiplos arquivos</span>
      </button>

      {fila.length > 0 && (
        <div className="mt-3 space-y-2">
          {fila.map((f, i) => (
            <div key={i} className="rounded-lg border border-white/5 bg-ink-900/60 px-3 py-2">
              <div className="flex items-center justify-between text-xs">
                <span className="truncate text-slate-300">{f.nome}</span>
                <span className={f.erro ? 'text-rose-400' : 'text-slate-500'}>
                  {f.erro ? 'erro' : `${f.progresso}%`}
                </span>
              </div>
              {!f.erro && (
                <div className="mt-1.5 h-1 overflow-hidden rounded-full bg-white/5">
                  <div
                    className="h-full rounded-full bg-brand-500 transition-all"
                    style={{ width: `${f.progresso}%` }}
                  />
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
