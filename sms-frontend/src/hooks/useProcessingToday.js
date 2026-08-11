import { useState, useEffect } from "react";
import processingDateApi from "../api/processingDateApi";

function localToday() {
  return new Date().toISOString().split("T")[0];
}

// Returns [processingTodayStr, refresh]. Starts as the real local date so
// components render immediately, then corrects to the actual processing
// date once fetched (usually within one render cycle).
export function useProcessingToday() {
  const [value, setValue] = useState(localToday());

  useEffect(() => {
    processingDateApi.get().then(r => {
      const d = r.data.data?.current_processing_date;
      if (d) setValue(d);
    }).catch(() => {});
  }, []);

  return value;
}
