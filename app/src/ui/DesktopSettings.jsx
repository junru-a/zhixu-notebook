import { useEffect, useState } from 'react';
import { Settings, FolderOpen } from 'lucide-react';
import { desktop } from '../core/desktop.js';
import { Dialog } from './Dialogs.jsx';
import './desktop.css';

export function DesktopTools() {
  const [open, setOpen] = useState(false);
  useEffect(() => desktop?.onSettings(() => setOpen(true)), []);
  if (!desktop) return null;
  return <><button className="icon-button" title="软件设置" aria-label="软件设置" onClick={() => setOpen(true)}><Settings size={18} /></button>{open && <DesktopSettings onClose={() => setOpen(false)} />}</>;
}
export function DesktopWelcome({ onImport }) {
  if (!desktop) return null;
  return <section className="desktop-welcome"><div><b>桌面版已就绪</b><p>关闭窗口后会留在托盘，再次点击图标即可继续。首次使用可从原浏览器导出备份，再导入这里。</p></div><button className="button" onClick={onImport}>导入已有记录</button></section>;
}
function DesktopSettings({ onClose }) {
  const [settings, setSettings] = useState(null), [key, setKey] = useState(''), [model, setModel] = useState('deepseek-flash'), [message, setMessage] = useState(''), [busy, setBusy] = useState(false), [clearKey, setClearKey] = useState(false);
  useEffect(() => { desktop.settings().then((value) => { setSettings(value); setModel(value.model); setMessage(value.error || ''); }).catch((error) => setMessage(error.message)); }, []);
  const save = async (event) => {
    event.preventDefault(); setBusy(true); setMessage('');
    try { const value = await desktop.saveSettings({ apiKey: key.trim(), model: model.trim(), clearKey }); setSettings(value); setKey(''); setClearKey(false); setMessage('配置已保存，立即生效。'); }
    catch (error) { setMessage(error.message); } finally { setBusy(false); }
  };
  const importConfig = async () => {
    setBusy(true);
    try { const value = await desktop.importConfig(); if (value) { setSettings(value); setModel(value.model); setMessage('原有 DeepSeek 配置已导入。'); } }
    catch (error) { setMessage(error.message); } finally { setBusy(false); }
  };
  return <Dialog title="软件设置" onClose={onClose}><form onSubmit={save}>
    <p className="dialog-subtitle">知序桌面版 {settings?.version} · 关闭窗口后继续在后台运行，托盘右键“退出软件”才会结束。</p>
    <h3>DeepSeek</h3><p className="field-hint">{settings?.configured ? '已配置。密钥由 Windows 加密保护，不会回显。' : '尚未配置，填写后即可使用 AI 分析。'} 留空可保留已有密钥。</p>
    <label className="field">API Key<input type="password" autoComplete="new-password" value={key} onChange={(e) => { setKey(e.target.value); setClearKey(false); }} placeholder={settings?.configured ? '已保存，输入新值可替换' : '输入 DeepSeek API Key'} /></label>
    <label className="field">模型名称<input required value={model} onChange={(e) => setModel(e.target.value)} /></label>
    {settings?.configured && <label className="desktop-clear-key"><input type="checkbox" checked={clearKey} onChange={(e) => setClearKey(e.target.checked)} />清除已保存的密钥</label>}
    <button className="button quiet" type="button" disabled={busy} onClick={importConfig}>从原 .env.local 导入配置</button>
    <section className="desktop-data-settings"><h3>本机记录</h3><p className="field-hint">记录直接保存为本机数据文件，更新或重新打开软件不会清空。浏览器版与桌面版分别保存，可用备份迁移；两边不会自动同步。</p><button type="button" className="button" onClick={() => desktop.openDataFolder().catch((e) => setMessage(e.message))}><FolderOpen size={16} />打开数据文件夹</button><p className="field-hint desktop-data-path">{settings?.dataDirectory}</p><button type="button" className="button quiet" onClick={() => desktop.openBrowserVersion().catch((e) => setMessage(e.message))}>打开原浏览器版</button><p className="field-hint">原浏览器版需已启动；也可使用项目中的“启动浏览器版”入口。</p></section>
    {message && <p className="notice" role="status">{message}</p>}
    <footer className="dialog-actions"><button className="button" type="button" onClick={onClose}>关闭</button><button className="button primary" disabled={busy || !settings} type="submit">{busy ? '处理中…' : '保存设置'}</button></footer>
  </form></Dialog>;
}
