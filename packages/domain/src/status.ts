export function personShortStatus(activeCount: number): string {
  if (activeCount > 0) {
    return `${activeCount.toLocaleString("fa-IR")} موجودی فعال`;
  }
  return "تسویه";
}
