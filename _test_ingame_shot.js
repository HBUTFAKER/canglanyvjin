// 带真实背景的实机画面（canvas 直出）
const { app, BrowserWindow } = require('electron');
// ★ 测试隔离：使用独立 userData，绝不碰玩家真实存档（%APPDATA%/Electron）
try { require('fs').rmSync(__dirname + '/_testprofile', { recursive: true, force: true }); } catch {}
app.setPath('userData', __dirname + '/_testprofile');

const fs = require('fs');
app.disableHardwareAcceleration();

app.whenReady().then(async () => {
  const win = new BrowserWindow({
    width: 620, height: 1000, show: false,
    webPreferences: { offscreen: true, backgroundThrottling: false }
  });
  await win.loadFile('星际射手.html');
  await new Promise(r => setTimeout(r, 2500));
  for (const lv of [3, 7, 11]) {
    await win.webContents.executeJavaScript(
      "document.getElementById('levelSelect').classList.add('hidden'); startCampaignAt(" + lv + "); player.invuln = 1e9; 'ok'");
    await new Promise(r => setTimeout(r, 2800));
    const png = await win.webContents.executeJavaScript("canvas.toDataURL('image/png')");
    fs.writeFileSync('_tmpimg/ingame_' + lv + '.png', Buffer.from(png.split(',')[1], 'base64'));
    console.log('拍到第 ' + lv + ' 关');
  }
  app.quit();
}).catch(e => { console.error('FATAL', e); app.quit(); });
