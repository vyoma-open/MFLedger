import { nanoid } from 'nanoid';

/** Generate a unique ID with optional prefix */
export function generateId(prefix?: string): string {
  const id = nanoid(12);
  return prefix ? `${prefix}_${id}` : id;
}
