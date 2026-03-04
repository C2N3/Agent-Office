/**
 * Universal hook script for all Claude CLI events.
 * Receives JSON from stdin, adds process.ppid (claude PID),
 * and forwards to the local HTTP hook server.
 */
const http = require('http');
const PORT = 47821;

const chunks = [];
process.stdin.on('data', d => chunks.push(d));
process.stdin.on('end', () => {
    try {
        const data = JSON.parse(Buffer.concat(chunks).toString());
        // claude 프로세스 PID: hook.js의 부모 프로세스
        data._pid = process.ppid;

        const body = Buffer.from(JSON.stringify(data), 'utf-8');

        const req = http.request({
            hostname: '127.0.0.1',
            port: PORT,
            path: '/hook',
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Content-Length': body.length }
        }, () => process.exit(0));

        req.on('error', () => process.exit(0));
        req.setTimeout(3000, () => { req.destroy(); process.exit(0); });
        req.write(body);
        req.end();
    } catch (e) {
        process.exit(0);
    }
});
