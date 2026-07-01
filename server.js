'use strict';

const express = require('express');
const path = require('path');
const nodemailer = require('nodemailer');
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
app.use(express.static(path.join(__dirname, 'public')));

app.use(express.urlencoded({ extended: true }));

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

// ── Routes ──────────────────────────────────────────────

app.get('/', async (req, res) => {
  const [categories, featuredProducts] = await Promise.all([
    safeApi(api.getCategories),
    safeApi(api.getFeaturedProducts),
  ]);
  res.render('index', { categories, featuredProducts, page: 'home', title: 'Home' });
});

app.get('/features', (req, res) => res.render('features', { page: 'features', title: 'Features' }));

app.get('/download', (req, res) => res.render('download', { page: 'download', title: 'Download the App' }));

app.get('/about', (req, res) => res.render('about', { page: 'about', title: 'About Us' }));

app.get('/collections', async (req, res) => {
  const [categories, featuredProducts] = await Promise.all([
    safeApi(api.getCategories),
    safeApi(api.getFeaturedProducts),
  ]);
  res.render('collections', { categories, featuredProducts, page: 'collections', title: 'Collections' });
});

app.get('/pricing', (req, res) => res.render('pricing', { page: 'pricing', title: 'Pricing' }));

app.get('/contact', (req, res) => res.render('contact', { page: 'contact', title: 'Contact Us' }));

app.post('/contact', async (req, res) => {
  const { name, email, subject, message } = req.body ?? {};
  if (mailer) {
    try {
      await mailer.sendMail({
        from: `"Hedge Wears Website" <${process.env.SMTP_USER || CONTACT_TO}>`,
        replyTo: email || undefined,
        to: CONTACT_TO,
        subject: subject ? `[Contact] ${subject}` : '[Contact] New message from hedgewears.com',
        text: `Name: ${name || '—'}\nEmail: ${email || '—'}\n\n${message || ''}`,
        html: `<p><strong>Name:</strong> ${name || '—'}</p><p><strong>Email:</strong> ${email || '—'}</p><hr><p>${(message || '').replace(/\n/g, '<br>')}</p>`,
      });
    } catch (err) {
      console.error('[contact] Failed to send email:', err.message);
      // Still show success — user submitted the form; follow-up via direct email if needed
    }
  } else {
    // SMTP not configured — log the submission for manual follow-up
    console.log(`[contact] Submission (SMTP not configured) — name=${name}, email=${email}, subject=${subject}`);
  }
  res.render('contact', { page: 'contact', title: 'Contact Us', success: true });
});

app.get('/products', async (req, res) => {
  const [featuredProducts, categories, tags] = await Promise.all([
    safeApi(api.getFeaturedProducts),
    safeApi(api.getCategories),
    safeApi(api.getTags),
  ]);
  res.render('products', { featuredProducts, categories, tags, page: 'products', title: 'Products' });
});

app.get('/categories', async (req, res) => {
  const [categories, tags] = await Promise.all([
    safeApi(api.getCategories),
    safeApi(api.getTags),
  ]);
  res.render('categories', { categories, tags, page: 'categories', title: 'Categories' });
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
