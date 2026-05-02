/**
 * Office Character — Agent ↔ character mapping, movement, state→zone logic
 * Ported from pixel_office renderer.ts (agent management parts)
 */

/* eslint-disable no-unused-vars */

import {
  addCharacter,
  assignDesk,
  releaseDesk,
  removeCharacter,
  updateAll,
  updateCharacter,
  updateMovement,
  updateTarget,
} from './behavior';
import {
  dropCharacterAt,
  pinCharacterAt,
  unpinCharacter,
} from './drag';
import {
  findNearDeskIdleSpot,
  humanizeToolName,
  mapStatus,
  setBubble,
} from './presentation';

export const officeCharacters: any = {
  characters: new Map(),
  seatAssignments: new Map(),
  getCharacterArray: function () {
    return Array.from(this.characters.values());
  },
  addCharacter,
  updateCharacter,
  removeCharacter,
  assignDesk,
  releaseDesk,
  pinCharacterAt,
  unpinCharacter,
  dropCharacterAt,
  updateAll,
  _updateTarget: updateTarget,
  _updateMovement: updateMovement,
  _humanizeToolName: humanizeToolName,
  _mapStatus: mapStatus,
  _setBubble: setBubble,
  _findNearDeskIdleSpot: findNearDeskIdleSpot,
};
