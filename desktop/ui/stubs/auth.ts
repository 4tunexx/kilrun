export async function auth() {
  return {
    user: {
      id: 'desktop-editor',
      steamId: '0',
      name: 'Editor',
    },
  };
}

export async function signIn() {
  return { ok: true };
}

export async function signOut() {
  return { ok: true };
}

export const handlers = {};
