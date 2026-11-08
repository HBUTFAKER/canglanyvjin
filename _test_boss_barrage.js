/* eslint-disable */
// Boss 弹幕压力测量台：量化"第 N 关每秒生成多少发弹幕"
// 用法：unset ELECTRON_RUN_AS_NODE && ./node_modules/.bin/electron _test_boss_barrage.js
const { app, BrowserWindow } = require('electron');
// ★ 测试隔离：使用独立 userData，绝不碰玩家真实存档（%APPDATA%/Electron）
try { require('fs').rmSync(__dirname + '/_testprofile', { recursive: true, force: true }); } catch {}
app.setPath('userData', __dirname + '/_testprofile');

app.disableHardwareAcceleration();

// 测哪些关，以及每关测哪几个阶段
const WAVES = [5, 6, 7, 8, 9, 10, 11, 12];
const PHASES = [1, 2, 3];

app.whenReady().then(async () => {
  const win = new BrowserWindow({ width: 430, height: 800, show: false,
    webPreferences: { offscreen: true, backgroundThrottling: false } });
  await win.loadFile('星际射手.html');
  await new Promise(r => setTimeout(r, 2500));

  const out = [];
  for (const w of WAVES) {
    for (const ph of PHASES) {
      const r = await win.webContents.executeJavaScript(`(function(){
        window.requestAnimationFrame = function(){};
        if (!Sfx.isMuted()) Sfx.toggleMute();
        // 屏蔽小兵，只留 Boss
        window.spawnWaveEnemy = function(){};
        resetGame(MODE.CAMPAIGN);
        wave = ${w};
        updateWaves = function(){};
        spawnBoss();
        const b = bossRef;
        b.enter = false; b.y = 200; b.x = W/2; b.atkCd = 0; b.atkMode = 0;
        b.phase = ${ph}; b.phaseTimer = 0;
        eBullets.length = 0;
        const dt = 1/60, dur = 60;                 // 测 60 秒
        const frames = Math.round(dur/dt);
        let total = 0, peak = 0;
        for (let f = 0; f < frames; f++) {
          eBullets.length = 0;                     // 每帧清空，统计"本帧新生成"
          b.atkCd = Math.max(0, b.atkCd - dt);
          bossAttack();
          const n = eBullets.length;
          total += n;
          if (n > peak) peak = n;
          b.phaseTimer += dt;
        }
        return { perSec: total/dur, peak, hp: b.hp, r: b.r, extra: b.extraMode, dbl: b.doublePhase,
                 name: b.name, type: b.bossType };
      })()`);
      out.push({ ...r, wave: w, phase: ph });
    }
  }

  // 输出表格
  const pad = (s, n) => String(s).padEnd(n);
  console.log('=== Boss 弹幕压力（普通难度，含难度/弹幕机制） ===');
  console.log(pad('关卡', 6) + pad('阶段', 6) + pad('发/秒', 9) + pad('单轮峰值', 10) + pad('BossHP', 10) + '机制');
  for (const r of out) {
    const mec = [];
    if (r.extra) mec.push('旋转激光阵');
    if (r.dbl) mec.push('弹幕翻倍');
    console.log(pad(r.wave, 6) + pad(r.phase, 6) + pad(r.perSec.toFixed(2), 9)
      + pad(r.peak, 10) + pad(r.hp, 10) + (mec.join('+') || '—'));
  }

  // 阶段 1 的压力增幅（断崖定位）
  console.log('\n=== 阶段 1 弹幕密度对比（断崖在这里最明显）===');
  const p1 = out.filter(r => r.phase === 1);
  let prev = null;
  for (const r of p1) {
    const jump = prev ? ((r.perSec / prev.perSec - 1) * 100).toFixed(0) + '%' : '—';
    console.log(`${r.wave} 关: ${r.perSec.toFixed(2)} 发/秒   环比 ${jump}`);
    prev = r;
  }
  app.quit();
}).catch(e => { console.error('ERR', e); app.quit(); });
