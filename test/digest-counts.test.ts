import { describe, expect, it } from 'vitest';
import { nightCounts } from '../src/digest/counts.js';

describe('nightCounts', () => {
  it('counts run lines by status for a night', () => {
    expect(nightCounts('runs', '2026-10-28')).toEqual({ ok: 10, retry: 4, fail: 1 });
  });

  it('is zero for a missing night', () => {
    expect(nightCounts('runs', '1999-01-01')).toEqual({ ok: 0, retry: 0, fail: 0 });
  });
});
