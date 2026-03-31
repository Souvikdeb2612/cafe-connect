import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

interface Outlet {
  id: string;
  name: string;
}

interface OutletAdmin {
  id: string;
  name: string;
  address: string;
  phone: string;
  is_active: boolean;
}

// Fetch active outlets (id, name) ordered by name
const fetchActiveOutlets = async (): Promise<Outlet[]> => {
  const { data, error } = await supabase
    .from("outlets")
    .select("id, name")
    .eq("is_active", true)
    .order("name");

  if (error) throw error;
  return data || [];
};

// Fetch all outlets (for admin)
const fetchAllOutlets = async (): Promise<OutletAdmin[]> => {
  const { data, error } = await supabase
    .from("outlets")
    .select("*")
    .order("name");

  if (error) throw error;
  return data || [];
};

// Create outlet
const createOutlet = async (payload: Omit<OutletAdmin, "id">): Promise<void> => {
  const { error } = await supabase.from("outlets").insert(payload);
  if (error) throw error;
};

// Update outlet
const updateOutlet = async ({
  id,
  payload,
}: {
  id: string;
  payload: Omit<OutletAdmin, "id">;
}): Promise<void> => {
  const { error } = await supabase.from("outlets").update(payload).eq("id", id);
  if (error) throw error;
};

// Hook for fetching active outlets
export const useOutlets = () => {
  return useQuery({
    queryKey: ["outlets"],
    queryFn: fetchActiveOutlets,
  });
};

// Hook for fetching all outlets (admin)
export const useAllOutlets = () => {
  return useQuery({
    queryKey: ["outlets", "all"],
    queryFn: fetchAllOutlets,
  });
};

// Hook for creating an outlet
export const useCreateOutlet = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: createOutlet,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["outlets"] });
    },
  });
};

// Hook for updating an outlet
export const useUpdateOutlet = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: updateOutlet,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["outlets"] });
    },
  });
};
