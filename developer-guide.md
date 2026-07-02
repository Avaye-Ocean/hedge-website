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

# Contact form SMTP (optional — graceful degradation if absent)
SMTP_HOST=smtp.example.com
SMTP_PORT=587
SMTP_USER=your-smtp-user
SMTP_PASS=your-smtp-password
CONTACT_EMAIL_TO=hello@hedgewears.com
```

> `WEB_SHOP_APP_URL` is **required** — the server will exit if it is not set.

> **Contact form:** The `/contact` POST route sends the submission via `nodemailer` when `SMTP_HOST`, `SMTP_USER`, and `SMTP_PASS` are all set. If they are absent the submission is logged to stdout and the user still sees the success page. Use any standard SMTP provider (Gmail App Password, Mailgun SMTP relay, SendGrid, etc.).

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

### Cache busting

When products or categories are updated in the backend and you need the website to reflect the change immediately (without waiting 30 min):

1. **Dyno restart** (Heroku): `heroku restart -a <app-name>` — clears all in-memory cache
2. **Reduced TTL for development**: change `TTL_MS = 30 * 60 * 1000` in `services/api.js` to a smaller value (e.g. `60 * 1000` for 1 min) during local testing
3. **Adding a new API call**: use the `cachedFetch(key, fetcherFn)` wrapper with a unique `key` string — never call `apiGet` directly in a route handler

---

## Contact Form SMTP Setup

The `/contact` POST route in `server.js` uses `nodemailer` to send emails when all three SMTP env vars are set.

### Supported providers

| Provider | `SMTP_HOST` | `SMTP_PORT` | Notes |
|----------|-------------|-------------|-------|
| Mailgun (SMTP relay) | `smtp.mailgun.org` | `587` | Requires Mailgun account and verified domain |
| SendGrid | `smtp.sendgrid.net` | `587` | Use API key as password |
| Gmail App Password | `smtp.gmail.com` | `587` | Enable 2FA → generate App Password |
| Zoho Mail | `smtp.zoho.com` | `587` | Business accounts |
| AWS SES | `email-smtp.<region>.amazonaws.com` | `587` | IAM credentials |

### Testing locally

```bash
# .env
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USER=your-email@gmail.com
SMTP_PASS=your-app-password   # NOT your Gmail password
CONTACT_EMAIL_TO=hello@hedgewears.com
```

Submit the contact form at `http://localhost:6300/contact` — check your inbox and the server stdout for `[contact] Failed to send email` errors if the SMTP credentials are wrong.

If SMTP env vars are missing, the form still shows the success page but no email is sent (graceful degradation).

---

## Adding a New Section to the Home Page

Example: adding a "Featured Looks" editorial section below the product grid.

1. **Add an API call in `services/api.js`** (if data comes from the backend):

```js
const getFeaturedLooks = () =>
  cachedFetch('featured-looks', () =>
    apiGet(`posts?postByUserIds=${BUSINESS_ID}&limit=6`)
      .then(d => d?.results ?? [])
  )

module.exports = { ..., getFeaturedLooks }
```

2. **Pass the data in the route handler** (`server.js`):

```js
app.get('/', async (req, res) => {
  const [categories, featuredProducts, featuredLooks] = await Promise.all([
    safeApi(api.getCategories),
    safeApi(api.getFeaturedProducts),
    safeApi(api.getFeaturedLooks),
  ])
  res.render('index', { categories, featuredProducts, featuredLooks, page: 'home', title: 'Home' })
})
```

3. **Render in `views/index.pug`**:

```pug
section.featured-looks
  h2 Featured Looks
  if featuredLooks && featuredLooks.length
    each look in featuredLooks
      .look-card
        img(src=look.photos[0] alt=look.comment loading='lazy')
  else
    p Looks coming soon.
```

4. **Style in `public/css/styles.css`** (inside the IIFE or as new class rules).

5. **Run `npm run build`** to minify JS if you added client-side JS.

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

- **Contact form** — sends email via `nodemailer` when `SMTP_HOST`, `SMTP_USER`, and `SMTP_PASS` are set. When SMTP is not configured the user still sees the success page (graceful degradation). Rate limited to 5 submissions per IP per 15 minutes via `express-rate-limit`. All user-supplied fields are HTML-escaped via the `htmlEscape()` helper in `server.js` before insertion into the HTML email body. Input lengths are capped: name 100, email/subject 200, message 2000 chars.
- **Blog page** — `/blog` displays three preview cards but has no individual article pages. Cards are rendered as `<article>` elements (non-links) rather than `<a href="#">` to avoid dead navigation. When article pages are implemented, change `article.blog-card` back to `a.blog-card(href='/blog/slug')` in `views/blog.pug`.
- **No dark mode** — static site, light mode only.
- **30-min cache** — API responses are cached in process memory. Cache clears on dyno restart.
