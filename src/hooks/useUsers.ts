import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

interface UserWithRole {
  id: string;
  email: string;
  full_name: string;
  roles: string[];
  outlet_ids: string[];
}

interface Profile {
  id: string;
  full_name: string;
  email: string;
}

interface UserRole {
  user_id: string;
  role: string;
}

interface UserOutlet {
  user_id: string;
  outlet_id: string;
}

// Fetch users with roles and outlets
const fetchUsers = async (): Promise<UserWithRole[]> => {
  // Fetch all profiles
  const { data: profiles, error: profilesError } = await supabase
    .from("profiles")
    .select("id, full_name, email");

  if (profilesError) throw profilesError;

  // Fetch all roles
  const { data: roles, error: rolesError } = await supabase
    .from("user_roles")
    .select("user_id, role");

  if (rolesError) throw rolesError;

  // Fetch all user-outlet assignments
  const { data: userOutlets, error: outletsError } = await supabase
    .from("user_outlets")
    .select("user_id, outlet_id");

  if (outletsError) throw outletsError;

  // Create a map of profiles for quick lookup
  const profileMap = new Map((profiles || []).map((p) => [p.id, p]));

  // Get all unique user IDs from roles
  const allUserIds = [...new Set((roles || []).map((r) => r.user_id))];

  // Build user list from all user IDs, merging with profile data when available
  const enriched: UserWithRole[] = allUserIds.map((userId) => {
    const profile = profileMap.get(userId);
    return {
      id: userId,
      email: profile?.email || "",
      full_name: profile?.full_name || "",
      roles: (roles || [])
        .filter((r) => r.user_id === userId)
        .map((r) => r.role),
      outlet_ids: (userOutlets || [])
        .filter((uo) => uo.user_id === userId)
        .map((uo) => uo.outlet_id),
    };
  });

  return enriched;
};

// Update user roles (delete + insert pattern)
const updateUserRoles = async ({
  userId,
  role,
}: {
  userId: string;
  role: string;
}): Promise<void> => {
  // Delete existing roles
  const { error: deleteError } = await supabase
    .from("user_roles")
    .delete()
    .eq("user_id", userId);

  if (deleteError) throw deleteError;

  // Insert new role if provided
  if (role) {
    const { error: insertError } = await supabase
      .from("user_roles")
      .insert({ user_id: userId, role });

    if (insertError) throw insertError;
  }
};

// Update user outlets (delete + insert pattern)
const updateUserOutlets = async ({
  userId,
  outletIds,
}: {
  userId: string;
  outletIds: string[];
}): Promise<void> => {
  // Delete existing outlet assignments
  const { error: deleteError } = await supabase
    .from("user_outlets")
    .delete()
    .eq("user_id", userId);

  if (deleteError) throw deleteError;

  // Insert new outlet assignments if provided
  if (outletIds.length > 0) {
    const { error: insertError } = await supabase.from("user_outlets").insert(
      outletIds.map((outletId) => ({
        user_id: userId,
        outlet_id: outletId,
      }))
    );

    if (insertError) throw insertError;
  }
};

// Hook for fetching users
export const useUsers = () => {
  return useQuery({
    queryKey: ["users"],
    queryFn: fetchUsers,
  });
};

// Hook for updating user roles
export const useUpdateUserRoles = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: updateUserRoles,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["users"] });
    },
  });
};

// Hook for updating user outlets
export const useUpdateUserOutlets = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: updateUserOutlets,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["users"] });
    },
  });
};
