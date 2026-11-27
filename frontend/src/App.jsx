import { Suspense, lazy } from "react";
import "@/App.css";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { Toaster } from "sonner";
import { AuthProvider, useAuth } from "./contexts/AuthContext";
import { LanguageProvider } from "./i18n";
import Login from "./pages/Login";
import Dashboard from "./pages/Dashboard";
// Einstellungen erst laden, wenn sie geöffnet werden (Plan 9): kleineres Start-Paket.
const Settings = lazy(() => import("./pages/Settings"));
import JoinPage from "./pages/JoinPage";
const Legal = lazy(() => import("./pages/Legal"));

// REMINDER: DO NOT HARDCODE THE URL, OR ADD ANY FALLBACKS OR REDIRECT URLS, THIS BREAKS THE AUTH

function AuthGate({ children }) {
  // Globaler Auth-Gate: solange wir noch nicht wissen, ob ein User existiert,
  // zeigen wir einen einheitlichen "AUTHENTICATING..." Screen — auch auf der
  // Login-Route ("/"). Dadurch kann der Login-Screen niemals kurz aufblitzen,
  // waehrend wir vom OAuth-Callback zurueckkommen und das Cookie schon gesetzt ist.
  const { loading } = useAuth();
  if (loading) {
    return (
      <div
        className="min-h-screen bg-[#0A0A0A] flex items-center justify-center"
        data-testid="auth-loading"
      >
        {/* gleicher Ladebildschirm wie das Dashboard (Dean 2026-11-27: kein eigenes „Authenticating“) */}
        <p className="text-[#CCFF00] font-anton text-3xl tracking-widest animate-pulse">LOADING...</p>
      </div>
    );
  }
  return children;
}

function PublicOnly({ children }) {
  // "/" Route: wenn User schon eingeloggt ist, direkt aufs Dashboard.
  const { user } = useAuth();
  if (user) return <Navigate to="/dashboard" replace />;
  return children;
}

function ProtectedRoute({ children }) {
  const { user } = useAuth();
  if (!user) return <Navigate to="/" replace />;
  return children;
}

function AppRouter() {
  return (
    <Routes>
      {/* Impressum/Datenschutz: immer sofort erreichbar, ohne Login und ohne auf den Server zu warten */}
      <Route path="/impressum" element={<Suspense fallback={null}><Legal page="imprint" /></Suspense>} />
      <Route path="/datenschutz" element={<Suspense fallback={null}><Legal page="privacy" /></Suspense>} />
      <Route path="*" element={<AuthGate>
      <Routes>
        <Route path="/" element={<PublicOnly><Login /></PublicOnly>} />
        <Route path="/dashboard" element={<ProtectedRoute><Dashboard /></ProtectedRoute>} />
        <Route
          path="/settings"
          element={
            <ProtectedRoute>
              <Suspense fallback={<div className="min-h-screen bg-[#0A0A0A]" data-testid="settings-loading" />}>
                <Settings />
              </Suspense>
            </ProtectedRoute>
          }
        />
        <Route path="/join/:handle" element={<JoinPage />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
      </AuthGate>} />
    </Routes>
  );
}

export default function App() {
  return (
    <div className="App">
      <LanguageProvider>
      <BrowserRouter>
        <AuthProvider>
          <AppRouter />
          <Toaster
            theme="dark"
            position="top-right"
            toastOptions={{
              style: {
                background: "#121212",
                border: "1px solid #222",
                borderRadius: 0,
                color: "#fff",
                fontFamily: "Manrope, sans-serif",
              },
            }}
          />
        </AuthProvider>
      </BrowserRouter>
      </LanguageProvider>
    </div>
  );
}