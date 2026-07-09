# Operação Maumau

Painel interno para a equipe subir mídias organizadas, o admin aprovar, e o Claude agendar no SendFlow.

- **Backend:** Node + Express + PostgreSQL (Neon) + Drizzle ORM + JWT
- **Frontend:** React (Vite) + Tailwind CSS + PWA (instalável, offline, push notifications)
- **Armazenamento de mídia:** Cloudinary (upload assinado)
- **Notificações:** Web Push (VAPID) + chip dedicado do SendFlow
- **Deploy:** Render (backend) + Netlify (frontend)

```
operacao-maumau/
├── backend/        API Express + Drizzle
├── frontend/       App React + Vite + PWA
├── render.yaml     Blueprint de deploy do backend
└── README.md
```

---

## 1. Pré-requisitos (contas)

Você vai precisar criar/coletar credenciais em:

| Serviço      | O que pegar                                            |
|--------------|--------------------------------------------------------|
| **Neon**     | `DATABASE_URL` (connection string com `?sslmode=require`) |
| **Cloudinary** | `cloud name`, `API key`, `API secret`                |
| **SendFlow** *(opcional)* | API key + id da conta/chip dedicado de avisos |

JWT secrets e chaves VAPID são geradas por você localmente (comandos abaixo) — não precisa de conta.

---

## 2. Rodar localmente

### Backend

```bash
cd backend
npm install
cp .env.example .env        # preencha os valores (veja abaixo)
npm run gen:vapid           # gera VAPID_PUBLIC_KEY / VAPID_PRIVATE_KEY → cole no .env
npm run setup               # cria as tabelas e o usuário admin (seed)
npm run dev                 # sobe em http://localhost:3001
```

Gerar os secrets JWT (exemplo):

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

### Frontend

```bash
cd frontend
npm install
cp .env.example .env        # VITE_API_URL=http://localhost:3001
                            # VITE_VAPID_PUBLIC_KEY = a mesma VAPID_PUBLIC_KEY do backend
npm run dev                 # sobe em http://localhost:5173
```

Login inicial: o email/senha definidos em `ADMIN_EMAIL` / `ADMIN_PASSWORD` no `.env` do backend.

---

## 3. Variáveis de ambiente

### Backend (`backend/.env`)

| Variável | Descrição |
|----------|-----------|
| `DATABASE_URL` | String de conexão do Neon |
| `JWT_SECRET` / `REFRESH_SECRET` | Segredos aleatórios (>=32 chars) |
| `ADMIN_EMAIL` / `ADMIN_PASSWORD` / `ADMIN_WHATSAPP` | Admin criado pelo seed |
| `FRONTEND_URL` | Origem(ns) do front para CORS (vírgula separa várias) |
| `CLOUDINARY_CLOUD_NAME` / `CLOUDINARY_API_KEY` / `CLOUDINARY_API_SECRET` | Cloudinary |
| `CLOUDINARY_FOLDER` | Pasta base (default `maumau-media`) |
| `VAPID_PUBLIC_KEY` / `VAPID_PRIVATE_KEY` / `VAPID_SUBJECT` | Web Push |
| `SENDFLOW_API_URL` / `SENDFLOW_API_KEY` / `SENDFLOW_NOTIFY_PATH` / `SENDFLOW_NOTIFY_ACCOUNT` | Chip dedicado (opcional) |
| `PORT` / `NODE_ENV` | Ambiente |

### Frontend (`frontend/.env`)

| Variável | Descrição |
|----------|-----------|
| `VITE_API_URL` | URL do backend (Render em produção) |
| `VITE_VAPID_PUBLIC_KEY` | Mesma chave pública VAPID do backend |

> Se `SENDFLOW_*` ou `VAPID_*` ficarem vazias, o app continua funcionando — as notificações
> por WhatsApp/push simplesmente ficam desativadas (o feed in-app continua ativo).

---

## 4. Deploy

### Backend no Render

1. Suba este repositório no GitHub.
2. No Render: **New > Blueprint** e aponte para o repo (ele lê o `render.yaml`).
3. Preencha as variáveis marcadas como `sync:false` no dashboard (DATABASE_URL, Cloudinary, VAPID, SendFlow, ADMIN_*, FRONTEND_URL).
4. `JWT_SECRET` e `REFRESH_SECRET` são gerados automaticamente pelo Render.
5. Após o primeiro deploy, rode uma vez o setup do banco no Shell do serviço:
   ```bash
   npm run setup
   ```

### Frontend no Netlify

1. No Netlify: **Add new site > Import from Git**, selecione o repo.
2. **Base directory:** `frontend` — o `netlify.toml` já define build/publish e o redirect de SPA.
3. Em **Site settings > Environment variables**, defina `VITE_API_URL` (URL do Render) e `VITE_VAPID_PUBLIC_KEY`.
4. Deploy. Depois, atualize `FRONTEND_URL` no backend (Render) com a URL do Netlify e redeploy.

---

## 5. Fluxo da operação

1. Admin cria a demanda e atribui a um operador → operador é notificado (push + WhatsApp).
2. Operador sobe as mídias (upload assinado direto no Cloudinary).
3. Operador envia para aprovação → admins são notificados.
4. Admin aprova/rejeita cada mídia e a demanda.
5. Com a demanda **aprovada**, o admin gera o **payload de agendamento** e cola no Claude.
6. Claude agenda no SendFlow; o admin confirma o status como *agendado* → *concluído*.

### Endpoints principais

| Método | Rota | Descrição |
|--------|------|-----------|
| `POST` | `/auth/login` `/auth/refresh` `/auth/logout` `/auth/me` | Autenticação |
| `GET/POST/PATCH/DELETE` | `/demandas` | CRUD + transições de status |
| `GET` | `/demandas/:id/agendamento-payload` | Payload para o Claude agendar |
| `POST` | `/arquivos/assinatura` | Assinatura de upload Cloudinary |
| `POST/GET/PATCH/DELETE` | `/arquivos...` | Registrar, aprovar, rejeitar, deletar |
| `GET/POST/PATCH/DELETE` | `/copys` | Copys de lançamento |
| `GET/POST/PATCH` | `/notificacoes...` | Push (subscribe), feed e teste |
| `GET/POST/PATCH` | `/usuarios` | Gestão de equipe (admin) |

---

## 6. Segurança

- Senhas com bcrypt (salt 12); access token JWT de 15 min; refresh token de 7 dias em cookie httpOnly, rotacionado a cada uso.
- Rate limit no login (5 tentativas / 15 min) e global.
- Upload Cloudinary **sempre assinado** pelo backend (pasta e formatos controlados no servidor).
- Toda permissão validada no backend; operador só acessa as demandas atribuídas.
- Idempotência de agendamentos (unique index em demanda+arquivo+horário+release).
- Activity logs em todas as ações relevantes.
