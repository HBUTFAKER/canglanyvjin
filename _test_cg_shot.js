// 剧情 CG 人物卡实拍（含 DOM 覆盖层，故用整页截图）
const { app, BrowserWindow } = require('electron');
// ★ 测试隔离：使用独立 userData，绝不碰玩家真实存档（%APPDATA%/Electron）
try { require('fs').rmSync(__dirname + '/_testprofile', { recursive: true, force: true }); } catch {}
app.setPath('userData', __dirname + '/_testprofile');

const fs = require('fs');
app.disableHardwareAcceleration();

app.whenReady().then(async () => {
  const win = new BrowserWindow({
    width: 460, height: 860, show: false,
    webPreferences: { offscreen: true, backgroundThrottling: false }
  });
  await win.loadFile('星际射手.html');
  await new Promise(r => setTimeout(r, 2500));
  for (const lv of [3, 11]) {
    await win.webContents.executeJavaScript("playCG(" + lv + ", function(){}); 'ok'");
    await new Promise(r => setTimeout(r, 2600));      // 等台词打完 + 人物卡动画结束
    const img = await win.webContents.capturePage();
    fs.writeFileSync('_tmpimg/cg_' + lv + '.png', img.toPNG());
    console.log('拍到第 ' + lv + ' 幕 CG');
  }
  app.quit();
}).catch(e => { console.error('FATAL', e); app.quit(); });
