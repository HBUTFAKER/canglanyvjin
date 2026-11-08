/* 背景动效核验：同一场景不同时刻截图，确认背景真的在转/在动，且装饰层有出场 */
const { app, BrowserWindow } = require('electron');
// ★ 测试隔离：使用独立 userData，绝不碰玩家真实存档（%APPDATA%/Electron）
try { require('fs').rmSync(__dirname + '/_testprofile', { recursive: true, force: true }); } catch {}
app.setPath('userData', __dirname + '/_testprofile');

const fs = require('fs'), path = require('path');
app.disableHardwareAcceleration();
const OUT = 'C:/Users/29212/WorkBuddy/2026-10-13-04-53-04/_tmpimg';
fs.mkdirSync(OUT, { recursive: true });

app.whenReady().then(async () => {
  const win = new BrowserWindow({ width: 430, height: 800, show: false,
    webPreferences: { offscreen: true, backgroundThrottling: false } });
  await win.loadFile('星际射手.html');
  await new Promise(r => setTimeout(r, 2600));

  const CASES = [
    ['campaign', 1,  0,  'star_t00'], ['campaign', 1,  45, 'star_t45'],
    ['campaign', 12, 0,  'orion_t00'],['campaign', 12, 45, 'orion_t45'],
    ['practice', 0,  0,  'saturn_t00'],['practice', 0, 45, 'saturn_t45'],
    ['daily',    0,  22, 'earth_t22'],
    ['campaign', 5,  30, 'cluster_t30'],
  ];
  for (const [m, lv, t, tag] of CASES) {
    const r = await win.webContents.executeJavaScript(`(function(M, LV, T){
      window.requestAnimationFrame = () => 0;
      if (!Sfx.isMuted()) Sfx.toggleMute();
      const MODES = { campaign:MODE.CAMPAIGN, endless:MODE.ENDLESS, daily:MODE.DAILY, practice:MODE.PRACTICE };
      resetGame(MODES[M]);
      if (LV) wave = LV;
      updateWaves = function(){};
      bgCurrent = null; bgPrev = null; bgFade = 1;
      bgFlyers = [];
      // 快进到目标时刻（只推进时间，不做战斗判定）
      const dt = 1/60;
      for (let k=0; k<Math.round(T/dt); k++) { gameTime += dt; bgTick(dt); }
      // 压满 1.2s 淡入
      for (let k=0;k<130;k++) { gameTime += dt; bgTick(dt); }
      // 清场：只留背景装饰，便于核对编队/立绘是否可见
      bullets.length = 0; eBullets.length = 0; enemies.length = 0;
      particles.length = 0; effects.length = 0; pickups.length = 0;
      draw();
      const mo = BG_MOTION[bgCurrent] || {};
      const deg = mo.full ? ((gameTime*mo.rot)%360) : Math.sin(gameTime*2*Math.PI/(mo.period||60))*mo.rot;
      return { key: bgCurrent, deg:+deg.toFixed(1), t:+gameTime.toFixed(1),
               flyers: bgFlyers.filter(f=>f.t>=0).length,
               png: canvas.toDataURL('image/png') };
    })(${JSON.stringify(m)}, ${lv}, ${t})`);
    fs.writeFileSync(path.join(OUT, `anim_${tag}.png`), Buffer.from(r.png.split(',')[1], 'base64'));
    console.log(`${tag.padEnd(12)} 背景=${String(r.key).padEnd(16)} t=${String(r.t).padStart(5)}s  旋转=${String(r.deg).padStart(6)}°  在屏载具=${r.flyers}`);
  }
  app.quit();
}).catch(e => { console.error('ERR', e); app.quit(); });
