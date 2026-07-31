export class ValidationError extends Error {
  code: string;
  constructor(code: string, message: string) {
    super(message);
    this.code = code;
  }
}

export function assertPositiveAmount(amount: number): void {
  if (!(amount > 0) || Number.isNaN(amount)) {
    throw new ValidationError("invalid_amount", "مبلغ باید بزرگ‌تر از صفر باشد");
  }
}

export function assertBalanceReturnAllowed(
  currentQty: number,
  returnAmount: number,
): void {
  assertPositiveAmount(returnAmount);
  if (returnAmount > currentQty) {
    throw new ValidationError(
      "over_return",
      "برگشت نمی‌تواند از مانده بیشتر باشد",
    );
  }
}
