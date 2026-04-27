import React, { type KeyboardEvent, type ReactElement } from 'react';
import { useI18n } from '../../i18n/react.js';
import type { Floor } from '../../office/floorManager.js';

type FloorDialog = 'none' | 'create' | 'manage';

export function FloorTabs({
  createName,
  currentFloorId,
  dialog,
  floors,
  onCloseDialog,
  onCreateFloor,
  onCreateNameChange,
  onDeleteFloor,
  onOpenCreate,
  onOpenManage,
  onRenameFloor,
  onSwitchFloor,
}: {
  createName: string;
  currentFloorId: string | null;
  dialog: FloorDialog;
  floors: Floor[];
  onCloseDialog: () => void;
  onCreateFloor: () => void;
  onCreateNameChange: (value: string) => void;
  onDeleteFloor: (floorId: string) => void;
  onOpenCreate: () => void;
  onOpenManage: () => void;
  onRenameFloor: (floorId: string, name: string) => void;
  onSwitchFloor: (floorId: string) => void;
}): ReactElement {
  const { t } = useI18n();

  return (
    <>
      <div className="floor-tabs-list" id="floorTabsList">
        {floors.map((floor) => (
          <button
            key={floor.id}
            className={`floor-tab${floor.id === currentFloorId ? ' active' : ''}`}
            data-floor-id={floor.id}
            type="button"
            onClick={() => onSwitchFloor(floor.id)}
          >
            <span className="floor-tab-name">{floor.name}</span>
          </button>
        ))}
      </div>
      <button className="floor-tab-add" id="floorAddBtn" title={t('dashboard.floor.add')} type="button" onClick={onOpenCreate}>+</button>
      <button className="floor-tab-manage" id="floorManageBtn" title={t('dashboard.floor.manage')} type="button" onClick={onOpenManage}>
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <circle cx="12" cy="12" r="3" />
          <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
        </svg>
      </button>
      {dialog === 'create' ? (
        <div className="floor-create-overlay" id="floorCreateOverlay" onClick={(event) => {
          if (event.target === event.currentTarget) onCloseDialog();
        }}>
          <div className="floor-create-dialog">
            <h3>{t('dashboard.floor.new')}</h3>
            <input
              autoFocus
              id="floorNameInput"
              maxLength={30}
              placeholder={t('dashboard.floor.exampleName')}
              type="text"
              value={createName}
              onChange={(event) => onCreateNameChange(event.currentTarget.value)}
              onKeyDown={(event) => handleCreateKeyDown(event, onCloseDialog, onCreateFloor)}
            />
            <div className="floor-create-actions">
              <button className="floor-cancel-btn" id="floorCancelBtn" type="button" onClick={onCloseDialog}>{t('common.cancel')}</button>
              <button className="floor-confirm-btn" id="floorConfirmBtn" type="button" onClick={onCreateFloor}>{t('common.create')}</button>
            </div>
          </div>
        </div>
      ) : null}
      {dialog === 'manage' ? (
        <div className="floor-create-overlay" id="floorManagerOverlay" onClick={(event) => {
          if (event.target === event.currentTarget) onCloseDialog();
        }}>
          <div className="floor-create-dialog floor-mgr-dialog">
            <div className="floor-mgr-header">
              <h3>{t('dashboard.floor.manager')}</h3>
              <button className="floor-mgr-close" id="floorMgrCloseBtn" type="button" onClick={onCloseDialog}>&times;</button>
            </div>
            <div className="floor-mgr-body">
              {floors.map((floor) => (
                <div key={floor.id} className="floor-mgr-row" data-floor-id={floor.id}>
                  <input
                    className="floor-mgr-name"
                    data-rename-floor={floor.id}
                    defaultValue={floor.name}
                    maxLength={30}
                    type="text"
                    onBlur={(event) => onRenameFloor(floor.id, event.currentTarget.value)}
                    onKeyDown={(event) => {
                      if (event.key === 'Enter') event.currentTarget.blur();
                    }}
                  />
                  <span className="floor-mgr-count">{t('dashboard.floor.agentCount', { count: floor.agentIds.length })}</span>
                  {floor.id === currentFloorId ? <span className="floor-mgr-current">{t('dashboard.floor.current')}</span> : null}
                  {floors.length > 1 ? (
                    <button
                      className="floor-mgr-delete"
                      data-delete-floor={floor.id}
                      title={t('common.delete')}
                      type="button"
                      onClick={() => onDeleteFloor(floor.id)}
                    >
                      &times;
                    </button>
                  ) : null}
                </div>
              ))}
            </div>
            <div className="floor-create-actions">
              <button className="floor-confirm-btn" id="floorMgrAddBtn" type="button" onClick={onOpenCreate}>+ {t('dashboard.floor.add')}</button>
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}

function handleCreateKeyDown(
  event: KeyboardEvent<HTMLInputElement>,
  onCloseDialog: () => void,
  onCreateFloor: () => void,
): void {
  if (event.key === 'Enter') onCreateFloor();
  if (event.key === 'Escape') onCloseDialog();
}
