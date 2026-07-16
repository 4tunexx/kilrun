import NextAuth from 'next-auth';
import Credentials from 'next-auth/providers/credentials';

/**
 * Steam identities are verified out-of-band by the native OpenID 2.0 handshake
 * in `src/app/api/auth/steam/` (initiate) and `src/app/api/auth/steam/callback/`
 * (verify + Prisma upsert + session mint). This Credentials provider exists so
 * NextAuth recognizes "steam" as the configured identity source and so the rest
 * of the app can rely on NextAuth's session/cookie machinery (`auth()`,
 * `useSession()`, `signOut()`) without pulling in an unstable third-party
 * NextAuth-Steam package built on Node-only OpenID libraries.
 */
export const { handlers, auth, signIn, signOut } = NextAuth({
  providers: [
    Credentials({
      id: 'steam',
      name: 'Steam',
      credentials: {},
      async authorize() {
        return null;
      },
    }),
  ],
  session: { strategy: 'jwt' },
  secret: process.env.AUTH_SECRET,
  pages: {
    signIn: '/landing',
  },
  callbacks: {
    async jwt({ token, user }) {
      if (user) {
        token.steamId = (user as { steamId?: string }).steamId;
        token.picture = user.image;
      }
      return token;
    },
    async session({ session, token }) {
      const user = session.user as (typeof session.user & { id?: string; steamId?: string }) | undefined;
      if (user) {
        user.id = token.sub ?? user.id;
        user.steamId = (token.steamId as string | undefined) ?? user.steamId;
      }
      return session;
    },
  },
});
