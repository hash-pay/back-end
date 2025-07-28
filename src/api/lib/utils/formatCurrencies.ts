export function toMicroUnits(amount: string | number): bigint {
  return BigInt(Math.floor(parseFloat(amount.toString()) * 1_000_000));
}
