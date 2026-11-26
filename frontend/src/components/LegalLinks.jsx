import { Link } from "react-router-dom";
import { useI18n } from "../i18n";

// Kleine Fußzeile mit beiden Links (Login, Dashboard)
export default function LegalLinks({ className = "" }) {
  const { t } = useI18n();
  return (
    <span className={`flex items-center gap-4 ${className}`} data-testid="legal-links">
      <Link to="/impressum" className="whitespace-nowrap hover:text-[#CCFF00] transition-colors">{t("legal.imprint")}</Link>
      <Link to="/datenschutz" className="whitespace-nowrap hover:text-[#CCFF00] transition-colors">{t("legal.privacy")}</Link>
    </span>
  );
}
