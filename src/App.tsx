import { lazy, Suspense } from "react";
import { Routes, Route } from "react-router-dom";
import { AuthProvider } from "./context/AuthContext";
import MainLayout from "./layouts/MainLayout";
import PrivateRoute from "./components/PrivateRoute";

const Home = lazy(() => import("./pages/Home"));
const Dashboard = lazy(() => import("./pages/Dashboard"));
const Login = lazy(() => import("./pages/Login"));
const Certificados = lazy(() => import("./pages/Certificados"));

const PageFallback = () => (
  <div style={{
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    minHeight: "calc(100vh - 80px)",
    color: "#2d7a42",
    fontFamily: "var(--sans, system-ui)",
    fontSize: 14,
  }}>
    Cargando...
  </div>
);

function App() {
  return (
    <AuthProvider>
      <MainLayout>
        <Suspense fallback={<PageFallback />}>
          <Routes>
            <Route path="/login" element={<Login />} />
            <Route
              path="/"
              element={
                <PrivateRoute>
                  <Home />
                </PrivateRoute>
              }
            />
            <Route
              path="/dashboard"
              element={
                <PrivateRoute>
                  <Dashboard />
                </PrivateRoute>
              }
            />
            <Route
              path="/certificados"
              element={
                <PrivateRoute>
                  <Certificados />
                </PrivateRoute>
              }
            />
          </Routes>
        </Suspense>
      </MainLayout>
    </AuthProvider>
  );
}

export default App;
