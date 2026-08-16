const apiBaseUrl = import.meta.env.VITE_API_BASE_URL;

if (!apiBaseUrl) {
  throw new Error(
    "VITE_API_BASE_URL is not set. Copy apps/web/.env.example to apps/web/.env.local and set it.",
  );
}

export const env = { apiBaseUrl };
