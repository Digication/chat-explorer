import { createContext, useContext, ReactNode } from "react";
import { useQuery } from "@apollo/client/react";
import { gql } from "@apollo/client";
import { useSession } from "./auth-client";

const GET_ME = gql`
  query AuthMe {
    me {
      id
      role
      institutionId
    }
  }
`;

interface AuthUser {
  id: string;
  name: string;
  email: string;
  image?: string | null;
  role: string | null;
  institutionId: string | null;
}

interface AuthContextValue {
  user: AuthUser | null;
  isLoading: boolean;
  isAuthenticated: boolean;
}

const AuthContext = createContext<AuthContextValue>({
  user: null,
  isLoading: true,
  isAuthenticated: false,
});

export function AuthProvider({ children }: { children: ReactNode }) {
  const { data: session, isPending } = useSession();
  const isAuthed = !!session?.user;

  const { data: meData, loading: meLoading } = useQuery<any>(GET_ME, {
    skip: !isAuthed,
  });

  const value: AuthContextValue = {
    user: session?.user
      ? {
          ...session.user,
          role: meData?.me?.role ?? null,
          institutionId: meData?.me?.institutionId ?? null,
        }
      : null,
    isLoading: isPending || (isAuthed && meLoading),
    isAuthenticated: isAuthed,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  return useContext(AuthContext);
}
