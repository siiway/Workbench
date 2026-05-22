# AI Agent Guidelines for Siiway Workbench

This document provides context and guidelines for AI coding assistants working on the Siiway Workbench project.

## Core Architecture
Siiway Workbench is a web-based dashboard utilizing a dual-stack architecture within a single repository:
- **Frontend**: React SPA managed by Vite.
- **Backend**: Cloudflare Worker using Hono.
- **State Storage**: Cloudflare KV (for settings, initialization config, app registry, keybinds, and auth sessions).
- **Core Integrations**: 
  - `Prism` (`@siiway/prism`) for Identity & OAuth.
  - `Glint` for tasks/todos data layer (proxied via Worker).

## Technology Stack & Versions
- **Language**: TypeScript (`bun` as the package manager).
- **Frontend**: 
  - React 19
  - React Router DOM v7
  - Fluent UI React v9 (`@fluentui/react-components`, `@fluentui/react-icons`)
  - Zustand (if global state is used outside of React context/hooks)
- **Backend**: 
  - Hono v4
  - Cloudflare Workers API
  - Cloudflare Workers KV
- **Tooling**:
  - Vite (Frontend build)
  - Wrangler (Worker deployment and local dev)

## Project Structure Rules
- **Frontend Code (`/src`)**:
  - Must not import from `/worker`.
  - UI components should heavily rely on Fluent UI v9 (`@fluentui/react-components`). 
  - Do not mix different CSS-in-JS libraries; use Fluent UI's `makeStyles`.
  - Command palette logic lives in `src/console/`.
  - Keybinds manager logic lives in `src/keybinds/`.
- **Backend Code (`/worker`)**:
  - Must not import from `/src`.
  - Worker endpoints handle KV operations, Prism authentication flow, and proxying requests to Glint.
  - Always use Hono standard context `c.env.KV` for KV operations.
  - Ensure any new secret environment variables are defined in `.dev.vars` (for local) and configured in Wrangler for production.

## Coding Conventions
1. **Typing**: Use strict TypeScript typing. Share types between worker and frontend only if necessary, but keep domain boundaries clean.
2. **Error Handling**: Use standard HTTP error codes in the Hono worker. The frontend should handle these gracefully, typically presenting Fluent UI Toasts or MessageBars.
3. **Authentication**: All sensitive frontend views must check for a valid session (provided by `authRoutes` / `auth.ts` in worker). The worker secures routes using cookies that map to a session in KV.
4. **Proxying**: External services (like Glint) are generally proxied through the Worker (`/worker/routes/glint.ts`) to attach the correct backend tokens or Prism Access Tokens without exposing them to the frontend.

## Deployment Notes
- This uses the new Cloudflare Workers Assets integration (`assets` in `wrangler.jsonc` instead of `site`). 
- When generating deploy or build scripts, respect `wrangler deploy` and Vite build integrations.
