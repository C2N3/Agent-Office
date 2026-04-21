import './dashboard.css';
import { mountDashboardApp } from './dashboard/root/index.js';
import { floorManager } from './office/floorManager.js';
import { initDashboardRuntime } from './dashboard/runtime/bootstrap.js';

floorManager.init();
mountDashboardApp();
void initDashboardRuntime();
