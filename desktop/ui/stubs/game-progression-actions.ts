export type GameProgressionSnapshot = {
  userId: string;
  level: number;
  xp: number;
  skillPoints: number;
  abilities: Record<string, number>;
};

export async function getGameProgression(_userId: string): Promise<GameProgressionSnapshot | null> {
  return {
    userId: 'desktop-editor',
    level: 1,
    xp: 0,
    skillPoints: 0,
    abilities: {},
  };
}

export async function getPowerDefinitionsForMenu() {
  return [];
}

export async function grantGameXp(_userId: string, _amount: number) {
  return getGameProgression('desktop-editor');
}

export async function upgradeGameAbility(_userId: string, _ability: string) {
  return getGameProgression('desktop-editor');
}
