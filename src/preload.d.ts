import type { ElectronAPI as SharedElectronAPI } from './shared/contracts/index';

export {};

declare global {
  interface ElectronAPI extends SharedElectronAPI {}

  interface Window {
    electronAPI: SharedElectronAPI;
  }
}
