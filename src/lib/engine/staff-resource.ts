export type StaffEngineResource =
  | 'sounds'
  | 'powers'
  | 'prefabs'
  | 'shop'
  | 'join-token'
  | 'models'
  | 'images';

export function parseStaffEngineResource(raw: string | null | undefined): StaffEngineResource | null {
  if (
    raw === 'sounds' ||
    raw === 'powers' ||
    raw === 'prefabs' ||
    raw === 'shop' ||
    raw === 'join-token' ||
    raw === 'models' ||
    raw === 'images'
  ) {
    return raw;
  }
  return null;
}
