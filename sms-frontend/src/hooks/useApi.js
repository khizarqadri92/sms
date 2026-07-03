/**
 * React Query wrappers for all API calls.
 * Components never call axios directly — always through these hooks.
 */
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";

export function useList(key, apiFn, params) {
  return useQuery({ queryKey: [key, params], queryFn: () => apiFn(params).then(r => r.data) });
}

export function useDetail(key, apiFn, id) {
  return useQuery({ queryKey: [key, id], queryFn: () => apiFn(id).then(r => r.data), enabled: !!id });
}

export function useCreate(apiFn, key) {
  const qc = useQueryClient();
  return useMutation({ mutationFn: apiFn, onSuccess: () => qc.invalidateQueries([key]) });
}

export function useUpdate(apiFn, key) {
  const qc = useQueryClient();
  return useMutation({ mutationFn: ({ id, data }) => apiFn(id, data), onSuccess: () => qc.invalidateQueries([key]) });
}
