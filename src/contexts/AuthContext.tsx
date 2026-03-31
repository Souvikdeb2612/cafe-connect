import {
  createContext,
  useContext,
  useEffect,
  useState,
  ReactNode,
} from "react";
import { User, Session } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";

type AppRole = "admin" | "outlet_manager" | "staff";

interface AuthContextType {
  user: User | null;
  session: Session | null;
  loading: boolean;
  roles: AppRole[];
  isAdmin: boolean;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider = ({ children }: { children: ReactNode }) => {
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);
  const [roles, setRoles] = useState<AppRole[]>([]);

  const fetchRoles = async (userId: string) => {
    const { data } = await supabase
      .from("user_roles")
      .select("role")
      .eq("user_id", userId);
    setRoles((data || []).map((r: { role: string }) => r.role as AppRole));
  };

  useEffect(() => {
    let mounted = true;
    let initialized = false;

    const initializeAuth = async () => {
      try {
        // Primary: fetch current session immediately
        const {
          data: { session },
          error,
        } = await supabase.auth.getSession();

        if (!mounted) return;

        if (error) {
          console.error("Failed to get session:", error);
          if (!initialized) {
            initialized = true;
            setSession(null);
            setUser(null);
            setRoles([]);
            setLoading(false);
          }
          return;
        }

        if (!initialized) {
          initialized = true;
          setSession(session);
          setUser(session?.user ?? null);
          if (session?.user) {
            try {
              await fetchRoles(session.user.id);
            } catch (e) {
              console.error("Failed to fetch roles:", e);
            }
          }
          setLoading(false);
        }
      } catch (e) {
        console.error("Auth initialization error:", e);
        if (mounted && !initialized) {
          initialized = true;
          setSession(null);
          setUser(null);
          setRoles([]);
          setLoading(false);
        }
      }
    };

    initializeAuth();

    // Secondary: listen for subsequent auth changes (sign-in, sign-out, token refresh)
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange(async (_event, session) => {
      if (!mounted) return;

      // Skip the initial event — already handled by getSession above
      if (!initialized) {
        initialized = true;
        setSession(session);
        setUser(session?.user ?? null);
        if (session?.user) {
          try {
            await fetchRoles(session.user.id);
          } catch (e) {
            console.error("Failed to fetch roles:", e);
          }
        } else {
          setRoles([]);
        }
        setLoading(false);
        return;
      }
      // Subsequent auth events
      setSession(session);
      setUser(session?.user ?? null);
      if (session?.user) {
        try {
          await fetchRoles(session.user.id);
        } catch (e) {
          console.error("Failed to fetch roles:", e);
        }
      } else {
        setRoles([]);
      }
    });

    return () => {
      mounted = false;
      subscription.unsubscribe();
    };
  }, []);

  const signOut = async () => {
    await supabase.auth.signOut();
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        session,
        loading,
        roles,
        isAdmin: roles.includes("admin"),
        signOut,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) throw new Error("useAuth must be used within AuthProvider");
  return context;
};
