export function patchTour(
  html: string,
  options?: { label?: string; into?: string },
): { html: string; changed: boolean; where: 'already' | 'bar' | 'own-bar' | 'root' };
