import crypto from 'crypto';
import { getClients, getRefs } from './context';

interface UpgradeServer {
  on(event: 'upgrade', listener: (req: any, socket: any) => void): void;
}

export function attachWebSocketUpgrade(server: UpgradeServer): void {
  server.on('upgrade', (req, socket) => {
    const url = new URL(req.url, `http://${req.headers.host}`);

    if (url.pathname === '/ws') {
      const key = req.headers['sec-websocket-key'];
      const acceptKey = crypto
        .createHash('sha1')
        .update(key + '258EAFA5-E914-47DA-95CA-C5AB0DC85B11')
        .digest('base64');

      socket.write(
        'HTTP/1.1 101 Switching Protocols\r\n' +
        'Upgrade: websocket\r\n' +
        'Connection: Upgrade\r\n' +
        `Sec-WebSocket-Accept: ${acceptKey}\r\n` +
        '\r\n'
      );

      const { wsClients } = getClients();
      const client: any = {
        socket,
        readyState: 1,
        send: (data: string) => {
          const frame: number[] = [0x81];

          const dataBytes = Buffer.from(data);
          const len = dataBytes.length;

          if (len < 126) {
            frame.push(len);
          } else if (len < 65536) {
            frame.push(126, (len >> 8) & 0xff, len & 0xff);
          } else {
            frame.push(127, 0, 0, 0, 0, (len >> 24) & 0xff, (len >> 16) & 0xff, (len >> 8) & 0xff, len & 0xff);
          }

          socket.write(Buffer.concat([Buffer.from(frame), dataBytes]));
        },
        close: () => {
          socket.end();
        },
      };

      wsClients.add(client);

      const { agentManager } = getRefs();
      if (agentManager) {
        const agents = agentManager.getAllAgents();
        client.send(JSON.stringify({
          type: 'initial',
          data: agents,
          timestamp: Date.now(),
        }));
      }

      socket.on('close', () => {
        wsClients.delete(client);
      });

      socket.on('error', (err: any) => {
        console.error('[Dashboard] WebSocket error:', err.message);
        wsClients.delete(client);
      });
    } else {
      socket.destroy();
    }
  });
}
