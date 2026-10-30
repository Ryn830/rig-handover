// Plan morning-digest § 1. The contract every part of § 2 builds against: one row per job for a
// night in runs/<night>.jsonl, and the reader that produces them.

export type RunStatus = 'ok' | 'retry' | 'fail';

// One line of runs/<night>.jsonl, once parsed.
export type RunLine = {
  at: string;
  job: string;
  status: RunStatus;
  owner: string | null;
  error?: string;
};

// One job across the night. Times keep the offset from the log (styleguide).
export type DigestRow = {
  job: string;
  owner: string | null;
  runs: number;
  retries: number;
  lastStatus: RunStatus;
  lastError: string | null;
  firstAt: string;
  lastAt: string;
};

// A night on disk: its rows sorted by job, and how many lines didn't parse (counted, never thrown).
export type Night = {
  night: string;
  rows: DigestRow[];
  badLines: number;
};

// Implemented in src/digest/read.ts as `export const readNight: ReadNight`.
// null when runs/<night>.jsonl doesn't exist; an empty file gives { rows: [], badLines: 0 }.
export type ReadNight = (runsDir: string, night: string) => Night | null;
