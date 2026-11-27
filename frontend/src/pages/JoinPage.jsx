import { useEffect, useRef } from "react";
import { Navigate, useNavigate, useParams } from "react-router-dom";
import { toast } from "sonner";
import { useAuth } from "../contexts/AuthContext";
import { api } from "../lib/api";
import { useI18n } from "../i18n";

// Einladungslink /join/<CODE> (Plan 4b). Eingeloggt: sofort beitreten (gegenseitig).
// Nicht eingeloggt: Code merken, zum Login; das Dashboard tritt danach bei.
const PENDING_KEY = "tyc_join";

export function consumePendingJoin() {
  try {
    const h = window.localStorage.getItem(PENDING_KEY);
    if (h) window.localStorage.removeItem(PENDING_KEY);
    return h;
  } catch {
    return null;
  }
}

// Code aus dem Link (10 Zeichen, eine Woche gültig – Dean 2026-11-27). Groß/klein zählt.
function cleanHandle(h) {
  return String(h || "").trim().replace(/[^A-Za-z0-9]/g, "").slice(0, 10);
}

export default function JoinPage() {
  const { handle } = useParams();
  const { user } = useAuth();
  const { t } = useI18n();
  const navigate = useNavigate();
  const started = useRef(false);
  const code = cleanHandle(handle);

  useEffect(() => {
    if (!user || started.current || code.length !== 10) return;
    started.current = true;
    api.post("/friends/join", { handle: code })
      .then(({ data }) => toast.success(t("crew.joined", { name: data?.friend?.name || code }), { duration: 3000 }))
      .catch((err) => toast.error(err.response?.data?.detail || t("crew.addFailed"), { duration: 3000 }))
      .finally(() => navigate("/dashboard", { replace: true }));
  }, [user, code, navigate, t]);

  if (code.length !== 10) return <Navigate to="/" replace />;
  if (!user) {
    try { window.localStorage.setItem(PENDING_KEY, code); } catch { /* egal */ }
    return <Navigate to="/" replace />;
  }
  return (
    <div className="min-h-screen bg-[#0A0A0A] flex items-center justify-center" data-testid="join-page">
      <div className="text-[#CCFF00] font-anton text-3xl tracking-widest animate-pulse">{t("join.working")}</div>
    </div>
  );
}
