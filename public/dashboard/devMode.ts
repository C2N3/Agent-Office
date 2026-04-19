type AppMeta = {
  isDev?: boolean;
};

async function fetchAppMeta(): Promise<AppMeta> {
  try {
    const response = await fetch('/api/app-meta', { cache: 'no-store' });
    if (!response.ok) return { isDev: false };
    return response.json() as Promise<AppMeta>;
  } catch {
    return { isDev: false };
  }
}

export async function initDevModeViews(): Promise<{ isDev: boolean }> {
  const appMeta = await fetchAppMeta();
  const isDev = !!appMeta.isDev;
  const cloudflareNavBtn = document.getElementById('cloudflareNavBtn');
  const cloudflareView = document.getElementById('cloudflareView');

  if (cloudflareNavBtn) cloudflareNavBtn.style.display = isDev ? '' : 'none';
  if (cloudflareView) cloudflareView.style.display = isDev ? '' : 'none';

  return { isDev };
}
