/** Shared API utility helpers. */
export const handleApiError = (err) => {
  return err.response?.data?.message || "An unexpected error occurred.";
};
