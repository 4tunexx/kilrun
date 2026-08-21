export type StaffEngineResource =
  | 'sounds'
  | 'powers'
  | 'prefabs'
  | 'shop'
  | 'join-token'
  | 'models';

export function parseStaffEngineResource(raw: string | null | undefined): StaffEngineResource | null {
  if (
    raw === 'sounds' ||
    raw === 'powers' ||
    raw === 'prefabs' ||
    raw === 'shop' ||
    raw === 'join-token' ||
    raw === 'models'
  ) {
    return raw;
  }
  return null;
}
