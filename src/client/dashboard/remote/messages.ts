export function isAuthFailureMessage(message: string): boolean {
  const normalized = message.trim().toLowerCase();
  return normalized.includes('authentication')
    || normalized.includes('owner access')
    || normalized.includes('owner secret')
    || normalized.includes('owner credential')
    || normalized.includes('room owner')
    || normalized.includes('permission denied')
    || normalized.includes('unauthorized')
    || normalized.includes('forbidden')
    || normalized.includes('http 401')
    || normalized.includes('http 403');
}

export function ownerAccessRequiredMessage(): string {
  return 'This server is already hosted by another owner credential. To create invites, open Agent Office on the host machine or restore the owner secret.';
}

export function isOwnerAccessErrorMessage(message: string): boolean {
  return isAuthFailureMessage(message) || message.includes('owner credential') || message.includes('owner secret');
}

export function hostAddressMismatchMessage(): string {
  return `Server updated, but this client does not have host access there. ${ownerAccessRequiredMessage()}`;
}

export function formatHostRotateError(message: string): string {
  if (isAuthFailureMessage(message)) {
    return ownerAccessRequiredMessage();
  }
  return message;
}
