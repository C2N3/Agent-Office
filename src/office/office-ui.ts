// @ts-nocheck
/**
 * Office UI — Name tags, speech bubbles, camera controls
 * Ported from pixel_office nameTagRenderer.ts
 */

/* eslint-disable no-unused-vars */

var OFFICE_UI_BASE_Y = -144;  // above character head (FRAME_H + small gap)

function drawOfficeNameTag(ctx, agent) {
  var S = OFFICE.MAP_SCALE || 1;
  const baseX = Math.round(agent.x);
  const footY = Math.round(agent.y);

  ctx.save();
  ctx.textAlign = 'center';
  ctx.textBaseline = 'bottom';

  const statusColor = STATE_COLORS[agent.agentState] || STATE_COLORS[agent.metadata.status] || '#94a3b8';

  // Role label
  ctx.font = 'bold ' + Math.round(10 * S) + 'px -apple-system, BlinkMacSystemFont, "Malgun Gothic", sans-serif';
  let roleStr = agent.role || agent.metadata.name || 'Agent';
  if (roleStr.length > 20) roleStr = roleStr.slice(0, 19) + '...';

  const tw = ctx.measureText(roleStr).width;
  const roleBoxW = tw + Math.round(16 * S);
  const roleBoxH = Math.round(16 * S);
  const roleBoxX = baseX - roleBoxW / 2;
  const roleBoxY = footY + OFFICE_UI_BASE_Y - roleBoxH;

  // Role background
  ctx.fillStyle = 'rgba(15, 23, 42, 0.90)';
  ctx.strokeStyle = statusColor;
  ctx.lineWidth = Math.round(1.5 * S);
  ctx.beginPath();
  ctx.roundRect(roleBoxX, roleBoxY, roleBoxW, roleBoxH, Math.round(4 * S));
  ctx.fill();
  ctx.stroke();

  // Role text
  ctx.fillStyle = '#f8fafc';
  ctx.fillText(roleStr, baseX, footY + OFFICE_UI_BASE_Y - Math.round(3 * S));

  // Status badge
  const state = agent.agentState || 'idle';
  const displayState = state === 'done' ? 'DONE' : state === 'idle' ? 'RESTING' : state.toUpperCase();

  ctx.font = 'bold ' + Math.round(9.5 * S) + 'px sans-serif';
  const stateTw = ctx.measureText(displayState).width;

  ctx.globalAlpha = 0.75;
  ctx.fillStyle = statusColor;
  const paddingX = Math.round(10 * S);
  const sBoxW = stateTw + paddingX * 2;
  const sBoxH = Math.round(15 * S);
  const sBoxX = baseX - sBoxW / 2;
  const sBoxY = roleBoxY - sBoxH - Math.round(5 * S);

  ctx.beginPath();
  ctx.roundRect(sBoxX, sBoxY, sBoxW, sBoxH, sBoxH / 2);
  ctx.fill();

  ctx.globalAlpha = 1.0;
  ctx.fillStyle = '#ffffff';
  ctx.fillText(displayState, baseX, sBoxY + sBoxH - Math.round(3 * S));

  ctx.restore();
}

function drawOfficeBubble(ctx, agent) {
  var S = OFFICE.MAP_SCALE || 1;
  const now = Date.now();
  const baseX = Math.round(agent.x);
  const bubbleY = Math.round(agent.y) + OFFICE_UI_BASE_Y - Math.round(45 * S);

  ctx.save();

  if (agent.bubble && agent.bubble.expiresAt > now) {
    const icon = agent.bubble.icon ? agent.bubble.icon + ' ' : '';
    const text = icon + agent.bubble.text;

    ctx.font = 'bold ' + Math.round(11 * S) + 'px -apple-system, BlinkMacSystemFont, sans-serif';
    const tw = ctx.measureText(text).width;
    const paddingH = Math.round(10 * S);
    const paddingV = Math.round(8 * S);
    const boxW = tw + paddingH * 2;
    const boxH = Math.round(16 * S) + paddingV * 2;
    const boxX = baseX - boxW / 2;
    const boxY = bubbleY - boxH;

    // Bubble background
    ctx.fillStyle = 'rgba(255, 255, 255, 0.95)';
    ctx.beginPath();
    ctx.roundRect(boxX, boxY, boxW, boxH, Math.round(8 * S));
    ctx.fill();

    // Border
    ctx.lineWidth = Math.round(2 * S);
    ctx.strokeStyle = 'rgba(203, 213, 225, 0.5)';
    ctx.stroke();

    // Tail
    var tailW = Math.round(6 * S);
    var tailH = Math.round(7 * S);
    ctx.fillStyle = 'rgba(255, 255, 255, 0.95)';
    ctx.beginPath();
    ctx.moveTo(baseX - tailW, boxY + boxH);
    ctx.lineTo(baseX + tailW, boxY + boxH);
    ctx.lineTo(baseX, boxY + boxH + tailH);
    ctx.closePath();
    ctx.fill();
    ctx.lineWidth = Math.round(2 * S);
    ctx.strokeStyle = 'rgba(203, 213, 225, 0.5)';
    ctx.stroke();

    // Text
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = '#0f172a';
    ctx.fillText(text, baseX, boxY + boxH / 2);
  }

  ctx.restore();
}
