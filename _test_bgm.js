const { app, BrowserWindow } = require('electron');
// ★ 测试隔离：使用独立 userData，绝不碰玩家真实存档（%APPDATA%/Electron）
try { require('fs').rmSync(__dirname + '/_testprofile', { recursive: true, force: true }); } catch {}
app.setPath('userData', __dirname + '/_testprofile');

app.whenReady().then(() => {
  const win = new BrowserWindow({ width:420, height:820, show:false, webPreferences:{ offscreen:true } });
  win.loadFile('星际射手.html').then(() => {
    setTimeout(async () => {
      const r = await win.webContents.executeJavaScript(`(() => {
        const out = {};
        const list = [
          ['战役1-4', bgmTrackFor(MODE.CAMPAIGN, 1)],
          ['战役5-8', bgmTrackFor(MODE.CAMPAIGN, 5)],
          ['战役9-12', bgmTrackFor(MODE.CAMPAIGN, 10)],
          ['无尽', bgmTrackFor(MODE.ENDLESS, 1)],
          ['练习', bgmTrackFor(MODE.PRACTICE, 1)],
        ];
        const ids = ['bounty','supply','training','defense','raid'];
        for (const id of ids) { dailyChallenge = { id }; list.push(['每日-'+id, bgmTrackFor(MODE.DAILY, 1)]); }
        dailyChallenge = null;
        out.tracks = list.map(([k,v]) => k + ' = ' + (v||'null').replace('assets/sfx/',''));
        out.total = list.length;
        out.unique = new Set(list.map(x=>x[1])).size;
        // 战力：新号 vs 满配
        save.playerLevel = 1;
        const before = combatPower();
        save.playerLevel = 30;
        loadout = [{type:'main',level:6},{type:'laser',level:6},{type:'missile',level:6},{type:'plasma',level:6}];
        enchantLevels = { pierce:5, chain:5, slow:5, blast:5, lifesteal:5 };
        wingmanLevel = 3;
        const after = combatPower();
        out.powerNew = Math.round(before*100)/100;
        out.powerMax = Math.round(after*100)/100;
        out.densityNew = Math.round((1+Math.min(1.4,before*0.09))*100)/100;
        out.densityMax = Math.round((1+Math.min(1.4,after*0.09))*100)/100;
        out.capNew = 10 + Math.floor(Math.min(14, before*1.0));
        out.capMax = 10 + Math.floor(Math.min(14, after*1.0));
        return out;
      })()`);
      console.log('曲目数:', r.total, ' 去重后:', r.unique, r.total===r.unique ? '✅ 各不相同' : '❌ 有重复');
      r.tracks.forEach(t => console.log('   ', t));
      console.log('战力 新号 =', r.powerNew, '| 满配 =', r.powerMax);
      console.log('出怪频率倍率  新号 =', r.densityNew, 'x | 满配 =', r.densityMax, 'x');
      console.log('场上小兵上限  新号 =', r.capNew, '| 满配 =', r.capMax);
      app.quit();
    }, 1200);
  });
});
