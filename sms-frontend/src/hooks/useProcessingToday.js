import { useState, useEffect } from "react";
import processingDateApi from "../api/processingDateApi";
import { getPublicRegional, isLoggedIn } from "../api/publicRegional";

function localToday() {
  return new Date().toISOString().split("T")[0];
}

// Returns [processingTodayStr, refresh]. Starts as the real local date so
// components render immediately, then corrects to the actual processing
// date once fetched (usually within one render cycle).
export function useProcessingToday() {
  const [value, setValue] = useState(localToday());

  useEffect(() => {
    if (!isLoggedIn()) {
      // before login: the processing date from the public endpoint (the normal one needs a session)
      getPublicRegional().then(d => { if (d.processing_date) setValue(d.processing_date); });
      return;
    }
    processingDateApi.get().then(r => {
      const d = r.data.data?.current_processing_date;
      if (d) setValue(d);
    }).catch(() => {});
  }, []);

  return value;
}
