/**
 * Marks a call stack as trusted server-side (webhooks, Steam callback, etc.)
 * so internal progression helpers can run without a browser session.
 * Client-invoked server actions never enter this context.
 */
import { AsyncLocalStorage } from 'async_hooks';

const trustedAls = new AsyncLocalStorage<boolean>();

export function runAsTrustedServer<T>(fn: () => Promise<T>): Promise<T> {
  return trustedAls.run(true, fn);
}

export function isTrustedServerContext(): boolean {
  return trustedAls.getStore() === true;
}
