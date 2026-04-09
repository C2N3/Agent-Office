import type { ElectronAPI as SharedElectronAPI } from '../public/dashboard/shared.js';

export {};

declare global {
  interface ElectronAPI extends SharedElectronAPI {}

  interface Window {
    electronAPI: SharedElectronAPI;
  }
}
