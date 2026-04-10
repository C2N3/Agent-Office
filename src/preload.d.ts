import type { ElectronAPI as SharedElectronAPI } from './shared/contracts/index.js';

export {};

declare global {
  interface ElectronAPI extends SharedElectronAPI {}

  interface Window {
    electronAPI: SharedElectronAPI;
  }
}
