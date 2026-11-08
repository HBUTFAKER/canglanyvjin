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

      // 安装"收银音效"探针：统计振荡器 start 次数（cash() 用合成振荡器）
      await run(`
        window.__oscN = 0;
        (function(){ const o = AudioContext.prototype.createOscillator;
          AudioContext.prototype.createOscillator = function(){ const n = o.call(this); const s = n.start.bind(n);
            n.start = (...a)=>{ window.__oscN++; return s(...a); }; return n; }; })();
        save.gold = 9999; save.wear[save.selectedShip] = { hull:40, weapons:{} }; saveStore();
      `);

      console.log('--- 机体升级（升级成功）---');
      await t('商店打开', `document.getElementById('mShop').click(); !document.getElementById('shopOvl').classList.contains('hidden')`);
      await t('点引擎升级→弹确认框', `document.getElementById('shopBody').children[0].click(); !document.getElementById('confirmOvl').classList.contains('hidden')`);
      const before = await run(`save.gold`);
      await t('确定→成功窗弹出', `document.getElementById('confirmYes').click(); ({
        confirmClosed: document.getElementById('confirmOvl').classList.contains('hidden'),
        shown: !document.getElementById('successOvl').classList.contains('hidden'),
        title: document.getElementById('successTitle').textContent,
        msg: document.getElementById('successMsg').textContent,
        cost: document.getElementById('successCost').textContent,
        coins: document.getElementById('successCoins').children.length,
        tip: document.querySelector('#successOvl .s-tip').textContent,
        gold: save.gold
      })`);
      console.log('   扣款:', before, '->', await run(`save.gold`), ' 收银振荡器次数:', await run(`window.__oscN`));

      await new Promise(r => setTimeout(r, 260));
      await t('点卡片关闭', `document.querySelector('#successOvl .s-card').click(); document.getElementById('successOvl').classList.contains('hidden')`);

      console.log('--- 附魔购买（购买成功）---');
      await t('点附魔项→确定', `var b=document.getElementById('shopBody').children; var idx=-1; for(var i=0;i<b.length;i++){ if(b[i].textContent.indexOf('附魔')>=0){ idx=i; break; } } b[idx].click(); document.getElementById('confirmYes').click(); [document.getElementById('successTitle').textContent, document.getElementById('successMsg').textContent, document.getElementById('successOvl').className]`);
      await new Promise(r => setTimeout(r, 240));
      await t('点空白关闭', `document.getElementById('successOvl').click(); document.getElementById('successOvl').classList.contains('hidden')`);

      console.log('--- 全面修复（修复成功，绿色主题）---');
      await t('点全面修复→确定', `var b=document.getElementById('shopBody').children; b[b.length-1].click(); document.getElementById('confirmYes').click(); ({ title:document.getElementById('successTitle').textContent, msg:document.getElementById('successMsg').textContent, icon:document.getElementById('successIcon').textContent, cls:document.getElementById('successOvl').className, cost:document.getElementById('successCost').textContent, hull:save.wear[save.selectedShip].hull })`);
      await new Promise(r => setTimeout(r, 240));
      await t('Esc 关闭', `window.dispatchEvent(new KeyboardEvent('keydown',{key:'Escape'})); document.getElementById('successOvl').classList.contains('hidden')`);

      console.log('--- 边界 ---');
      await t('弹窗后立即点击被忽略(防误触)', `showSuccess('buy','购买成功','测试',10); document.getElementById('successOvl').click(); !document.getElementById('successOvl').classList.contains('hidden')`);
      await new Promise(r => setTimeout(r, 260));
      await t('稍后可关闭', `document.getElementById('successOvl').click(); document.getElementById('successOvl').classList.contains('hidden')`);
      await t('空格不会误开战役', `showSuccess('buy','购买成功','测试',10); window.dispatchEvent(new KeyboardEvent('keydown',{key:' '})); ({ successHidden: document.getElementById('successOvl').classList.contains('hidden'), mode: mode })`);
      await t('hideAllOvl 会收起成功窗', `showSuccess('buy','购买成功','测试',10); hideAllOvl(); document.getElementById('successOvl').classList.contains('hidden')`);
      await t('金币不足时不可点', `document.getElementById('shopClose').click(); save.gold=0; saveStore(); document.getElementById('mShop').click(); var b=document.getElementById('shopBody').children; b[3].click(); ({ confirmHidden: document.getElementById('confirmOvl').classList.contains('hidden'), mode: mode })`);
      await t('商店返回', `document.getElementById('shopClose').click(); 'ok'`);

      await new Promise(r => setTimeout(r, 300));
      console.log('--- 运行时错误数:', errors.length);
      errors.slice(0, 8).forEach(e => console.log('  [err]', e.slice(0, 120)));
      app.quit();
    }, 1600);
  });
});
