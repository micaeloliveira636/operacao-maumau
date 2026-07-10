import { useCallback, useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { api } from '../lib/api';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import { STATUS } from '../lib/constants';
import { formatarData } from '../lib/format';
import { StatusBadge, CategoriaTag, PrioridadeTag, LoadingScreen, EmptyState, Modal, Spinner } from '../components/ui';
import { WhatsappPreview } from '../components/WhatsappPreview';
import { ArquivoUploader } from '../components/ArquivoUploader';
import { SuccessOverlay } from '../components/SuccessOverlay';
import { Icon } from '../components/Icon';

const EDITAVEL = ['pendente', 'em_andamento', 'rejeitado'];

export default function DemandaDetalhe() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { user, isAdmin } = useAuth();
  const toast = useToast();

  const [demanda, setDemanda] = useState(null);
  const [arquivos, setArquivos] = useState([]);
  const [carregando, setCarregando] = useState(true);
  const [acao, setAcao] = useState(false);
  const [modalRejeitar, setModalRejeitar] = useState(false);
  const [motivo, setMotivo] = useState('');
  const [payload, setPayload] = useState(null);
  const [overlay, setOverlay] = useState(null); // mensagem do overlay de sucesso
  const [editArq, setEditArq] = useState(null); // arquivo sendo editado
  const [plano, setPlano] = useState(null); // preview do agendamento
  const [agendando, setAgendando] = useState(false);

  const carregar = useCallback(async () => {
    try {
      const data = await api.get(`/demandas/${id}`);
      setDemanda(data.demanda);
      setArquivos(data.arquivos || []);
    } catch (err) {
      toast.erro(err.message || 'Erro ao carregar');
      if (err.status === 404 || err.status === 403) navigate('/board');
    } finally {
      setCarregando(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  useEffect(() => {
    carregar();
  }, [carregar]);

  const podeEditar = demanda && EDITAVEL.includes(demanda.status) &&
    (isAdmin || demanda.atribuidoA === user?.id);

  async function mudarStatus(novoStatus, extra = {}) {
    setAcao(true);
    try {
      const { demanda: upd } = await api.patch(`/demandas/${id}/status`, { novoStatus, ...extra });
      setDemanda(upd);
      if (novoStatus === 'aprovado') setOverlay('Demanda aprovada');
      else if (novoStatus === 'concluido') setOverlay('Concluída');
      else toast.sucesso(`Status: ${STATUS[novoStatus]?.label || novoStatus}`);
    } catch (err) {
      toast.erro(err.message || 'Falha ao mudar status');
    } finally {
      setAcao(false);
    }
  }

  async function moderarArquivo(arquivoId, tipo) {
    try {
      const { arquivo } = await api.patch(`/arquivos/${arquivoId}/${tipo}`);
      setArquivos((a) => a.map((x) => (x.id === arquivoId ? arquivo : x)));
    } catch (err) {
      toast.erro(err.message);
    }
  }

  async function deletarArquivo(arquivoId) {
    try {
      await api.del(`/arquivos/${arquivoId}`);
      setArquivos((a) => a.filter((x) => x.id !== arquivoId));
      toast.sucesso('Arquivo removido');
    } catch (err) {
      toast.erro(err.message);
    }
  }

  async function confirmarRejeicao() {
    if (!motivo.trim()) return toast.erro('Informe o motivo');
    await mudarStatus('rejeitado', { motivoRejeicao: motivo.trim() });
    setModalRejeitar(false);
    setMotivo('');
  }

  async function gerarPayload() {
    setAcao(true);
    try {
      const data = await api.get(`/demandas/${id}/agendamento-payload`);
      setPayload(data);
    } catch (err) {
      toast.erro(err.message || 'Erro ao gerar payload');
    } finally {
      setAcao(false);
    }
  }

  async function copiarPayload() {
    try {
      await navigator.clipboard.writeText(JSON.stringify(payload, null, 2));
      toast.sucesso('Payload copiado — cole no Claude para agendar');
    } catch {
      toast.erro('Não foi possível copiar');
    }
  }

  async function salvarArquivo(patch) {
    try {
      const { arquivo } = await api.patch(`/arquivos/${editArq.id}`, patch);
      setArquivos((a) => a.map((x) => (x.id === arquivo.id ? arquivo : x)));
      setEditArq(null);
      toast.sucesso('Mídia atualizada');
    } catch (err) {
      toast.erro(err.message);
    }
  }

  async function abrirPreview() {
    setAgendando(true);
    try {
      const data = await api.get(`/demandas/${id}/agendar/preview`);
      setPlano(data);
    } catch (err) {
      toast.erro(err.message || 'Erro ao montar o plano');
    } finally {
      setAgendando(false);
    }
  }

  async function confirmarAgendamento() {
    setAgendando(true);
    try {
      const { demanda: upd, resultado } = await api.post(`/demandas/${id}/agendar`);
      setDemanda(upd);
      setPlano(null);
      if (resultado?.ok) {
        setOverlay(`${resultado.agendadas} mensagem(ns) agendada(s)`);
      } else {
        toast.erro(`Falhou: ${(resultado?.erros || ['erro']).slice(0, 2).join(' | ')}`);
      }
    } catch (err) {
      toast.erro(err.message || 'Erro ao agendar');
    } finally {
      setAgendando(false);
    }
  }

  async function deletarDemanda() {
    if (!confirm('Deletar esta demanda e seus arquivos?')) return;
    try {
      await api.del(`/demandas/${id}`);
      toast.sucesso('Demanda deletada');
      navigate('/board');
    } catch (err) {
      toast.erro(err.message);
    }
  }

  if (carregando) return <LoadingScreen label="Carregando demanda" />;
  if (!demanda) return null;

  const totalHorarios = (demanda.horarios || []).length;
  const proximaOrdem = arquivos.length;
  const arquivosAprovados = arquivos.filter((a) => a.status === 'aprovado').length;

  return (
    <div className="page max-w-4xl animate-fade-up">
      {overlay && <SuccessOverlay message={overlay} onDone={() => setOverlay(null)} />}
      <button onClick={() => navigate(-1)} className="link-quiet inline-flex items-center gap-1.5 text-sm">
        <Icon name="arrowLeft" className="h-4 w-4" /> Voltar
      </button>

      {/* Cabeçalho */}
      <div className="card card-pad">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <StatusBadge status={demanda.status} />
              <CategoriaTag categoria={demanda.categoria} className="px-2 py-1" />
              {demanda.prioridade && demanda.prioridade !== 'normal' && (
                <PrioridadeTag prioridade={demanda.prioridade} className="px-2 py-1" />
              )}
            </div>
            <h1 className="mt-3 page-title">{demanda.titulo}</h1>
            {demanda.descricao && <p className="mt-2 text-sm text-slate-400">{demanda.descricao}</p>}
          </div>
          {isAdmin && EDITAVEL.includes(demanda.status) && (
            <button onClick={deletarDemanda} className="btn-danger px-3">
              <Icon name="trash" className="h-4 w-4" />
            </button>
          )}
        </div>

        <div className="mt-4 grid grid-cols-2 gap-3 border-t border-white/[0.06] pt-4 text-sm sm:grid-cols-4">
          <Info icon="calendar" label="Data alvo" valor={formatarData(demanda.dataAlvo)} />
          <Info icon="clock" label="Horários" valor={`${totalHorarios}`} />
          <Info icon="send" label="Velocidade" valor={demanda.velocidade} />
          <Info icon="users" label="Menção" valor={demanda.mencionar ? 'Sim' : 'Não'} />
        </div>

        {(demanda.campanhasDestino || []).length > 0 && (
          <div className="mt-4 flex flex-wrap gap-1.5">
            {demanda.campanhasDestino.map((c) => (
              <span key={c} className="rounded-lg bg-brand-500/10 px-2 py-1 text-xs font-medium text-brand-200">
                {c}
              </span>
            ))}
          </div>
        )}

        {demanda.status === 'rejeitado' && demanda.motivoRejeicao && (
          <div className="mt-4 rounded-xl border border-rose-500/20 bg-rose-500/[0.06] px-4 py-3">
            <p className="text-xs font-semibold uppercase tracking-wide text-rose-300">Motivo da rejeição</p>
            <p className="mt-1 text-sm text-rose-100/90">{demanda.motivoRejeicao}</p>
          </div>
        )}
      </div>

      {/* Barra de ações por status */}
      <ActionBar
        demanda={demanda}
        isAdmin={isAdmin}
        acao={acao}
        arquivos={arquivos}
        arquivosAprovados={arquivosAprovados}
        onEnviar={() => mudarStatus('enviado')}
        onReabrir={() => mudarStatus('em_andamento')}
        onAprovar={() => mudarStatus('aprovado')}
        onRejeitar={() => setModalRejeitar(true)}
        onAgendar={abrirPreview}
        agendando={agendando}
        onGerarPayload={gerarPayload}
        onConcluir={() => mudarStatus('concluido')}
      />

      {/* Legenda padrão — preview estilo WhatsApp */}
      {demanda.legenda && (
        <div className="panel p-4">
          <p className="mb-2 text-xs font-medium uppercase tracking-wide text-slate-500">Legenda (preview WhatsApp)</p>
          <WhatsappPreview texto={demanda.legenda} />
        </div>
      )}

      {/* Arquivos */}
      <div>
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-sm font-semibold text-slate-200">
            Mídias <span className="text-slate-500">({arquivos.length}/{totalHorarios})</span>
          </h2>
        </div>

        {podeEditar && (
          <div className="mb-4">
            <ArquivoUploader
              demandaId={demanda.id}
              ordemInicial={proximaOrdem}
              horariosSugeridos={demanda.horarios}
              onEnviado={(arq) => setArquivos((a) => [...a, arq])}
            />
          </div>
        )}

        {arquivos.length === 0 ? (
          <EmptyState icon="image" titulo="Nenhuma mídia" descricao="As mídias enviadas aparecerão aqui." />
        ) : (
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            {arquivos.map((arq, i) => (
              <ArquivoCard
                key={arq.id}
                index={i}
                arquivo={arq}
                isAdmin={isAdmin}
                podeDeletar={podeEditar}
                podeEditarMidia={
                  (isAdmin && !['agendado', 'concluido'].includes(demanda.status)) || podeEditar
                }
                statusDemanda={demanda.status}
                onAprovar={() => moderarArquivo(arq.id, 'aprovar')}
                onRejeitar={() => moderarArquivo(arq.id, 'rejeitar')}
                onDeletar={() => deletarArquivo(arq.id)}
                onEditar={() => setEditArq(arq)}
              />
            ))}
          </div>
        )}
      </div>

      {/* Payload de agendamento */}
      {payload && (
        <div className="card card-pad">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-sm font-semibold text-slate-200">Payload de agendamento</h2>
            <button onClick={copiarPayload} className="btn-ghost px-3 py-1.5 text-xs">
              <Icon name="clipboard" className="h-3.5 w-3.5" /> Copiar
            </button>
          </div>
          <p className="mb-3 text-xs text-slate-500">
            Cole este JSON no Claude para agendar no SendFlow.
          </p>
          <pre className="max-h-80 overflow-auto rounded-xl border border-white/5 bg-ink-950/80 p-4 text-xs leading-relaxed text-slate-300">
            {JSON.stringify(payload, null, 2)}
          </pre>
        </div>
      )}

      {/* Modal de rejeição */}
      <Modal open={modalRejeitar} onClose={() => setModalRejeitar(false)} titulo="Rejeitar demanda">
        <p className="mb-3 text-sm text-slate-400">O operador receberá o motivo para correção.</p>
        <textarea
          className="input min-h-[100px] resize-y"
          value={motivo}
          onChange={(e) => setMotivo(e.target.value)}
          placeholder="Descreva o que precisa ser ajustado…"
          autoFocus
        />
        <div className="mt-4 flex justify-end gap-2">
          <button onClick={() => setModalRejeitar(false)} className="btn-ghost">Cancelar</button>
          <button onClick={confirmarRejeicao} disabled={acao} className="btn-danger">
            {acao ? <Spinner className="h-4 w-4" /> : <Icon name="x" className="h-4 w-4" />} Rejeitar
          </button>
        </div>
      </Modal>

      {/* Modal: editar mídia (legenda + links + horário) */}
      <EditarMidiaModal
        arquivo={editArq}
        legendaDemanda={demanda.legenda}
        onClose={() => setEditArq(null)}
        onSalvar={salvarArquivo}
      />

      {/* Modal: preview do plano de agendamento */}
      <PreviewAgendamentoModal
        plano={plano}
        agendando={agendando}
        onClose={() => setPlano(null)}
        onConfirmar={confirmarAgendamento}
      />
    </div>
  );
}

function EditarMidiaModal({ arquivo, legendaDemanda, onClose, onSalvar }) {
  const [form, setForm] = useState(null);
  useEffect(() => {
    if (arquivo)
      setForm({
        legendaCustom: arquivo.legendaCustom || '',
        linkPrincipal: arquivo.linkPrincipal || '',
        linkDois: arquivo.linkDois || '',
        horario: arquivo.horario || '',
      });
  }, [arquivo]);

  if (!arquivo || !form) return null;
  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }));

  return (
    <Modal open={!!arquivo} onClose={onClose} titulo={`Mídia #${arquivo.ordem + 1}`} maxWidth="max-w-lg">
      <div className="space-y-4">
        <div>
          <label className="label">Horário</label>
          <input type="time" className="input" value={form.horario} onChange={(e) => set('horario', e.target.value)} />
        </div>
        <div>
          <label className="label">Legenda desta mídia</label>
          <textarea
            className="input min-h-[100px] resize-y"
            value={form.legendaCustom}
            onChange={(e) => set('legendaCustom', e.target.value)}
            placeholder={legendaDemanda ? `Padrão: ${legendaDemanda.slice(0, 60)}…` : 'Legenda específica (use {link})'}
          />
          <p className="mt-1 text-[11px] text-slate-500">Vazio = usa a legenda padrão da demanda. Use <code>{'{link}'}</code> onde o link entra.</p>
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <label className="label">Link principal</label>
            <input className="input" value={form.linkPrincipal} onChange={(e) => set('linkPrincipal', e.target.value)} placeholder="https://…" />
          </div>
          <div>
            <label className="label">Link 2 (ATIVOS 1)</label>
            <input className="input" value={form.linkDois} onChange={(e) => set('linkDois', e.target.value)} placeholder="https://…" />
          </div>
        </div>
        <div className="flex justify-end gap-2">
          <button onClick={onClose} className="btn-ghost">Cancelar</button>
          <button onClick={() => onSalvar(form)} className="btn-primary">
            <Icon name="check" className="h-4 w-4" /> Salvar
          </button>
        </div>
      </div>
    </Modal>
  );
}

function PreviewAgendamentoModal({ plano, agendando, onClose, onConfirmar }) {
  if (!plano) return null;
  const { itens = [], avisos = [], podeAgendar } = plano;
  return (
    <Modal open={!!plano} onClose={onClose} titulo="Confirmar agendamento" maxWidth="max-w-2xl">
      <p className="mb-3 text-sm text-slate-400">
        O painel vai disparar <strong className="text-slate-200">{itens.length}</strong> mensagem(ns) no SendFlow
        (uma chamada por linha), buscando os accountIds na hora.
      </p>

      {avisos.length > 0 && (
        <div className="mb-3 rounded-lg border border-amber-500/20 bg-amber-500/[0.06] px-3 py-2 text-xs text-amber-200/90">
          {avisos.map((a, i) => (
            <div key={i}>• {a}</div>
          ))}
        </div>
      )}

      <div className="max-h-72 overflow-auto rounded-xl border border-white/5">
        <table className="w-full text-left text-xs">
          <thead className="sticky top-0 bg-ink-800 text-slate-400">
            <tr>
              <th className="px-2 py-2 font-medium">Horário</th>
              <th className="px-2 py-2 font-medium">Campanha</th>
              <th className="px-2 py-2 font-medium">Vel.</th>
              <th className="px-2 py-2 font-medium">Menção</th>
              <th className="px-2 py-2 font-medium">Var.</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-white/[0.04]">
            {itens.map((it, i) => (
              <tr key={i} className="text-slate-300">
                <td className="px-2 py-1.5 tabular-nums">{it.horario}</td>
                <td className="px-2 py-1.5">{it.campanha}</td>
                <td className="px-2 py-1.5">{it.shippingSpeed}</td>
                <td className="px-2 py-1.5">{it.mentionAll ? 'sim' : 'não'}</td>
                <td className="px-2 py-1.5">{it.variante === 'link2' ? 'link 2' : '—'}</td>
              </tr>
            ))}
            {itens.length === 0 && (
              <tr>
                <td colSpan={5} className="px-2 py-6 text-center text-slate-500">Nada a agendar.</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <div className="mt-4 flex justify-end gap-2">
        <button onClick={onClose} className="btn-ghost">Cancelar</button>
        <button onClick={onConfirmar} disabled={agendando || !podeAgendar || itens.length === 0} className="btn-primary">
          {agendando ? <Spinner className="h-4 w-4" /> : <Icon name="send" className="h-4 w-4" />}
          Disparar {itens.length} envio(s)
        </button>
      </div>
    </Modal>
  );
}

function Info({ icon, label, valor }) {
  return (
    <div>
      <p className="flex items-center gap-1.5 text-xs text-slate-500">
        <Icon name={icon} className="h-3.5 w-3.5" /> {label}
      </p>
      <p className="mt-0.5 font-medium capitalize text-slate-200">{valor}</p>
    </div>
  );
}

function ActionBar({
  demanda, isAdmin, acao, arquivos, arquivosAprovados, agendando,
  onEnviar, onAprovar, onRejeitar, onAgendar, onGerarPayload, onConcluir,
}) {
  const st = demanda.status;
  const totalHorarios = (demanda.horarios || []).length;
  const btns = [];

  if (st === 'em_andamento' || st === 'rejeitado') {
    const pronto = arquivos.length === totalHorarios && arquivos.length > 0;
    btns.push(
      <button key="enviar" onClick={onEnviar} disabled={acao || !pronto} className="btn-primary">
        <Icon name="send" className="h-4 w-4" /> Enviar para aprovação
      </button>
    );
    if (!pronto)
      btns.push(
        <span key="hint" className="self-center text-xs text-slate-500">
          {arquivos.length}/{totalHorarios} mídias
        </span>
      );
  }

  if (st === 'enviado' && isAdmin) {
    btns.push(
      <button key="aprovar" onClick={onAprovar} disabled={acao} className="btn-success">
        <Icon name="check" className="h-4 w-4" /> Aprovar demanda
      </button>,
      <button key="rejeitar" onClick={onRejeitar} disabled={acao} className="btn-danger">
        <Icon name="x" className="h-4 w-4" /> Rejeitar
      </button>
    );
  }
  if (st === 'enviado' && !isAdmin) {
    btns.push(
      <span key="aguardando" className="self-center text-sm text-slate-400">
        Aguardando aprovação do admin.
      </span>
    );
  }

  // Agendar direto no SendFlow (aprovado / pendente / erro)
  if (['aprovado', 'agendamento_pendente', 'erro_agendamento'].includes(st) && isAdmin) {
    const podeAgendar = arquivosAprovados > 0;
    btns.push(
      <button key="agendar" onClick={onAgendar} disabled={acao || agendando || !podeAgendar} className="btn-primary">
        {agendando ? <Spinner className="h-4 w-4" /> : <Icon name="send" className="h-4 w-4" />}
        {st === 'erro_agendamento' ? 'Tentar agendar novamente' : 'Agendar no SendFlow'}
      </button>,
      <button key="payload" onClick={onGerarPayload} disabled={acao} className="btn-ghost">
        <Icon name="sparkle" className="h-4 w-4" /> Payload p/ Claude
      </button>
    );
    if (!podeAgendar)
      btns.push(
        <span key="warn" className="self-center text-xs text-amber-300/80">
          Aprove ao menos uma mídia para agendar.
        </span>
      );
  }

  if (st === 'agendado' && isAdmin) {
    btns.push(
      <button key="concluir" onClick={onConcluir} disabled={acao} className="btn-success">
        <Icon name="check" className="h-4 w-4" /> Concluir
      </button>
    );
  }

  if (btns.length === 0) return null;
  return <div className="flex flex-wrap gap-2">{btns}</div>;
}

function ArquivoCard({ arquivo, isAdmin, podeDeletar, podeEditarMidia, statusDemanda, onAprovar, onRejeitar, onDeletar, onEditar, index = 0 }) {
  const isVideo = arquivo.tipo === 'video';
  const temLink = arquivo.linkPrincipal || arquivo.linkDois;
  const tone =
    arquivo.status === 'aprovado'
      ? 'border-emerald-500/40'
      : arquivo.status === 'rejeitado'
      ? 'border-rose-500/40'
      : 'border-white/10';

  return (
    <div
      style={{ animationDelay: `${Math.min(index, 12) * 0.05}s` }}
      className={`group animate-card overflow-hidden rounded-xl border ${tone} bg-ink-850`}
    >
      <div className="relative aspect-[4/5] bg-ink-950">
        {isVideo ? (
          <video src={arquivo.cloudinaryUrl} className="h-full w-full object-cover" muted playsInline controls preload="metadata" />
        ) : (
          <img src={arquivo.cloudinaryUrl} alt="" className="h-full w-full object-cover" loading="lazy" />
        )}
        <div className="absolute left-2 top-2 flex items-center gap-1">
          <span className="rounded-md bg-black/60 px-1.5 py-0.5 text-[10px] font-medium text-white backdrop-blur">
            #{arquivo.ordem + 1}{arquivo.horario ? ` · ${arquivo.horario}` : ''}
          </span>
        </div>
        <div className="absolute right-2 top-2 flex items-center gap-1">
          {temLink && (
            <span className="flex h-6 items-center rounded-md bg-brand-500/80 px-1.5 text-[10px] font-medium text-white backdrop-blur" title="Link definido">
              link{arquivo.linkDois ? ' ×2' : ''}
            </span>
          )}
          <span className="flex h-6 w-6 items-center justify-center rounded-md bg-black/60 text-white backdrop-blur">
            <Icon name={isVideo ? 'video' : 'image'} className="h-3.5 w-3.5" />
          </span>
        </div>
      </div>

      <div className="flex items-center justify-between gap-1 p-2">
        <span
          className={`text-[11px] font-medium capitalize ${
            arquivo.status === 'aprovado'
              ? 'text-emerald-300'
              : arquivo.status === 'rejeitado'
              ? 'text-rose-300'
              : 'text-slate-400'
          }`}
        >
          {arquivo.status}
        </span>
        <div className="flex items-center gap-1">
          {podeEditarMidia && (
            <button onClick={onEditar} title="Editar legenda/links" className="rounded-md p-1.5 text-slate-400 hover:bg-white/5 hover:text-brand-300">
              <Icon name="edit" className="h-4 w-4" />
            </button>
          )}
          {isAdmin && statusDemanda === 'enviado' && (
            <>
              <button onClick={onAprovar} title="Aprovar" className="rounded-md p-1.5 text-emerald-300 hover:bg-emerald-500/10">
                <Icon name="check" className="h-4 w-4" />
              </button>
              <button onClick={onRejeitar} title="Rejeitar" className="rounded-md p-1.5 text-rose-300 hover:bg-rose-500/10">
                <Icon name="x" className="h-4 w-4" />
              </button>
            </>
          )}
          {podeDeletar && (
            <button onClick={onDeletar} title="Remover" className="rounded-md p-1.5 text-slate-400 hover:bg-white/5 hover:text-rose-300">
              <Icon name="trash" className="h-4 w-4" />
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
