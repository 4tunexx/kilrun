export type PowerTreeConfig = {
  backgroundUrl: string;
  backgroundColor: string;
  backgroundOpacity: number;
};

const DEFAULT_CONFIG: PowerTreeConfig = {
  backgroundUrl: '',
  backgroundColor: '',
  backgroundOpacity: 0.5,
};

const STORAGE_KEY = 'kilrun.engine.powerTree.v1';

export async function getPowerTreeConfig(): Promise<PowerTreeConfig> {
  if (typeof window === 'undefined') return { ...DEFAULT_CONFIG };
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    return raw ? { ...DEFAULT_CONFIG, ...JSON.parse(raw) } : { ...DEFAULT_CONFIG };
  } catch {
    return { ...DEFAULT_CONFIG };
  }
}

export async function updatePowerTreeConfig(
  input: Partial<PowerTreeConfig>
): Promise<PowerTreeConfig> {
  const current = await getPowerTreeConfig();
  const next = { ...current, ...input };
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  } catch {
    /* quota */
  }
  return next;
}
