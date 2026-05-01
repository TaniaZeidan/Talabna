const app = require('./app');
const { runAutoCancelSweep } = require('./controllers/order.controller');

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
