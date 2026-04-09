// Runtime environment config — overwritten by the nginx entrypoint in Docker.
// Keep all values empty here; the real values come from container env vars.
window.__env__ = {
  GOOGLE_CLIENT_ID: '',
  APPLE_CLIENT_ID: '',
  GOOGLE_ALLOWED_ORIGINS: '',
  APPLE_ALLOWED_ORIGINS: '',
};
