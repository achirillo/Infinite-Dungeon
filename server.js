require('dotenv').config();
const express = require('express');
const path = require('path');
const { initDatabase } = require('./db/database');
const apiRoutes = require('./routes/api');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

app.use('/api', apiRoutes);

app.get('/game', (_req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'game.html'));
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
  app.listen(PORT, () => {
    console.log(`Infinite Dungeon running at http://localhost:${PORT}`);
  });
})();
