export function isAuthFailureMessage(message: string): boolean {
  const normalized = message.trim().toLowerCase();
  return normalized.includes('authentication')
    || normalized.includes('permission denied')
    || normalized.includes('unauthorized')
    || normalized.includes('forbidden')
    || normalized.includes('http 401')
    || normalized.includes('http 403');
}

export function hostAddressMismatchMessage(): string {
  return 'Address saved, but this server does not accept the current host access. If this is a new server, press Open Public Room to start hosting here.';
}

export function formatHostRotateError(message: string): string {
  if (isAuthFailureMessage(message)) {
    return 'Rotate Invite needs the current host access for this server. If you changed the server address, save it first and reopen hosting here.';
  }
  return message;
}
