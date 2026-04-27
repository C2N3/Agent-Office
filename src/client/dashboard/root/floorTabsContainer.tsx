import React, { type ReactElement, useEffect, useState } from 'react';
import { floorManager, type Floor } from '../../office/floorManager.js';
import { t } from '../../i18n/index.js';
import { switchOfficeFloor } from '../../office/index.js';
import { renderAgentList } from '../agentViews.js';
import { FloorTabs } from '../react/floors.js';
import { notifyDashboardStore } from '../state/store.js';

type FloorDialog = 'none' | 'create' | 'manage';

export function FloorTabsContainer(): ReactElement {
  const [dialog, setDialog] = useState<FloorDialog>('none');
  const [createName, setCreateName] = useState('');
  const [, setVersion] = useState(0);

  useEffect(() => {
    const sync = () => {
      setVersion((value) => value + 1);
      notifyDashboardStore();
    };
    floorManager.on('floor-changed', sync);
    floorManager.on('floors-updated', sync);
    return () => {
      floorManager.off('floor-changed', sync);
      floorManager.off('floors-updated', sync);
    };
  }, []);

  async function handleFloorSwitch(floorId: string) {
    floorManager.switchFloor(floorId);
    setDialog('none');
    setCreateName('');
    notifyDashboardStore();
    await switchOfficeFloor(floorId);
    renderAgentList();
  }

  function handleDeleteFloor(floorId: string) {
    const floor = floorManager.getFloors().find((entry) => entry.id === floorId);
    if (!floor) return;
    if (!confirm(t('dashboard.floor.confirmDelete', { name: floor.name }))) return;
    for (const agentId of [...floor.agentIds]) {
      floorManager.unassignAgent(agentId);
    }
    const wasCurrent = floorManager.getCurrentFloorId() === floorId;
    floorManager.removeFloor(floorId);
    if (wasCurrent) {
      const nextFloor = floorManager.getCurrentFloor();
      if (nextFloor) {
        void handleFloorSwitch(nextFloor.id);
        return;
      }
    }
    renderAgentList();
  }

  return (
    <FloorTabs
      createName={createName}
      currentFloorId={floorManager.getCurrentFloorId()}
      dialog={dialog}
      floors={floorManager.getFloors() as Floor[]}
      onCloseDialog={() => {
        setDialog('none');
        setCreateName('');
      }}
      onCreateFloor={() => {
        const name = createName.trim();
        if (!name) return;
        const newFloor = floorManager.addFloor(name);
        setDialog('none');
        setCreateName('');
        void handleFloorSwitch(newFloor.id);
      }}
      onCreateNameChange={setCreateName}
      onDeleteFloor={handleDeleteFloor}
      onOpenCreate={() => {
        setDialog('create');
        setCreateName('');
      }}
      onOpenManage={() => {
        setDialog('manage');
      }}
      onRenameFloor={(floorId, nextName) => {
        const trimmed = nextName.trim();
        if (trimmed) {
          floorManager.renameFloor(floorId, trimmed);
        }
      }}
      onSwitchFloor={(floorId) => {
        if (floorId !== floorManager.getCurrentFloorId()) {
          void handleFloorSwitch(floorId);
        }
      }}
    />
  );
}
