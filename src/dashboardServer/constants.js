const path = require('path');

const PORT = 3000;
const HTML_FILE = path.join(__dirname, '..', '..', 'dashboard.html');

const MIME_TYPES = {
  '.html': 'text/html',
  '.css': 'text/css',
  '.js': 'application/javascript',
  '.json': 'application/json',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.svg': 'image/svg+xml',
  '.webp': 'image/webp',
};

module.exports = {
  PORT,
  HTML_FILE,
  MIME_TYPES,
};
