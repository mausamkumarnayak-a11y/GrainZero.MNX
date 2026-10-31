const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '.env') });
require('dotenv').config();

const express = require('express');
const cors    = require('cors');
const { initDb } = require('./db');

const app = express();
app.use(cors());
app.use(express.json());

// ── API Routes ───────────────────────────────────────────────────────────────
app.use('/api/auth', require('./routes/auth'));
app.use('/api', require('./routes/settings'));
app.use('/api', require('./routes/menu'));
app.use('/api/student', require('./routes/student'));
app.use('/api/admin', require('./routes/seed'));
app.use('/api/admin', require('./routes/admin'));
app.use('/api/admin', require('./routes/analytics'));

// ── Global Error Handler ─────────────────────────────────────────────────────
app.use((err, req, res, next) => {
  console.error(`❌ Unhandled Error [${req.method} ${req.originalUrl}]:`, err);
  const status = err.status || err.statusCode || 500;
  res.status(status).json({
    error: err.message || 'Internal server error'
  });
});

// ── Serve React build in production ──────────────────────────────────────────
const clientDist = path.join(__dirname, '..', 'client', 'dist');
app.use(express.static(clientDist));
app.get('*', (_req, res) => {
  res.sendFile(path.join(clientDist, 'index.html'));
});

const PORT = process.env.PORT || 3001;

initDb()
  .then(() => {
    app.listen(PORT, '0.0.0.0', () => {
      console.log(`🌿 GrainZero server running on port ${PORT}`);
    });
  })
  .catch((err) => {
    console.error('Failed to initialise database on startup:', err);
    process.exit(1);
  });
