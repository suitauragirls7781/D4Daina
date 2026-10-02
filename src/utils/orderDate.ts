/**
 * Order date for display in the admin panel: "02 Oct 2026, 03:45 pm" in India time.
 * Orders store the date as a UTC ISO string; this only changes how it is shown. A value that is not a
 * valid date is returned as it is, and a plain day ("2026-10-02") is shown without a time.
 */
export const formatOrderDate = (value: unknown): string => {
  const raw = String(value ?? '');
  const date = new Date(raw);
  if (!raw || Number.isNaN(date.getTime())) return raw;
  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) {
    return date.toLocaleDateString('en-IN', { timeZone: 'UTC', day: '2-digit', month: 'short', year: 'numeric' });
  }
  return date.toLocaleString('en-IN', { timeZone: 'Asia/Kolkata', day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
};
