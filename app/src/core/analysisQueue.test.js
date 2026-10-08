import { it, expect, vi } from 'vitest';
import { notebookFetch } from './desktop.js';
it('serializes architecture and record requests and skips a cancelled queued request', async () => {
  let finish;
  const fetcher = vi.fn().mockImplementationOnce(() => new Promise(resolve => { finish = resolve; })).mockResolvedValue({ ok: true });
  vi.stubGlobal('fetch', fetcher);
  try {
    const first = notebookFetch('/api/architecture/analyze', { method: 'POST' });
    await Promise.resolve();
    const controller = new AbortController(), second = notebookFetch('/api/architecture/record', { method: 'POST', signal: controller.signal });
    const cancelled = expect(second).rejects.toMatchObject({ name: 'AbortError' }); controller.abort();
    expect(fetcher).toHaveBeenCalledTimes(1); finish({ ok: true }); await first; await cancelled;
    await notebookFetch('/api/architecture/record', { method: 'POST' }); expect(fetcher).toHaveBeenCalledTimes(2);
  } finally { vi.unstubAllGlobals(); }
});
