function createDevClientScript() {
  return `
const source = new EventSource('/__dev/events');

function refreshCss(targetPath) {
  document.querySelectorAll('link[rel="stylesheet"]').forEach((link) => {
    const href = link.getAttribute('href');
    if (!href) return;

    const nextUrl = new URL(href, window.location.href);
    if (nextUrl.pathname !== targetPath) return;

    nextUrl.searchParams.set('v', String(Date.now()));
    link.href = nextUrl.pathname + nextUrl.search;
  });
}

source.onmessage = (event) => {
  try {
    const payload = JSON.parse(event.data);
    if (payload.type === 'css-update' && payload.path) {
      refreshCss(payload.path);
      return;
    }
  } catch (error) {
    console.warn('[renderer-dev] Invalid payload', error);
  }

  window.location.reload();
};

source.onerror = () => {
  console.warn('[renderer-dev] Lost HMR connection, falling back to page reload on reconnect.');
};
`.trim();
}

module.exports = { createDevClientScript };
