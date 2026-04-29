@echo off
echo Starting HOST instance (port 3000)...
start "AO-Host" cmd /k "set AO_DASHBOARD_PORT=3000&& set AO_HOOK_PORT=47821&& set AO_CONFIG_DIR=%USERPROFILE%\.agent-office-host&& set AO_CENTRAL_SERVER_URL=http://127.0.0.1:47823&& npm start"

timeout /t 5 /nobreak >nul

echo Starting GUEST instance (port 3002)...
start "AO-Guest" cmd /k "set AO_DASHBOARD_PORT=3002&& set AO_HOOK_PORT=47831&& set AO_CONFIG_DIR=%USERPROFILE%\.agent-office-guest&& set AO_CENTRAL_SERVER_URL=http://127.0.0.1:47823&& npm start"
