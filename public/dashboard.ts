import './dashboard.css';
import { initDashboardApp } from './dashboard/app.js';
import { mountDashboardApp } from './dashboard/root/index.js';
import { floorManager } from './office/floorManager.js';

floorManager.init();
mountDashboardApp();
void initDashboardApp();
