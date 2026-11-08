/* 连锁 / 穿透 新特效实渲染截图 */
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
  await new Promise(r => setTimeout(r, 1800));
  const info = await win.webContents.executeJavaScript(`(function(){
    window.requestAnimationFrame = () => 0;
    if (!Sfx.isMuted()) Sfx.toggleMute();
    resetGame(MODE.CAMPAIGN);
    enchantLevels = { pierce:2, chain:2, slow:0, blast:2, lifesteal:0 };
    loadout = [{type:'main',level:5},{type:'laser',level:4}];
    wingmanLevel = 0;
    updateWaves = function(){};
    player.x = W/2; player.y = H*0.86; player.speed = 0;
    // 一撮聚团敌机，让连锁疯狂放电
    enemies.length = 0;
    for (let i=0;i<7;i++)
      enemies.push({ type:'grunt', x: W/2 + (i%3-1)*54, y: H*0.26 + Math.floor(i/3)*50,
        hp:1e9, maxHp:1e9, r:16, score:0, color:'#ff6b7a', speed:0, fire:false,
        radial:false, fireCd:1e9, wob:0, slowT:0, atk:0 });
    // 按真实射速连打 3 秒，攒出连锁电弧 / 贯穿十字 / 爆炸环（不再每帧强制开火）
    for (let k=0;k<180;k++) { update(1/60); player.invuln = 1e9; }
    draw();
    return { png: canvas.toDataURL('image/png'),
             fx: effects.length,
             chain: effects.filter(e=>e.type==='chain').length,
             pierce: effects.filter(e=>e.type==='pierce').length,
             blast: effects.filter(e=>e.type==='blast').length };
  })()`);
  fs.writeFileSync(path.join(OUT, 'vfx_chain_pierce.png'),
    Buffer.from(info.png.split(',')[1], 'base64'));
  console.log(`特效总数=${info.fx}  连锁电弧=${info.chain}  贯穿十字=${info.pierce}  爆炸环=${info.blast}`);
  app.quit();
}).catch(e => { console.error('ERR', e); app.quit(); });
