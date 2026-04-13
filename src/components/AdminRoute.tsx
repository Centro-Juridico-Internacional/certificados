import { Navigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { isAdmin } from "../constants/admins";

const AdminRoute = ({ children }: { children: React.ReactNode }) => {
  const { user, loading } = useAuth();

  if (loading) return <p style={{ textAlign: "center", marginTop: "40px" }}>Cargando...</p>;
  if (!user) return <Navigate to="/login" />;
  if (!isAdmin(user.email)) return <Navigate to="/" />;

  return children;
};

export default AdminRoute;
