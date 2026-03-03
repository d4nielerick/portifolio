# Portfolio

Portfolio com front-end em HTML/CSS/JS e backend via API (`/api`) compatível com Vercel.

## Requisitos

- Node.js 18+

## Configuração local

1. Copie `.env.example` para `.env`
2. Preencha:
- `GROK_API_KEY`
- `ADMIN_PIN`
- `ADMIN_TOKEN_SECRET`
- `SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`

## Rodar local

```bash
npm install
npm start
```

Acesse:
- `http://localhost:3000/index.html`
- `http://localhost:3000/admin.html`

## Deploy na Vercel

1. Importar o repo na Vercel
2. Framework: `Other`
3. Build command: vazio
4. Output directory: vazio
5. Adicionar env vars no projeto Vercel:
- `GROK_API_KEY`
- `GROK_API_URL`
- `GROK_MODEL`
- `ADMIN_PIN`
- `ADMIN_TOKEN_SECRET`
- `SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`
- `SUPABASE_PROJECTS_TABLE` (opcional, default `portfolio_projects`)

## Supabase (tabela de projetos)

Execute este SQL no Supabase SQL Editor:

```sql
create table if not exists public.portfolio_projects (
  id text primary key,
  managed boolean not null default false,
  projects jsonb not null default '[]'::jsonb,
  updated_at timestamptz not null default now()
);

create or replace function public.set_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

drop trigger if exists trg_portfolio_projects_updated_at on public.portfolio_projects;
create trigger trg_portfolio_projects_updated_at
before update on public.portfolio_projects
for each row
execute function public.set_updated_at();
```

## Endpoints

- `GET /api/health`
- `GET /api/projects`
- `PUT /api/projects` (requer token admin)
- `POST /api/admin/login` com `{ "pin": "..." }`
- `POST /api/chat`
