import { useAuth } from "../context/AuthContext";
import { useNavigate, useLocation } from "react-router-dom";
import logo from "../assets/logo.png";
import "./MainLayout.css";

const MainLayout = ({ children }: { children: React.ReactNode }) => {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();

  const handleLogout = async () => {
    await logout();
    navigate("/login");
  };

  return (
    <div className="layout">
      {user && (
        <header className="layout-header">
          <div className="header-left">
            <span className="header-brand">Centro Jurídico Internacional</span>
          </div>
          <div className="header-center">
            <img src={logo} alt="" className="header-avatar" />
            <span className="header-email">{user.email}</span>
          </div>
          <div className="header-right">
            {location.pathname !== "/" && (
              <button type="button" className="btn-nav" onClick={() => navigate("/")}>
                Formulario
              </button>
            )}
            {location.pathname !== "/certificados" && (
              <button type="button" className="btn-nav" onClick={() => navigate("/certificados")}>
                Generar certificados
              </button>
            )}
            <button className="btn-logout" onClick={handleLogout}>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
                <polyline points="16 17 21 12 16 7" />
                <line x1="21" y1="12" x2="9" y2="12" />
              </svg>
              Cerrar sesión
            </button>
          </div>
        </header>
      )}
      <main className={user ? "layout-main" : "layout-main-full"}>
        {children}
      </main>
    </div>
  );
};

export default MainLayout;
