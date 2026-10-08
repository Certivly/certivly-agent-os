export interface User {
  id: string;
  profile?: {
    name?: string;
  };
}

export function getDisplayName(user?: User | null): string {
  return (user as any).profile.name;
}
