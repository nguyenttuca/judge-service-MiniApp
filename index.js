// -----------------------------------------------------------
// Judge Service — Entry Point
// Reads PORT from process.env, starts Express, detects compilers.
// -----------------------------------------------------------
require('dotenv').config();

const express = require('express');
const { detectAvailableCompilers, getLanguageStatus } = require('./core/languages');
const judgeRoutes = require('./routes/judge');

const PORT = parseInt(process.env.PORT, 10) || 3000;
const API_KEY = process.env.JUDGE_API_KEY || '';

const app = express();

// ---- Body parser with size limit ----
app.use(express.json({ limit: '100mb' }));

// ---- Optional API-key middleware ----
if (API_KEY) {
  app.use((req, res, next) => {
    // Health endpoint is public so load-balancers / monitors can reach it
    if (req.path === '/health') return next();

    const provided =
      req.headers['x-api-key'] ||
      (req.headers.authorization || '').replace(/^Bearer\s+/i, '');

    if (provided !== API_KEY) {
      return res.status(401).json({ error: 'Unauthorized — invalid or missing API key' });
    }
    next();
  });
}

// ---- Routes ----
app.use('/', judgeRoutes);

// ---- Global error handler ----
app.use((err, _req, res, _next) => {
  console.error('[ERROR]', err);
  res.status(500).json({ error: 'Internal server error' });
});

// ---- Startup sequence ----
(async () => {
  console.log('[INIT] Judge Service starting …');

  await detectAvailableCompilers();

  const langs = getLanguageStatus();
  const summary = Object.entries(langs)
    .map(([k, v]) => `${k}=${v ? 'OK' : 'NOT FOUND'}`)
    .join(', ');
  console.log(`[INIT] Compiler check: ${summary}`);

  app.listen(PORT, () => {
    console.log(`[INIT] Judge Service listening on port ${PORT}`);
  });
})();
