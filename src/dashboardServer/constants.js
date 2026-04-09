"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.MIME_TYPES = exports.HTML_FILE = exports.PORT = void 0;
const path_1 = __importDefault(require("path"));
exports.PORT = 3000;
exports.HTML_FILE = path_1.default.join(__dirname, '..', '..', 'dashboard.html');
exports.MIME_TYPES = {
    '.html': 'text/html',
    '.css': 'text/css',
    '.js': 'application/javascript',
    '.json': 'application/json',
    '.png': 'image/png',
    '.jpg': 'image/jpeg',
    '.svg': 'image/svg+xml',
    '.webp': 'image/webp',
};
