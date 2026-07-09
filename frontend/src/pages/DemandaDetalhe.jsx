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
      toast.sucesso(`Status: ${STATUS[novoStatus]?.label || novoStatus}`);
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
    <div className="mx-auto max-w-4xl space-y-6 animate-fade-in">
      <button onClick={() => navigate(-1)} className="link-quiet inline-flex items-center gap-1.5 text-sm">
        <Icon name="arrowLeft" className="h-4 w-4" /> Voltar
      </button>

      {/* Cabeçalho */}
      <div className="card p-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <StatusBadge status={demanda.status} />
              <CategoriaTag categoria={demanda.categoria} className="px-2 py-1" />
              {demanda.prioridade && demanda.prioridade !== 'normal' && (
                <PrioridadeTag prioridade={demanda.prioridade} className="px-2 py-1" />
              )}
            </div>
            <h1 className="mt-3 text-xl font-semibold text-white sm:text-2xl">{demanda.titulo}</h1>
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
        onAgendarPendente={() => mudarStatus('agendamento_pendente')}
        onGerarPayload={gerarPayload}
        onAgendado={() => mudarStatus('agendado')}
        onErro={() => mudarStatus('erro_agendamento')}
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
            {arquivos.map((arq) => (
              <ArquivoCard
                key={arq.id}
                arquivo={arq}
                isAdmin={isAdmin}
                podeDeletar={podeEditar}
                statusDemanda={demanda.status}
                onAprovar={() => moderarArquivo(arq.id, 'aprovar')}
                onRejeitar={() => moderarArquivo(arq.id, 'rejeitar')}
                onDeletar={() => deletarArquivo(arq.id)}
              />
            ))}
          </div>
        )}
      </div>

      {/* Payload de agendamento */}
      {payload && (
        <div className="card p-5">
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
    </div>
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
  demanda, isAdmin, acao, arquivos, arquivosAprovados,
  onEnviar, onReabrir, onAprovar, onRejeitar, onAgendarPendente,
  onGerarPayload, onAgendado, onErro, onConcluir,
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

  if (st === 'aprovado' && isAdmin) {
    btns.push(
      <button key="payload" onClick={onGerarPayload} disabled={acao} className="btn-primary">
        <Icon name="sparkle" className="h-4 w-4" /> Gerar payload de agendamento
      </button>,
      <button key="pendente" onClick={onAgendarPendente} disabled={acao} className="btn-ghost">
        Marcar agendamento pendente
      </button>
    );
  }

  if (st === 'agendamento_pendente' && isAdmin) {
    btns.push(
      <button key="payload2" onClick={onGerarPayload} disabled={acao} className="btn-ghost">
        <Icon name="sparkle" className="h-4 w-4" /> Ver payload
      </button>,
      <button key="agendado" onClick={onAgendado} disabled={acao} className="btn-success">
        <Icon name="check" className="h-4 w-4" /> Confirmar agendado
      </button>,
      <button key="erro" onClick={onErro} disabled={acao} className="btn-danger">
        Erro no agendamento
      </button>
    );
  }

  if (st === 'erro_agendamento' && isAdmin) {
    btns.push(
      <button key="retry" onClick={onAgendarPendente} disabled={acao} className="btn-primary">
        <Icon name="refresh" className="h-4 w-4" /> Tentar novamente
      </button>
    );
  }

  if (st === 'agendado' && isAdmin) {
    btns.push(
      <button key="concluir" onClick={onConcluir} disabled={acao} className="btn-success">
        <Icon name="check" className="h-4 w-4" /> Concluir
      </button>
    );
  }

  if (st === 'aprovado' && isAdmin && arquivosAprovados === 0) {
    btns.push(
      <span key="warn" className="self-center text-xs text-amber-300/80">
        Aprove ao menos um arquivo para gerar o payload.
      </span>
    );
  }

  if (btns.length === 0) return null;
  return <div className="flex flex-wrap gap-2">{btns}</div>;
}

function ArquivoCard({ arquivo, isAdmin, podeDeletar, statusDemanda, onAprovar, onRejeitar, onDeletar }) {
  const isVideo = arquivo.tipo === 'video';
  const tone =
    arquivo.status === 'aprovado'
      ? 'border-emerald-500/40'
      : arquivo.status === 'rejeitado'
      ? 'border-rose-500/40'
      : 'border-white/10';

  return (
    <div className={`group overflow-hidden rounded-xl border ${tone} bg-ink-850`}>
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
        <span className="absolute right-2 top-2 flex h-6 w-6 items-center justify-center rounded-md bg-black/60 text-white backdrop-blur">
          <Icon name={isVideo ? 'video' : 'image'} className="h-3.5 w-3.5" />
        </span>
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
