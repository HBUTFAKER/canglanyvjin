const { app, BrowserWindow } = require('electron');
// ★ 测试隔离：使用独立 userData，绝不碰玩家真实存档（%APPDATA%/Electron）
try { require('fs').rmSync(__dirname + '/_testprofile', { recursive: true, force: true }); } catch {}
app.setPath('userData', __dirname + '/_testprofile');

app.whenReady().then(() => {
  const win = new BrowserWindow({ width:420, height:820, show:false, webPreferences:{ offscreen:true } });
  let errors = [];
  win.webContents.on('console-message', (e, level, msg) => { if (level >= 2 && !msg.includes('Security') && !msg.includes('Content') && !msg.includes('unsafe')) errors.push(msg); });
  win.loadFile('星际射手.html').then(() => {
    setTimeout(async () => {
      const run = (js) => win.webContents.executeJavaScript(js);
      const t = async (name, js) => { try { const r = await run(js); console.log('✅', name, '->', JSON.stringify(r)); } catch(e){ console.log('❌', name, '->', e.message); } };
      // 真实帧等待：offscreen 窗口下 rAF 会被节流，必须按帧数等（而不是按墙钟）
      const frames = (n) => win.webContents.executeJavaScript(
        `new Promise(res=>{ let c=0; const to=setTimeout(()=>res('timeout'), 4000);
           const f=()=>{ if(++c>=${n}){ clearTimeout(to); return res(c); } requestAnimationFrame(f); };
           requestAnimationFrame(f); })`
      );
      const step = () => frames(2);
      const STATE = `({ hidden:document.getElementById('runProgress').classList.contains('hidden'), cls:document.getElementById('runProgress').className, label:document.getElementById('rpLabel').textContent, right:document.getElementById('rpRight').textContent, fill:document.getElementById('rpFill').style.width })`;

      // 通用几何/重叠工具
      await run(`
        window.__rect = (sel) => { const e = document.querySelector(sel); if(!e) return null; const r = e.getBoundingClientRect();
          return { t:Math.round(r.top), b:Math.round(r.bottom), l:Math.round(r.left), r:Math.round(r.right) }; };
        window.__ov = (a,b) => a && b && !(a.r<=b.l || b.r<=a.l || a.b<=b.t || b.b<=a.t);
        'ok'
      `);

      console.log('--- 菜单（应隐藏）---');
      await t('主菜单隐藏推进条', STATE);

      console.log('--- 战役模式 ---');
      await t('进入战役', `startCampaign(); 'ok'`); await step();
      await t('推进条出现·第1关', STATE);
      await t('时间推进 20/23 → 约 57%', `waveTimer = 20; 'ok'`); await step();
      await t('  状态', STATE);
      await t('首领登场 → 转红·65%', `spawnBoss(); 'ok'`); await step();
      await t('  状态', STATE);
      await t('首领半血 → 约 83%', `bossRef.hp = bossRef.maxHp/2; 'ok'`); await step();
      await t('  状态', STATE);
      await t('首领击破 → 100%', `killBoss(); 'ok'`); await step();
      await t('  状态', STATE);
      await t('战机位置随推进度移动', `({ rp:document.getElementById('runProgress').style.getPropertyValue('--rp'), plane:Math.round(document.querySelector('.rp-plane-wrap').getBoundingClientRect().left), trackL:Math.round(document.querySelector('.rp-track').getBoundingClientRect().left), trackR:Math.round(document.querySelector('.rp-track').getBoundingClientRect().right) })`);
      await t('几何：右下角布局不打架', `({ track:__rect('#runProgress .rp-track'), bomb:__rect('#bombBtn'), tip:__rect('.tip'),
        trackVsBomb:__ov(__rect('#runProgress'),__rect('#bombBtn')), tipVsBomb:__ov(__rect('.tip'),__rect('#bombBtn')),
        trackVsTip:__ov(__rect('#runProgress'),__rect('.tip')), trackVsGear:__ov(__rect('#runProgress'),__rect('#arsenalBtn')) })`);

      console.log('--- 无尽模式 ---');
      await t('进入无尽', `startEndless(); 'ok'`); await step();
      await t('无限进程提示', STATE);
      await t('换波后仍显示', `wave = 7; updateHud(); 'ok'`); await step();
      await t('  状态', STATE);

      console.log('--- 练习模式 ---');
      await t('进入练习', `startPractice(); 'ok'`); await step();
      await t('无限进程提示（自由演练）', STATE);

      console.log('--- 每日挑战 ---');
      await t('进入每日挑战', `selectDaily(0); 'ok'`); await step();
      await t('带挑战名 + 波次', STATE);
      await t('第二波', `wave = 3; waveTimer = 10; updateHud(); 'ok'`); await step();
      await t('  状态', STATE);

      console.log('--- 显隐边界 ---');
      await t('暂停 → 隐藏', `pauseGame(); 'ok'`); await step();
      await t('  状态', STATE);
      await t('继续 → 恢复', `resumeGame(); 'ok'`); await step();
      await t('  状态', STATE);
      await t('死亡结算 → 隐藏', `gameOver(); 'ok'`); await step();
      await t('  状态', STATE);
      await t('回菜单', `mode = MODE.MENU; hideAllOvl(); document.getElementById('menu').classList.remove('hidden'); 'ok'`); await step();
      await t('  状态', STATE);

      await new Promise(r => setTimeout(r, 200));
      console.log('--- 运行时错误数:', errors.length);
      errors.slice(0, 8).forEach(e => console.log('  [err]', e.slice(0, 120)));
      app.quit();
    }, 1600);
  });
});
