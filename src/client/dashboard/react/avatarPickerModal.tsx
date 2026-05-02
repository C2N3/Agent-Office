import React, {
  type CSSProperties,
  type KeyboardEvent,
  type MouseEvent,
  type ReactElement,
  useCallback,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import {
  SHARED_AVATAR_DATA,
  getDashboardAPI,
  refreshSharedAvatarData,
  state,
  type AvatarCategory,
  type AvatarData,
} from '../shared';
import { officeCharacters } from '../../office/index';
import { updateAgentUI } from '../agentViews';
import { syncCentralAgentUpdate } from '../centralAgents/index';
import { dashboardModalRegistry } from '../modals/registry';

type AvatarPickerContext = {
  agentId: string;
  registryId: string;
  currentIndex: number;
};

type AvatarCatalogSnapshot = {
  categories: AvatarCategory[];
  files: string[];
};

const DISPLAY_WIDTH = 53;
const DISPLAY_HEIGHT = 70;
const GRID_COLUMNS = 8;

function snapshotAvatarCatalog(data: AvatarData = SHARED_AVATAR_DATA): AvatarCatalogSnapshot {
  return {
    categories: data.categories.map((category) => ({
      name: category.name,
      files: [...category.files],
    })),
    files: [...data.allFiles],
  };
}

function buildFileCategoryMap(categories: AvatarCategory[]): Map<string, string> {
  const fileCategoryMap = new Map<string, string>();
  for (const category of categories) {
    for (const file of category.files) {
      fileCategoryMap.set(file, category.name);
    }
  }
  return fileCategoryMap;
}

function getAvatarTitle(file: string, index: number): string {
  return file.split('/').pop()?.replace(/\.\w+$/, '') || `Avatar ${index}`;
}

export function AvatarPickerModal(): ReactElement | null {
  const overlayRef = useRef<HTMLDivElement | null>(null);
  const [visible, setVisible] = useState(false);
  const [activeTab, setActiveTab] = useState('All');
  const [context, setContext] = useState<AvatarPickerContext | null>(null);
  const [catalog, setCatalog] = useState<AvatarCatalogSnapshot>(() => snapshotAvatarCatalog());

  const fileCategoryMap = useMemo(
    () => buildFileCategoryMap(catalog.categories),
    [catalog.categories],
  );

  const tabNames = useMemo(
    () => ['All', ...catalog.categories.map((category) => category.name)],
    [catalog.categories],
  );

  const avatarItems = useMemo(
    () => catalog.files
      .map((file, index) => ({
        file,
        index,
        category: fileCategoryMap.get(file) || '',
      }))
      .filter((item) => activeTab === 'All' || item.category === activeTab),
    [activeTab, catalog.files, fileCategoryMap],
  );

  const closeAvatarPicker = useCallback(() => {
    setVisible(false);
    setContext(null);
  }, []);

  const openAvatarPickerModal = useCallback(async (agentId: string, registryId: string) => {
    const agent = state.agents.get(agentId);
    const currentIndex = agent?.avatarIndex != null ? agent.avatarIndex : 0;

    setActiveTab('All');
    const avatarData = await refreshSharedAvatarData();
    setCatalog(snapshotAvatarCatalog(avatarData));
    setContext({ agentId, registryId, currentIndex });
    setVisible(true);
    requestAnimationFrame(() => overlayRef.current?.focus());
  }, []);

  useLayoutEffect(() => {
    dashboardModalRegistry.openAvatarPickerModal = openAvatarPickerModal;
    return () => {
      if (dashboardModalRegistry.openAvatarPickerModal === openAvatarPickerModal) {
        delete dashboardModalRegistry.openAvatarPickerModal;
      }
    };
  }, [openAvatarPickerModal]);

  const selectAvatar = useCallback(async (index: number, file: string) => {
    if (!context) return;

    const dashboardAPI = getDashboardAPI();
    if (dashboardAPI?.updateRegisteredAgent) {
      await dashboardAPI.updateRegisteredAgent(context.registryId, { avatarIndex: index });
    }

    syncCentralAgentUpdate(context.registryId, { avatarIndex: index }).catch((error) => {
      console.warn('[Central Agents] avatar sync failed', error);
    });

    const character = officeCharacters.characters.get(context.agentId);
    if (character) {
      character.avatarFile = file;
      character.skinIndex = index;
    }

    const agent = state.agents.get(context.agentId);
    if (agent) {
      agent.avatarIndex = index;
      updateAgentUI(agent);
    }

    closeAvatarPicker();
  }, [closeAvatarPicker, context]);

  const handleOverlayClick = useCallback((event: MouseEvent<HTMLDivElement>) => {
    if (event.target === event.currentTarget) closeAvatarPicker();
  }, [closeAvatarPicker]);

  const handleOverlayKeyDown = useCallback((event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key === 'Escape') closeAvatarPicker();
  }, [closeAvatarPicker]);

  if (!visible) return null;

  return (
    <div
      aria-labelledby="avatarPickerTitle"
      aria-modal="true"
      className="modal-overlay"
      id="avatarPickerModal"
      onClick={handleOverlayClick}
      onKeyDown={handleOverlayKeyDown}
      ref={overlayRef}
      role="dialog"
      tabIndex={-1}
    >
      <div className="modal-content avatar-picker-modal">
        <div className="modal-header" id="avatarPickerTitle">Change Avatar</div>
        <div className="avatar-picker-tabs">
          {tabNames.map((name) => (
            <button
              className={`avatar-picker-tab${name === activeTab ? ' active' : ''}`}
              key={name}
              onClick={() => setActiveTab(name)}
              type="button"
            >
              {name}
            </button>
          ))}
        </div>
        <div className="avatar-picker-grid">
          {avatarItems.map(({ file, index }) => {
            const avatarStyle: CSSProperties = {
              backgroundImage: `url('/assets/characters/${file}')`,
              backgroundPosition: '0px 0px',
              backgroundSize: `${DISPLAY_WIDTH * GRID_COLUMNS}px auto`,
              height: `${DISPLAY_HEIGHT}px`,
              imageRendering: 'auto',
              width: `${DISPLAY_WIDTH}px`,
            };

            return (
              <button
                aria-label={`Select ${getAvatarTitle(file, index)}`}
                className={`avatar-picker-item${context?.currentIndex === index ? ' selected' : ''}`}
                key={file}
                onClick={() => { void selectAvatar(index, file); }}
                style={avatarStyle}
                title={getAvatarTitle(file, index)}
                type="button"
              />
            );
          })}
        </div>
        <div className="modal-actions">
          <button className="btn-secondary" onClick={closeAvatarPicker} type="button">Cancel</button>
        </div>
      </div>
    </div>
  );
}
