import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createApp } from '../src/app.js';

// Job names in the order the page's table rows show them. Reads the first cell of each row.
function pageJobs(html: string): string[] {
  const tbody = html.match(/<tbody>([\s\S]*?)<\/tbody>/);
  if (!tbody) return [];
  const rows = [...tbody[1].matchAll(/<tr[^>]*>([\s\S]*?)<\/tr>/g)];
  return rows.map((row) => {
    const cell = row[1].match(/<td>([\s\S]*?)<\/td>/);
    return cell ? cell[1] : '';
  });
}

const line = (at: string, job: string, status: string, extra: Record<string, unknown> = {}) =>
  JSON.stringify({ at, job, status, owner: 'ops', ...extra });

let runsDir: string;

beforeAll(() => {
  runsDir = mkdtempSync(join(tmpdir(), 'rig-digest-routes-'));

  // A normal night: jobs out of order, one with a retry, one that failed.
  writeFileSync(
    join(runsDir, '2026-10-28.jsonl'),
    [
      line('2026-10-28T02:10:00+01:00', 'notes/backup', 'fail', { error: 'quota exceeded' }),
      line('2026-10-28T01:30:00+01:00', 'fixtures/refresh', 'retry'),
      line('2026-10-28T01:31:00+01:00', 'fixtures/refresh', 'ok'),
      line('2026-10-28T03:00:00+01:00', 'digest/render', 'ok', { owner: null }),
      '',
    ].join('\n'),
  );

  // A night with no file at all: nothing written for 2026-10-27.

  // An empty night: the file exists but holds no lines.
  writeFileSync(join(runsDir, '2026-10-26.jsonl'), '');

  // A night with one bad line among good ones.
  writeFileSync(
    join(runsDir, '2026-10-25.jsonl'),
    [
      line('2026-10-25T01:00:00+01:00', 'digest/render', 'ok'),
      'this is not json',
      line('2026-10-25T01:05:00+01:00', 'notes/backup', 'ok'),
    ].join('\n'),
  );
});

afterAll(() => {
  rmSync(runsDir, { recursive: true, force: true });
});

const app = () =>
  createApp({
    adapter: 'shim',
    installed: '2026-10-29T14:06:00+01:00',
    beatEverySeconds: 60,
    runsDir,
  });

describe('digest page for a normal night', () => {
  it('renders 200 with each job', async () => {
    const res = await app().request('/digest/2026-10-28');
    const html = await res.text();
    expect(res.status).toBe(200);
    for (const job of ['fixtures/refresh', 'digest/render', 'notes/backup']) {
      expect(html).toContain(job);
    }
    expect(html).toContain('quota exceeded');
  });

  it('JSON gives the same jobs in the same order as the table rows', async () => {
    const html = await (await app().request('/digest/2026-10-28')).text();
    const res = await app().request('/api/digest/2026-10-28');
    expect(res.status).toBe(200);
    const body = (await res.json()) as { rows: { job: string; retries: number; lastStatus: string }[] };
    const jobs = body.rows.map((r) => r.job);
    expect(jobs).toEqual(['digest/render', 'fixtures/refresh', 'notes/backup']);
    expect(pageJobs(html)).toEqual(jobs);
  });

  it('JSON counts the retry and the failure', async () => {
    const body = (await (await app().request('/api/digest/2026-10-28')).json()) as {
      rows: { job: string; retries: number; lastStatus: string; lastError: string | null }[];
    };
    const refresh = body.rows.find((r) => r.job === 'fixtures/refresh');
    const backup = body.rows.find((r) => r.job === 'notes/backup');
    expect(refresh).toMatchObject({ retries: 1, lastStatus: 'ok' });
    expect(backup).toMatchObject({ lastStatus: 'fail', lastError: 'quota exceeded' });
  });
});

describe('digest for a night with no file', () => {
  it('page is 404', async () => {
    const res = await app().request('/digest/2026-10-27');
    expect(res.status).toBe(404);
    expect(await res.text()).toContain('no run log for 2026-10-27');
  });

  it('JSON is 404', async () => {
    const res = await app().request('/api/digest/2026-10-27');
    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({ error: 'no run log', night: '2026-10-27' });
  });
});

describe('digest for an empty night', () => {
  it('page is 200 and says nothing ran', async () => {
    const res = await app().request('/digest/2026-10-26');
    const html = await res.text();
    expect(res.status).toBe(200);
    expect(html).toContain('nothing ran');
  });

  it('JSON is 200 with no rows', async () => {
    const res = await app().request('/api/digest/2026-10-26');
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ night: '2026-10-26', rows: [], badLines: 0 });
  });
});

describe('digest for a night with a bad line', () => {
  it('page is 200, renders the good jobs and counts the bad line', async () => {
    const res = await app().request('/digest/2026-10-25');
    const html = await res.text();
    expect(res.status).toBe(200);
    expect(html).toContain('digest/render');
    expect(html).toContain('notes/backup');
    expect(html).toContain('1 line didn&#39;t parse');
  });

  it('JSON reports badLines 1 and keeps the good rows', async () => {
    const res = await app().request('/api/digest/2026-10-25');
    expect(res.status).toBe(200);
    const body = (await res.json()) as { badLines: number; rows: { job: string }[] };
    expect(body.badLines).toBe(1);
    expect(body.rows.map((r) => r.job)).toEqual(['digest/render', 'notes/backup']);
  });
});
