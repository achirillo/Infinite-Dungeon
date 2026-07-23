require('dotenv').config();
const express = require('express');
const path = require('path');
const cookieParser = require('cookie-parser');
const { initDatabase } = require('./db/database');
const { attachUser } = require('./middleware/auth');
const apiRoutes = require('./routes/api');
const adminRoutes = require('./routes/admin');
const authRoutes = require('./routes/auth');

const app = express();
const PORT = process.env.PORT || 3000;
const IS_PROD = process.env.NODE_ENV === 'production';

app.use((_req, res, next) => {
  res.header('Access-Control-Allow-Origin', IS_PROD ? process.env.CORS_ORIGIN || '*' : '*');
  res.header('Access-Control-Allow-Credentials', 'true');
  res.header('Access-Control-Allow-Headers', 'Content-Type');
  if (_req.method === 'OPTIONS') return res.sendStatus(204);
  next();
});

app.use(express.json());
app.use(cookieParser());
app.use(express.static(path.join(__dirname, 'public')));

app.use(attachUser);

app.get('/api/health', (_req, res) => {
  res.json({ status: 'ok', uptime: process.uptime() });
});

app.use('/api', authRoutes);
app.use('/api', apiRoutes);
app.use('/api', adminRoutes);

app.get('/game', (_req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'game.html'));
});

app.get('/admin', (req, res) => {
  if (!req.user || req.user.role !== 'Admin') {
    return res.status(403).send('Admin access required');
  }
  res.sendFile(path.join(__dirname, 'public', 'admin.html'));
});

app.get('/:page', (req, res, next) => {
  const page = req.params.page;
  if (page === 'index.html' || page === '') {
    return res.sendFile(path.join(__dirname, 'public', 'index.html'));
  }
  next();
});

(async () => {
  await initDatabase();
  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Infinite Dungeon running on port ${PORT}`);
  });
})();
