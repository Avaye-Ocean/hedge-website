'use strict';

const express = require('express');
const path = require('path');
const { getVersion } = require('./scripts/version');
const api = require('./services/api');

const app = express();
const PORT = process.env.PORT || 3000;

const version = getVersion();
const year = new Date().getFullYear();

if (!process.env.WEB_SHOP_APP_URL) {
  console.error('ERROR: WEB_SHOP_APP_URL is required — set it in .env or the system environment');
  process.exit(1);
}

// URLs injected into all templates
const shopUrls = {
  webShopUrl: process.env.WEB_SHOP_APP_URL.replace(/\/$/, ''),
  iosUrl: process.env.IOS_SHOP_APP_URL ?? 'https://apps.apple.com',
  androidUrl: process.env.ANDROID_SHOP_APP_URL ?? 'https://play.google.com',
};

app.set('view engine', 'pug');
app.set('views', path.join(__dirname, 'views'));
app.use(express.static(path.join(__dirname, 'public')));

app.use((req, res, next) => {
  res.locals.version = version;
  res.locals.year = year;
  Object.assign(res.locals, shopUrls);
  next();
});

// Helper: safely fetch API data, default to empty on failure
async function safeApi(fn, fallback = []) {
  try { return await fn() ?? fallback; } catch { return fallback; }
}

// ── Routes ──────────────────────────────────────────────

app.get('/', async (req, res) => {
  const [categories, featuredProducts] = await Promise.all([
    safeApi(api.getCategories),
    safeApi(api.getFeaturedProducts),
  ]);
  res.render('index', { categories, featuredProducts });
});

app.get('/features', (req, res) => res.render('features'));

app.get('/download', (req, res) => res.render('download'));

app.get('/about', (req, res) => res.render('about'));

app.get('/collections', async (req, res) => {
  const [categories, featuredProducts] = await Promise.all([
    safeApi(api.getCategories),
    safeApi(api.getFeaturedProducts),
  ]);
  res.render('collections', { categories, featuredProducts });
});

app.get('/pricing', (req, res) => res.render('pricing'));

app.get('/contact', (req, res) => res.render('contact'));

app.get('/products', async (req, res) => {
  const [featuredProducts, categories, tags] = await Promise.all([
    safeApi(api.getFeaturedProducts),
    safeApi(api.getCategories),
    safeApi(api.getTags),
  ]);
  res.render('products', { featuredProducts, categories, tags });
});

app.get('/categories', async (req, res) => {
  const [categories, tags] = await Promise.all([
    safeApi(api.getCategories),
    safeApi(api.getTags),
  ]);
  res.render('categories', { categories, tags });
});

app.get('/help', (req, res) => res.render('help'));
app.get('/privacy', (req, res) => res.render('privacy'));
app.get('/terms', (req, res) => res.render('terms'));
app.get('/blog', (req, res) => res.render('blog'));
app.get('/careers', (req, res) => res.render('careers'));

// 404
app.use((req, res) => {
  res.status(404).render('404');
});

app.listen(PORT, () => {
  console.log(`Hedge Wears website running on http://localhost:${PORT}`);
});
