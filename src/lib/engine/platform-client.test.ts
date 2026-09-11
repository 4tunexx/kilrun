import { afterEach, describe, expect, it } from 'vitest';
import {
  configureEnginePlatform,
  enginePlatformOrigin,
  hasEngineSession,
  pickCloudMapDocument,
} from './platform-client';

afterEach(() => {
  configureEnginePlatform({ token: null });
});

describe('platform-client session helpers', () => {
  it('tracks a linked Engine session token', () => {
    configureEnginePlatform({ token: null });
    expect(hasEngineSession()).toBe(false);
    configureEnginePlatform({ token: 'staff.jwt' });
    expect(hasEngineSession()).toBe(true);
    configureEnginePlatform({ token: null });
    expect(hasEngineSession()).toBe(false);
  });

  it('strips a trailing slash from a configured origin', () => {
    configureEnginePlatform({ origin: 'https://kilrun.example/' });
    expect(enginePlatformOrigin()).toBe('https://kilrun.example');
  });

  it('picks a cloud map by id or localId', () => {
    const rows = [
      {
        id: 'mongo_1',
        localId: 'map_local',
        name: 'Arena',
        mode: 'deathrun',
        thumbnailUrl: null,
        isActive: true,
        updatedAt: '2026-09-11',
        document: { version: 1, name: 'Arena' },
      },
    ];
    expect(pickCloudMapDocument(rows as never, 'mongo_1')?.name).toBe('Arena');
    expect(pickCloudMapDocument(rows as never, 'map_local')?.name).toBe('Arena');
    expect(pickCloudMapDocument(rows as never, 'missing')).toBeNull();
  });
});
