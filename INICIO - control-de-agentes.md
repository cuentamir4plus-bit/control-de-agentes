# Control de Agentes v3.0

Panel web local para crear, gestionar y chatear con agentes de IA configurables. Usa la GitHub Models API como backend de inferencia. Todo corre en `http://localhost:3000`, sin base de datos externa.

## Estado del proyecto

**Recién creado** — Estructura completa, backend y frontend implementados. Pendiente de instalar dependencias y probar.

## Tecnologías

| Área | Stack |
|------|-------|
| Backend | Node.js 18+ / Express 4 (ES Modules) |
| Frontend | HTML/CSS/JS vanilla (SPA) |
| Templates | Server-side static files |
| Streaming | SSE (Server-Sent Events) via fetch + ReadableStream |
| API IA | GitHub Models API (compatible OpenAI, HTTP directo, sin SDK) |
| Subida archivos | multer + mammoth (docx) + pdf-parse |
| Persistencia | Archivos JSON (agentes) + Markdown (chats) |
| Skills | Archivos `.skill.md` en config/skills/ |
| Estilos | CSS custom, dark theme industrial, sin frameworks |

## Cómo iniciar

```bash
# 1. Instalar dependencias
npm install

# 2. Copiar configuración
cp .env.example .env
# Editar .env con tu GITHUB_TOKEN (ghp_... o github_pat_...)

# 3. Iniciar servidor
npm start
# → http://localhost:3000

# 4. Modo desarrollo (hot reload con --watch)
npm run dev
```

## Configuración necesaria

- **GitHub Token** obligatorio — se necesita un token de GitHub con acceso a GitHub Models.
  Conseguilo en: https://github.com/settings/tokens
  Formatos aceptados: `ghp_...`, `gho_...`, `github_pat_...`
- Se puede configurar desde el panel (wizard inicial) o directamente en `.env`
- **Jira** (opcional) — se configura desde la sección Configuración del panel

## Funcionalidades

| Sección | Descripción |
|---------|-------------|
| Agentes | CRUD completo, cada agente tiene system prompt + skills asociadas + modelo default |
| Chat | Streaming en tiempo real, sesiones persistidas en archivos `.md` |
| Historial | Árbol por agente con buscador, abrir/descargar/eliminar sesiones previas |
| Modelos LLM | Lista de modelos disponibles desde GitHub Models API |
| Skills | Skills globales reutilizables que se inyectan al system prompt |
| Jira | Proxy para consultar y crear issues (requiere config) |
| Configuración | Gestión de token GitHub + credenciales Jira |

## Persistencia

- **Agentes**: `agents/<id>.json` — formato JSON
- **Chats**: `chats/<agentId>/<sessionId>.md` — formato Markdown con historial completo
- **Skills**: `config/skills/<name>.skill.md` — markdown plano
- **Config**: `.env` — token y credenciales

## Resolución de bugs de v2

| Bug | Solución |
|-----|----------|
| Streaming crasheaba con `[DONE]` | Try/catch por chunk, `[DONE]` ignorado explícitamente |
| Sin timeout en API | AbortController con 60s timeout |
| multer sin límite | 10MB max, allowlist de extensiones |
| Path traversal | `safePath()` con validación de prefijo |
| Sin CORS | Headers CORS para desarrollo local |
| Chats no persistían | Sistema completo con `initSessionFile` + `appendToSessionFile` |
| XSS en renderizado | `escapeHtml()` antes de transformar a markdown |
| EventSource no se cerraba | Referencia guardada + abort en `closeChat()` |
| Sin feedback visual | Spinner + estados de carga |
| Modelo no recordado | `localStorage` por `agentId` |
