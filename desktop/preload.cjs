const { contextBridge, ipcRenderer } = require('electron');
const invoke = async (channel, ...args) => {
  const result = await ipcRenderer.invoke(channel, ...args);
  if (result?.error) throw new Error(result.error);
  return result?.value;
};
contextBridge.exposeInMainWorld('notebookDesktop', {
  platform: 'windows',
  storage: {
    getItem(key) { const result = ipcRenderer.sendSync('notebook:storage', 'get', key); if (result.error) throw new Error(result.error); return result.value; },
    setItem(key, value) { const result = ipcRenderer.sendSync('notebook:storage', 'set', key, value); if (result.error) throw new Error(result.error); },
  },
  request: (id, route, body) => invoke('notebook:api', id, route, body),
  cancel: (id) => ipcRenderer.send('notebook:cancel', id),
  settings: () => invoke('notebook:settings'),
  saveSettings: (value) => invoke('notebook:save-settings', value),
  importConfig: () => invoke('notebook:import-config'),
  openDataFolder: () => invoke('notebook:open-data'),
  openBrowserVersion: () => invoke('notebook:open-browser'),
  chooseDirectories: (multiple = true) => invoke('notebook:choose-directories', multiple),
  onSettings: (callback) => { const listener = () => callback(); ipcRenderer.on('notebook:show-settings', listener); return () => ipcRenderer.removeListener('notebook:show-settings', listener); },
});
