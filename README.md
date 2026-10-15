# SiiWay Workbench

A centralized workspace dashboard built with React and Cloudflare Workers, integrating with SiiWay Prism for authentication and SiiWay Glint for task management.

## Tech Stack

- **Frontend:** React 19, Vite, React Router, Fluent UI React v9 (`@fluentui/react-components`), Zustand
- **Backend:** Hono, Cloudflare Workers
- **Database / Storage:** Cloudflare KV
- **Authentication:** SiiWay Prism (OAuth 2.0 / OpenID Connect)
- **Task Management API:** SiiWay Glint

## Project Structure

```text
src/                # Frontend React application
  components/       # Reusable UI components
  console/          # Command palette and fuzzy search system
  hooks/            # Custom React hooks
  i18n/             # Internationalization support
  keybinds/         # Global shortcut / keybinding manager
  pages/            # React Router views
  App.tsx           # Application entry and routing
worker/             # Backend Cloudflare Worker API
  routes/           # Hono API routes (auth, glint proxy, settings, etc.)
  index.ts          # Worker entry point
```

## Quick Start

### 1. Install dependencies

```bash
bun install
```

### 2. Configure Environment

Create a `.dev.vars` file based on `.dev.vars.example`:

```bash
cp .dev.vars.example .dev.vars
```

Update the configuration (Prism and Glint details).

### 3. Local Development

Run the Vite development server (frontend) and Wrangler (backend worker) simultaneously:

```bash
bun run dev
```
*(You may need to run `bun run build` for Cloudflare Assets if required by the latest Wrangler/Vite plugin).*

### 4. Deployment

Deploy the application to Cloudflare Workers:

```bash
bun run deploy
```

### GitHub Actions

The `Build and Deploy` workflow builds every pull request. Pushes to `main`
and manual runs from `main` deploy the Worker after the build succeeds.

Add `CLOUDFLARE_API_TOKEN` under **Repository settings → Secrets and
variables → Actions**. Use a Cloudflare API token scoped to this account with
the minimum permissions required to edit Workers. The account ID is already
declared in `wrangler.jsonc`; never commit the API token itself.
