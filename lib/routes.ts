export function bookPath(id: string): string {
  return `/?book=${encodeURIComponent(id)}`;
}
