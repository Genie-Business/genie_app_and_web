/**
 * Prisma returns BigInt for every *Kobo column. `JSON.stringify` throws on
 * BigInt, so we teach it to emit a decimal string. Import this module once at
 * process start (see server.ts / api/index.ts).
 */
if (!('toJSON' in BigInt.prototype)) {
  Object.defineProperty(BigInt.prototype, 'toJSON', {
    value(this: bigint) {
      return this.toString();
    },
    configurable: true,
    writable: true,
  });
}

/** Recursively convert BigInt values in a plain object to strings. */
export function serializeBigInts<T>(value: T): T {
  if (typeof value === 'bigint') return value.toString() as unknown as T;
  if (Array.isArray(value)) return value.map(serializeBigInts) as unknown as T;
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>).map(([k, v]) => [k, serializeBigInts(v)]),
    ) as T;
  }
  return value;
}

export {};
