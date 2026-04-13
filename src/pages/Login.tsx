import { useAuth } from "../context/AuthContext";
import { useNavigate } from "react-router-dom";
import { useEffect, useState } from "react";
import logo from "../assets/logo.png";
import fondoinicio from "../assets/fondoinicio.jpg";
import "./Login.css";

const Login = () => {
  const { user, loginWithGoogle } = useAuth();
  const navigate = useNavigate();
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (user) navigate("/");
  }, [user, navigate]);

  const handleLogin = async () => {
    try {
      setError(null);
      await loginWithGoogle();
    } catch (err: unknown) {
      if (err instanceof Error && err.message === "DOMINIO_NO_PERMITIDO") {
        setError("Solo se permite el acceso con correo @centrojuridicointernacional.com");
      } else {
        console.error("Error al iniciar sesión:", err);
        setError("Ocurrió un error al iniciar sesión. Intente de nuevo.");
      }
    }
  };

  return (
    <div className="login-page" style={{ backgroundImage: `url(${fondoinicio})` }}>
      <div className="login-card">
        {/* Panel izquierdo azul */}
        <div className="login-left">
          <div className="login-left-content">
            <p className="login-welcome">Bienvenido a</p>
            <div className="login-logo">
              <img src={logo} alt="Centro Jurídico Internacional" className="login-logo-img" />
            </div>
            <h1 className="login-brand">Centro Jurídico<br />Internacional</h1>
            <p className="login-tagline">
              Plataforma de gestión de capacitaciones empresariales. Accede con tu cuenta corporativa.
            </p>
          </div>
          <div className="login-left-wave">
            <svg viewBox="0 0 500 60" preserveAspectRatio="none">
              <path
                d="M0,30 C80,60 160,0 260,30 C360,60 440,10 500,30 L500,60 L0,60 Z"
                fill="rgba(255,255,255,0.07)"
              />
            </svg>
          </div>
        </div>

        {/* Panel derecho */}
        <div className="login-right">
          <div className="login-right-inner">
            <h2>Iniciar Sesión</h2>
            <p className="login-subtitle">
              Usa tu cuenta corporativa de Google para acceder.
            </p>

            <div className="login-domain-badge">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
                <path d="M7 11V7a5 5 0 0 1 10 0v4" />
              </svg>
              Solo correos @centrojuridicointernacional.com
            </div>

            <div className="login-divider">Acceder con</div>

            <button className="btn-google" onClick={handleLogin}>
              <svg viewBox="0 0 24 24" width="20" height="20">
                <path
                  d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z"
                />
                <path
                  d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
                />
                <path
                  d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
                />
                <path
                  d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
                />
              </svg>
              Iniciar sesión con Google
            </button>

            {error && <p className="login-error">{error}</p>}

            <p className="login-footer-text">
              Al iniciar sesión, aceptas los términos y condiciones de uso de la plataforma.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Login;
