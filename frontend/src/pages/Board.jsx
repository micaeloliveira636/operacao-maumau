import { useMemo, useState } from 'react';
import { useFetch } from '../lib/useFetch';
import { BOARD_COLUNAS, CATEGORIAS } from '../lib/constants';
import { LoadingScreen, EmptyState } from '../components/ui';
import { DemandaCard } from '../components/DemandaCard';
import { Icon } from '../components/Icon';

export default function Board() {
  const { data, carregando } = useFetch('/demandas', []);
  const [busca, setBusca] = useState('');
  const [categoria, setCategoria] = useState('');
  const [modo, setModo] = useState('board'); // board | lista

  const demandas = useMemo(() => {
    let arr = data?.demandas || [];
    if (categoria) arr = arr.filter((d) => d.categoria === categoria);
    if (busca.trim()) {
      const q = busca.toLowerCase();
      arr = arr.filter((d) => d.titulo.toLowerCase().includes(q));
    }
    return arr;
  }, [data, categoria, busca]);

  if (carregando) return <LoadingScreen label="Carregando board" />;

  return (
    <div className="mx-auto max-w-7xl space-y-5 animate-fade-up">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold text-white sm:text-2xl">Board</h1>
          <p className="mt-1 text-sm text-slate-500">{demandas.length} demanda(s)</p>
        </div>
        <div className="inline-flex rounded-xl border border-white/10 bg-white/[0.02] p-1">
          {['board', 'lista'].map((m) => (
            <button
              key={m}
              onClick={() => setModo(m)}
              className={`rounded-lg px-3 py-1.5 text-xs font-medium capitalize transition ${
                modo === m ? 'bg-brand-500/20 text-white' : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              {m === 'board' ? 'Board' : 'Lista'}
            </button>
          ))}
        </div>
      </div>

      {/* Filtros */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative flex-1 min-w-[200px]">
          <Icon name="search" className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500" />
          <input
            value={busca}
            onChange={(e) => setBusca(e.target.value)}
            placeholder="Buscar por título…"
            className="input pl-9"
          />
        </div>
        <select value={categoria} onChange={(e) => setCategoria(e.target.value)} className="input w-auto">
          <option value="">Todas categorias</option>
          {CATEGORIAS.map((c) => (
            <option key={c.value} value={c.value}>{c.label}</option>
          ))}
        </select>
      </div>

      {demandas.length === 0 ? (
        <EmptyState icon="board" titulo="Nenhuma demanda" descricao="Ajuste os filtros ou crie uma nova demanda." />
      ) : modo === 'board' ? (
        <div className="-mx-4 overflow-x-auto px-4 pb-2 sm:mx-0 sm:px-0">
          <div className="flex min-w-max gap-4 sm:grid sm:min-w-0 sm:grid-cols-2 lg:grid-cols-5">
            {BOARD_COLUNAS.map((col) => {
              const itens = demandas.filter((d) => col.status.includes(d.status));
              return (
                <div key={col.key} className="w-72 flex-none sm:w-auto">
                  <div className="mb-3 flex items-center justify-between px-1">
                    <h3 className="text-xs font-semibold uppercase tracking-wide text-slate-400">{col.titulo}</h3>
                    <span className="rounded-full bg-white/[0.05] px-2 py-0.5 text-[11px] text-slate-400">
                      {itens.length}
                    </span>
                  </div>
                  <div className="space-y-3">
                    {itens.map((d, i) => (
                      <DemandaCard key={d.id} demanda={d} compact index={i} />
                    ))}
                    {itens.length === 0 && (
                      <div className="rounded-xl border border-dashed border-white/[0.06] py-8 text-center text-xs text-slate-600">
                        vazio
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {demandas.map((d, i) => (
            <DemandaCard key={d.id} demanda={d} index={i} />
          ))}
        </div>
      )}
    </div>
  );
}
