# 第三方依赖与参考

本仓库不包含历史浏览器插件、其他项目 fork 或私人研究材料。主要第三方包通过 npm 安装，许可保留在各自安装包中；构建时会保留依赖生成的许可注释。

| 依赖 | 许可证 |
| --- | --- |
| React / React DOM | MIT |
| D3 | ISC |
| KaTeX | MIT |
| markdown-it | MIT |
| Mermaid | MIT |
| lucide-react | ISC |
| Electron | MIT（包含其他组件的独立许可） |
| electron-builder / esbuild | MIT |
| Vite / Vitest | MIT |

完整依赖版本以 `app/package-lock.json` 和 `desktop/package-lock.json` 为准，表格不是传递依赖完整清单。分发桌面二进制时应保留 Electron 随附的 `LICENSE.electron.txt` 与 `LICENSES.chromium.html` 等通知。软件包最终许可需按实际发布内容复核。


已收集锁定生产依赖的许可证正文：[完整许可文本](THIRD_PARTY_LICENSES.md)。该文件与本项目 LICENSE 一起进入桌面构建。
