import './dashboard.css';
import { mountDashboardApp } from './dashboard/root/index';
import { floorManager } from './office/floorManager';
import { initDashboardRuntime } from './dashboard/runtime/bootstrap';

floorManager.init();
mountDashboardApp();
void initDashboardRuntime();
