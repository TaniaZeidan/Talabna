require('dotenv').config();

const express = require('express');
const cors    = require('cors');
const rateLimit = require('express-rate-limit');

const routes  = require('./routes');
const { errorHandler } = require('./middleware/error');
const { runAutoCancelSweep } = require('./controllers/order.controller');

const app = express();

app.use(cors({ origin: process.env.CORS_ORIGIN || '*' }));
app.use(express.json({ limit: '1mb' }));

// Light global rate limit (NFR-S2: log suspicious activity)
app.use(rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 600,                              // 600 req / 15 min / IP
  standardHeaders: true,
  legacyHeaders: false,
}));

app.get('/api/health', (req, res) => res.json({ status: 'ok', time: new Date() }));

app.use('/api', routes);

app.use(errorHandler);

// FR-V4 auto-cancel sweeper (every 60s)
const sweepInterval = setInterval(runAutoCancelSweep, 60 * 1000);

const port = process.env.PORT || 4000;
const server = app.listen(port, () => {
  console.log(`[server] MVD API listening on port ${port}`);
});

// Graceful shutdown
process.on('SIGTERM', () => {
  clearInterval(sweepInterval);
  server.close(() => process.exit(0));
});

module.exports = app;
