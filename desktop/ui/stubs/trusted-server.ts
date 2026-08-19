export function runAsTrustedServer<T>(fn: () => T): T {
  return fn();
}

export function isTrustedServerContext(): boolean {
  return false;
}

