/**
 * Utility functions for deep equality and partial matching.
 */

/** Deep equality comparison */
export function deepEqual(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (a == null || b == null) return a === b;
  if (typeof a !== typeof b) return false;

  if (Array.isArray(a) && Array.isArray(b)) {
    if (a.length !== b.length) return false;
    for (let i = 0; i < a.length; i++) {
      if (!deepEqual(a[i], b[i])) return false;
    }
    return true;
  }

  if (typeof a === 'object' && typeof b === 'object') {
    const aKeys = Object.keys(a as Record<string, unknown>);
    const bKeys = Object.keys(b as Record<string, unknown>);
    if (aKeys.length !== bKeys.length) return false;
    for (const key of aKeys) {
      if (!deepEqual(
        (a as Record<string, unknown>)[key],
        (b as Record<string, unknown>)[key],
      )) return false;
    }
    return true;
  }

  return a === b;
}

/** Partial object match — checks that all keys in `expected` match `actual` */
export function matchObject(actual: unknown, expected: Record<string, unknown>): boolean {
  if (actual == null || typeof actual !== 'object') return false;
  for (const [key, val] of Object.entries(expected)) {
    const actualVal = (actual as Record<string, unknown>)[key];
    // Recurse for nested objects (partial match all the way down)
    if (val != null && typeof val === 'object' && !Array.isArray(val)) {
      if (!matchObject(actualVal, val as Record<string, unknown>)) return false;
    } else {
      if (!deepEqual(actualVal, val)) return false;
    }
  }
  return true;
}
