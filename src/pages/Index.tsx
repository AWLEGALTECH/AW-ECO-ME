import { useAuth } from "@/hooks/useAuth";
import Auth from "./Auth";
import { Scale } from "lucide-react";
import { Navigate } from "react-router-dom";

export default function Index() {
  const { user, loading } = useAuth();

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <Scale className="h-10 w-10 animate-pulse text-primary" />
      </div>
    );
  }

  if (!user) return <Auth />;
  return <Navigate to="/dashboard" replace />;
}
