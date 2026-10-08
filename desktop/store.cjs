const fs = require('node:fs');
const path = require('node:path');
const KEYS = {
  'zhixu-oss:workspace:v2': 'workspace.json',
  'zhixu-oss:workspace:v2:prev': 'workspace.previous.json',
};

function atomicWrite(filename, value) {
  fs.mkdirSync(path.dirname(filename), { recursive: true });
  const temp = `${filename}.${process.pid}.tmp`;
  let fd;
  try {
    fd = fs.openSync(temp, 'w', 0o600);
    fs.writeFileSync(fd, value, 'utf8'); fs.fsyncSync(fd); fs.closeSync(fd); fd = undefined;
    fs.renameSync(temp, filename);
  } finally {
    if (fd !== undefined) fs.closeSync(fd);
    if (fs.existsSync(temp)) fs.unlinkSync(temp);
  }
}

function createStore(directory, validate) {
  return {
    getItem(key) {
      if (key === 'zhixu-oss:doc:v1') return null;
      if (!Object.hasOwn(KEYS, key)) throw new Error('不支持的数据类型');
      const filename = path.join(directory, KEYS[key]);
      try { return fs.readFileSync(filename, 'utf8'); }
      catch (error) { if (error.code === 'ENOENT') return null; throw new Error('无法读取本机记录，请检查数据文件夹的权限。'); }
    },
    setItem(key, value) {
      if (!Object.hasOwn(KEYS, key) || typeof value !== 'string' || Buffer.byteLength(value) > 30 * 1024 * 1024) throw new Error('保存内容格式无效或超过 30 MB');
      validate(value);
      atomicWrite(path.join(directory, KEYS[key]), value);
    },
  };
}
module.exports = { atomicWrite, createStore };
