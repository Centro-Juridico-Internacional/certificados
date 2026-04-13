import { Navigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";

const PrivateRoute = ({ children }: { children: React.ReactNode }) => {
  const { user, loading } = useAuth();

  if (loading) return <p style={{ textAlign: "center", marginTop: "40px" }}>Cargando...</p>;
  if (!user) return <Navigate to="/login" />;

  return children;
};

export default PrivateRoute;
