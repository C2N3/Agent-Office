// @ts-nocheck
/**
 * Office Character — Agent ↔ character mapping, movement, state→zone logic
 * Ported from pixel_office renderer.ts (agent management parts)
 */

/* eslint-disable no-unused-vars */

import {
  addCharacter,
  assignDesk,
  clearReportBubble,
  findNearDeskIdleSpot,
  humanizeToolName,
  mapStatus,
  releaseDesk,
  removeCharacter,
  setBubble,
  setReportBubble,
  updateAll,
  updateCharacter,
  updateMovement,
  updateTarget,
} from './behavior.js';

export const officeCharacters: any = {
  characters: new Map(),
  seatAssignments: new Map(),
  addCharacter,
  updateCharacter,
  removeCharacter,
  assignDesk,
  releaseDesk,
  updateAll,
  _updateTarget: updateTarget,
  _updateMovement: updateMovement,
  _humanizeToolName: humanizeToolName,
  _mapStatus: mapStatus,
  _setBubble: setBubble,
  setReportBubble,
  clearReportBubble,
  _findNearDeskIdleSpot: findNearDeskIdleSpot,
};
