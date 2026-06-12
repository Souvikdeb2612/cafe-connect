import { createContext, useContext, useState, ReactNode } from "react";

const STORAGE_KEY = "cafe_selected_outlet";

interface OutletContextType {
  selectedOutletId: string | null;
  setSelectedOutletId: (id: string | null) => void;
}

const OutletContext = createContext<OutletContextType | undefined>(undefined);

export const OutletProvider = ({ children }: { children: ReactNode }) => {
  const [selectedOutletId, setSelectedOutletIdState] = useState<string | null>(
    () => localStorage.getItem(STORAGE_KEY)
  );

  const setSelectedOutletId = (id: string | null) => {
    if (id) {
      localStorage.setItem(STORAGE_KEY, id);
    } else {
      localStorage.removeItem(STORAGE_KEY);
    }
    setSelectedOutletIdState(id);
  };

  return (
    <OutletContext.Provider value={{ selectedOutletId, setSelectedOutletId }}>
      {children}
    </OutletContext.Provider>
  );
};

export const useOutlet = () => {
  const context = useContext(OutletContext);
  if (!context) throw new Error("useOutlet must be used within OutletProvider");
  return context;
};
