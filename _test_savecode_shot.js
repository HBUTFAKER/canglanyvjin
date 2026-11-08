// 存档码 UI 实机截图（存到 _tmpimg/）
const { app, BrowserWindow } = require('electron');
const path = require('path'), fs = require('fs');
try { fs.rmSync(__dirname + '/_testprofile', { recursive: true, force: true }); } catch {}
app.setPath('userData', __dirname + '/_testprofile');
app.disableHardwareAcceleration();
const wait = ms => new Promise(r => setTimeout(r, ms));

app.whenReady().then(async () => {
  fs.mkdirSync(path.join(__dirname, '_tmpimg'), { recursive: true });
  const win = new BrowserWindow({ width: 900, height: 760, show: false,
    webPreferences: { offscreen: true, backgroundThrottling: false } });
  await win.loadFile('星际射手.html');
  await wait(1800);
  const shot = async (name) => {
    const d = await win.webContents.executeJavaScript(`(function(){
      var c = document.querySelector('canvas');
      return c.toDataURL('image/png');
    })()`);
    fs.writeFileSync(path.join(__dirname, '_tmpimg', name), Buffer.from(d.split(',')[1], 'base64'));
  };
  // 造一份档
  await win.webContents.executeJavaScript(`(function(){
    localStorage.clear();
    localStorage.setItem(slotKey(0), JSON.stringify({gold:29356, playerLevel:30, best:99999,
      stars:{'1':3,'2':3,'3':3}, playTime:7265, selectedShip:'heavy'}));
    localStorage.setItem(slotKey(1), JSON.stringify({gold:45, playerLevel:3, best:800, stars:{'1':1}, playTime:564}));
    localStorage.setItem('stellar_gunner_active_slot','0');
    return 1; })()`);
  win.webContents.reload(); await wait(1800);

  await win.webContents.executeJavaScript(`(function(){
    document.getElementById('menu').classList.add('hidden'); openSave(); return 1; })()`);
  await wait(400); await shot('code_1_panel.png');

  await win.webContents.executeJavaScript(`(function(){ SaveCode.openExport(); return 1; })()`);
  await wait(400); await shot('code_2_export.png');

  await win.webContents.executeJavaScript(`(function(){ SaveCode.openImport(); return 1; })()`);
  await wait(300); await shot('code_3_import_empty.png');

  // 粘贴一段「另一台设备」的码，看覆盖预览
  await win.webContents.executeJavaScript(`(function(){
    var ta = document.querySelector('#saveCodeOvl textarea');
    ta.value = 'SGSAVE1-916-1rm8kf3-' + (function(){
      var keys = {};
      keys['stellar_gunner_v5_s0'] = JSON.stringify({gold:1234, playerLevel:14, best:5200, stars:{'1':3,'2':3,'3':1}, playTime:3600});
      keys['stellar_gunner_v5_s2'] = JSON.stringify({gold:99, playerLevel:2, best:70, stars:{}, playTime:120});
      keys['stellar_gunner_active_slot'] = '2';
      var raw = JSON.stringify({app:'stellar_gunner', v:1, at:Date.now(), keys:keys});
      var b = btoa(unescape(encodeURIComponent(raw))).replace(/\\+/g,'-').replace(/\\//g,'_').replace(/=+$/,'');
      return b;
    })();
    document.querySelector('#saveCodeOvl button.btn').click();
    return 1; })()`);
  await wait(500); await shot('code_4_import_preview.png');

  console.log('已输出 _tmpimg/code_1_panel.png / code_2_export.png / code_3_import_empty.png / code_4_import_preview.png');
  win.destroy(); app.quit();
});
