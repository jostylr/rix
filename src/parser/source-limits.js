/** Portable bounds: counts/UTF-16 units, not a process memory or CPU sandbox. */
export const RIX_SOURCE_LIMITS = Object.freeze({
  sourceLength: 8 * 1024 * 1024,
  tokens: 262144,
  tokenLength: 1024 * 1024,
  numeralLength: 65536,
  nodes: 262144,
  parseDepth: 128,
  astDepth: 256,
  recoveryErrors: 32,
});

export function sourceLimits(options = {}) {
  const input = options.limits || {};
  const result = { ...RIX_SOURCE_LIMITS };
  for (const key of Object.keys(input)) {
    if (!Object.hasOwn(RIX_SOURCE_LIMITS, key)) throw new TypeError(`Unknown source limit '${key}'`);
    if (!Number.isSafeInteger(input[key]) || input[key] < 1 || input[key] > RIX_SOURCE_LIMITS[key]) {
      throw new RangeError(`Source limit '${key}' must be 1..${RIX_SOURCE_LIMITS[key]}`);
    }
    result[key] = input[key];
  }
  return result;
}

export class RixSourceLimitError extends Error {
  constructor(limit, maximum, offset = 0, endOffset = offset) {
    super(`Source limit '${limit}' exceeded (maximum ${maximum}) at position ${offset}`);
    this.name = 'RixSourceLimitError';
    this.code = 'RXP1001';
    this.reason = `Source limit '${limit}' exceeded (maximum ${maximum})`;
    this.limit = limit;
    this.maximum = maximum;
    this.offset = offset;
    this.endOffset = Math.max(offset, endOffset);
  }
}

export function checkSourceLimit(limit, value, limits, offset = 0, endOffset = offset) {
  if (value > limits[limit]) throw new RixSourceLimitError(limit, limits[limit], offset, endOffset);
}

/** Validate iteratively before lowering/lint visitors can recurse into the AST. */
export function checkAstLimits(ast, limits) {
  const work = [[ast, 0]];
  const seen = new WeakSet();
  let count = 0;
  while (work.length) {
    const [value, parentDepth] = work.pop();
    if (!value || typeof value !== 'object' || seen.has(value)) continue;
    seen.add(value);
    const node = !Array.isArray(value) && typeof value.type === 'string';
    const depth = parentDepth + (node ? 1 : 0);
    if (node) {
      checkSourceLimit('nodes', ++count, limits, value.pos?.[1] || 0, value.pos?.[2]);
      checkSourceLimit('astDepth', depth, limits, value.pos?.[1] || 0, value.pos?.[2]);
    }
    for (const [key, child] of Object.entries(value)) {
      if (key === 'systemInfo' || key === 'pos') continue;
      if (child && typeof child === 'object') work.push([child, depth]);
    }
  }
  return ast;
}
