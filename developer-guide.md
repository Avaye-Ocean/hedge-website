# Hedge Website — Developer Guide

## Overview

Server-rendered marketing and storefront website for Hedge Wears.  
**Stack:** Node.js 22 + Express 4 + Pug 3 templates + vanilla CSS/JS.  
No React, no bundler, no TypeScript. Strictly server-rendered.

---

## Quick Start

```bash
# Prerequisites: Node.js 22 LTS
npm install

# Development (with auto-restart)
npm run dev       # uses nodemon

# Production
npm start         # node --env-file=.env server.js || node server.js

# Build (minify JS)
npm run build
```

### Environment

Copy `.env.example` to `.env` and fill in your values:

```
PORT=6300
NODE_ENV=development

# Vendorstack API
BACKEND_API_URL=https://dev-vendorstack-backend.herokuapp.com/api/v1/
BACKEND_API_KEY=<app api key>
BACKEND_SOURCE_ID=HEDGE_WEARSLY_LTD
BACKEND_BUSINESS_ID=6471104cc17ea387218a737b

# App URLs (used in templates — deep links and download badges)
WEB_SHOP_APP_URL=https://dev-hedge-web-app-82768f1c25de.herokuapp.com
IOS_SHOP_APP_URL=https://apps.apple.com/app/hedge-wears
ANDROID_SHOP_APP_URL=https://play.google.com/store/apps/details?id=com.hedgewears
```

> `WEB_SHOP_APP_URL` is **required** — the server will exit if it is not set.

Node 22+ loads `.env` natively via `--env-file`. No `dotenv` package is used.

---

## Architecture

### File structure

```
server.js           Express app + all routes
services/
  api.js            Vendorstack API calls (30-min cache)
views/              Pug templates
  index.pug         Home page
  about.pug
  features.pug
  download.pug
  cookies.pug
  404.pug
  partials/         Shared header, footer, nav
public/
  css/              Vanilla CSS (variables.css, styles.css)
  js/               main.js (IIFE, no bundler), main.min.js (built)
  assets/           Images, fonts, icons
scripts/
  version.js        Git hash for cache-busting
  build.js          Minifies main.js → main.min.js
```

### API caching

`services/api.js` wraps all backend calls with a **30-minute in-memory cache**:

```js
const getCategories = () =>
  cachedFetch('categories', () =>
    apiGet(`categories?categoryBusinessIds=${BUSINESS_ID}&limit=12`)
      .then(d => d?.results ?? [])
  )
```

Cache is per-key (`cachedFetch(key, fetchFn)`). The cache clears on server restart.

---

## Adding a New Page

1. Add a route in `server.js`:

```js
app.get('/new-page', async (req, res) => {
  const products = await getFeaturedProducts()
  res.render('new-page', { products })
})
```

2. Create `views/new-page.pug`:

```pug
extends partials/layout

block content
  h1 My New Page
  each product in products
    p= product.name
```

3. Add asset URLs with version suffix:

```pug
link(rel="stylesheet" href=`/css/styles.css?v=${version}`)
```

---

## API Param Reference

The backend query params that this site uses:

| Call | Correct param | Wrong (old) |
|------|--------------|-------------|
| Products by business | `productBusinessId` | ~~productByBusinessIds~~ |
| Products by category | `productCategoryIds` | ~~productByCategoryIds~~ |
| Categories by business | `categoryBusinessIds` | ~~categoryByBusinessIds~~ |

Using the wrong param names silently returns all records instead of filtering.

---

## Design System

- **Font:** Rethink Sans — loaded from `public/assets/fonts/`
- **Primary dark:** `#111618`
- **Brand orange:** `#c15006`
- **Tokens:** `public/css/variables.css` (CSS custom properties)

---

## Build & Deploy

```bash
npm run build    # Minifies main.js → main.min.js
```

Deployed to Heroku. `Procfile`:

```
web: node --env-file=.env server.js || node server.js
```

All templates receive `res.locals.version` (git hash) and `res.locals.year` automatically.

---

## Coding Rules

- CommonJS only (`require` / `module.exports`) — no ES6 `import`
- No `console.log` in committed code — `console.error` for caught errors only
- Routes stay in `server.js` (no separate router files unless complexity demands)
- JS in `public/js/main.js` is a single IIFE — no module syntax
- All asset URLs must include `?v=#{version}` for cache-busting

---

## Known Limitations

- **Contact form** — submission is logged server-side only; no email delivery. Deferred.
- **No dark mode** — static site, light mode only.
- **30-min cache** — API responses are cached in process memory. Cache clears on dyno restart.
