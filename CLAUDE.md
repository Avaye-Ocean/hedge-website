# Claude Code — Hedge Website

**Working branch:** `develop`

## Stack

- **Runtime:** Node.js 22 LTS (requires ≥ 20.6 for `--env-file`)
- **Server:** Express 4 (CommonJS — no `"type": "module"`)
- **Env loading:** `node --env-file=.env server.js || node server.js` — no dotenv package
- **View engine:** Pug 3 — templates live in `./views/`
- **Styles:** Vanilla CSS — files live in `./public/css/`
- **Client JS:** Vanilla JS (IIFE, no bundler) — files live in `./public/js/`
- **Static assets:** `./public/` — CSS in `public/css/`, JS in `public/js/`, images/icons in `public/assets/`

## Views

Pug templates go in `./views/`. Routes defined in `server.js`:

| Route | Template |
|---|---|
| `GET /` | `views/index.pug` |
| `GET /features` | `views/features.pug` |
| `GET /download` | `views/download.pug` |
| `GET /about` | `views/about.pug` |
| 404 fallback | `views/404.pug` |

All templates receive `res.locals.version` (git hash) and `res.locals.year` (current year) automatically via middleware.

## Versioning & Asset URLs

`scripts/version.js` generates a short git commit hash used for cache-busting. In Pug templates, use:

```pug
link(rel="stylesheet" href=`/css/styles.css?v=${version}`)
script(src=`/js/main.js?v=${version}`)
```

Never hardcode an asset URL without the `?v=#{version}` suffix.

Use `getVersionedUrl(path)` from `scripts/version.js` in build scripts if needed.

## Build

```bash
npm run build
```

Runs `scripts/build.js` — uglifies `public/js/main.js` → `public/js/main.min.js`. There is no CSS bundler; CSS is served directly.

## Design System

- **Font:** Rethink Sans (load from `public/assets/fonts/` or Google Fonts)
- **Primary dark:** `#111618`
- **Brand orange:** `#c15006`
- **Full token list:** see `public/css/variables.css` (created by the design agent)

CSS custom properties (variables) are defined in `public/css/variables.css` and imported at the top of the main stylesheet.

## Coding Conventions

- Use `require` (CommonJS) in all Node scripts — never `import`/`export`
- No `console.log` in committed code; use `console.error` for caught errors only
- All routes rendered with `res.render('<template-name>')` — no `.pug` extension needed
- Keep `server.js` thin — route handlers stay in `server.js` for now (no separate router files unless complexity demands it)
- JS in `public/js/main.js` is a single IIFE — no ES6 modules, no import statements
