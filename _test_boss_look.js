/* 12 关 Boss 实渲染截图：核验 AI 立绘接入后的实际观感（尺寸/朝向/压屏/白边） */
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
  await new Promise(r => setTimeout(r, 2200));   // 等贴图解码完

  for (let w = 1; w <= 12; w++) {
    const info = await win.webContents.executeJavaScript(`(function(WV){
      window.spawnWaveEnemy = function(){};               // 屏蔽小兵，只留 Boss
      resetGame(MODE.CAMPAIGN);
      wave = WV;
      player.shipId = 'balanced';
      const st = shipStats('balanced');
      player.atk = st.atk; player.rate = st.rate;
      player.hp = 1e9; player.maxHp = 1e9;
      spawnBoss();
      const b = bossRef;
      // 直接摆到"入场完成"的停留位（与 bossUpdate 里 enterY 的算法一致）
      const bb = bossBox(b.r, b.bossType);
      b.enter = false;
      b.y = Math.max(H*0.18, bb.h/2 + 8);
      b.x = W/2;
      b.atkCd = 1e9;
      bossRef.atkCd = 1e9;
      update(1/60);           // 走一帧，让内部状态（光环/核心）就位
      bossRef.atkCd = 1e9;
      draw();                 // 渲染到 canvas
      return { type:b.bossType, name:b.name, R:b.r,
               img:[Math.round(bb.w), Math.round(bb.h)],
               y:Math.round(b.y), H, W,
               top:Math.round(b.y - bb.h/2), bottom:Math.round(b.y + bb.h/2),
               loaded: !!(SHIP_IMG['boss_'+b.bossType] && SHIP_IMG['boss_'+b.bossType].complete
                          && SHIP_IMG['boss_'+b.bossType].naturalWidth>0),
               png: canvas.toDataURL('image/png') };
    })(${w})`);
    const b64 = info.png.split(',')[1];
    const f = path.join(OUT, `boss_w${String(w).padStart(2,'0')}.png`);
    fs.writeFileSync(f, Buffer.from(b64, 'base64'));
    console.log(`第${String(w).padStart(2)}关 ${info.type.padEnd(13)} ${info.name.padEnd(12)} R=${String(info.R).padStart(3)}  `
      + `贴图=${String(info.img[0]).padStart(3)}x${String(info.img[1]).padStart(3)}  `
      + `y=${String(info.y).padStart(3)} 屏内范围 ${String(info.top).padStart(4)}~${String(info.bottom).padStart(4)} (H=${info.H})  `
      + `贴图加载=${info.loaded?'是':'否 ←回退程序化'}`);
  }
  app.quit();
}).catch(e => { console.error('ERR', e); app.quit(); });
