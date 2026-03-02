# Portfolio

Portfolio com front-end em HTML/CSS/JS e backend em Node + Express.

## Requisitos

- Node.js 18+

## Configuracao

1. Copie `.env.example` para `.env`
2. Preencha:
- `GROK_API_KEY`
- `ADMIN_PIN`
- `ADMIN_TOKEN_SECRET` (valor longo e aleatorio)

## Rodar local

```bash
npm install
npm start
```

Acesse:
- `http://localhost:3000/index.html`
- `http://localhost:3000/admin.html`

## API

- `GET /api/health`
- `GET /api/projects`
- `PUT /api/projects` (requer `Authorization: Bearer <token_admin>`)
- `POST /api/admin/login` com `{ "pin": "..." }`
- `POST /api/chat`
