const DEFAULT_API_BASE_URL = "http://localhost:8000";

const configuredBaseUrl = import.meta.env.VITE_API_BASE_URL?.trim();

export const API_BASE_URL = (configuredBaseUrl || DEFAULT_API_BASE_URL).replace(/\/+$/, "");

export const apiUrl = (path) =>
  `${API_BASE_URL}${path.startsWith("/") ? path : `/${path}`}`;

export const readApiError = async (response, fallbackMessage) => {
  try {
    const body = await response.json();
    if (typeof body?.detail === "string") return body.detail;
    if (body?.detail) return JSON.stringify(body.detail);
  } catch {
    // The response was not JSON; use the caller's fallback message.
  }
  return fallbackMessage;
};

export const downloadResponseBlob = async (response, fallbackFilename) => {
  const blob = await response.blob();
  const disposition = response.headers.get("content-disposition") || "";
  const utf8Match = disposition.match(/filename\*=utf-8''([^;]+)/i);
  const filenameMatch = disposition.match(/filename="?([^";]+)"?/i);
  const encodedFilename = utf8Match?.[1] || filenameMatch?.[1];
  const filename = encodedFilename
    ? decodeURIComponent(encodedFilename.trim())
    : fallbackFilename;

  const url = window.URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  window.setTimeout(() => window.URL.revokeObjectURL(url), 0);
};
