const { app, BrowserWindow, Tray, Menu, nativeImage, protocol, net, ipcMain, shell, dialog, safeStorage, screen } = require('electron');
const fs = require('node:fs');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const { createStore, atomicWrite } = require('./store.cjs');
const { readDirectories } = require('./directories.cjs');
const { parseWorkspace } = require('../app/src/core/workspace.js');
const { analyzeWithDeepSeek } = require('../app/server/architecture.js');
const { analyzeRecordWithDeepSeek } = require('../app/server/recordKnowledge.js');

const TEST = process.env.ZHIXU_DESKTOP_TEST === '1';
const profile = TEST && path.isAbsolute(process.env.ZHIXU_TEST_PROFILE || '') ? process.env.ZHIXU_TEST_PROFILE : path.join(app.getPath('appData'), 'ZhixuNotebookOpenSource');
fs.mkdirSync(profile, { recursive: true });
app.setPath('userData', profile);
app.setAppUserModelId('cn.zhixu.notebook.opensource');
protocol.registerSchemesAsPrivileged([{ scheme: 'notebook', privileges: { standard: true, secure: true, supportFetchAPI: true, corsEnabled: true } }]);
const dataDir = path.join(profile, 'data');
const configFile = path.join(profile, 'settings.json');
const windowFile = path.join(profile, 'window.json');
const store = createStore(dataDir, parseWorkspace);
const requests = new Map();
let win, tray, quitting = false, crashed = false, config = { apiKey: '', model: 'deepseek-flash' }, configError = '';
const initialQuit = process.argv.includes('--quit');
const primary = app.requestSingleInstanceLock({ quit: initialQuit });

function showWindow() {
  if (!win || win.isDestroyed()) return;
  if (crashed) { crashed = false; win.reload(); }
  if (win.isMinimized()) win.restore();
  win.setSkipTaskbar(false); win.show(); win.focus();
}
function showSettings() { showWindow(); win?.webContents.send('notebook:show-settings'); }
function requestQuit() {
  if (requests.size) {
    showWindow();
    const response = dialog.showMessageBoxSync(win, { type: 'question', title: '退出知序', message: '仍有 AI 分析正在进行。', detail: '留在后台可继续分析；退出会取消当前分析，已经保存的记录不受影响。', buttons: ['继续在后台运行', '退出软件'], defaultId: 0, cancelId: 0 });
    if (response !== 1) { win.hide(); win.setSkipTaskbar(true); return; }
  }
  app.quit();
}
function trusted(event) {
  return win && event.sender === win.webContents && event.senderFrame === win.webContents.mainFrame && event.senderFrame.url.startsWith('notebook://app/');
}
function handle(channel, fn) {
  ipcMain.handle(channel, async (event, ...args) => {
    if (!trusted(event)) return { error: '拒绝未知页面访问桌面服务。' };
    try { return { value: await fn(...args) }; }
    catch (error) { return { error: error instanceof TypeError ? '网络或服务暂不可用，请重试。' : error.message }; }
  });
}
function publicSettings() {
  return { configured: !!config.apiKey, model: config.model, dataDirectory: dataDir, error: configError, version: app.getVersion() };
}
function persistConfig(next) {
  if (!next || typeof next.model !== 'string' || !/^[a-zA-Z0-9._:-]{1,100}$/.test(next.model)) throw new Error('请填写有效的模型名称。');
  const apiKey = next.clearKey ? '' : next.apiKey || config.apiKey;
  if (typeof apiKey !== 'string' || apiKey.length > 4096 || /[\r\n]/.test(apiKey)) throw new Error('API Key 格式有误。');
  if (!safeStorage.isEncryptionAvailable()) throw new Error('Windows 密钥保护暂不可用，尚未保存配置。');
  atomicWrite(configFile, JSON.stringify({ model: next.model, encryptedKey: apiKey ? safeStorage.encryptString(apiKey).toString('base64') : '' }));
  config = { model: next.model, apiKey }; configError = '';
  return publicSettings();
}
function importEnvironment(filename) {
  if (fs.statSync(filename).size > 65536) throw new Error('配置文件过大。');
  const content = fs.readFileSync(filename, 'utf8'), values = {};
  for (const line of content.split(/\r?\n/)) {
    const match = line.match(/^\s*(?:export\s+)?(DEEPSEEK_API_KEY|DEEPSEEK_MODEL)\s*=\s*(.*?)\s*$/);
    if (!match) continue;
    let value = match[2];
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) value = value.slice(1, -1);
    else value = value.replace(/\s+#.*$/, '').trim();
    values[match[1]] = value;
  }
  if (!values.DEEPSEEK_API_KEY) throw new Error('所选文件没有 DEEPSEEK_API_KEY。');
  return persistConfig({ apiKey: values.DEEPSEEK_API_KEY, model: values.DEEPSEEK_MODEL || 'deepseek-flash' });
}
function readSettings() {
  if (TEST) return;
  if (fs.existsSync(configFile)) {
    try {
      const saved = JSON.parse(fs.readFileSync(configFile, 'utf8'));
      config = { model: saved.model || 'deepseek-flash', apiKey: saved.encryptedKey ? safeStorage.decryptString(Buffer.from(saved.encryptedKey, 'base64')) : '' };
    } catch { configError = '无法读取旧的 AI 配置，请在软件设置中重新填写。原文件已保留。'; }
    return;
  }

}
function registerIPC() {
  let choosingDirectories = false;
  handle('notebook:choose-directories', async (multiple = true) => {
    if (choosingDirectories) throw new Error('目录选择窗口已经打开。');
    choosingDirectories = true;
    try {
      const selection = await dialog.showOpenDialog(win, { title: multiple ? '选择程序目录 · 按 Ctrl / Shift 多选' : '选择要更新的原目录', buttonLabel: '读取所选目录', properties: multiple === false ? ['openDirectory'] : ['openDirectory', 'multiSelections'] });
      return selection.canceled ? null : await readDirectories(selection.filePaths);
    } finally { choosingDirectories = false; }
  });
  ipcMain.on('notebook:storage', (event, operation, key, value) => {
    try {
      if (!trusted(event)) throw new Error('拒绝未知页面访问记录。');
      if (operation !== 'get' && operation !== 'set') throw new Error('无效的数据操作');
      event.returnValue = { value: operation === 'get' ? store.getItem(key) : store.setItem(key, value) ?? true };
    } catch (error) { event.returnValue = { error: error.message }; }
  });
  handle('notebook:api', async (id, route, body) => {
    if (route === '/api/architecture/config') return { ...publicSettings(), token: 'desktop-session' };
    if (!['/api/architecture/analyze', '/api/architecture/record'].includes(route) || typeof id !== 'string' || id.length > 100 || typeof body !== 'string' || Buffer.byteLength(body) > 1600000) throw new Error('不支持的分析请求。');
    if (requests.size) throw new Error('已有分析正在进行，请稍后重试。');
    let payload;
    try { payload = JSON.parse(body); } catch { throw new Error('请求内容不是有效的 JSON。'); }
    const controller = new AbortController(); requests.set(id, controller);
    const timer = setTimeout(() => controller.abort(), 120000);
    try {
      if (TEST) {
        globalThis.__notebookTest.lastPayload = payload;
        // No real credentials or upstream traffic in desktop acceptance tests.
        return await new Promise((resolve, reject) => { controller.signal.addEventListener('abort', () => reject(new Error('分析已取消。')), { once: true }); globalThis.__notebookTest.resolveAnalysis = resolve; });
      }
      const analyze = route.endsWith('/record') ? analyzeRecordWithDeepSeek : analyzeWithDeepSeek;
      return await analyze(payload, { ...config, signal: controller.signal });
    } catch (error) { if (controller.signal.aborted) throw new Error('分析已取消或超时。记录已保存。'); throw error; }
    finally { clearTimeout(timer); requests.delete(id); }
  });
  ipcMain.on('notebook:cancel', (event, id) => { if (trusted(event)) requests.get(id)?.abort(); });
  handle('notebook:settings', () => publicSettings());
  handle('notebook:save-settings', persistConfig);
  handle('notebook:import-config', async () => {
    const result = await dialog.showOpenDialog(win, { title: '导入原有 DeepSeek 配置', properties: ['openFile'], filters: [{ name: '环境配置文件', extensions: ['local', 'env', 'txt'] }, { name: '所有文件', extensions: ['*'] }] });
    return result.canceled ? null : importEnvironment(result.filePaths[0]);
  });
  handle('notebook:open-data', async () => { fs.mkdirSync(dataDir, { recursive: true }); const error = await shell.openPath(dataDir); if (error) throw new Error('无法打开数据文件夹。'); return true; });
  handle('notebook:open-browser', async () => { await shell.openExternal('http://localhost:5290/'); return true; });
}

async function start() {
  if (initialQuit) { app.quit(); return; }
  fs.mkdirSync(profile, { recursive: true });
  readSettings(); registerIPC();
  const base = path.join(__dirname, 'web');
  const csp = "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob: https: http:; font-src 'self' data:; connect-src 'self'; object-src 'none'; base-uri 'self'; frame-src 'none'; form-action 'none'";
  protocol.handle('notebook', async (request) => {
    try {
      const url = new URL(request.url);
      if (url.hostname !== 'app' || request.method !== 'GET') return new Response('Not found', { status: 404 });
      const relative = decodeURIComponent(url.pathname).replace(/^\/+/, '') || 'index.html';
      const filename = path.resolve(base, relative), relativeCheck = path.relative(base, filename);
      if (relativeCheck.startsWith('..') || path.isAbsolute(relativeCheck) || !fs.existsSync(filename) || !fs.statSync(filename).isFile()) return new Response('Not found', { status: 404 });
      const response = await net.fetch(pathToFileURL(filename).toString());
      const headers = new Headers(response.headers); headers.set('Content-Security-Policy', csp); headers.set('X-Content-Type-Options', 'nosniff');
      return new Response(response.body, { status: response.status, headers });
    } catch { return new Response('Unable to read application file', { status: 500 }); }
  });
  let bounds = { width: 1440, height: 950 };
  try { const saved = JSON.parse(fs.readFileSync(windowFile, 'utf8')); if (Number.isFinite(saved.width) && Number.isFinite(saved.height)) { const area = screen.getPrimaryDisplay().workArea; bounds = { width: Math.max(800, Math.min(saved.width, area.width)), height: Math.max(600, Math.min(saved.height, area.height)) }; } } catch {}
  const icon = nativeImage.createFromPath(path.join(app.getAppPath(), 'assets/icon.png'));
  win = new BrowserWindow({ ...bounds, minWidth: 800, minHeight: 600, show: false, title: '知序 · 科研记录本（开源版）', icon, backgroundColor: '#fafbfc', autoHideMenuBar: true, webPreferences: { preload: path.join(__dirname, 'preload.cjs'), contextIsolation: true, sandbox: true, nodeIntegration: false, webSecurity: true, backgroundThrottling: false } });
  Menu.setApplicationMenu(null);
  win.webContents.session.setPermissionRequestHandler((_contents, _permission, callback) => callback(false));
  win.webContents.session.setPermissionCheckHandler(() => false);
  const openExternal = (value) => { try { const url = new URL(value); if (['https:', 'http:'].includes(url.protocol)) shell.openExternal(url.toString()).catch(() => {}); } catch {} };
  win.webContents.setWindowOpenHandler(({ url }) => { openExternal(url); return { action: 'deny' }; });
  win.webContents.on('will-navigate', (event, url) => { if (!url.startsWith('notebook://app/')) { event.preventDefault(); openExternal(url); } });
  win.webContents.on('will-attach-webview', (event) => event.preventDefault());
  win.webContents.on('render-process-gone', () => { crashed = true; });
  win.webContents.on('will-prevent-unload', (event) => {
    showWindow();
    const response = dialog.showMessageBoxSync(win, { type: 'question', title: '仍有未保存的记录', message: '编辑器中有未保存的修改。', detail: '关闭窗口到后台会保留草稿；退出软件前请保存。', buttons: ['返回继续编辑', '放弃修改并退出'], defaultId: 0, cancelId: 0 });
    if (response === 1) event.preventDefault(); else quitting = false;
  });
  win.on('close', (event) => {
    try { const { width, height } = win.getNormalBounds(); atomicWrite(windowFile, JSON.stringify({ width, height })); } catch {}
    if (!quitting) { event.preventDefault(); win.hide(); win.setSkipTaskbar(true); }
  });
  tray = new Tray(icon.resize({ width: 32, height: 32 }));
  tray.setToolTip('知序 · 科研记录本（开源版） — 点击打开');
  tray.setContextMenu(Menu.buildFromTemplate([
    { label: '打开科研记录本', click: showWindow },
    { label: '软件设置', click: showSettings },
    { label: '打开数据文件夹', click: () => shell.openPath(dataDir) },
    { type: 'separator' },
    { label: '退出软件', click: requestQuit },
  ]));
  tray.on('click', showWindow); tray.on('double-click', showWindow);
  app.on('activate', showWindow);
  win.once('ready-to-show', showWindow);
  if (TEST) globalThis.__notebookTest = { win, tray, requestQuit, showWindow, showSettings, requests, profile, dataDir, store, setConfig: (value) => { config = value; }, getQuitting: () => quitting };
  await win.loadURL('notebook://app/');
}

if (!primary) app.quit();
else {
  app.on('second-instance', (_event, _argv, _cwd, extra) => extra?.quit ? requestQuit() : showWindow());
  app.on('window-all-closed', () => {});
  app.on('before-quit', () => { quitting = true; });
  app.on('will-quit', () => { for (const controller of requests.values()) controller.abort(); tray?.destroy(); });
  app.whenReady().then(start).catch((error) => { dialog.showErrorBox('知序启动失败', `无法打开桌面应用：${error.message}`); app.exit(1); });
}
