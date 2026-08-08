import { describe, expect, it } from 'vitest';
import { serialise } from './serialise.js';

describe('deterministic serialiser', () => {
  it('produces identical output regardless of key insertion order', () => {
    expect(serialise({ b: 1, a: 2 })).toBe(serialise({ a: 2, b: 1 }));
  });

  it('sorts nested keys and preserves array order', () => {
    const text = serialise({ z: 1, a: { d: 1, c: 2 }, list: [3, 1, 2] });
    expect(text).toBe('{\n  "a": {\n    "c": 2,\n    "d": 1\n  },\n  "list": [\n    3,\n    1,\n    2\n  ],\n  "z": 1\n}\n');
  });

  it('drops undefined rather than emitting null, so optional fields round-trip', () => {
    expect(serialise({ a: 1, b: undefined })).toBe('{\n  "a": 1\n}\n');
  });

  it('ends with a newline so files concatenate and diff cleanly', () => {
    expect(serialise({ a: 1 }).endsWith('\n')).toBe(true);
  });
});
