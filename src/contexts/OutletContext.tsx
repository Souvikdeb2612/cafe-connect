import { createContext, useContext, useState, ReactNode } from "react";

interface OutletContextType {
  selectedOutletId: string | null;
  setSelectedOutletId: (id: string | null) => void;
  isAllOutletsSelected: boolean;
}

const OutletContext = createContext<OutletContextType | undefined>(undefined);

export const OutletProvider = ({ children }: { children: ReactNode }) => {
  const [selectedOutletId, setSelectedOutletId] = useState<string | null>(
    "all",
  );

  const isAllOutletsSelected = selectedOutletId === "all";

  return (
    <OutletContext.Provider
      value={{ selectedOutletId, setSelectedOutletId, isAllOutletsSelected }}
    >
      {children}
    </OutletContext.Provider>
  );
};

export const useOutlet = () => {
  const context = useContext(OutletContext);
  if (!context) throw new Error("useOutlet must be used within OutletProvider");
  return context;
};
