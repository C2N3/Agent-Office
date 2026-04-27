import React, { type ReactElement, type RefObject, useEffect, useMemo, useRef } from 'react';
import { useI18n } from '../../i18n/react.js';
import type { DashboardTerminalEntry, DashboardTerminalProfile } from '../shared.js';

export function TerminalTabs({
  activeId,
  terminals,
  onActivate,
  onClose,
}: {
  activeId: string | null;
  terminals: Array<[string, DashboardTerminalEntry]>;
  onActivate: (terminalId: string) => void;
  onClose: (terminalId: string) => void;
}): ReactElement {
  const { t } = useI18n();

  return (
    <>
      {terminals.map(([terminalId, terminal]) => (
        <div
          key={terminalId}
          className={`terminal-tab${activeId === terminalId ? ' active' : ''}`}
          data-agent-id={terminalId}
          onClick={() => onActivate(terminalId)}
        >
          <span className={`terminal-tab-dot${terminal.exited ? ' exited' : ''}`} />
          <span className="terminal-tab-label">{terminal.label}</span>
          <button
            className="terminal-tab-close"
            title={t('terminal.closeTab')}
            type="button"
            onClick={(event) => {
              event.stopPropagation();
              onClose(terminalId);
            }}
          >
            &times;
          </button>
        </div>
      ))}
    </>
  );
}

export function PowerShellPolicyBanner({
  visible,
  onDismiss,
  onFix,
}: {
  onDismiss: () => void;
  onFix: () => void;
  visible: boolean;
}): ReactElement | null {
  return (
    <div className="ps-policy-banner" hidden={!visible}>
      <span>PowerShell 외부 스크립트 실행이 차단되어 있습니다. Claude CLI를 사용하려면 스크립트 실행 허용이 필요합니다.</span>
      <button type="button" onClick={onFix}>설정 열기</button>
      <button type="button" onClick={onDismiss}>닫기</button>
    </div>
  );
}

export function isOutsideTerminalProfileMenu(
  target: Node | null,
  menuElement: HTMLElement | null,
  triggerElement: HTMLElement | null,
): boolean {
  if (!target) return true;
  return !menuElement?.contains(target) && !triggerElement?.contains(target);
}

export function TerminalProfileMenu({
  defaultProfileId,
  onClose,
  onOpenProfile,
  onSetDefaultProfile,
  open,
  profiles,
  triggerRef,
}: {
  defaultProfileId: string | null;
  onClose: () => void;
  onOpenProfile: (profileId: string) => void | Promise<void>;
  onSetDefaultProfile: (profileId: string) => void | Promise<void>;
  open: boolean;
  profiles: DashboardTerminalProfile[];
  triggerRef: RefObject<HTMLElement | null>;
}): ReactElement | null {
  const { t } = useI18n();
  const menuRef = useRef<HTMLDivElement | null>(null);
  const defaultProfile = useMemo(
    () => profiles.find((profile) => profile.id === defaultProfileId) || profiles[0] || null,
    [defaultProfileId, profiles],
  );

  useEffect(() => {
    if (!open) return;

    const onDocumentClick = (event: MouseEvent) => {
      const target = event.target instanceof Node ? event.target : null;
      if (!isOutsideTerminalProfileMenu(target, menuRef.current, triggerRef.current)) return;
      onClose();
    };

    const onDocumentKeydown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        onClose();
      }
    };

    document.addEventListener('click', onDocumentClick);
    document.addEventListener('keydown', onDocumentKeydown);
    return () => {
      document.removeEventListener('click', onDocumentClick);
      document.removeEventListener('keydown', onDocumentKeydown);
    };
  }, [open, onClose, triggerRef]);

  if (!open) return null;

  return (
    <div ref={menuRef} className="terminal-launch-popover" id="terminalProfileMenu">
      {profiles.length === 0 ? (
        <>
          <div className="terminal-launch-header">
            <div>
              <div className="terminal-launch-title">{t('terminal.new')}</div>
              <div className="terminal-launch-subtitle">{t('terminal.noProfiles')}</div>
            </div>
            <button className="terminal-launch-close" type="button" onClick={onClose}>&times;</button>
          </div>
        </>
      ) : (
        <>
          <div className="terminal-launch-header">
            <div>
              <div className="terminal-launch-title">{t('terminal.new')}</div>
              <div className="terminal-launch-subtitle">{t('terminal.profileHelp')}</div>
            </div>
            <button className="terminal-launch-close" type="button" onClick={onClose}>&times;</button>
          </div>
          <button
            className="terminal-launch-primary"
            type="button"
            onClick={() => {
              if (!defaultProfile) return;
              onClose();
              void onOpenProfile(defaultProfile.id);
            }}
          >
            <span className="terminal-launch-primary-label">{t('terminal.openDefault')}</span>
            <span className="terminal-launch-primary-value">{defaultProfile.title}</span>
          </button>
          <div className="terminal-profile-section-title">{t('terminal.openWith')}</div>
          <div className="terminal-profile-list">
            {profiles.map((profile) => (
              <button
                key={profile.id}
                className="terminal-profile-item"
                data-action="open-profile"
                data-profile-id={profile.id}
                type="button"
                onClick={() => {
                  onClose();
                  void onOpenProfile(profile.id);
                }}
              >
                <span className="terminal-profile-item-main">
                  <span className="terminal-profile-item-title">{profile.title}</span>
                  <span className="terminal-profile-item-hint">{t('terminal.oneOffHint')}</span>
                </span>
                {profile.id === defaultProfile?.id ? <span className="terminal-profile-badge">{t('terminal.defaultBadge')}</span> : null}
              </button>
            ))}
          </div>
          <div className="terminal-profile-divider" />
          <div className="terminal-profile-section-title">{t('terminal.defaultProfile')}</div>
          <div className="terminal-profile-list">
            {profiles.map((profile) => (
              <button
                key={profile.id}
                className={`terminal-profile-item${profile.id === defaultProfile?.id ? ' selected' : ''}`}
                data-action="set-default-profile"
                data-profile-id={profile.id}
                type="button"
                onClick={() => {
                  void onSetDefaultProfile(profile.id);
                }}
              >
                <span className="terminal-profile-item-main">
                  <span className="terminal-profile-item-title">{profile.title}</span>
                  <span className="terminal-profile-item-hint">{t('terminal.setDefaultHint')}</span>
                </span>
                <span className="terminal-profile-check">{profile.id === defaultProfile?.id ? '✓' : ''}</span>
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
