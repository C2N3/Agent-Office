/**
 * Office Character — Agent ↔ character mapping, movement, state→zone logic
 * Ported from pixel_office renderer.ts (agent management parts)
 */

/* eslint-disable no-unused-vars */

var officeCharacters = {
  characters: new Map(),
  seatAssignments: new Map(), // deskIndex → agentId

  /** Dashboard SSE agent → office character */
  addCharacter: function (agentData) {
    if (this.characters.has(agentData.id)) {
      this.updateCharacter(agentData);
      return;
    }

    // Map dashboard status to office state
    const officeState = this._mapStatus(agentData.status);

    // 서버 할당 avatarIndex 우선, 폴백: 해시 계산
    var avatarIdx = (agentData.avatarIndex !== undefined && agentData.avatarIndex !== null)
      ? agentData.avatarIndex : avatarIndexFromId(agentData.id);
    var avatarFile = AVATAR_FILES[avatarIdx] || AVATAR_FILES[0];

    const char = {
      id: agentData.id,
      x: 100 + Math.random() * 100,
      y: 200 + Math.random() * 100,
      path: [],
      pathIndex: 0,
      facingDir: 'down',
      avatarFile: avatarFile,
      skinIndex: avatarIdx, // kept for compat
      deskIndex: undefined,
      currentAnim: 'down_idle',
      animFrame: 0,
      animTimer: 0,
      agentState: officeState,
      restTimer: 0,
      bubble: null,
      role: agentData.name || 'Agent',
      metadata: {
        name: agentData.name || 'Agent',
        project: agentData.project || '',
        tool: agentData.currentTool || null,
        type: agentData.type || 'main',
        status: agentData.status || 'idle',
        lastMessage: agentData.lastMessage || null,
      },
    };

    this.characters.set(agentData.id, char);

    // Assign desk if needed
    if (STATE_ZONE_MAP[officeState] === 'desk') {
      this.assignDesk(agentData.id);
    }

    this._updateTarget(char);
    this._setBubble(char, agentData);

  },

  updateCharacter: function (agentData) {
    const char = this.characters.get(agentData.id);
    if (!char) {
      this.addCharacter(agentData);
      return;
    }

    const oldState = char.agentState;
    const newState = this._mapStatus(agentData.status);
    char.agentState = newState;
    char.role = agentData.name || char.role;
    char.metadata.name = agentData.name || char.metadata.name;
    char.metadata.project = agentData.project || char.metadata.project;
    char.metadata.tool = agentData.currentTool || null;
    char.metadata.status = agentData.status || 'idle';
    char.metadata.type = agentData.type || char.metadata.type;
    char.metadata.lastMessage = agentData.lastMessage || char.metadata.lastMessage;

    // State change → zone transition
    if (oldState !== newState) {
      const oldZone = STATE_ZONE_MAP[oldState] || 'idle';
      const newZone = STATE_ZONE_MAP[newState] || 'idle';

      if (newZone === 'desk' && char.deskIndex === undefined) {
        this.assignDesk(agentData.id);
      } else if (newZone === 'idle' && oldZone === 'desk') {
        this.releaseDesk(agentData.id);
      }

      // Trigger effect on state change
      if (typeof officeRenderer !== 'undefined') {
        var stateColor = STATE_COLORS[newState] || '#94a3b8';
        officeRenderer.spawnEffect('stateChange', char.x, char.y - 32, stateColor);
        if (newState === 'done') {
          officeRenderer.spawnEffect('confetti', char.x, char.y - 45);
        } else if (newState === 'error') {
          officeRenderer.spawnEffect('warning', char.x, char.y - 65);
        }
      }
    }

    this._setBubble(char, agentData);
  },

  removeCharacter: function (agentId) {
    this.releaseDesk(agentId);
    this.characters.delete(agentId);
  },

  assignDesk: function (agentId) {
    const char = this.characters.get(agentId);
    if (!char || char.deskIndex !== undefined) return;

    // 빈 좌석 수집
    const usedDesks = new Set(this.seatAssignments.keys());
    const deskCoords = officeCoords.desk || [];
    var available = [];
    for (let i = 0; i < deskCoords.length; i++) {
      if (!usedDesks.has(i)) available.push(i);
    }

    if (available.length === 0) {
      // D6: 좌석 초과 — 오버플로 처리
      char.deskOverflow = true;
      return;
    }

    // 에이전트 ID 기반 결정론적 랜덤 (같은 에이전트는 같은 선호)
    var hash = avatarIndexFromId(agentId);
    var idx = available[hash % available.length];
    char.deskIndex = idx;
    this.seatAssignments.set(idx, agentId);
  },

  releaseDesk: function (agentId) {
    const char = this.characters.get(agentId);
    if (!char) return;
    if (char.deskIndex !== undefined) {
      this.seatAssignments.delete(char.deskIndex);
      char.deskIndex = undefined;
    }
    char.deskOverflow = false;
  },

  updateAll: function (deltaSec, deltaMs) {
    const self = this;
    this.characters.forEach(function (char) {
      self._updateTarget(char);
      self._updateMovement(char, deltaSec);
      tickOfficeAnimation(char, deltaMs);

      // Working sparkles
      if (char.agentState === 'working' && Math.random() < 0.05) {
        if (typeof officeRenderer !== 'undefined') {
          officeRenderer.spawnEffect('focus', char.x, char.y - 40);
        }
      }
    });
  },

  _updateTarget: function (char) {
    const coords = officeCoords;
    if (!coords || !coords.desk || !coords.idle) return;

    // WORKING / THINKING / HELP / ERROR → desk
    if (char.agentState === 'working' || char.agentState === 'thinking' ||
        char.agentState === 'error' || char.agentState === 'help') {
      char.restTimer = 0;

      // D6: 좌석 초과 에이전트 — desk 근처 idle 좌표로 이동 (서서 일하기)
      if (char.deskOverflow) {
        if (char.path.length > 0 && char.pathIndex < char.path.length) return;
        // desk 영역 근처의 idle 좌표 중 하나를 선택
        var nearIdle = this._findNearDeskIdleSpot(char);
        if (nearIdle) {
          if (Math.abs(char.x - nearIdle.x) < 5 && Math.abs(char.y - nearIdle.y) < 5) return;
          char.path = officePathfinder.findPath(char.x, char.y, nearIdle.x, nearIdle.y);
          char.pathIndex = 0;
        }
        return;
      }

      if (char.deskIndex !== undefined && char.deskIndex < coords.desk.length) {
        const target = coords.desk[char.deskIndex];
        const tx = Math.floor(target.x);
        const ty = Math.floor(target.y);

        if (char.path.length === 0 && Math.floor(char.x) === tx && Math.floor(char.y) === ty) return;
        if (char.path.length > 0) {
          const last = char.path[char.path.length - 1];
          if (Math.floor(last.x) === tx && Math.floor(last.y) === ty) return;
        }

        const found = officePathfinder.findPath(char.x, char.y, tx, ty);
        char.path = found;
        char.pathIndex = 0;
      }
      return;
    }

    // IDLE / WAITING / DONE → idle zone
    if (char.path.length > 0 && char.pathIndex < char.path.length) return;

    const isAtIdle = coords.idle.some(function (p) {
      return Math.abs(p.x - char.x) < 5 && Math.abs(p.y - char.y) < 5;
    });

    if (isAtIdle) return;

    // Find unoccupied idle spot
    const occupied = {};
    const self = this;
    this.characters.forEach(function (a) {
      if (a.id === char.id) return;
      let ax = Math.floor(a.x), ay = Math.floor(a.y);
      if (a.path.length > 0) {
        const t = a.path[a.path.length - 1];
        ax = Math.floor(t.x);
        ay = Math.floor(t.y);
      }
      occupied[ax + ',' + ay] = true;
    });

    const valid = coords.idle.filter(function (p) {
      return !occupied[Math.floor(p.x) + ',' + Math.floor(p.y)];
    });

    if (valid.length > 0) {
      const dest = valid[Math.floor(Math.random() * valid.length)];
      char.path = officePathfinder.findPath(char.x, char.y, dest.x, dest.y);
      char.pathIndex = 0;
    }
  },

  _updateMovement: function (char, deltaSec) {
    const isArrived = char.path.length === 0 || char.pathIndex >= char.path.length;

    if (isArrived) {
      // Apply seat config
      const allSpots = (officeCoords.desk || []).concat(officeCoords.idle || []);
      let currentSpot = null;
      for (let i = 0; i < allSpots.length; i++) {
        if (Math.abs(allSpots[i].x - char.x) < 5 && Math.abs(allSpots[i].y - char.y) < 5) {
          currentSpot = allSpots[i];
          break;
        }
      }

      if (char.agentState === 'done' || char.agentState === 'completed') {
        char.currentAnim = 'dance';
      } else if (char.deskOverflow) {
        // D6: 오버플로 에이전트는 서서 일하는 자세
        char.facingDir = 'down';
        char.currentAnim = 'down_idle';
      } else if (char.agentState !== 'error') {
        const config = currentSpot ? getSeatConfig(currentSpot.id) : { dir: 'down', animType: 'sit' };
        char.facingDir = config.dir;
        if (config.animType === 'sit') {
          char.currentAnim = 'sit_' + config.dir;
        } else {
          char.currentAnim = config.dir + '_idle';
        }
      } else {
        char.currentAnim = 'dance';
      }
      return;
    }

    // Move along path
    const target = char.path[char.pathIndex];
    const dx = target.x - char.x;
    const dy = target.y - char.y;
    const dist = Math.sqrt(dx * dx + dy * dy);

    if (dist < OFFICE.ARRIVE_THRESHOLD) {
      char.x = target.x;
      char.y = target.y;
      char.pathIndex++;
    } else {
      const speed = OFFICE.MOVE_SPEED * deltaSec;
      char.x += (dx / dist) * speed;
      char.y += (dy / dist) * speed;
      const dir = Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? 'right' : 'left') : (dy > 0 ? 'down' : 'up');
      char.facingDir = dir;
      char.currentAnim = animKeyFromDir(dir, true);
    }
  },

  _mapStatus: function (dashboardStatus) {
    const map = {
      'working': 'working',
      'thinking': 'thinking',
      'waiting': 'idle',
      'completed': 'done',
      'done': 'done',
      'help': 'help',
      'error': 'error',
    };
    return map[dashboardStatus] || 'idle';
  },

  _setBubble: function (char, agentData) {
    let text = null;
    let icon = null;
    const status = agentData.status || char.metadata.status;

    if (status === 'working' && agentData.currentTool) {
      text = agentData.currentTool;
      icon = null;
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
      // working/thinking/help/error 상태는 상태 유지 중 영구 표시
      var isPersistent = (status === 'working' || status === 'thinking' || status === 'help' || status === 'error');
      char.bubble = { text: text, icon: icon, expiresAt: isPersistent ? Infinity : Date.now() + 8000 };
    }
  },

  /** D6: desk 영역 근처의 빈 idle 좌표 찾기 (오버플로 에이전트용) */
  _findNearDeskIdleSpot: function (char) {
    var coords = officeCoords;
    if (!coords || !coords.idle || !coords.desk || coords.desk.length === 0) return null;

    // desk 영역의 평균 좌표 계산
    var avgX = 0, avgY = 0;
    for (var i = 0; i < coords.desk.length; i++) {
      avgX += coords.desk[i].x;
      avgY += coords.desk[i].y;
    }
    avgX /= coords.desk.length;
    avgY /= coords.desk.length;

    // idle 좌표를 desk 평균 좌표와의 거리 순으로 정렬
    var occupied = {};
    this.characters.forEach(function (a) {
      if (a.id === char.id) return;
      var ax = Math.floor(a.x), ay = Math.floor(a.y);
      if (a.path.length > 0) {
        var t = a.path[a.path.length - 1];
        ax = Math.floor(t.x);
        ay = Math.floor(t.y);
      }
      occupied[ax + ',' + ay] = true;
    });

    var candidates = coords.idle.filter(function (p) {
      return !occupied[Math.floor(p.x) + ',' + Math.floor(p.y)];
    }).sort(function (a, b) {
      var da = Math.abs(a.x - avgX) + Math.abs(a.y - avgY);
      var db = Math.abs(b.x - avgX) + Math.abs(b.y - avgY);
      return da - db;
    });

    // 결정론적 선택 (에이전트 ID 기반)
    if (candidates.length === 0) return null;
    var hash = avatarIndexFromId(char.id);
    return candidates[hash % Math.min(candidates.length, 5)];
  },

  getCharacterArray: function () {
    return Array.from(this.characters.values());
  },
};
