# 苍蓝余烬 · Azure Embers

Electron 桌面弹幕射击游戏（内部代号「星际射手」）。躲避弹幕、击败 Boss、收集战机、解锁 CG，带存档与商店系统。

## 运行

```bash
npm install
npm start
```

或直接用 Electron 启动入口：

```bash
npx electron main-shooter.js
```

打包（electron-builder）：

```bash
npx electron-builder --win
```

## 结构

| 路径 | 说明 |
| --- | --- |
| `main-shooter.js` | 桌面版启动入口，创建窗口、加载页面、自检模式 |
| `星际射手.html` | 游戏主页面（文件名是历史遗留，未改名） |
| `gunner.js` | 游戏核心逻辑：战斗、弹幕、Boss、进度、UI |
| `savecode.js` | 存档编解码与槽位管理 |
| `assets/` | 美术与音效（背景 / 立绘 / Boss / 战机 / CG / 音效 / 图标） |
| `package.json` | 依赖与脚本 |
| `electron-builder.yml` | 打包配置 |

## 说明

- 存档写在 `%APPDATA%/Electron`，启动时被显式钉死在这个目录，安装版与开发版共用同一份存档。**不要改这个目录，也不要在运行时复制或同步别的存档**，否则会出现「存档丢了」的错觉。
- 自检模式：设置环境变量 `SHOOTER_SMOKE=1` 启动，会无窗口加载页面、检查贴图与存档状态后自动退出，用于验证资源完整性。
- 仓库不包含 `node_modules/`、打包产物、素材原始中间文件与 web 发布副本。
