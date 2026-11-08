// 验证：战斗背景双人物（左正派/右反派）随模式与剧情段换人 + 剧情 CG 人物卡
const { app, BrowserWindow } = require('electron');
// ★ 测试隔离：使用独立 userData，绝不碰玩家真实存档（%APPDATA%/Electron）
try { require('fs').rmSync(__dirname + '/_testprofile', { recursive: true, force: true }); } catch {}
app.setPath('userData', __dirname + '/_testprofile');

const fs = require('fs');
app.disableHardwareAcceleration();

app.whenReady().then(async () => {
  const win = new BrowserWindow({
    width: 700, height: 1000, show: false,
    webPreferences: { offscreen: true, backgroundThrottling: false }
  });
  await win.loadFile('星际射手.html');
  await new Promise(r => setTimeout(r, 2500));

  const cases = [
    ['campaign_1', 'MODE.CAMPAIGN', 1], ['campaign_3', 'MODE.CAMPAIGN', 3],
    ['campaign_5', 'MODE.CAMPAIGN', 5], ['campaign_7', 'MODE.CAMPAIGN', 7],
    ['campaign_9', 'MODE.CAMPAIGN', 9], ['campaign_11', 'MODE.CAMPAIGN', 11],
    ['endless', 'MODE.ENDLESS', 3], ['practice', 'MODE.PRACTICE', 1], ['daily', 'MODE.DAILY', 1],
  ];

  for (const [tag, m, wv] of cases) {
    const r = await win.webContents.executeJavaScript(`(function(){
      window.requestAnimationFrame = function(){};
      mode = ${m}; wave = ${wv};
      gameTime = 300;                       // 让呼吸/漂移走到中段
      var cast = bgCastFor(mode, wave);
      var out = { ally: cast.ally, foe: cast.foe,
                  allyName: (CHAR_INFO[cast.ally]||{}).name, foeName: (CHAR_INFO[cast.foe]||{}).name };
      // 只渲染装饰层（抽掉背景贴图），方便肉眼确认两个人都在
      var keep = BG_IMG.deep_starfield; BG_IMG.deep_starfield = new Image();
      ctx.setTransform(DPR,0,0,DPR,0,0);
      ctx.clearRect(0,0,W,H); ctx.fillStyle = '#0a0e18'; ctx.fillRect(0,0,W,H);
      drawBgDecor();
      BG_IMG.deep_starfield = keep;
      out.png = canvas.toDataURL('image/png');
      return out;
    })()`);
    fs.writeFileSync('_tmpimg/cast_' + tag + '.png', Buffer.from(r.png.split(',')[1], 'base64'));
    console.log(('  ' + tag).padEnd(16) + '正派 ' + r.allyName + '(' + r.ally + ')   反派 ' + r.foeName + '(' + r.foe + ')');
  }

  // 剧情 CG 人物卡
  const cg = await win.webContents.executeJavaScript(`(function(){
    var out = {};
    for (var lv of [1,3,5,6,8,11]) {
      playCG(lv, function(){});
      var n = document.getElementById('cgCast').children.length;
      var names = [].map.call(document.querySelectorAll('#cgCast .cc-name'), function(e){return e.textContent;});
      var srcs = [].map.call(document.querySelectorAll('#cgCast img'), function(e){return e.getAttribute('src').split('/').pop();});
      var loaded = [].every.call(document.querySelectorAll('#cgCast img'), function(e){ return e.complete && e.naturalWidth > 0; });
      out['第'+lv+'幕'] = n + ' 人 ' + names.join('/') + ' [' + srcs.join(',') + '] 图加载=' + loaded;
    }
    cgContinue();
    return out;
  })()`);
  console.log('\n=== 剧情 CG 人物卡 ===');
  for (const k of Object.keys(cg)) console.log('  ' + k + ' → ' + cg[k]);

  app.quit();
}).catch(e => { console.error('FATAL', e); app.quit(); });
