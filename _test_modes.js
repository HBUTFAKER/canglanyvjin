/* 验证两个模式的时间轴改动：
   ① 练习模式：难度随时间递增（wave 每 25 秒 +1，上限 12）
   ② 每日挑战：一把速通 —— 击破首领即结算，总时长 40 秒内 */
const { app, BrowserWindow } = require('electron');
// ★ 测试隔离：使用独立 userData，绝不碰玩家真实存档（%APPDATA%/Electron）
try { require('fs').rmSync(__dirname + '/_testprofile', { recursive: true, force: true }); } catch {}
app.setPath('userData', __dirname + '/_testprofile');

app.disableHardwareAcceleration();

app.whenReady().then(async () => {
  const win = new BrowserWindow({ width: 430, height: 800, show: false,
    webPreferences: { offscreen: true, backgroundThrottling: false } });
  await win.loadFile('星际射手.html');
  await new Promise(r => setTimeout(r, 2200));

  // ---- ① 练习模式：空跑 80 秒，记录 wave 的时间轨迹 ----
  const prac = await win.webContents.executeJavaScript(`(function(){
    window.requestAnimationFrame = function(){};
    if (!Sfx.isMuted()) Sfx.toggleMute();
    resetGame(MODE.PRACTICE);
    const dt = 1/60, track = [];
    let lastW = -1;
    for (let k=0; k<80*60; k++) {
      update(dt);   // gameTime 由 update 内部累加，这里不要再手动加（否则时间轴跑成两倍速）
      if (wave !== lastW) { track.push('T' + Math.round(k*dt) + 's→强度' + wave); lastW = wave; }
      if (enemies.length > 60) enemies.length = 60;     // 防止长时间空跑堆满敌人拖慢仿真
    }
    return { track, finalWave: wave, enemyCount: enemies.length };
  })()`);
  console.log('=== 练习模式难度递增 ===');
  console.log('  轨迹：' + prac.track.join('  |  '));
  console.log('  80 秒后强度档 = ' + prac.finalWave + '（期望 4）  场上敌人 ' + prac.enemyCount);

  // ---- ② 每日挑战：击破首领后是否立刻结算 ----
  const daily = await win.webContents.executeJavaScript(`(function(){
   try {
    window.requestAnimationFrame = function(){};
    dailyChallenge = DAILY_CHALLENGES[0];
    resetGame(MODE.DAILY);
    wave = 1; dailyChallenge = DAILY_CHALLENGES[0];
    const dt = 1/60;
    const wl = 12;                                    // 期望的单波时长
    // 先空跑到首领出现，统计这段时间
    let t = 0, bossAt = -1;
    for (; t < 40; t += dt) {
      update(dt);
      if (bossRef && bossAt < 0) { bossAt = t; break; }
    }
    const bossHp = bossRef ? bossRef.maxHp : -1;
    if (bossRef) { bossRef.enter = false; bossRef.y = 160; }
    // 用"理论站桩输出"把首领打掉，统计剩下的时间
    const t0 = t;
    while (bossRef && t < 120) { bossRef.enter = false; bossRef.hp -= 12; update(dt); t += dt; }
    const tKill = t - t0;
    // 结算延迟（nextWavePending 1.2s）
    for (let k=0;k<120;k++){ update(dt); }
    const shown = ['gameOver','successOvl'].some(id => { const e = document.getElementById(id); return e && !e.classList.contains('hidden'); });
    return { bossAt:+bossAt.toFixed(1), waveLenExpect: wl, bossHp, tKill:+tKill.toFixed(1),
             total:+(bossAt+tKill+1.2).toFixed(1), mode, OVER: MODE.OVER, overShown: shown };
   } catch(err) { return { err: String(err && err.message || err), stack: String(err && err.stack || '').split('\\n').slice(0,3).join(' | ') }; }
  })()`);
  console.log('\n=== 每日挑战速通 ===');
  if (daily.err) { console.log('  ✗ 抛出异常：' + daily.err); console.log('    ' + daily.stack); }
  else {
  console.log('  首领出现于 ' + daily.bossAt + 's（期望 ≈' + daily.waveLenExpect + 's）  首领血量 ' + daily.bossHp);
  console.log('  击破耗时 ' + daily.tKill + 's   →  理论总时长 ' + daily.total + 's' + (daily.total <= 40 ? '  ✓ 40 秒内' : '  ✗ 超过 40 秒'));
  console.log('  击破后 mode=' + daily.mode + '（期望 ' + daily.OVER + ' = 结算界面）  结算界面已弹出 = ' + daily.overShown);
  }

  app.quit();
}).catch(e => { console.error('ERR', e); app.quit(); });
