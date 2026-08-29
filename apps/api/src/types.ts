import type { UserRole } from '@genie/db';

export type AuthUser = {
  id: string;
  role: UserRole;
  email: string;
  username: string;
  emailVerified: boolean;
};

export type AppEnv = {
  Variables: {
    requestId: string;
    user?: AuthUser;
  };
};
