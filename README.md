# Hedge Wears Website

Official marketing website for Hedge Wears — built with Express, Pug, and vanilla CSS/JS.

## Prerequisites

- Node.js 22 LTS
- npm (bundled with Node)

## Setup

```bash
git clone <repo-url>
cd hedge-website
npm install
cp .env.example .env
```

Edit `.env` as needed (see Environment Variables below).

## Development

```bash
npm run dev
```

Starts the server with `nodemon` — auto-restarts on file changes. Open [http://localhost:3000](http://localhost:3000).

## Build (minify JS)

```bash
npm run build
```

Runs `scripts/build.js` which uglifies `public/js/main.js` → `public/js/main.min.js`. CSS is not bundled — it is served as-is from `public/css/`.

## Production

### Direct Node

```bash
npm start
```

### PM2 (recommended)

```bash
npm run start:prod
```

Starts the server under PM2 with the process name `hedge-website`.

## Versioning & Cache-Busting

`scripts/version.js` reads the current short git commit hash at server startup. This value is exposed as `res.locals.version` in all Pug templates and used to append `?v=<hash>` to CSS and JS asset URLs, ensuring browsers pick up updated assets after deploys.

If git is unavailable (e.g. in a Docker image without git history), the fallback is `APP_VERSION` from `.env`, then `"dev"`.

## Environment Variables

| Variable | Default | Description |
|---|---|---|
| `PORT` | `3000` | Port the HTTP server listens on |
| `APP_VERSION` | _(empty)_ | Override version string; leave blank to auto-detect from git |
| `NODE_ENV` | `development` | `development` or `production` |
