
import { avatarIndexFromId } from '../officeConfig';
import { officeCoordsByRoom } from '../officeCoords';

export function humanizeToolName(toolName, provider) {
  if (!toolName) return null;

  if (provider === 'codex') {
    const known = {
      exec_command: 'Command',
      apply_patch: 'Patch',
      web_search: 'Web Search',
      view_image: 'Image',
      spawn_agent: 'Subagent',
      send_input: 'Agent Input',
      wait_agent: 'Waiting',
      query_docs: 'Docs',
      read_mcp_resource: 'MCP Resource',
    };

    if (known[toolName]) return known[toolName];
  }

  return String(toolName)
    .replace(/[_-]+/g, ' ')
    .replace(/\b\w/g, (ch) => ch.toUpperCase());
}

export function mapStatus(agentOrStatus) {
  const dashboardStatus = typeof agentOrStatus === 'string'
    ? agentOrStatus
    : (agentOrStatus?.status || 'idle');
  const currentTool = typeof agentOrStatus === 'string'
    ? null
    : (agentOrStatus?.currentTool || null);
  const provider = typeof agentOrStatus === 'string'
    ? null
    : (agentOrStatus?.metadata?.provider || null);

  const map = {
    working: 'working',
    thinking: 'thinking',
    waiting: 'idle',
    completed: 'done',
    done: 'done',
    help: 'help',
    error: 'error',
    offline: 'offline',
  };

  if (provider === 'codex' && currentTool && !['error', 'offline', 'completed', 'done', 'help'].includes(dashboardStatus)) {
    return 'working';
  }

  return map[dashboardStatus] || 'idle';
}

export function setBubble(char, agentData) {
  let text = null;
  let icon = null;
  const status = this._mapStatus(agentData);
  const provider = agentData.metadata?.provider || char.metadata.provider || null;
  const currentTool = agentData.currentTool || char.metadata.tool || null;

  if (status === 'working' && currentTool) {
    text = this._humanizeToolName(currentTool, provider);
  } else if (status === 'thinking') {
    text = 'Thinking...';
  } else if (status === 'completed' || status === 'done') {
    text = 'Done!';
  } else if (status === 'help') {
    text = 'Need help!';
  } else if (status === 'error') {
    text = 'Error!';
  }

  if (text) {
    const isPersistent = status === 'working' || status === 'thinking' || status === 'help' || status === 'error';
    char.bubble = { text, icon, expiresAt: isPersistent ? Infinity : Date.now() + 8000 };
  }
}

export function findNearDeskIdleSpot(char) {
  const coords = officeCoordsByRoom[char.roomId];
  if (!coords || !coords.idle || !coords.desk || coords.desk.length === 0) return null;

  let avgX = 0;
  let avgY = 0;
  for (let i = 0; i < coords.desk.length; i++) {
    avgX += coords.desk[i].x;
    avgY += coords.desk[i].y;
  }
  avgX /= coords.desk.length;
  avgY /= coords.desk.length;

  const occupied = {};
  this.characters.forEach((a) => {
    if (a.id === char.id) return;
    if (a.roomId !== char.roomId) return;
    let ax = Math.floor(a.x);
    let ay = Math.floor(a.y);
    if (a.path.length > 0) {
      const t = a.path[a.path.length - 1];
      ax = Math.floor(t.x);
      ay = Math.floor(t.y);
    }
    occupied[`${ax},${ay}`] = true;
  });

  const candidates = coords.idle
    .filter((p) => !occupied[`${Math.floor(p.x)},${Math.floor(p.y)}`])
    .sort((a, b) => (Math.abs(a.x - avgX) + Math.abs(a.y - avgY)) - (Math.abs(b.x - avgX) + Math.abs(b.y - avgY)));

  if (candidates.length === 0) return null;
  const idHash = avatarIndexFromId(char.id);
  return candidates[idHash % Math.min(candidates.length, 5)];
}
