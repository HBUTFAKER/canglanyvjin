/* 背景系统核验：每个模式 / 战役各段场景实渲染截图 */
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
  await new Promise(r => setTimeout(r, 2600));   // 等大图解码

  const CASES = [
    ['campaign', 1,  '战役第1关'], ['campaign', 3, '战役第3关'], ['campaign', 5, '战役第5关'],
    ['campaign', 7,  '战役第7关'], ['campaign', 9, '战役第9关'], ['campaign', 12,'战役第12关'],
    ['endless', 0, '无尽模式'], ['daily', 0, '每日挑战'], ['practice', 0, '练习模式'],
  ];
  const shots = [];
  for (const [m, lv, label] of CASES) {
    const r = await win.webContents.executeJavaScript(`(function(M, LV){
      window.requestAnimationFrame = () => 0;
      if (!Sfx.isMuted()) Sfx.toggleMute();
      const MODES = { campaign:MODE.CAMPAIGN, endless:MODE.ENDLESS, daily:MODE.DAILY, practice:MODE.PRACTICE };
      resetGame(MODES[M]);
      if (LV) wave = LV;
      updateWaves = function(){};
      bgCurrent = null; bgPrev = null; bgFade = 1;
      for (let k=0;k<130;k++) update(1/60);   // 跑满 2 秒让交叉淡入完成（bgFade 1.2s 到位）
      draw();
      return { key: bgKeyFor(mode, wave),
               loaded: !!(BG_IMG[bgCurrent] && BG_IMG[bgCurrent].complete && BG_IMG[bgCurrent].naturalWidth),
               png: canvas.toDataURL('image/png') };
    })(${JSON.stringify(m)}, ${lv})`);
    const f = path.join(OUT, `bg_${m}${lv || ''}.png`);
    fs.writeFileSync(f, Buffer.from(r.png.split(',')[1], 'base64'));
    shots.push(f);
    console.log(`${label.padEnd(10)} 背景=${r.key.padEnd(18)} 贴图加载=${r.loaded ? '是' : '否 ←回退程序化星云'}`);
  }
  // 拼总览
  console.log('SHOTS=' + shots.join('|'));
  app.quit();
}).catch(e => { console.error('ERR', e); app.quit(); });
