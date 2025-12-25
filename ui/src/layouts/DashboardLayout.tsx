import { Link, Outlet, useLocation } from "react-router-dom";
import useSWR from "swr";
import { fetcher } from "@/lib/api";
import { LayoutDashboard, Database, Box } from "lucide-react";
import { cn } from "@/lib/utils";

export default function DashboardLayout() {
  const { data } = useSWR("/", fetcher);
  const location = useLocation();

  const endpoints = data?.endpoints || [];

  return (
    <div className="flex h-screen bg-background text-foreground">
      {/* Sidebar */}
      <aside className="w-64 border-r border-border bg-card">
        <div className="p-6 border-b border-border">
          <div className="flex items-center gap-2">
            <Box className="w-6 h-6 text-primary" />
            <h1 className="text-xl font-bold tracking-tight">Mocklite</h1>
          </div>
        </div>
        <nav className="p-4 space-y-2">
          <Link
            to="/"
            className={cn(
              "flex items-center gap-2 px-3 py-2 rounded-md text-sm font-medium transition-colors",
              location.pathname === "/"
                ? "bg-primary text-primary-foreground"
                : "text-muted-foreground hover:text-foreground hover:bg-accent"
            )}
          >
            <LayoutDashboard className="w-4 h-4" />
            Overview
          </Link>

          <div className="pt-4 pb-2">
            <p className="px-3 text-xs font-semibold text-muted-foreground uppercase tracking-wider">
              Resources
            </p>
          </div>

          {endpoints.map((endpoint: string) => {
            const name = endpoint.replace("/", "");
            return (
              <Link
                key={endpoint}
                to={`/resources${endpoint}`}
                className={cn(
                  "flex items-center gap-2 px-3 py-2 rounded-md text-sm font-medium transition-colors",
                  location.pathname === `/resources${endpoint}`
                    ? "bg-accent text-accent-foreground"
                    : "text-muted-foreground hover:text-foreground hover:bg-accent"
                )}
              >
                <Database className="w-4 h-4" />
                {name}
              </Link>
            );
          })}
        </nav>
      </aside>

      {/* Main Content */}
      <main className="flex-1 overflow-auto bg-muted/10">
        <div className="container mx-auto p-8 max-w-7xl">
          <Outlet />
        </div>
      </main>
    </div>
  );
}
