// github-hook.js — GitHub push webhook → git pull + build + pm2 restart
//   Payload URL : https://hook-dev-site.hedgewears.com/webhook
//   Run with PM2: pm2 start github-hook.js --name dev-hedge-site-hook

'use strict';

const http   = require('http');
const crypto = require('crypto');
const { execSync } = require('child_process');
const path   = require('path');

const PORT    = Number(process.env.WEBHOOK_PORT) || 6134;
const SECRET  = process.env.GITHUB_WEBHOOK_SECRET || '';
const BRANCH  = process.env.DEPLOY_BRANCH || 'develop';
const APP_DIR = path.resolve(__dirname);

const DEPLOY_HISTORY = [];
const MAX_HISTORY    = 10;

const BETA_BANNER = [
  '╔══════════════════════════════════════════════════════════════════╗',
  '║  ⚠️  BETA — UNSTABLE DEPLOY — CONTINUOUS BUILD                  ║',
  '║  This is a pre-release version. Expect breaking changes.        ║',
  '║  Do not use for production workloads.                          ║',
  '╚══════════════════════════════════════════════════════════════════╝',
].join('\n');

const SHOW_BANNER = !process.env.NODE_ENV ||
  ['development', 'stage', 'test'].includes(process.env.NODE_ENV);

function log(msg) { console.log(`[${new Date().toISOString()}] ${msg}`); }

function verifySignature(body, sig) {
  if (!SECRET) return true;
  if (!sig)    return false;
  const digest = 'sha256=' + crypto.createHmac('sha256', SECRET).update(body).digest('hex');
  try { return crypto.timingSafeEqual(Buffer.from(digest), Buffer.from(sig)); }
  catch { return false; }
}

function run(cmd, opts = {}) {
  return execSync(cmd, {
    cwd: APP_DIR, stdio: 'pipe', encoding: 'utf-8', ...opts,
    env: { ...process.env, PORT: undefined, GITHUB_WEBHOOK_SECRET: undefined }
  });
}

function deploy(pusher, commitMsg) {
  const start = Date.now(), deployId = start;
  const entry = { id: deployId, startedAt: new Date(start).toISOString(),
                  pusher, commitMsg, status: 'running', steps: [] };
  if (DEPLOY_HISTORY.length >= MAX_HISTORY) DEPLOY_HISTORY.shift();
  DEPLOY_HISTORY.push(entry);

  function step(name, fn) {
    try {
      log(`  [deploy:${deployId}] ${name}...`);
      const out = fn();
      entry.steps.push({ name, status: 'ok', output: (out || '').trim().slice(0, 500) });
      log(`  [deploy:${deployId}] ${name} ✓`);
    } catch (err) {
      entry.steps.push({ name, status: 'failed', error: (err.message || String(err)).slice(0, 500) });
      entry.status = 'failed'; throw err;
    }
  }

  try {
    step('git fetch',    () => run(`git fetch origin ${BRANCH}; git checkout ${BRANCH}; git reset --hard origin/${BRANCH}`));
    step('npm install',  () => run('npm install --include=dev --no-audit --no-fund'));
    step('pm2 restart',  () => run('npm run pm2:start'));
    step('pm2 save',     () => run('pm2 save'));
    const elapsed = ((Date.now() - start) / 1000).toFixed(1);
    entry.status = 'success'; entry.finishedAt = new Date().toISOString(); entry.elapsedSecs = elapsed;
    log(`[deploy:${deployId}] ✅ Done in ${elapsed}s — app restarted`);
  } catch (err) {
    entry.finishedAt = new Date().toISOString();
    log(`[deploy:${deployId}] ❌ Deploy failed`);
  }
}

const server = http.createServer((req, res) => {
  if (req.method === 'GET' && req.url === '/health') {
    const pm2Status = (() => { try { return run('pm2 jlist').trim().length > 2 ? 'running' : 'unknown'; } catch { return 'error'; } })();
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ status: 'ok', webhook: 'up', pm2: pm2Status, watchedBranch: BRANCH, nodeEnv: process.env.NODE_ENV || 'development', lastDeploy: DEPLOY_HISTORY.at(-1) ?? null, deploymentsToday: DEPLOY_HISTORY.filter(d => d.startedAt.startsWith(new Date().toISOString().slice(0, 10))).length, uptime: process.uptime() }, null, 2));
    return;
  }
  if (req.method === 'GET' && req.url === '/deploys') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ deploys: [...DEPLOY_HISTORY].reverse() }, null, 2));
    return;
  }
  if (req.method !== 'POST' || req.url !== '/webhook') { res.writeHead(404).end('Not found'); return; }

  let body = '';
  req.on('data', chunk => { body += chunk; });
  req.on('end', () => {
    const sig = req.headers['x-hub-signature-256'], event = req.headers['x-github-event'];
    if (!verifySignature(body, sig)) { res.writeHead(401).end('Unauthorized'); return; }
    if (event !== 'push') { res.writeHead(200).end('OK'); return; }

    let payload = {};
    try { payload = JSON.parse(body); } catch { /* ignore */ }

    const pushedBranch = (payload.ref || '').replace('refs/heads/', '');
    if (pushedBranch !== BRANCH) { res.writeHead(200).end('OK — wrong branch'); return; }

    const pusher = payload.pusher?.name ?? 'unknown';
    const commits = payload.commits ?? [];
    const commitMsg = commits[0]?.message?.split('\n')[0] ?? 'no message';
    const commitSha = commits[0]?.id?.slice(0, 7) ?? '';

    log(`Push to ${BRANCH} by ${pusher} [${commitSha}] "${commitMsg}" — deploying...`);
    res.writeHead(202).end('Accepted');
    setImmediate(() => deploy(pusher, `[${commitSha}] ${commitMsg}`));
  });
});

server.listen(PORT, () => {
  if (SHOW_BANNER) console.log(BETA_BANNER);
  log(`GitHub webhook on :${PORT} | Branch: ${BRANCH} | Dir: ${APP_DIR}`);
  log(`  NODE_ENV: ${process.env.NODE_ENV || 'development'}${SHOW_BANNER ? ' (beta/unstable)' : ''}`);
  if (!SECRET) log('  ⚠️  GITHUB_WEBHOOK_SECRET not set');
});

server.on('error', err => { log(`Server error: ${err.message}`); process.exit(1); });
