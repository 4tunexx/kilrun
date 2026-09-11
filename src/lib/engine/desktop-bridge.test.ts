import { describe, expect, it } from 'vitest';
import {
  desktopEngineInfo,
  listDesktopProjects,
  readDesktopProject,
  startDesktopAuthLoopback,
} from './desktop-bridge';

describe('desktop-bridge off Engine', () => {
  it('returns empty lists and nulls when not running inside Tauri', async () => {
    expect(await desktopEngineInfo()).toBeNull();
    expect(await listDesktopProjects()).toEqual([]);
    expect(await readDesktopProject('map_1')).toBeNull();
    expect(await startDesktopAuthLoopback()).toBeNull();
  });
});
