/**
 * GS1 mod-10 check digit (used by GTIN-8/12/13/14, SSCC, GLN, GSIN).
 * Weights 3,1,3,1… applied from the rightmost data digit.
 */
export function gs1CheckDigit(digits: string): number {
  if (!/^\d+$/.test(digits)) throw new TypeError("gs1CheckDigit expects digits only.");
  let sum = 0;
  for (let i = digits.length - 1, w = 3; i >= 0; i -= 1, w = w === 3 ? 1 : 3) {
    sum += (digits.charCodeAt(i) - 48) * w;
  }
  return (10 - (sum % 10)) % 10;
}

/** True if the last digit of `digits` is a valid GS1 mod-10 check digit. */
export function hasValidGs1CheckDigit(digits: string): boolean {
  if (!/^\d{2,}$/.test(digits)) return false;
  return gs1CheckDigit(digits.slice(0, -1)) === digits.charCodeAt(digits.length - 1) - 48;
}
