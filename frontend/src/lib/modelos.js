// Modelos de texto por categoria (extraídos de conversa-sendflow-maumau-media.md).
// Placeholders: {slot} = nome do slot escolhido; {link} = link (o backend troca
// por link principal / link 2 na hora de agendar).
//
// precisaSlot  -> mostra o seletor de slot no formulário
// precisaLink  -> mostra os campos de link (só entrada usa link)

export const SLOTS = [
  'FORTUNE DRAGON 🐉',
  'FORTUNE RABBIT 🐰',
  'FORTUNE TIGER',
  'FORTUNE OX',
  'FORTUNE SNAKE 🐍',
  'DOUBLE FORTUNE 🎎🏮',
  'WINGS OF IGUAZU 🦜',
];

const ENTRADA = [
  {
    id: 'ent-1830',
    label: '18h30 — Falha validada (normal)',
    precisaSlot: true,
    precisaLink: true,
    texto: `*FALHA VALIDADA✅*

Família, validamos o principal ponto de falha no sistema! - *Assistam com atenção🚨*

*SLOT: {slot}*

ESTRATÉGIA: Comece com uma bet baixa e suba após ganhos pequenos para alinhar ao padrão -Dobrou sacou !

DEPOSITE VALORES QUEBRADOS
EX: 29,41,59,77,91,133,195,281,407 ETC

Link atualizado: {link}`,
  },
  {
    id: 'ent-2130',
    label: '21h30 — Brecha validada (normal)',
    precisaSlot: true,
    precisaLink: true,
    texto: `*BRECHA VALIDADA✅*

Família, encontramos e validamos o ponto mais vulnerável que o sistema apontou! - *Aproveitem🚨*

*SLOT: {slot}*

ESTRATÉGIA: Comece com uma bet baixa e suba após ganhos pequenos para alinhar ao padrão!

DEPOSITE VALORES QUEBRADOS
EX: 29,41,59,77,91,133,195,281,407 ETC

Link atualizado: {link}`,
  },
  {
    id: 'ent-1230',
    label: '12h30 — Entrada validada (dia normal)',
    precisaSlot: true,
    precisaLink: true,
    texto: `*ENTRADA VALIDADA✅*

Família, finalizamos a validação em todas as nossas contas sobre as falhas do sistema - Aproveitem!🚨

*SLOT: {slot}*

ESTRATÉGIA: Comece com uma bet baixa e suba após ganhos pequenos para alinhar ao padrão!

DEPOSITE VALORES QUEBRADOS
EX: 29,41,59,77,91,133,195,281,407 ETC

Link atualizado: {link}`,
  },
  {
    id: 'ent-1230-sn',
    label: '12h30 — Sistema novo (quinta)',
    precisaSlot: true,
    precisaLink: true,
    texto: `*ENTRADA VALIDADA NO SISTEMA NOVO✅*

Família, finalizamos a validação em todas as nossas contas sobre as falhas do sistema - Aproveitem!🚨

*SLOT: {slot}*

ESTRATÉGIA: Comece com uma bet baixa e suba após ganhos pequenos para alinhar ao padrão!

DEPOSITE VALORES QUEBRADOS
EX: 29,41,59,77,91,133,195,281,407 ETC

Sistema novo: {link}`,
  },
  {
    id: 'ent-1830-sn',
    label: '18h30 — Sistema novo',
    precisaSlot: true,
    precisaLink: true,
    texto: `*FALHA NO SISTEMA NOVO VALIDADA✅*

Família, validamos varias linhas de falha nos testes de banco de dados do sistema novo! - *Assistam com atenção🚨*

*SLOT: {slot}*

ESTRATÉGIA: Comece com uma bet baixa e suba após ganhos pequenos para alinhar ao padrão -Dobrou sacou !

DEPOSITE VALORES QUEBRADOS
EX: 29,41,59,77,91,133,195,281,407 ETC

Sistema novo: {link}`,
  },
  {
    id: 'ent-2130-sn',
    label: '21h30 — Sistema novo',
    precisaSlot: true,
    precisaLink: true,
    texto: `*FALHA NO SISTEMA NOVO VALIDADA✅*

Família, conseguimos validar o ponto principal de falha no sistema novo! - *Aproveitem!🚨*

*SLOT: {slot}*

ESTRATÉGIA: Comece sempre com a bet baixa e após liberação de ganhos medias aumente a bet.

DEPOSITE VALORES QUEBRADOS
EX:29,37,51,63,89,111,249,311,479,617 etc

Sistema novo: {link}`,
  },
];

const PEDIDO = [
  {
    id: 'ped-13h',
    label: '13h — Preciso de contas (normal)',
    texto: `*PRECISO DE CONTAS* ✅

Meu programador validou a falha em mais contas e agora vou precisar de Laras para sacar!!

*QUEM ESTIVER ON REAGE ESSA MENSAGEM*🍊

*NÃO ME CHAMA NO PRIVADO* ❌- Seleciono por aqui e me chamar não vai fazer vc ser escolhido antes.`,
  },
  {
    id: 'ped-13h-sn',
    label: '13h — Preciso de laras (sistema novo)',
    texto: `*PRECISO DE LARAS* ✅

Família, vamos precisar de muitos laras para escalar o sistema novo!!

*QUEM ESTIVER ON REAGE ESSA MENSAGEM*🍊

*NÃO ME CHAMA NO PRIVADO* ❌- Seleciono por aqui e me chamar não vai fazer vc ser escolhido antes

*🚨Não precisa chamar no privado!*`,
  },
  {
    id: 'ped-15h',
    label: '15h — Mais contas laras (normal)',
    texto: `*🚨PRECISO DE MAIS CONTAS LARAS*

Família, preciso de mais contas laras para poder escalar ainda mais o sistema!

Então já reage essa mensagem quem estiver disponível que eu chamo no privado (SOMENTE ESSE NÚMERO PODE CHAMAR)

*NÃO TENHO EQUIPE, NÃO COBRO TAXA❌*`,
  },
  {
    id: 'ped-15h-sn',
    label: '15h — Sistema novo (reação por região)',
    texto: `*🚨PRECISO DE MAIS CONTAS*

Vamos precisar de mais laras pra continuar escalando a operação no sistema novo família!

Então reage essa mensagem quem estiver disponível que eu chamo no privado! (SOMENTE ESSE NÚMERO PODE CHAMAR)

*NÃO TENHO EQUIPE, NÃO COBRO TAXA❌*
REAGE DE ACORDO COM SUA REGIÃO!
❤️ - SUDESTE
✅ - SUL
🍊 - CENTRO - OESTE
👍 - NORTE
😂- NORDESTE

*🚨Não precisa chamar no privado!*`,
  },
  {
    id: 'ped-19h',
    label: '19h — Preciso de mais contas',
    texto: `*PRECISO DE MAIS CONTAS* ✅

Validamos algumas falhas agora a noite e preciso de laras !

*QUEM ESTIVER ON REAGE ESSA MSG* 🍊

Não me chama pv, seleciono por aqui`,
  },
];

const AQUECIMENTO = [
  // ---- 11h20 (8 variações) ----
  {
    id: 'aq-1120-v1',
    label: '11h20 — Finalizando validação do novo sistema',
    texto: `*FINALIZANDO A VALIDAÇÃO DO NOVO SISTEMA*🚨

Família, minha equipe está nos pontos finais de validação, logo menos trago as atualizações!!`,
  },
  {
    id: 'aq-1120-v2',
    label: '11h20 — Começamos o dia',
    texto: `*COMEÇAMOS O DIA* ✅

Assim que localizarmos as primeiras oportunidades retorno aqui, hoje vou precisar de muitos laras então quero geral atento !`,
  },
  {
    id: 'aq-1120-v3',
    label: '11h20 — Fazendo as validações',
    texto: `*FAZENDO AS VALIDAÇÕES* 🚨

Família, minha equipe está fazendo as primeiras validações do dia e logo menos eu retorno com as atualizações`,
  },
  {
    id: 'aq-1120-v4',
    label: '11h20 — Operação iniciada (iniciou)',
    texto: `*🚨 OPERAÇÃO INICIADA* ✅

📢 Meu time iniciou as validações e daqui a pouco eu trago as atualizações!`,
  },
  {
    id: 'aq-1120-v5-segunda',
    label: '11h20 — Começamos a semana (segunda)',
    texto: `*COMEÇAMOS A SEMANA* ✅

Família, meu time já iniciou as primeiras validações do dia, assim que surgir algo eu trago as atualizações por aqui!!`,
  },
  {
    id: 'aq-1120-v6',
    label: '11h20 — Possível vulnerabilidade (novas linhas)',
    texto: `*🚨 POSSÍVEL VULNERABILIDADE LOCALIZADA*

Família, já localizamos novas linhas de falha e vamos iniciar as validações em todas até localizar o ponto mais vulnerável do sistema.

Logo menos eu retorno aqui!`,
  },
  {
    id: 'aq-1120-v7',
    label: '11h20 — Operação iniciada (vai iniciar)',
    texto: `*🚨 OPERAÇÃO INICIADA* ✅

📢 Meu time vai iniciar as validações e daqui a pouco eu trago as atualizações!`,
  },
  {
    id: 'aq-1120-v8',
    label: '11h20 — Possível vulnerabilidade (localizou pontos)',
    texto: `*🚨 POSSÍVEL VULNERABILIDADE LOCALIZADA*

Família, meu time localizou possíveis pontos de vulnerabilidades no sistema.

🚨 Vamos iniciar as validações e daqui a pouco eu trago as atualizações!`,
  },
  // ---- 12h (7 variações) ----
  {
    id: 'aq-12h-v1-sabdom',
    label: '12h — Falha localizada (sábado/domingo)',
    texto: `*🚨 FALHA LOCALIZADA*

Família, conseguimos localizar novas falhas, caso se confirme eu solto a falha pra vocês aproveitarem junto com a gente!!

FIQUEM ATENTOS!!`,
  },
  {
    id: 'aq-12h-v2-sabado',
    label: '12h — Brecha localizada (sábado)',
    texto: `*🚨 BRECHA LOCALIZADA*

Família, sabadão e nós continuamos no foco por aqui e já localizamos algumas brechas no sistema!

Já iniciamos as validações e logo menos vamos precisar de muitos laras!!

FIQUEM ATENTOS!!`,
  },
  {
    id: 'aq-12h-v3-sn',
    label: '12h — Sistema novo 100% validado',
    texto: `*SISTEMA NOVO 100% VALIDADO* ✅

Ja estamos aproveitando as falhas dessa casa nova, vamos testar em mais contas e trago aqui pra vcs!`,
  },
  {
    id: 'aq-12h-v4-sn',
    label: '12h — Finalizando validação (sistema novo)',
    texto: `*🚨FINALIZANDO VALIDAÇÃO*

Família, estamos finalizando as validações nas últimas contas e jájá eu volto aqui com a entrada validada.

FIQUEM ATENTOS!! 🚨`,
  },
  {
    id: 'aq-12h-v5',
    label: '12h — Finalizando validação (meu time)',
    texto: `*🚨FINALIZANDO VALIDAÇÃO*

Família, meu time vai finalizar as validações nas últimas contas e jájá eu volto aqui com a entrada validada.

FIQUEM ATENTOS!! 🚨`,
  },
  {
    id: 'aq-12h-v6',
    label: '12h — Finalizando validação (resultado do dev)',
    texto: `*FINALIZANDO A VALIDAÇÃO* 🚨

Se liga nesse resultado que o meu desenvolvedor conseguiu em uma das nossas contas família

Vamos finalizar a validação no restante das nossas contas e jájá eu trago a entrada validada pra vocês!`,
  },
  {
    id: 'aq-12h-v7',
    label: '12h — Finalizando validação (resultado numa conta)',
    texto: `*🚨 FINALIZANDO VALIDAÇÃO*

✅ Em uma das nossas contas o resultado foi esse família!

📢 Vamos finalizar as validações em mais algumas contas e logo menos trago a entrada validada pra vocês!`,
  },
  {
    id: 'aq-18h-1',
    label: '18h — Var 1 (normal)',
    texto: `*ATENÇÃO FAMÍLIA🚨*

Localizamos algumas falhas no sistema, vamos validar e retorno aqui!`,
  },
  {
    id: 'aq-18h-2',
    label: '18h — Var 2 (normal)',
    texto: `*ATENÇÃO FAMÍLIA🚨*

Assim que a gente validar o ponto principal eu trago aqui pra vocês. FIQUEM ATENTOS!!`,
  },
  {
    id: 'aq-18h-sn',
    label: '18h — Sistema novo',
    texto: `*ATENÇÃO FAMÍLIA🚨*

O sistema novo ta apresentando diversas falhas família, assim que validarmos eu trago a entrada validada pra vocês!!

*FIQUEM ATENTOS!*`,
  },
  {
    id: 'aq-1820-aquec',
    label: '18h20 — Campanha AQUECIMENTO (texto adaptado)',
    texto: `*ATENÇÃO FAMÍLIA🚨*

O sistema novo ta apresentando diversas falhas família, assim que validarmos vamos precisar de mais contas!!

*FIQUEM ATENTOS!*`,
  },
  {
    id: 'aq-21h-1',
    label: '21h — Var 1 (validando oportunidade)',
    texto: `*🚨VALIDANDO OPORTUNIDADE*

Família encontramos uma brecha com o software e estamos fazendo as validações necessárias aqui. Logo menos eu retorno por aqui!`,
  },
  {
    id: 'aq-21h-2',
    label: '21h — Var 2 (brecha encontrada)',
    texto: `*🚨 BRECHA ENCONTRADA*

Família, meu programador localizou novas falhas e estamos fazendo as validações e logo menos eu retorno com a entrada validada!

*FIQUEM ATENTOS!!*`,
  },
  {
    id: 'aq-21h-sn',
    label: '21h — Sistema novo (brecha localizada)',
    texto: `*🚨BRECHA LOCALIZADA*

Família, localizamos novas falhas no sistema novo e já iniciamos as validações dessa falha localizada!

*FIQUEM ATENTOS!🚨*`,
  },
];

const BOM_DIA = [
  { id: 'bd-seg-1', label: 'Segunda — 1', texto: '*Bom dia família, uma semana abençoada pra geral 🙌🏻❤️*' },
  { id: 'bd-seg-2', label: 'Segunda — 2', texto: '*Bom dia família, uma semana abençoada pra todos nós ❤️🙏🏻*' },
  { id: 'bd-ter-1', label: 'Terça — 1', texto: '*Bom dia família, uma ótima terça pra geral ❤️🙌🏻*' },
  { id: 'bd-ter-2', label: 'Terça — 2', texto: '*Uma ótima terça pra geral família ❤️*' },
  { id: 'bd-qua-1', label: 'Quarta — 1', texto: '*Bom dia família, uma ótima quarta pra geral ❤️🙌🏻*' },
  { id: 'bd-qua-2', label: 'Quarta — 2', texto: '*Bom dia família, uma quarta abençoada pra todos nós ❤️🙏🏻*' },
  { id: 'bd-qui-1', label: 'Quinta — 1', texto: '*Bom dia família, uma ótima quinta pra geral ❤️🙌🏻*' },
  { id: 'bd-qui-2', label: 'Quinta — 2', texto: '*Bom dia família, boa quinta pra todos nós ❤️*' },
  { id: 'bd-sex-1', label: 'Sexta — 1', texto: '*Bom dia família, uma ótima sexta pra geral ❤️🙌🏻*' },
  { id: 'bd-sex-2', label: 'Sexta — 2', texto: '*Bom dia família, uma sexta abençoada pra geral ❤️🙏🏻*' },
  { id: 'bd-sab-1', label: 'Sábado — 1', texto: '*Bom dia família, um ótimo sábado pra geral ❤️🙌🏻*' },
  { id: 'bd-sab-2', label: 'Sábado — 2', texto: '*Bom dia família, um ótimo final de semana pra geral ❤️*' },
  { id: 'bd-dom-1', label: 'Domingo — 1', texto: '*Bom dia família, um final de semana abençoado pra todos 🙌🏻❤️*' },
  { id: 'bd-dom-2', label: 'Domingo — 2', texto: '*Bom dia família, um domingo abençoado pra todos nós ❤️🙏🏻*' },
];

export const MODELOS = {
  entrada: ENTRADA,
  pedido: PEDIDO,
  aquecimento: AQUECIMENTO,
  'bom-dia': BOM_DIA,
};

// categorias que usam link (só entrada, conforme a operação)
export function categoriaUsaLink(categoria) {
  return categoria === 'entrada';
}

export function aplicarSlot(texto, slot) {
  return String(texto || '').replace(/\{slot\}/g, slot || '{slot}');
}
