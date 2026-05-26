import { useAuth } from "@/hooks/useAuth";
import Auth from "./Auth";
import { Navigate } from "react-router-dom";

export default function Index() {
  const { user, loading } = useAuth();

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <img src="/aw-logo.png" alt="AW" className="h-24 w-24 object-contain animate-pulse" />
      </div>
    );
  }

  if (!user) return <Auth />;
  return <Navigate to="/dashboard" replace />;
}
