const crypto = require('crypto');

const CLOUD_NAME = process.env.CLOUDINARY_CLOUD_NAME;
const API_KEY = process.env.CLOUDINARY_API_KEY;
const API_SECRET = process.env.CLOUDINARY_API_SECRET;

// Pasta fixa definida pelo backend — o frontend nunca escolhe o destino.
const UPLOAD_FOLDER = process.env.CLOUDINARY_FOLDER || 'maumau-media';

// Formatos permitidos no upload (validado no backend, não no cliente).
const FORMATOS_PERMITIDOS = ['jpg', 'jpeg', 'png', 'webp', 'mp4', 'mov', 'webm'];

function assertConfigured() {
  if (!CLOUD_NAME || !API_KEY || !API_SECRET) {
    throw new Error('Cloudinary não configurado (CLOUDINARY_CLOUD_NAME / API_KEY / API_SECRET)');
  }
}

/**
 * Gera a assinatura para um upload ASSINADO direto do frontend.
 * O backend controla folder, formatos e timestamp — o cliente só recebe
 * a assinatura e sobe o binário direto para o Cloudinary.
 */
// Monta a pasta fixa (controlada pelo backend): maumau/{data}/{categoria}/{demanda}
function montarFolder({ demandaId, dataAlvo, categoria }) {
  const partes = [UPLOAD_FOLDER];
  if (dataAlvo) partes.push(String(dataAlvo));
  if (categoria) partes.push(String(categoria));
  partes.push(demandaId);
  return partes.join('/');
}

function assinarUpload({ demandaId, dataAlvo, categoria }) {
  assertConfigured();

  const timestamp = Math.round(Date.now() / 1000);
  const folder = montarFolder({ demandaId, dataAlvo, categoria });

  // Parâmetros que entram na assinatura (ordem alfabética, exigido pelo Cloudinary).
  const paramsToSign = {
    folder,
    timestamp,
  };

  const toSign = Object.keys(paramsToSign)
    .sort()
    .map((k) => `${k}=${paramsToSign[k]}`)
    .join('&');

  const signature = crypto
    .createHash('sha1')
    .update(toSign + API_SECRET)
    .digest('hex');

  return {
    cloudName: CLOUD_NAME,
    apiKey: API_KEY,
    timestamp,
    folder,
    signature,
    uploadUrl: `https://api.cloudinary.com/v1_1/${CLOUD_NAME}/auto/upload`,
    formatosPermitidos: FORMATOS_PERMITIDOS,
  };
}

/**
 * Monta a URL pública pronta para o SendFlow.
 * Conforme aprendizado da operação:
 *  - NUNCA usar f_auto,q_auto (SendFlow rejeita)
 *  - imagem: entregar como .jpg
 *  - vídeo (.mov) é convertido on-the-fly trocando a extensão para .mp4
 */
function urlEntrega({ publicId, tipo }) {
  assertConfigured();
  const resource = tipo === 'video' ? 'video' : 'image';
  const ext = tipo === 'video' ? 'mp4' : 'jpg';
  return `https://res.cloudinary.com/${CLOUD_NAME}/${resource}/upload/${publicId}.${ext}`;
}

// Assinatura de upload para uma PASTA de copy (não amarrada a demanda).
// Pasta: maumau-media/copys/{folderId}
function assinarUploadCopy(folderId) {
  assertConfigured();
  const timestamp = Math.round(Date.now() / 1000);
  const folder = `${UPLOAD_FOLDER}/copys/${folderId}`;
  const toSign = `folder=${folder}&timestamp=${timestamp}`;
  const signature = crypto.createHash('sha1').update(toSign + API_SECRET).digest('hex');
  return {
    cloudName: CLOUD_NAME,
    apiKey: API_KEY,
    timestamp,
    folder,
    signature,
    uploadUrl: `https://api.cloudinary.com/v1_1/${CLOUD_NAME}/auto/upload`,
  };
}

// URL de entrega p/ mensagem de copy (inclui áudio). Áudio é resource 'video'
// no Cloudinary — mantém o formato original (mp3/ogg/m4a).
function urlEntregaCopy({ publicId, tipo, format }) {
  assertConfigured();
  if (tipo === 'image') return `https://res.cloudinary.com/${CLOUD_NAME}/image/upload/${publicId}.jpg`;
  if (tipo === 'video') return `https://res.cloudinary.com/${CLOUD_NAME}/video/upload/${publicId}.mp4`;
  // audio
  const ext = format || 'mp3';
  return `https://res.cloudinary.com/${CLOUD_NAME}/video/upload/${publicId}.${ext}`;
}

/**
 * Remove um asset do Cloudinary (usado ao deletar arquivo).
 * Chamada assinada da Admin API.
 */
async function deletarAsset({ publicId, tipo }) {
  assertConfigured();

  const timestamp = Math.round(Date.now() / 1000);
  const resource = tipo === 'video' ? 'video' : 'image';

  const toSign = `public_id=${publicId}&timestamp=${timestamp}`;
  const signature = crypto
    .createHash('sha1')
    .update(toSign + API_SECRET)
    .digest('hex');

  const body = new URLSearchParams({
    public_id: publicId,
    timestamp: String(timestamp),
    api_key: API_KEY,
    signature,
  });

  const url = `https://api.cloudinary.com/v1_1/${CLOUD_NAME}/${resource}/destroy`;

  try {
    const resp = await fetch(url, { method: 'POST', body });
    const json = await resp.json();
    return json; // { result: 'ok' | 'not found' }
  } catch (err) {
    console.error('Erro ao deletar asset do Cloudinary:', err.message);
    return { result: 'error', error: err.message };
  }
}

function validarFormato(formato) {
  return FORMATOS_PERMITIDOS.includes(String(formato).toLowerCase());
}

module.exports = {
  assinarUpload,
  assinarUploadCopy,
  montarFolder,
  urlEntrega,
  urlEntregaCopy,
  deletarAsset,
  validarFormato,
  FORMATOS_PERMITIDOS,
  UPLOAD_FOLDER,
};
