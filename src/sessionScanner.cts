const sessionScannerModule = require('./sessionScanner.js');
const SessionScanner = sessionScannerModule.SessionScanner || sessionScannerModule.default || sessionScannerModule;

module.exports = SessionScanner;
module.exports.SessionScanner = SessionScanner;
