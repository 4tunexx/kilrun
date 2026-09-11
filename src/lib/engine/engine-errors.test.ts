import { describe, expect, it } from 'vitest';
import {
  clearEngineIssues,
  formatEngineError,
  getLastEngineIssue,
  onEngineIssue,
  reportEngineIssue,
} from './engine-errors';

describe('engine-errors', () => {
  it('records and notifies issues', () => {
    clearEngineIssues();
    const seen: string[] = [];
    const off = onEngineIssue((issue) => seen.push(`${issue.source}:${issue.message}`));
    reportEngineIssue('list_projects', new Error('disk full'));
    expect(getLastEngineIssue()?.source).toBe('list_projects');
    expect(seen[0]).toBe('list_projects:disk full');
    expect(formatEngineError('x')).toBe('x');
    off();
  });
});
