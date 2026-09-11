/**
 * Shared issue bus so plugin / IPC / catalog failures are not silent.
 * Desktop EngineApp toasts these; tests can read getLastEngineIssue().
 */

export type EngineIssue = {
  source: string;
  message: string;
  at: number;
};

type Listener = (issue: EngineIssue) => void;

const listeners = new Set<Listener>();
let lastIssue: EngineIssue | null = null;

export function formatEngineError(err: unknown): string {
  if (err instanceof Error && err.message) return err.message;
  if (typeof err === 'string' && err.trim()) return err;
  return 'Unknown error';
}

export function reportEngineIssue(source: string, err: unknown): EngineIssue {
  const issue: EngineIssue = {
    source,
    message: formatEngineError(err),
    at: Date.now(),
  };
  lastIssue = issue;
  console.warn(`[kilrun-engine] ${source}: ${issue.message}`, err);
  for (const fn of listeners) {
    try {
      fn(issue);
    } catch {
      /* listener must not break reporters */
    }
  }
  return issue;
}

export function onEngineIssue(fn: Listener): () => void {
  listeners.add(fn);
  return () => {
    listeners.delete(fn);
  };
}

export function getLastEngineIssue(): EngineIssue | null {
  return lastIssue;
}

export function clearEngineIssues(): void {
  lastIssue = null;
}
