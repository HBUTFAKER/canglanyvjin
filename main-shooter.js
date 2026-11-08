// 苍蓝余烬（Azure Embers）· 桌面启动入口
// 开发用法：electron main-shooter.js
// 安装版：直接双击 苍蓝余烬.exe
// 注：页面文件名仍是 星际射手.html（内部文件名，玩家看不到，故意不改以缩小改动面）
const { app, BrowserWindow } = require('electron');
const path = require('path');
const fs = require('fs');

const SMOKE = !!process.env.SHOOTER_SMOKE;   // 自检模式：不开窗、加载完即退出

/* ---------- 存档目录（★不要改这里） ---------- */
// 游戏从第一天起就把存档写在 %APPDATA%/Electron（electron main-shooter.js 的默认目录）。
// 曾经为了「好看」把目录改成 %APPDATA%/星际射手 并复制旧档过去 —— 结果旧窗口还在写老目录，
// 新窗口读复制过去的快照，两边不一致，玩家会以为「存档没了」。教训：
//   **存档目录一旦定下就不要动，更不要在运行时复制/同步别人的存档。**
// 下面这行只是把「安装版」也钉到同一个目录，保证快捷方式和安装版读的是同一份存档。
app.setPath('userData', path.join(app.getPath('appData'), 'Electron'));

function createWindow() {
  const win = new BrowserWindow({
    width: 1200,
    height: 800,
    minWidth: 900,
    minHeight: 600,
    backgroundColor: '#05060a',
    title: '苍蓝余烬',
    icon: path.join(__dirname, 'assets', 'icon_shooter.ico'),
    autoHideMenuBar: true,
    useContentSize: true,
    show: !SMOKE,
    webPreferences: { contextIsolation: true, nodeIntegration: false }
  });
  win.setMenuBarVisibility(false);
  win.loadFile(path.join(__dirname, '星际射手.html'));

  if (SMOKE) {
    const OUT = path.join(require('os').tmpdir(), 'shooter-probe.json');
    const writeOut = (obj) => {
      try { fs.writeFileSync(OUT, JSON.stringify(obj, null, 1), 'utf8'); } catch {}
      console.log('SHOOTER_PROBE ' + JSON.stringify(obj));
    };
    const bail = setTimeout(() => { writeOut({ error: 'timeout: 15s 内没加载完' }); app.quit(); }, 15000);
    win.webContents.on('did-finish-load', async () => {
      try {
        const r = await win.webContents.executeJavaScript(`(async function(){
          var list = ['assets/menu_bg.png','assets/portraits/pilot.png','assets/bg/planet_jupiter.jpg',
                      'assets/bosses/b01_interceptor.png','assets/cg/cg01.png','assets/ships/balanced.png'];
          var imgs = [];
          for (var i=0;i<list.length;i++){
            imgs.push(await new Promise(function(ok){
              var im = new Image();
              im.onload  = function(){ ok(list[i]+'='+im.naturalWidth+'x'+im.naturalHeight); };
              im.onerror = function(){ ok(list[i]+'=LOAD-FAIL'); };
              im.src = list[i];
            }));
          }
          var c = document.querySelector('canvas');
          return { canvas: c ? [c.width, c.height] : null,
                   buttons: document.querySelectorAll('button').length,
                   title: document.title,
                   hasSave: typeof save !== 'undefined',
                   gold: (typeof save!=='undefined') ? save.gold : null,
                   lv:   (typeof save!=='undefined') ? save.playerLevel : null,
                   unlocked: (typeof save!=='undefined') ? save.unlocked : null,
                   activeSlot: (typeof activeSlot!=='undefined') ? activeSlot : null,
                   imgs: imgs };
        })()`);
        clearTimeout(bail);
        writeOut(r);
      } catch (e) {
        clearTimeout(bail);
        writeOut({ error: e.message });
      }
      setTimeout(() => app.quit(), 300);
    });
    win.webContents.on('did-fail-load', (_e, code, desc) => {
      clearTimeout(bail);
      writeOut({ error: 'did-fail-load ' + code + ' ' + desc });
      setTimeout(() => app.quit(), 200);
    });
  } else {
    win.webContents.on('did-fail-load', (_e, code, desc) => {
      console.error('[苍蓝余烬] 页面加载失败', code, desc);
    });
  }
}

app.whenReady().then(() => {
  createWindow();
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
