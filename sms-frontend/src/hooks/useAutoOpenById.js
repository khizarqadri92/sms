import { useEffect, useRef } from "react";
import { useSearchParams } from "react-router-dom";

export function useAutoOpenById(items, openFn, idField) {
  var field = idField || "id";
  var hasOpened = useRef(false);
  useEffect(function() {
    if (hasOpened.current) return;
    var targetId = new URLSearchParams(window.location.search).get("id");
    if (!targetId || !items || items.length === 0) return;
    var found = items.find(function(i) { return String(i[field]) === String(targetId); });
    if (found) { openFn(found); hasOpened.current = true; }
  }, [items]);
}

export function getInitialFilter(defaultFilter) {
  var def = defaultFilter || "pending";
  return new URLSearchParams(window.location.search).get("id") ? "all" : def;
}
