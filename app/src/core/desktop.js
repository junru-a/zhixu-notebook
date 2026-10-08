export const desktop = typeof window !== 'undefined' ? window.notebookDesktop : undefined;
export const workspaceStorage = () => desktop?.storage || window.localStorage;

// Keep the browser's local HTTP API and the packaged app's isolated IPC behind
// the same response contract. The desktop renderer never receives an API key.
let analysisQueue = Promise.resolve();
export function notebookFetch(route, options = {}) {
  if (options.method !== 'POST') return performRequest(route, options);
  const run = () => { if (options.signal?.aborted) throw new DOMException('Aborted', 'AbortError'); return performRequest(route, options); };
  const task = analysisQueue.then(run, run);
  analysisQueue = task.catch(() => {});
  return task;
}
async function performRequest(route, options) {
  if (!desktop) return fetch(route, options);
  const id = crypto.randomUUID();
  if (options.signal?.aborted) throw new DOMException('Aborted', 'AbortError');
  let abort;
  const canceled = new Promise((_resolve, reject) => {
    abort = () => { desktop.cancel(id); reject(new DOMException('Aborted', 'AbortError')); };
    options.signal?.addEventListener('abort', abort, { once: true });
  });
  try {
    const result = await Promise.race([desktop.request(id, route, options.body || ''), canceled]);
    return { ok: true, status: 200, json: async () => result };
  } finally { options.signal?.removeEventListener('abort', abort); }
}
