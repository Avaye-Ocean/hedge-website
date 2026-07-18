'use strict';

const express = require('express');
const path = require('path');
const nodemailer = require('nodemailer');
const rateLimit = require('express-rate-limit');
const { getVersion } = require('./scripts/version');
const api = require('./services/api');

// ── Contact-form mailer ──────────────────────────────────────────────────────
// Configure via SMTP_* env vars. If not set, submissions are logged only and
// the user still sees the success page (graceful degradation).
function buildMailer() {
  const { SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS } = process.env;
  if (!SMTP_HOST || !SMTP_USER || !SMTP_PASS) return null;
  return nodemailer.createTransport({
    host: SMTP_HOST,
    port: Number(SMTP_PORT) || 587,
    secure: Number(SMTP_PORT) === 465,
    auth: { user: SMTP_USER, pass: SMTP_PASS },
  });
}
const mailer = buildMailer();
const CONTACT_TO = process.env.CONTACT_EMAIL_TO || 'hello@hedgewears.com';

const app = express();
const PORT = process.env.PORT || 3000;

const version = getVersion();

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
// Static assets are cache-busted with ?v=<git commit> (rotates each deploy),
// so browsers can hold them for a month safely.
app.use(express.static(path.join(__dirname, 'public'), { maxAge: '30d' }));

app.use(express.urlencoded({ extended: true }));

const contactLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 5,
  message: 'Too many messages submitted. Please try again in 15 minutes.',
  standardHeaders: true,
  legacyHeaders: false,
});

app.use((req, res, next) => {
  res.locals.version = version;
  res.locals.year = new Date().getFullYear();
  res.locals.path = req.originalUrl;
  Object.assign(res.locals, shopUrls);
  next();
});

// Helper: safely fetch API data, default to empty on failure
async function safeApi(fn, fallback = []) {
  try { return await fn() ?? fallback; } catch { return fallback; }
}

// Helper: escape HTML special characters for safe inclusion in email HTML bodies
function htmlEscape(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

// Helper: pick the best available image URL from a product object
function productImage(p) {
  if (!p) return null;
  return p.photo || (Array.isArray(p.thumbnailPhotos) && p.thumbnailPhotos[0]) || (Array.isArray(p.photos) && p.photos[0]) || null;
}

// ── Routes ──────────────────────────────────────────────

app.get('/', async (req, res) => {
  const [categories, featuredProducts] = await Promise.all([
    safeApi(api.getCategories),
    safeApi(api.getFeaturedProducts),
  ]);
  const og_image = productImage(featuredProducts[0]) || (categories[0] && categories[0].photo) || null;
  res.render('index', { categories, featuredProducts, page: 'home', title: 'Home', og_image });
});

app.get('/features', (req, res) => res.render('features', { page: 'features', title: 'Features' }));

app.get('/download', (req, res) => res.render('download', { page: 'download', title: 'Download the App' }));

app.get('/about', (req, res) => res.render('about', { page: 'about', title: 'About Us' }));

app.get('/collections', async (req, res) => {
  const [categories, featuredProducts] = await Promise.all([
    safeApi(api.getCategories),
    safeApi(api.getFeaturedProducts),
  ]);
  const og_image = productImage(featuredProducts[0]) || (categories[0] && categories[0].photo) || null;
  res.render('collections', { categories, featuredProducts, page: 'collections', title: 'Collections', og_image });
});

app.get('/pricing', (req, res) => res.render('pricing', { page: 'pricing', title: 'Pricing' }));

app.get('/contact', (req, res) => res.render('contact', { page: 'contact', title: 'Contact Us' }));

app.post('/contact', contactLimiter, async (req, res) => {
  // Truncate inputs to reasonable limits to prevent outsized email payloads
  const name    = String((req.body ?? {}).name    ?? '').slice(0, 100);
  const email   = String((req.body ?? {}).email   ?? '').slice(0, 200);
  const subject = String((req.body ?? {}).subject ?? '').slice(0, 200);
  const message = String((req.body ?? {}).message ?? '').slice(0, 2000);
  if (mailer) {
    try {
      await mailer.sendMail({
        from: `"Hedge Wears Website" <${process.env.SMTP_USER || CONTACT_TO}>`,
        replyTo: email || undefined,
        to: CONTACT_TO,
        subject: subject ? `[Contact] ${subject}` : '[Contact] New message from hedgewears.com',
        text: `Name: ${name || '—'}\nEmail: ${email || '—'}\n\n${message || ''}`,
        html: `<p><strong>Name:</strong> ${htmlEscape(name) || '—'}</p><p><strong>Email:</strong> ${htmlEscape(email) || '—'}</p><hr><p>${htmlEscape(message).replace(/\n/g, '<br>') || '—'}</p>`,
      });
    } catch (err) {
      console.error('[contact] Failed to send email:', err.message);
      // Still show success — user submitted the form; follow-up via direct email if needed
    }
  } else {
    // SMTP not configured — form submission received but no email sent.
    // User still sees the success page (graceful degradation).
  }
  res.render('contact', { page: 'contact', title: 'Contact Us', success: true });
});

app.get('/products', async (req, res) => {
  const [featuredProducts, categories, tags] = await Promise.all([
    safeApi(api.getFeaturedProducts),
    safeApi(api.getCategories),
    safeApi(api.getTags),
  ]);
  const og_image = productImage(featuredProducts[0]) || null;
  res.render('products', { featuredProducts, categories, tags, page: 'products', title: 'Products', og_image });
});

app.get('/categories', async (req, res) => {
  const [categories, tags] = await Promise.all([
    safeApi(api.getCategories),
    safeApi(api.getTags),
  ]);
  const og_image = (categories[0] && categories[0].photo) || null;
  res.render('categories', { categories, tags, page: 'categories', title: 'Categories', og_image });
});

// ── sitemap.xml — dynamic, lists every public static route ──────────────────
const SITE = 'https://hedgewears.com';
const SITEMAP_ROUTES = [
  { path: '/',            changefreq: 'daily',   priority: '1.0' },
  { path: '/collections', changefreq: 'weekly',  priority: '0.9' },
  { path: '/products',    changefreq: 'daily',   priority: '0.9' },
  { path: '/categories',  changefreq: 'weekly',  priority: '0.9' },
  { path: '/features',    changefreq: 'monthly', priority: '0.7' },
  { path: '/about',       changefreq: 'monthly', priority: '0.7' },
  { path: '/pricing',     changefreq: 'monthly', priority: '0.7' },
  { path: '/download',    changefreq: 'monthly', priority: '0.7' },
  { path: '/help',        changefreq: 'monthly', priority: '0.6' },
  { path: '/contact',     changefreq: 'monthly', priority: '0.6' },
  { path: '/blog',        changefreq: 'weekly',  priority: '0.5' },
  { path: '/careers',     changefreq: 'monthly', priority: '0.5' },
  { path: '/privacy',     changefreq: 'yearly',  priority: '0.3' },
  { path: '/terms',       changefreq: 'yearly',  priority: '0.3' },
  { path: '/cookies',     changefreq: 'yearly',  priority: '0.3' },
];

app.get('/sitemap.xml', (req, res) => {
  const lastmod = new Date().toISOString().slice(0, 10);
  const urls = SITEMAP_ROUTES.map(({ path: p, changefreq, priority }) =>
    `  <url>\n    <loc>${SITE}${p}</loc>\n    <lastmod>${lastmod}</lastmod>\n    <changefreq>${changefreq}</changefreq>\n    <priority>${priority}</priority>\n  </url>`
  ).join('\n');
  const xml = `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls}\n</urlset>\n`;
  res.type('application/xml').send(xml);
});

app.get('/help', (req, res) => res.render('help', { page: 'help', title: 'Help Center' }));
app.get('/privacy', (req, res) => res.render('privacy', { page: 'privacy', title: 'Privacy Policy' }));
app.get('/terms', (req, res) => res.render('terms', { page: 'terms', title: 'Terms of Service' }));
app.get('/cookies', (req, res) => res.render('cookies', { page: 'cookies', title: 'Cookie Policy' }));
app.get('/blog', (req, res) => res.render('blog', { page: 'blog', title: 'Blog' }));
app.get('/careers', (req, res) => res.render('careers', { page: 'careers', title: 'Careers' }));

// 404
app.use((req, res) => {
  res.status(404).render('404', { page: '404', title: 'Page Not Found' });
});

app.listen(PORT);
