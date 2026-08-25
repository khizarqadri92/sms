import { createContext, useContext, useState, useEffect } from "react";
import settingsApi from "../api/settingsApi";
import { useAuth } from "../auth/AuthContext";
import { useProcessingNow } from "../hooks/useProcessingNow";

const DEFAULT_SETTINGS = {
  date_format: "DD/MM/YYYY",
  time_format: "24h",
  decimal_places: "2",
  region: "en-PK",
  currency_code: "PKR",
  currency_symbol: "Rs",
  currency_position: "prefix",
  timezone: "Asia/Karachi",
  weekend_days: "Saturday,Sunday",
  first_day_of_week: "Monday",
  academic_year_start_month: "4",
  fiscal_year_start_month: "7",
  default_country_code: "+92",
};

const MONTH_SHORT = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
const MONTH_FULL = ["January","February","March","April","May","June","July","August","September","October","November","December"];

const RegionalSettingsContext = createContext(null);

export function RegionalSettingsProvider({ children }) {
  const { user } = useAuth();
  const processingNow = useProcessingNow();
  const [settings, setSettings] = useState(DEFAULT_SETTINGS);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // This provider mounts before login (it wraps the whole app, including
    // the login route), so a fetch tied only to mount would fire once while
    // unauthenticated, fail silently, and never retry - leaving components
    // stuck on DEFAULT_SETTINGS until a full page reload re-mounts
    // everything post-login. Re-running this whenever `user` changes means
    // it fires again right after a successful login.
    if (!user) { setLoading(false); return; }
    setLoading(true);
    settingsApi.getRegionalFormatPublic()
      .then(r => { if (r.data.data) setSettings(prev => ({ ...prev, ...r.data.data })); })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [user]);

  const pad = (n) => String(n).padStart(2, "0");

  const toDateObj = (input) => {
    if (input instanceof Date) return input;
    if (!input) return null;
    const d = new Date(input);
    return isNaN(d.getTime()) ? null : d;
  };

  const formatDate = (input) => {
    const d = toDateObj(input);
    if (!d) return "";
    const day = pad(d.getDate());
    const month = pad(d.getMonth() + 1);
    const year = d.getFullYear();
    const dayNum = d.getDate();
    const monIdx = d.getMonth();
    switch (settings.date_format) {
      case "MM/DD/YYYY": return `${month}/${day}/${year}`;
      case "YYYY-MM-DD": return `${year}-${month}-${day}`;
      case "DD-MM-YYYY": return `${day}-${month}-${year}`;
      case "DD MMM YYYY": return `${pad(dayNum)} ${MONTH_SHORT[monIdx]} ${year}`;
      case "MMM DD, YYYY": return `${MONTH_SHORT[monIdx]} ${pad(dayNum)}, ${year}`;
      case "DD MMMM YYYY": return `${pad(dayNum)} ${MONTH_FULL[monIdx]} ${year}`;
      case "MMMM DD, YYYY": return `${MONTH_FULL[monIdx]} ${pad(dayNum)}, ${year}`;
      case "DD/MM/YYYY":
      default: return `${day}/${month}/${year}`;
    }
  };

  const formatTime = (input) => {
    const d = toDateObj(input);
    if (!d) return "";
    if (settings.time_format === "12h") {
      return d.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", hour12: true });
    }
    return `${pad(d.getHours())}:${pad(d.getMinutes())}`;
  };

  const formatDateTime = (input) => {
    const d = toDateObj(input);
    if (!d) return "";
    return `${formatDate(d)} ${formatTime(d)}`;
  };

  const formatCurrency = (amount) => {
    const num = Number(amount) || 0;
    const decimals = parseInt(settings.decimal_places, 10) || 0;
    const formatted = num.toLocaleString(settings.region || "en-US", {
      minimumFractionDigits: decimals, maximumFractionDigits: decimals,
    });
    return settings.currency_position === "suffix"
      ? `${formatted} ${settings.currency_symbol}`
      : `${settings.currency_symbol} ${formatted}`;
  };

  const nowInSchoolTimezone = () => {
    try {
      return new Date(processingNow.toLocaleString("en-US", { timeZone: settings.timezone }));
    } catch { return processingNow; }
  };

  const isWeekend = (input) => {
    const d = toDateObj(input);
    if (!d) return false;
    const dayNames = ["Sunday","Monday","Tuesday","Wednesday","Thursday","Friday","Saturday"];
    const weekendList = (settings.weekend_days || "").split(",").map(s => s.trim());
    return weekendList.includes(dayNames[d.getDay()]);
  };

  return (
    <RegionalSettingsContext.Provider value={{
      settings, loading, formatDate, formatTime, formatDateTime, formatCurrency, nowInSchoolTimezone, isWeekend,
    }}>
      {children}
    </RegionalSettingsContext.Provider>
  );
}

export const useRegionalSettings = () => useContext(RegionalSettingsContext);
