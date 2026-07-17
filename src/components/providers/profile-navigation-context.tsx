'use client';

import { createContext, useContext, type ReactNode } from 'react';

interface ProfileNavigationValue {
  /** Navigates to a user's full public profile page from anywhere in the hub. */
  openProfile: (userId: string) => void;
}

const ProfileNavigationContext = createContext<ProfileNavigationValue | null>(null);

export function ProfileNavigationProvider({
  value,
  children,
}: {
  value: ProfileNavigationValue;
  children: ReactNode;
}) {
  return (
    <ProfileNavigationContext.Provider value={value}>
      {children}
    </ProfileNavigationContext.Provider>
  );
}

/** Safe outside a provider (no-op fallback) so components can be reused freely. */
export function useProfileNavigation(): ProfileNavigationValue {
  const ctx = useContext(ProfileNavigationContext);
  return ctx ?? { openProfile: () => {} };
}
