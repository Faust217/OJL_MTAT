// Format seconds to "HH:MM:SS" if >= 1h, else "MM:SS".
export const formatHMS = (secs) => {
  const total = Math.max(0, Math.floor(Number(secs) || 0));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  const pad = (n) => String(n).padStart(2, "0");
  return h > 0 ? `${pad(h)}:${pad(m)}:${pad(s)}` : `${pad(m)}:${pad(s)}`;
};

// Convenience helper for ranges
export const formatRange = (start, end) => `${formatHMS(start)} - ${formatHMS(end)}`;
