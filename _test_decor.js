/* 只看背景装饰层（关掉背景贴图），确认战斗机编队与人物立绘确实画出来了 */
const { app, BrowserWindow } = require('electron');
// ★ 测试隔离：使用独立 userData，绝不碰玩家真实存档（%APPDATA%/Electron）
try { require('fs').rmSync(__dirname + '/_testprofile', { recursive: true, force: true }); } catch {}
app.setPath('userData', __dirname + '/_testprofile');

const fs = require('fs');
app.disableHardwareAcceleration();
app.whenReady().then(async () => {
  const win = new BrowserWindow({ width: 430, height: 800, show: false,
    webPreferences: { offscreen: true, backgroundThrottling: false } });
  await win.loadFile('星际射手.html');
  await new Promise(r => setTimeout(r, 2500));
  const r = await win.webContents.executeJavaScript(`(function(){
    window.requestAnimationFrame = () => 0;
    if (!Sfx.isMuted()) Sfx.toggleMute();
    resetGame(MODE.CAMPAIGN); wave = 5; updateWaves = function(){};
    bgCurrent = 'deep_starfield'; bgPrev = null; bgFade = 1; bgFlyers = [];
    const keep = BG_IMG.deep_starfield;
    BG_IMG.deep_starfield = new Image();           // 临时抽掉贴图
    const dt = 1/60;
    for (let k=0;k<1800;k++) { gameTime += dt; bgTick(dt); }
    bullets.length=0; eBullets.length=0; enemies.length=0; particles.length=0; effects.length=0; pickups.length=0;
    ctx.clearRect(0,0,W,H); ctx.fillStyle='#0a0e18'; ctx.fillRect(0,0,W,H);
    drawBgDecor();
    BG_IMG.deep_starfield = keep;
    return { n: bgFlyers.filter(f=>f.t>=0).length,
             keys: bgFlyers.map(f=>f.key+':'+f.x.toFixed(0)).join(' '),
             png: canvas.toDataURL('image/png') };
  })()`);
  fs.writeFileSync('_tmpimg/decor_only.png', Buffer.from(r.png.split(',')[1], 'base64'));
  console.log('在屏载具 =', r.n, '|', r.keys);
  app.quit();
}).catch(e => { console.error('ERR', e); app.quit(); });
