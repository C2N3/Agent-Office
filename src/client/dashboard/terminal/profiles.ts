import { getDashboardAPI, termState } from '../shared';
import { notifyDashboardStore, setTerminalProfileMenuOpen } from '../state/store';

function getTerminalProfile(profileId: string | null | undefined) {
  return termState.profiles.find((profile) => profile.id === profileId) || null;
}

function getDefaultTerminalProfile() {
  return getTerminalProfile(termState.defaultProfileId) || termState.profiles[0] || null;
}

function syncTerminalProfiles(result: {
  defaultProfileId?: string | null;
  profiles?: Array<{ id: string; title: string }>;
} | null | undefined): void {
  termState.profiles = Array.isArray(result?.profiles) ? result.profiles : [];
  termState.defaultProfileId = result?.defaultProfileId || termState.profiles[0]?.id || null;
}

export async function refreshTerminalProfiles() {
  const dashboardAPI = getDashboardAPI();
  if (!dashboardAPI?.getTerminalProfiles) return;

  const result = await dashboardAPI.getTerminalProfiles();
  syncTerminalProfiles(result);
  notifyDashboardStore();
}

export async function setDefaultTerminalProfile(profileId: string) {
  const dashboardAPI = getDashboardAPI();
  if (!dashboardAPI?.setDefaultTerminalProfile) {
    return { success: false, error: 'Terminal profiles are unavailable' };
  }

  const result = await dashboardAPI.setDefaultTerminalProfile(profileId);
  if (result?.success) {
    syncTerminalProfiles(result);
    notifyDashboardStore();
  }
  return result || { success: false, error: 'unknown' };
}

export function openTerminalProfileMenu(): void {
  setTerminalProfileMenuOpen(true);
}

export function closeTerminalProfileMenu(): void {
  setTerminalProfileMenuOpen(false);
}

export function toggleTerminalProfileMenu(): void {
  setTerminalProfileMenuOpen(!termState.profileMenuOpen);
}

export function initTerminalProfileMenu(): void {
  setTerminalProfileMenuOpen(false);
}
