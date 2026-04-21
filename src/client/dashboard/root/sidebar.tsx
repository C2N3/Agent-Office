import React, { type ReactElement, type ReactNode } from 'react';
import { type DashboardView } from '../state/store.js';
import styles from './sidebar.module.scss';

type NavItem = {
  icon: ReactNode;
  id?: string;
  label: string;
  view: DashboardView;
};

type NavSection = {
  items: NavItem[];
  label: string;
  marginTop?: number;
};

const sections: NavSection[] = [
  {
    label: 'Main',
    items: [
      {
        icon: (
          <svg width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2">
            <rect x="3" y="3" width="18" height="18" rx="2" ry="2" />
            <line x1="9" y1="3" x2="9" y2="21" />
          </svg>
        ),
        label: 'Overview',
        view: 'office',
      },
    ],
  },
  {
    label: 'Access',
    marginTop: 20,
    items: [
      {
        icon: (
          <svg width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
            <circle cx="12" cy="12" r="10" />
            <line x1="2" y1="12" x2="22" y2="12" />
            <path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z" />
          </svg>
        ),
        id: 'remoteNavBtn',
        label: 'Remote',
        view: 'remote',
      },
      {
        icon: (
          <svg width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
            <path d="M7 18a4 4 0 1 1 .9-7.9A5 5 0 0 1 17.5 9a3.5 3.5 0 1 1 .5 7H7z" />
          </svg>
        ),
        id: 'cloudflareNavBtn',
        label: 'Cloudflare',
        view: 'cloudflare',
      },
    ],
  },
];

export function Sidebar({
  connected,
  currentView,
  onSelectView,
}: {
  connected: boolean;
  currentView: DashboardView;
  onSelectView: (view: DashboardView) => void;
}): ReactElement {
  return (
    <aside className="sidebar">
      <div className="sidebar-header">
        <div className="brand-icon" />
        Agent-Office
      </div>
      <nav className="sidebar-nav">
        {sections.map((section) => (
          <React.Fragment key={section.label}>
            <div className={`${styles.navLabel} nav-label`} style={section.marginTop ? { marginTop: `${section.marginTop}px` } : undefined}>
              {section.label}
            </div>
            {section.items.map((item) => (
              <button
                key={item.view}
                className={`nav-item${currentView === item.view ? ' active' : ''}`}
                data-view={item.view}
                id={item.id}
                type="button"
                onClick={() => onSelectView(item.view)}
              >
                {item.icon}
                {item.label}
              </button>
            ))}
          </React.Fragment>
        ))}
      </nav>
      <div className="sidebar-footer">
        <div className={`status-dot ${connected ? 'connected' : 'disconnected'}`} id="statusIndicator" />
        <span id="connectionStatus">{connected ? 'Gateway Online' : 'Disconnected'}</span>
        <a className={`${styles.githubLink} github-link`} href="https://github.com/Mgpixelart/agent-office" target="_blank" rel="noreferrer" title="GitHub">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
            <path d="M12 2C6.477 2 2 6.477 2 12c0 4.418 2.865 8.166 6.839 9.489.5.092.682-.217.682-.482 0-.237-.009-.868-.013-1.703-2.782.604-3.369-1.342-3.369-1.342-.454-1.155-1.11-1.463-1.11-1.463-.908-.62.069-.608.069-.608 1.003.07 1.531 1.03 1.531 1.03.892 1.529 2.341 1.087 2.91.832.092-.647.35-1.088.636-1.338-2.22-.253-4.555-1.11-4.555-4.943 0-1.091.39-1.984 1.029-2.683-.103-.253-.446-1.27.098-2.647 0 0 .84-.269 2.75 1.025A9.578 9.578 0 0 1 12 6.836a9.59 9.59 0 0 1 2.504.337c1.909-1.294 2.747-1.025 2.747-1.025.546 1.377.203 2.394.1 2.647.64.699 1.028 1.592 1.028 2.683 0 3.842-2.339 4.687-4.566 4.935.359.309.678.919.678 1.852 0 1.336-.012 2.415-.012 2.742 0 .267.18.578.688.48C19.138 20.163 22 16.418 22 12c0-5.523-4.477-10-10-10z" />
          </svg>
        </a>
      </div>
    </aside>
  );
}
