import { Outlet } from "react-router-dom";
import AppSidebar from "./AppSidebar";
import { OutletProvider } from "@/contexts/OutletContext";

const AppLayout = () => {
  return (
    <OutletProvider>
      <div className="flex min-h-screen">
        <AppSidebar />
        <main className="flex-1 overflow-auto">
          <div className="p-3 sm:p-4 md:p-6 lg:p-8 pt-16 sm:pt-14 md:pt-6">
            <Outlet />
          </div>
        </main>
      </div>
    </OutletProvider>
  );
};

export default AppLayout;
