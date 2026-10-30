// After a deploy, a tab (or a cached index.html) can still reference lazy
// chunks that no longer exist. Loading one fails and the router would leave a
// blank page; a single full reload picks up the new build instead.
const RELOAD_KEY = 'app.staleChunkReloadAt';
const STALE_CHUNK_PATTERN = /Failed to fetch dynamically imported module|Importing a module script failed|error loading dynamically imported module|ChunkLoadError|Unexpected token '<'/i;

export function reloadOnStaleChunk(error: unknown, targetUrl: string): void {
  const message = error instanceof Error ? `${error.name} ${error.message}` : String(error);
  if (!STALE_CHUNK_PATTERN.test(message)) {
    return;
  }

  // Guard against a reload loop if the chunk is genuinely broken.
  try {
    const last = Number(sessionStorage.getItem(RELOAD_KEY) ?? 0);
    if (Date.now() - last < 30_000) {
      return;
    }
    sessionStorage.setItem(RELOAD_KEY, String(Date.now()));
  } catch {
    // Storage unavailable: still reload once.
  }

  window.location.assign(targetUrl);
}
