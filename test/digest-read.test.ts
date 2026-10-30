import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { readNight } from '../src/digest/read.js';

describe('readNight on runs/2026-10-28.jsonl', () => {
  const night = readNight('runs', '2026-10-28');
  const row = (job: string) => night?.rows.find((r) => r.job === job);

  it('gives 5 jobs, sorted, and 1 bad line', () => {
    expect(night).not.toBeNull();
    expect(night?.night).toBe('2026-10-28');
    expect(night?.rows).toHaveLength(5);
    expect(night?.badLines).toBe(1);
    const jobs = night?.rows.map((r) => r.job) ?? [];
    expect(jobs).toEqual([...jobs].sort());
  });

  it('counts retries and takes the last status', () => {
    expect(row('fixtures/refresh')).toMatchObject({ retries: 3, runs: 4, lastStatus: 'ok', lastError: null });
  });

  it('keeps a row with a null owner', () => {
    expect(row('digest/render')).toMatchObject({ owner: null, runs: 1 });
  });

  it('keeps the last error of a failed job', () => {
    expect(row('notes/backup')).toMatchObject({ lastStatus: 'fail', lastError: 'quota exceeded' });
  });

  it('keeps the offset on times', () => {
    expect(row('fixtures/refresh')).toMatchObject({
      firstAt: '2026-10-29T01:30:00+01:00',
      lastAt: '2026-10-29T01:37:00+01:00',
    });
  });
});

describe('readNight edge cases', () => {
  const dir = mkdtempSync(join(tmpdir(), 'rig-digest-'));
  afterAll(() => rmSync(dir, { recursive: true, force: true }));

  it('returns null for a missing file', () => {
    expect(readNight(dir, '2000-01-01')).toBeNull();
  });

  it('returns no rows for an empty file', () => {
    writeFileSync(join(dir, '2000-01-02.jsonl'), '');
    expect(readNight(dir, '2000-01-02')).toEqual({ night: '2000-01-02', rows: [], badLines: 0 });
  });

  it('counts invalid lines and skips blank ones', () => {
    const lines = [
      '{"at":"2026-01-01T00:00:00+01:00","job":"a","status":"ok","owner":"x"}',
      '',
      '{"at":"2026-01-01T00:00:00+01:00","job":"a","status":"maybe","owner":"x"}',
      '{"job":"a","status":"ok"}',
      '[]',
      'not json',
      '',
    ];
    writeFileSync(join(dir, '2000-01-03.jsonl'), lines.join('\n'));
    const night = readNight(dir, '2000-01-03');
    expect(night?.badLines).toBe(4);
    expect(night?.rows).toHaveLength(1);
  });
});
