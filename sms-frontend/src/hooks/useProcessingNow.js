import { useState, useEffect, useRef } from "react";
import processingDateApi from "../api/processingDateApi";

// Returns a live-ticking Date object representing the application's
// simulated "now" (advanced processing date + real/offset time-of-day),
// instead of the browser's real new Date(). Ticks every second so
// components using it for live clocks or elapsed-time math update
// naturally, but the underlying value stays anchored to the processing
// datetime fetched once on mount.
export function useProcessingNow() {
  const [now, setNow] = useState(new Date());
  const offsetMsRef = useRef(0);

  useEffect(() => {
    processingDateApi.getDatetime().then(r => {
      const serverDt = new Date(r.data.data.processing_datetime);
      offsetMsRef.current = serverDt.getTime() - Date.now();
      setNow(new Date(Date.now() + offsetMsRef.current));
    }).catch(() => {});
  }, []);

  useEffect(() => {
    const timer = setInterval(() => {
      setNow(new Date(Date.now() + offsetMsRef.current));
    }, 1000);
    return () => clearInterval(timer);
  }, []);

  return now;
}
