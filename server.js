'use strict';

require('dotenv').config();

const express = require('express');
const path = require('path');
const { getVersion } = require('./scripts/version');

const app = express();
const PORT = process.env.PORT || 3000;

// Resolve version once at startup for cache-busting
const version = getVersion();
const year = new Date().getFullYear();

// View engine
app.set('view engine', 'pug');
app.set('views', path.join(__dirname, 'views'));

// Static files
app.use(express.static(path.join(__dirname, 'public')));

// Inject version and year into all templates
app.use(function (req, res, next) {
  res.locals.version = version;
  res.locals.year = year;
  next();
});

// Routes
app.get('/', function (req, res) {
  res.render('index');
});

app.get('/features', function (req, res) {
  res.render('features');
});

app.get('/download', function (req, res) {
  res.render('download');
});

app.get('/about', function (req, res) {
  res.render('about');
});

// 404 handler
app.use(function (req, res) {
  res.status(404);
  if (res.locals && app.get('views')) {
    try {
      return res.render('404');
    } catch (e) {
      // fallback if 404.pug doesn't exist yet
    }
  }
  res.send('<h1>404 — Page Not Found</h1><p><a href="/">Go home</a></p>');
});

// Start server
app.listen(PORT, function () {
  console.log(`Hedge Wears website running on http://localhost:${PORT}`);
});
