/* Boss 击杀时长实测：按"玩家会走位追着打"模拟，验证新血量曲线是否符合
   第1关约 30 秒、逐关拉长、末几关明显更久的预期 */
const { app, BrowserWindow } = require('electron');
// ★ 测试隔离：使用独立 userData，绝不碰玩家真实存档（%APPDATA%/Electron）
try { require('fs').rmSync(__dirname + '/_testprofile', { recursive: true, force: true }); } catch {}
app.setPath('userData', __dirname + '/_testprofile');

app.disableHardwareAcceleration();

// 每个阶段的「代表性装备」——决定该关的实际 DPS 与 combatPower
const CASES = [
  { wave: 1,  tag:'新号',   load:[{type:'main',level:1}], wing:0, ench:{pierce:0,chain:0,slow:0,blast:0,lifesteal:0} },
  { wave: 2,  tag:'前期',   load:[{type:'main',level:2}], wing:0, ench:{pierce:0,chain:0,slow:0,blast:0,lifesteal:0} },
  { wave: 3,  tag:'前期',   load:[{type:'main',level:2},{type:'laser',level:1}], wing:0, ench:{pierce:1,chain:0,slow:0,blast:0,lifesteal:0} },
  { wave: 4,  tag:'中期',   load:[{type:'main',level:3},{type:'laser',level:2}], wing:1, ench:{pierce:1,chain:1,slow:0,blast:0,lifesteal:0} },
  { wave: 5,  tag:'中期',   load:[{type:'main',level:3},{type:'laser',level:2},{type:'missile',level:2}], wing:1, ench:{pierce:1,chain:1,slow:1,blast:0,lifesteal:0} },
  { wave: 6,  tag:'中期',   load:[{type:'main',level:3},{type:'laser',level:2},{type:'missile',level:2}], wing:2, ench:{pierce:1,chain:2,slow:1,blast:1,lifesteal:0} },
  { wave: 7,  tag:'后期',   load:[{type:'main',level:4},{type:'laser',level:3},{type:'missile',level:3}], wing:2, ench:{pierce:1,chain:2,slow:1,blast:1,lifesteal:0} },
  { wave: 8,  tag:'后期',   load:[{type:'main',level:4},{type:'laser',level:3},{type:'missile',level:3},{type:'side',level:2}], wing:3, ench:{pierce:2,chain:2,slow:2,blast:2,lifesteal:0} },
  { wave: 9,  tag:'后期',   load:[{type:'main',level:4},{type:'laser',level:3},{type:'missile',level:3},{type:'side',level:3}], wing:3, ench:{pierce:2,chain:2,slow:2,blast:2,lifesteal:0} },
  { wave: 10, tag:'终局',   load:[{type:'main',level:5},{type:'laser',level:4},{type:'missile',level:3},{type:'side',level:3},{type:'plasma',level:2}], wing:4, ench:{pierce:2,chain:3,slow:2,blast:2,lifesteal:0} },
  { wave: 11, tag:'终局',   load:[{type:'main',level:5},{type:'laser',level:4},{type:'missile',level:3},{type:'side',level:3},{type:'plasma',level:2}], wing:4, ench:{pierce:2,chain:3,slow:2,blast:3,lifesteal:0} },
  { wave: 12, tag:'满配',   load:[{type:'main',level:6},{type:'laser',level:5},{type:'missile',level:3},{type:'side',level:4},{type:'ring',level:4},{type:'plasma',level:4}], wing:4, ench:{pierce:2,chain:3,slow:2,blast:3,lifesteal:0} },
];

app.whenReady().then(async () => {
  const win = new BrowserWindow({ width: 430, height: 800, show: false,
    webPreferences: { offscreen: true, backgroundThrottling: false } });
  await win.loadFile('星际射手.html');
  await new Promise(r => setTimeout(r, 1600));

  console.log('  关卡  阶段   战力   血量    实测 DPS   击杀耗时');
  console.log('  ' + '-'.repeat(52));
  for (const c of CASES) {
    const r = await win.webContents.executeJavaScript(`(function(c){
      if (!window.__os) window.__os = window.spawnWaveEnemy;
      window.spawnWaveEnemy = function(){};
      save.playerLevel = 1; save.weaponLevels = {}; save.enchantPerm = {};
      save.difficulty = 1; difficulty = 1;   // 固定普通难度（真正生效的是模块级 difficulty）
      resetGame(MODE.CAMPAIGN);
      wave = c.wave;
      loadout = c.load.map(o=>({type:o.type, level:o.level}));
      wingmanLevel = c.wing;
      enchantLevels = Object.assign({pierce:0,chain:0,slow:0,blast:0,lifesteal:0}, c.ench);
      player.shipId = 'balanced';
      const st = shipStats('balanced');
      player.atk = st.atk; player.rate = st.rate;
      player.hp = 1e9; player.maxHp = 1e9; player.fireCd = 0;
      const pw = combatPower();
      spawnBoss();
      const hp = bossRef.maxHp;
      bossRef.enter = false; bossRef.y = H*0.18; bossRef.x = W/2; bossRef.atkCd = 1e9;
      const dt = 1/60; let t = 0;
      while (bossRef && t < 400) {
        player.x = clamp(bossRef.x, 26, W-26);   // 玩家始终追到 Boss 正下方
        bossRef.enter = false; bossRef.atkCd = 1e9;
        update(dt); t += dt;
      }
      return { power:+pw.toFixed(2), hp, sec:+t.toFixed(1), dps:+(hp/t).toFixed(1), killed: !bossRef };
    })(${JSON.stringify(c)})`);
    console.log(`  第${String(c.wave).padStart(2)}关  ${c.tag}  ${String(r.power).padStart(5)}  ${String(r.hp).padStart(6)}  ${String(r.dps).padStart(8)}   ${String(r.sec).padStart(6)} 秒  ${r.killed?'':'【未打完 400s】'}`);
  }
  app.quit();
}).catch(e => { console.error('ERR', e); app.quit(); });
