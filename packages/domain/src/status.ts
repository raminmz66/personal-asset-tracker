export function personShortStatus(activeCount: number): string {
  if (activeCount > 0) {
    return `${activeCount} موجودی فعال`;
  }
  return "تسویه";
}
