import { api } from './api';

// Faz o fluxo completo de upload assinado:
//  1. pede a assinatura ao backend
//  2. envia o binário direto pro Cloudinary
//  3. registra o arquivo no backend
export async function uploadArquivo({ demandaId, file, ordem, horario, legendaCustom, onProgress }) {
  const tipo = file.type.startsWith('video') ? 'video' : 'imagem';
  const formatoOriginal = (file.name.split('.').pop() || '').toLowerCase();

  // 1. assinatura
  const sig = await api.post('/arquivos/assinatura', { demandaId });

  if (sig.formatosPermitidos && !sig.formatosPermitidos.includes(formatoOriginal)) {
    throw new Error(`Formato .${formatoOriginal} não permitido`);
  }

  // 2. upload direto pro Cloudinary (com progresso via XHR)
  const fd = new FormData();
  fd.append('file', file);
  fd.append('api_key', sig.apiKey);
  fd.append('timestamp', String(sig.timestamp));
  fd.append('signature', sig.signature);
  fd.append('folder', sig.folder);

  const uploaded = await new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open('POST', sig.uploadUrl);
    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable && onProgress) onProgress(Math.round((e.loaded / e.total) * 100));
    };
    xhr.onload = () => {
      try {
        const res = JSON.parse(xhr.responseText);
        if (xhr.status >= 200 && xhr.status < 300) resolve(res);
        else reject(new Error(res?.error?.message || 'Falha no upload'));
      } catch {
        reject(new Error('Resposta inválida do Cloudinary'));
      }
    };
    xhr.onerror = () => reject(new Error('Erro de rede no upload'));
    xhr.send(fd);
  });

  // 3. registra no backend
  const { arquivo } = await api.post('/arquivos', {
    demandaId,
    cloudinaryPublicId: uploaded.public_id,
    tipo,
    formatoOriginal,
    ordem,
    horario: horario || null,
    legendaCustom: legendaCustom || null,
  });
  return arquivo;
}
