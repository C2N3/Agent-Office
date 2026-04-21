let officeCanvasHost: HTMLCanvasElement | null = null;

export function registerOfficeCanvasHost(element: HTMLCanvasElement | null): void {
  officeCanvasHost = element;
}

export function getOfficeCanvasHost(): HTMLCanvasElement | null {
  return officeCanvasHost;
}
