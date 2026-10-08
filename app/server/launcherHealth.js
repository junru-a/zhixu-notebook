import { createHash } from 'node:crypto';
import { resolve } from 'node:path';

export function launcherHealth(appDirectory) {
  const workspaceId = createHash('sha256').update(resolve(appDirectory).replace(/\\/g, '/').toLowerCase()).digest('hex');
  return (req, res, next) => {
    if (req.method !== 'GET' || req.url?.split('?')[0] !== '/__notebook/health') return next();
    res.writeHead(200, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' });
    res.end(JSON.stringify({ app: 'zhixu-open-source-notebook', workspaceId }));
  };
}
