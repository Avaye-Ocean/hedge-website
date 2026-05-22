'use strict';

const { execSync } = require('child_process');

/**
 * Returns the short git commit hash for cache-busting.
 * Falls back to APP_VERSION env var, then "dev" if git is unavailable.
 */
function getVersion() {
  try {
    const hash = execSync('git rev-parse --short HEAD', { stdio: ['pipe', 'pipe', 'pipe'] })
      .toString()
      .trim();
    return hash;
  } catch (err) {
    console.error('[version] git unavailable, falling back to APP_VERSION:', err.message);
    return process.env.APP_VERSION ?? 'dev';
  }
}

/**
 * Appends ?v=<version> to a CSS/JS asset path for cache-busting.
 * @param {string} path - e.g. "/css/styles.css"
 * @returns {string} e.g. "/css/styles.css?v=a1b2c3d"
 */
function getVersionedUrl(path) {
  return `${path}?v=${getVersion()}`;
}

module.exports = { getVersion, getVersionedUrl };
