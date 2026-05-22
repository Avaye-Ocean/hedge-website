# Hedge Wears Website

Official marketing website for Hedge Wears — built with Express, Pug, and vanilla CSS/JS.

## Prerequisites

- Node.js 22 LTS (`--env-file` flag requires Node ≥ 20.6)
- npm (bundled with Node)

## Setup

```bash
git clone <repo-url>
cd hedge-website
npm install
cp .env.example .env
# edit .env with your values
```

## Development

```bash
npm run dev
```

Starts the server with `nodemon` — auto-restarts on file changes. Loads `.env` via `node --env-file=.env`; falls back to plain `node server.js` if `.env` is absent (assumes env vars are already in the system environment).

Open [http://localhost:6300](http://localhost:6300) (or whatever `PORT` is set to).

## Build (minify JS)

```bash
npm run build
```

Runs `scripts/build.js` — uglifies `public/js/main.js` → `public/js/main.min.js`. CSS is not bundled; it is served as-is from `public/css/`.

## Production

### Direct Node

```bash
npm start
# node --env-file=.env server.js || node server.js
```

If `.env` is present it is loaded via `--env-file`. Otherwise the process falls through to `node server.js`, expecting env vars to be injected by the hosting platform (Heroku config vars, PM2 env, systemd environment, etc.).

### PM2 (recommended)

```bash
npm run start:prod
```

Starts the server under PM2 with the process name `hedge-website`. Set env vars in your PM2 ecosystem file or via `pm2 set`.

## Versioning & Cache-Busting

`scripts/version.js` reads the current short git commit hash at server startup. This value is exposed as `res.locals.version` in all Pug templates and appended as `?v=<hash>` on every CSS and JS asset URL, ensuring browsers pick up updated assets after deploys.

If git is unavailable (e.g. a Docker image without git history), the fallback order is `APP_VERSION` from env → `"dev"`.

## Environment Variables

Copy `.env.example` to `.env` and fill in your values. No `dotenv` package is used — variables are loaded natively via `node --env-file=.env`.

| Variable | Default | Description |
|---|---|---|
| `PORT` | `6300` | Port the HTTP server listens on |
| `NODE_ENV` | `development` | `development` or `production` |
| `APP_VERSION` | _(empty)_ | Override version string; leave blank to auto-detect from git |
| `BACKEND_API_URL` | _(see example)_ | Base URL for the Vendorstack backend API (must end with `/`) |
| `BACKEND_API_KEY` | _(required)_ | Static API key sent with every backend request |
| `BACKEND_SOURCE_ID` | `HEDGE_WEARSLY_LTD` | Source/tenant identifier for this storefront |
| `BACKEND_BUSINESS_ID` | _(required)_ | MongoDB ObjectId of the Hedge Wears business |
| `WEB_SHOP_APP_URL` | **required** | URL of the web shop (Next.js app) — used for all product/category/tag links. Server will not start if unset. |
| `IOS_SHOP_APP_URL` | `https://apps.apple.com` | App Store page URL |
| `ANDROID_SHOP_APP_URL` | `https://play.google.com` | Google Play page URL |
