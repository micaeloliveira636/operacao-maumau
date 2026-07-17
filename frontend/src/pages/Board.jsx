import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useFetch } from '../lib/useFetch';
import { api } from '../lib/api';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import { BOARD_COLUNAS, CATEGORIAS, STATUS_CONCLUIDAS } from '../lib/constants';
import { LoadingScreen, EmptyState, Select, ConfirmDialog, StatusBadge, CategoriaTag } from '../components/ui';
import { DemandaCard } from '../components/DemandaCard';
import { formatarData } from '../lib/format';
import { Icon } from '../components/Icon';

// Sub-grupos da aba "Concluídas": já agendado com mídia vs concluído.
const GRUPOS_CONCLUIDAS = [
  { key: 'agendado', titulo: 'Agendado (com mídia)', status: ['agendado'] },
  { key: 'concluido', titulo: 'Concluído', status: ['concluido'] },
];

// Linha compacta da visão em lista (estilo ClickUp).
function DemandaRow({ demanda, podeExcluir, onExcluir, excluindo }) {
  const horarios = demanda.horarios || [];
  const campanhas = demanda.campanhasDestino || [];
  return (
    <Link
      to={`/demandas/${demanda.id}`}
      className="group flex items-center gap-3 border-b border-white/[0.05] px-3 py-2.5 transition hover:bg-white/[0.025]"
    >
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium text-slate-100">{demanda.titulo}</p>
        <div className="mt-1 flex flex-wrap items-center gap-x-2.5 gap-y-1 text-[11px] text-slate-500">
          <CategoriaTag categoria={demanda.categoria} />
          <span className="inline-flex items-center gap-1">
            <Icon name="calendar" className="h-3.5 w-3.5" /> {formatarData(demanda.dataAlvo)}
          </span>
          {horarios.length > 0 && (
            <span className="inline-flex items-center gap-1">
              <Icon name="clock" className="h-3.5 w-3.5" /> {horarios.length}
            </span>
          )}
          {campanhas.map((c) => (
            <span key={c} className="rounded bg-brand-500/10 px-1.5 py-0.5 text-[10px] font-medium text-brand-200">{c}</span>
          ))}
        </div>
      </div>
      <StatusBadge status={demanda.status} />
      {podeExcluir && (
        <button
          type="button"
          disabled={excluindo}
          onClick={(e) => { e.preventDefault(); e.stopPropagation(); onExcluir?.(demanda); }}
          title="Excluir demanda"
          className="rounded-lg border border-white/10 bg-ink-900/80 p-1.5 text-slate-400 transition hover:border-rose-500/40 hover:bg-rose-500/15 hover:text-rose-300 disabled:opacity-50"
        >
          <Icon name="trash" className="h-4 w-4" />
        </button>
      )}
    </Link>
  );
}

export default function Board() {
  const { data, carregando, setData } = useFetch('/demandas', []);
  const { isAdmin } = useAuth();
  const toast = useToast();
  const [excluindo, setExcluindo] = useState(null);
  const [confirmar, setConfirmar] = useState(null); // demanda aguardando confirmação
  const [busca, setBusca] = useState('');
  const [categoria, setCategoria] = useState('');

  async function excluir(demanda) {
    setExcluindo(demanda.id);
    try {
      const r = await api.del(`/demandas/${demanda.id}`);
      setData((d) => ({ ...d, demandas: (d?.demandas || []).filter((x) => x.id !== demanda.id) }));
      toast.sucesso(r?.acoesRemovidas ? `Excluída · ${r.acoesRemovidas} envio(s) removido(s) do SendFlow` : 'Demanda excluída');
      setConfirmar(null);
    } catch (err) {
      toast.erro(err.message || 'Falha ao excluir');
    } finally {
      setExcluindo(null);
    }
  }
  // no mobile começa em lista (kanban horizontal é ruim de usar no dedo)
  const [modo, setModo] = useState(() =>
    typeof window !== 'undefined' && window.innerWidth < 768 ? 'lista' : 'board'
  );

  const demandas = useMemo(() => {
    let arr = data?.demandas || [];
    if (categoria) arr = arr.filter((d) => d.categoria === categoria);
    if (busca.trim()) {
      const q = busca.toLowerCase();
      arr = arr.filter((d) => d.titulo.toLowerCase().includes(q));
    }
    return arr;
  }, [data, categoria, busca]);

  // Ativas = ainda precisam de atenção; Concluídas = já agendadas c/ mídia + concluídas.
  // Ativas mostram SÓ hoje e dias futuros — nunca dias que já passaram.
  const hojeISO = new Date().toLocaleDateString('en-CA'); // YYYY-MM-DD local
  const concluidas = demandas.filter((d) => STATUS_CONCLUIDAS.includes(d.status));
  const ativas = demandas.filter(
    (d) => !STATUS_CONCLUIDAS.includes(d.status) && String(d.dataAlvo).slice(0, 10) >= hojeISO
  );
  const emConcluidas = modo === 'concluidas';
  const visiveis = emConcluidas ? concluidas : ativas;

  if (carregando) return <LoadingScreen label="Carregando board" />;

  return (
    <div className="page max-w-7xl animate-fade-up">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="page-title">Board</h1>
          <p className="page-sub">{visiveis.length} demanda(s){emConcluidas ? ' concluída(s)' : ' ativa(s)'}</p>
        </div>
        <div className="inline-flex rounded-xl border border-white/10 bg-white/[0.02] p-1">
          {[
            { m: 'board', label: 'Board' },
            { m: 'lista', label: 'Lista' },
            { m: 'concluidas', label: `Concluídas${concluidas.length ? ` (${concluidas.length})` : ''}` },
          ].map(({ m, label }) => (
            <button
              key={m}
              onClick={() => setModo(m)}
              className={`rounded-lg px-3 py-1.5 text-xs font-medium transition ${
                modo === m ? 'bg-brand-500/20 text-white' : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              {label}
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
        <Select
          value={categoria}
          onChange={setCategoria}
          placeholder="Todas categorias"
          className="min-w-[180px] flex-1 sm:w-56 sm:flex-none"
          options={[{ value: '', label: 'Todas categorias' }, ...CATEGORIAS.map((c) => ({ value: c.value, label: c.label }))]}
        />
      </div>

      {visiveis.length === 0 ? (
        <EmptyState icon="board" titulo={emConcluidas ? 'Nada concluído ainda' : 'Nenhuma demanda ativa'}
          descricao={emConcluidas ? 'O que você agendar com mídia / concluir aparece aqui.' : 'Ajuste os filtros ou crie uma nova demanda.'} />
      ) : modo === 'board' ? (
        <div className="-mx-4 overflow-x-auto px-4 pb-2 sm:mx-0 sm:px-0">
          <div className="flex min-w-max gap-4 sm:grid sm:min-w-0 sm:grid-cols-2 lg:grid-cols-5">
            {BOARD_COLUNAS.map((col) => {
              const itens = ativas.filter((d) => col.status.includes(d.status));
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
                      <DemandaCard key={d.id} demanda={d} compact index={i}
                        podeExcluir={isAdmin} onExcluir={setConfirmar} excluindo={excluindo === d.id} />
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
        /* Lista agrupada por status (estilo ClickUp) — ativas OU concluídas */
        <div className="space-y-5">
          {(emConcluidas ? GRUPOS_CONCLUIDAS : BOARD_COLUNAS).map((col) => {
            const itens = visiveis.filter((d) => col.status.includes(d.status));
            if (itens.length === 0) return null;
            return (
              <div key={col.key}>
                <div className="mb-1 flex items-center gap-2 px-1">
                  <h3 className="text-xs font-semibold uppercase tracking-wide text-slate-300">{col.titulo}</h3>
                  <span className="rounded-full bg-white/[0.05] px-2 py-0.5 text-[11px] text-slate-400">{itens.length}</span>
                </div>
                <div className="overflow-hidden rounded-xl border border-white/[0.06] bg-white/[0.015]">
                  {itens.map((d) => (
                    <DemandaRow key={d.id} demanda={d}
                      podeExcluir={isAdmin} onExcluir={setConfirmar} excluindo={excluindo === d.id} />
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      )}

      <ConfirmDialog
        open={!!confirmar}
        titulo="Excluir demanda"
        mensagem={confirmar ? `Excluir "${confirmar.titulo}"?\nIsso também remove os agendamentos dela no SendFlow.` : ''}
        confirmLabel="Excluir"
        perigo
        ocupado={!!excluindo}
        onConfirmar={() => confirmar && excluir(confirmar)}
        onCancelar={() => setConfirmar(null)}
      />
    </div>
  );
}
