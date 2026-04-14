export const normalizeString = (value: unknown): string =>
  typeof value === 'string' ? value.trim() : '';
