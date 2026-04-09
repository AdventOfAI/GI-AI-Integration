# GI Actuarial Workbench

Interactive case study for **Australian motor/property insurance**: paid claims development (chain ladder & Bornhuetter–Ferguson), a 2023 reinsurance comparison (quota share vs XL), and **APRA GPS 110**–style prescribed capital. All figures in the UI are **$000s AUD**; valuation date **31 Dec 2023**.

An **AI Analyst** tab answers questions in context using Claude; the Anthropic API key stays on the server, not in the browser.

## Stack

| Layer | Technology |
|--------|------------|
| Frontend | React 19, Vite |
| Backend | Express (`server/index.js`) — proxies chat to Anthropic |
| Config | `.env` for `ANTHROPIC_API_KEY` (see `.env.example`) |

## Quick start

```bash
npm install
cp .env.example .env
# Edit .env and set ANTHROPIC_API_KEY (from https://console.anthropic.com/)
npm run dev
```

- **App (Vite):** [http://localhost:5173](http://localhost:5173) — dev server proxies `/api` to the backend on port **8787**.
- **API only:** if you run `node server/index.js` without Vite, it listens on `PORT` (default `8787`).

## Scripts

| Command | Purpose |
|---------|---------|
| `npm run dev` | Vite + API server (hot reload for the UI) |
| `npm run build` | Production build to `dist/` |
| `npm run start` | Serves `dist/` + `/api` on one port (default **8787**) — run after `build` |
| `npm run lint` | ESLint |
| `npm run preview` | Preview the production build only (no API; use `start` for full stack) |

## Environment variables

| Variable | Required | Description |
|----------|----------|-------------|
| `ANTHROPIC_API_KEY` | Yes, for AI tab | Server-side key; never commit `.env` |
| `PORT` | No | API server port (default `8787`). If you change it, update the `proxy` target in `vite.config.js` for local dev. |

## Project layout

```
server/index.js   # Express: POST /api/chat, static SPA in production
src/App.jsx       # Tabs, case study data, AI chat UI
src/main.jsx, src/index.css
```

## License

Private / internal use unless you add a license.
# GI-AI-Integration
