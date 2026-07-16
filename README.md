# 📋 Trevyx — Trello Clone powered by vyx

Trevyx é um gerenciador de projetos estilo Kanban (como Trello/Jira) construído sobre o framework **vyx**. Demonstra um sistema completo multi-worker com backend em Node.js, Go e Python.

## 🏗️ Arquitetura

```
Browser (React)
    │
    ▼
[Vite Dev Server] — proxy /api/*
    │
    ▼
[vyx Core (Go)] — Gateway HTTP + Roteamento + Auth JWT
    │
    ├──► [Worker Node.js] — API REST principal (boards, lists, cards, auth)
    │       SQLite via better-sqlite3
    │       21 endpoints, @Route + @Auth + @Validate
    │
    ├──► [Worker Go] — Export de dados (CSV/JSON)
    │       Lê o mesmo SQLite, gera arquivos exportáveis
    │
    └──► [Worker Python] — Estatísticas e analytics
            Consulta SQLite, calcula métricas do board
```

## 🧩 Componentes

### 🟢 vyx Core (Go)
- Gateway HTTP que recebe requisições e roteia para workers
- Autenticação JWT com suporte a roles (`@Auth`)
- Validação de payload com JSON Schema (`@Validate`)
- Rate limiting, circuit breaker, CORS
- Gerenciamento de workers (spawn, health check, restart)

### 🔵 Worker Node.js (`backend/node/`)
**Propósito:** API principal CRUD do Trello.
**Tecnologia:** TypeScript + @vyx/worker SDK + better-sqlite3
**Rotas:** 21 endpoints REST
- `POST /api/auth/register|login` — Registro e autenticação
- `GET|POST /api/boards` — Listar e criar boards
- `GET|PUT|DELETE /api/boards/:id` — CRUD de board
- `POST /api/boards/:id/lists` — Criar listas
- `POST /api/lists/:id/cards` — Criar cards
- `PUT /api/cards/:id/move` — Arrastar cards entre listas
- `POST /api/cards/:id/comments` — Comentários

### 🟡 Worker Go (`backend/go/`)
**Propósito:** Exportação de dados.
**Tecnologia:** Go + SQLite
**Rotas:**
- `GET /api/export/boards/:id/csv` — Exportar board como CSV
- `GET /api/export/boards/:id/json` — Exportar board como JSON
**Por que Go?** Performance na geração de arquivos grandes, tipagem forte para estruturas de exportação.

### 🟣 Worker Python (`backend/python/`)
**Propósito:** Estatísticas e analytics dos boards.
**Tecnologia:** Python 3 + sqlite3
**Rotas:**
- `GET /api/stats/boards/:id` — Métricas do board (cards por prioridade, overdue, taxa de conclusão)
**Por que Python?** Facilidade para manipulação de dados e futura integração com bibliotecas de analytics (pandas, matplotlib).

### 🔴 Frontend React (`frontend/`)
**Propósito:** Interface do usuário.
**Tecnologia:** React 18 + Vite + TypeScript
**Funcionalidades:**
- Login/Register
- Grid de boards
- Kanban com drag & drop nativo
- Modal de detalhe do card (label, prioridade, data, comentários)
- Edição inline do board

## 🚀 Como Rodar

```bash
# 1. Instalar dependências
cd backend/node && npm install
cd ../../frontend && npm install

# 2. Compilar backend Node.js
cd ../backend/node && npx tsc

# 3. Iniciar tudo
cd ../..
vyx dev
```

O `vyx dev` sobe automaticamente:
1. Core em `:8080` (gateway HTTP)
2. Worker Node.js (conecta via IPC)
3. Frontend React em `:5173`

Acesse `http://localhost:5173/` no navegador.

## 🐳 Docker

### Build & Run

```bash
# Build tudo e gerar imagem Docker
cd docker && bash build.sh

# Ou manualmente:
chmod +x docker/build.sh
./docker/build.sh
```

### docker-compose

```bash
docker compose up -d
```

### Acessar

| Serviço | URL |
|---------|-----|
| Frontend | http://localhost:3000 |
| API | http://localhost:8080/api/ |
| Health | http://localhost:8080/health |

### Arquitetura Docker

```
[Browser] → :3000 (busybox httpd) → static frontend
          → :8080 (vyx core)       → API → worker → SQLite
```

A imagem Docker contém:
- **Core:** vyx-core (Go binary, ~10MB, sem AWS provider)
- **Frontend:** React buildado (HTML/CSS/JS estáticos)
- **Worker:** Node.js compilado + node_modules
- **SQLite:** Volume persistente em `/data/trevyx.db`

## 🗄️ Banco de Dados

SQLite via `better-sqlite3` — schema em `backend/node/src/db.ts`:

```
users    → boards   → lists   → cards   → comments
  ↑                  ↑           ↑
  └── user_id        └── pos     └── list_id, priority, labels, due_date
```

## 🔌 Anotações

O vyx usa anotações em comentários pra declarar rotas e validações:

```typescript
// @Route(POST /api/boards)
// @Auth(roles: ["user"])
// @Validate(JsonSchema: "create_board")
worker.post('/api/boards', handler);
```

```go
// @Route(GET /api/export/boards/:id/csv)
// @Auth(roles: ["user"])
func handleExportCSV() {}
```

```python
# @Route(GET /api/stats/boards/:id)
# @Auth(roles: ["user"])
def handle_board_stats():
    pass
```

## ☁️ Infraestrutura

Definida via `vyx infra` em `vyx.yaml`:

```yaml
infrastructure:
  resources:
    - type: aws_s3_bucket (uploads de arquivos)
    - type: aws_rds_instance (banco de dados PostgreSQL)
    - type: aws_instance (servidor de aplicação)
```

```bash
vyx infra plan    # Ver o que será criado
vyx infra apply   # Provisionar na AWS
```

## 🧪 Testes

```bash
# Testar API diretamente
curl -X POST http://localhost:8080/api/auth/register \
  -H "Content-Type: application/json" \
  -d '{"email":"test@t.com","name":"Test","password":"123456"}'

# Login e criar board
TOKEN=$(curl -s -X POST http://localhost:8080/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"test@t.com","password":"123456"}' | python3 -c "import json,sys;print(json.load(sys.stdin)['token'])")
curl -X POST http://localhost:8080/api/boards \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"title":"Demo Board"}'
```

## 🏗️ Stack

| Camada | Tecnologia | Propósito |
|--------|-----------|-----------|
| Orquestração | vyx Core (Go) | Gateway + Auth + Roteamento + Workers |
| API principal | Node.js + TypeScript | CRUD boards, lists, cards, auth |
| Export | Go | Geração de CSV/JSON |
| Analytics | Python | Estatísticas dos boards |
| Frontend | React + Vite + TS | Interface Kanban |
| Banco | SQLite | Persistência local |
| Infra | vyx infra (AWS) | Deploy em produção |
