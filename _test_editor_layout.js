// 验证 ① 练习/调参面板：悬停立绘不再盖住 −/＋（点击能落到按钮上）
//      ② 每日挑战：5 个挑战当天各可打一次，打完一个只锁一个
const { app, BrowserWindow } = require('electron');
// ★ 测试隔离：使用独立 userData，绝不碰玩家真实存档（%APPDATA%/Electron）
try { require('fs').rmSync(__dirname + '/_testprofile', { recursive: true, force: true }); } catch {}
app.setPath('userData', __dirname + '/_testprofile');

const fs = require('fs');
app.disableHardwareAcceleration();

app.whenReady().then(async () => {
  const win = new BrowserWindow({
    width: 1200, height: 760, show: false,
    webPreferences: { offscreen: true, backgroundThrottling: false }
  });
  await win.loadFile('星际射手.html');
  await new Promise(r => setTimeout(r, 2200));

  // ---------- ① 面板几何 + 点击穿透 ----------
  const g = await win.webContents.executeJavaScript(`(function(){
    window.requestAnimationFrame = function(){};
    openPractice();
    // 固定初始状态：主炮 Lv6（别依赖玩家存档，测试必须在空档下也成立）
    practiceWeaponLv.main = 6; renderEditor('menu');
    // 悬停第一行（主炮）→ 触发右侧放大立绘
    var row0 = document.querySelector('#practiceWeapons .ui-item');
    row0.dispatchEvent(new MouseEvent('mouseenter'));
    var plus  = document.querySelector('#practiceWeapons .lv-btn[data-d="1"]');
    plus.dispatchEvent(new MouseEvent('mouseenter'));
    var panel = document.querySelector('#practiceOvl .prac-panel').getBoundingClientRect();
    var pv    = document.getElementById('portraitPreview');
    var pvb   = pv.getBoundingClientRect();
    var pb    = plus.getBoundingClientRect();
    var hit   = document.elementFromPoint(pb.x + pb.width/2, pb.y + pb.height/2);
    // 先点 − 再点 ＋（main 默认已是满级，只点 ＋ 会被 clamp，测不出效果）
    var lv0   = practiceWeaponLv.main || 0;
    document.querySelector('#practiceWeapons .lv-btn[data-d="-1"]').click();
    var lvMid = practiceWeaponLv.main || 0;
    document.querySelector('#practiceWeapons .lv-btn[data-d="1"]').click();
    var lv1   = practiceWeaponLv.main || 0;
    var vals  = [].map.call(document.querySelectorAll('#practiceWeapons .lv-val'), function(v){ return v.textContent; });
    var art   = document.querySelector('#practiceOvl .prac-art img');
    return {
      vw: innerWidth,
      panel:  [Math.round(panel.x), Math.round(panel.right)],
      preview:[Math.round(pvb.x), Math.round(pvb.right)], previewShow: pv.classList.contains('show'),
      overlap: Math.max(0, Math.round(Math.min(panel.right, pvb.right) - Math.max(panel.x, pvb.x))),
      plusBtn:[Math.round(pb.x), Math.round(pb.right)],
      hitTag: hit ? (hit.tagName + '.' + (hit.className||'')) : 'null',
      hitIsPlus: hit === plus,
      lvBefore: lv0, lvMid: lvMid, lvAfter: lv1,
      firstVals: vals.slice(0,3),
      artSrc: art ? art.getAttribute('src') : null,
      artRect: art ? [Math.round(art.getBoundingClientRect().x), Math.round(art.getBoundingClientRect().width)] : null,
    };
  })()`);
  console.log('=== ① 练习面板（窗口 1200 宽） ===');
  console.log('  面板      x=' + g.panel[0] + ' -> ' + g.panel[1]);
  console.log('  立绘预览层 x=' + g.preview[0] + ' -> ' + g.preview[1] + '（显示中=' + g.previewShow + '）');
  console.log('  两者水平重叠宽度 = ' + g.overlap + 'px' + (g.overlap === 0 ? '  ✓ 完全不压面板' : '  ✗ 仍压面板'));
  console.log('  ＋ 按钮   x=' + g.plusBtn[0] + ' -> ' + g.plusBtn[1]);
  console.log('  悬停立绘时，＋ 按钮中心的命中元素 = ' + g.hitTag + (g.hitIsPlus ? '  ✓ 就是按钮本身' : '  ✗ 被别的层挡住了'));
  console.log('  点 − → ＋：主炮等级 ' + g.lvBefore + ' → ' + g.lvMid + ' → ' + g.lvAfter +
    ((g.lvMid === g.lvBefore - 1 && g.lvAfter === g.lvBefore) ? '  ✓ 加减点都生效' : '  ✗ 点了没反应'));
  console.log('  前 3 行显示值：' + g.firstVals.join(' / '));
  console.log('  右侧陪练立绘 = ' + g.artSrc + '  x=' + (g.artRect ? g.artRect[0] : '?') + ' 宽=' + (g.artRect ? g.artRect[1] : '?'));

  // 窄窗口再验一次（按钮折成两行，仍然不能重叠/挡住）
  win.setContentSize(920, 700);
  await new Promise(r => setTimeout(r, 700));
  const g2 = await win.webContents.executeJavaScript(`(function(){
    var panel = document.querySelector('#practiceOvl .prac-panel').getBoundingClientRect();
    var pvb = document.getElementById('portraitPreview').getBoundingClientRect();
    var plus = document.querySelector('#practiceWeapons .lv-btn[data-d="1"]');
    var pb = plus.getBoundingClientRect();
    var hit = document.elementFromPoint(pb.x + pb.width/2, pb.y + pb.height/2);
    var minus = document.querySelector('#practiceWeapons .lv-btn[data-d="-1"]');
    var lv0 = practiceWeaponLv.main||0; minus.click(); var lv1 = practiceWeaponLv.main||0; plus.click();
    return { vw:innerWidth, panel:[Math.round(panel.x),Math.round(panel.right)],
      overlap: Math.max(0, Math.round(Math.min(panel.right,pvb.right)-Math.max(panel.x,pvb.x))),
      hitIsPlus: hit===plus, lv:[lv0, lv1, practiceWeaponLv.main||0] };
  })()`);
  console.log('  窄窗口 ' + g2.vw + '：面板 ' + g2.panel[0] + '->' + g2.panel[1] + '  重叠=' + g2.overlap + 'px  命中按钮=' + g2.hitIsPlus + '  减/加点 ' + g2.lv.join('->'));

  // 截图留档
  await new Promise(r => setTimeout(r, 500));
  let shot = await win.webContents.capturePage();
  await new Promise(r => setTimeout(r, 500));
  shot = await win.webContents.capturePage();
  fs.mkdirSync('_tmpimg', { recursive: true });
  fs.writeFileSync('_tmpimg/prac_layout.png', shot.toPNG());

  // ---------- ①b 战斗内「装备调参」面板（同一套 CSS，也要靠左且不被盖） ----------
  const a = await win.webContents.executeJavaScript(`(function(){
    startPractice(); openArsenal(false);
    practiceWeaponLv.main = 6; renderEditor('live'); applyEditorToLive();
    var panel = document.querySelector('#arsenalOvl .prac-panel').getBoundingClientRect();
    var pvb = document.getElementById('portraitPreview').getBoundingClientRect();
    document.querySelector('#arsenalWeapons .ui-item').dispatchEvent(new MouseEvent('mouseenter'));
    var plus = document.querySelector('#arsenalWeapons .lv-btn[data-d="1"]');
    plus.dispatchEvent(new MouseEvent('mouseenter'));
    var pb = plus.getBoundingClientRect();
    var hit = document.elementFromPoint(pb.x+pb.width/2, pb.y+pb.height/2);
    var lv0 = practiceWeaponLv.main||0;
    document.querySelector('#arsenalWeapons .lv-btn[data-d="-1"]').click();
    var lv1 = practiceWeaponLv.main||0;
    // 关键：调参要"实时生效"到本局 loadout
    var live = loadout.filter(function(l){ return l.type==='main'; })[0];
    return { panel:[Math.round(panel.x),Math.round(panel.right)], vw:innerWidth,
      overlap: Math.max(0, Math.round(Math.min(panel.right,pvb.right)-Math.max(panel.x,pvb.x))),
      hitIsPlus: hit===plus, lv:[lv0,lv1], liveMain: live?live.level:null,
      art: document.querySelector('#arsenalOvl .prac-art img').getAttribute('src'),
      role: document.getElementById('arsenalArtRole').textContent };
  })()`);
  console.log('\n=== ①b 战斗内装备调参 ===');
  console.log('  面板 ' + a.panel[0] + '->' + a.panel[1] + '（窗口 ' + a.vw + '）  与预览层重叠=' + a.overlap + 'px');
  console.log('  ＋ 按钮命中=' + a.hitIsPlus + '   点 − ：主炮 ' + a.lv[0] + '->' + a.lv[1] + '   本局 loadout 主炮等级=' + a.liveMain + (a.liveMain===a.lv[1]?'  ✓ 实时生效':'  ✗ 没同步'));
  console.log('  右侧立绘=' + a.art + '   ' + a.role);

  // ---------- ② 每日挑战逐个记录 ----------
  const d = await win.webContents.executeJavaScript(`(function(){
    var out = {};
    save.daily = { date: dailyToday(), done:{}, played:false };
    renderDailyList();
    var items = function(){ return [].slice.call(document.querySelectorAll('#dailyList > div')); };
    out.total = items().length;
    out.locked0 = items().filter(function(x){ return /今日已完成/.test(x.textContent); }).length;
    out.clickable0 = items().filter(function(x){ return /点击出击/.test(x.textContent); }).length;
    out.hint0 = document.getElementById('dailyHint').textContent;
    // 真打一把第一个挑战
    dailyChallenge = DAILY_CHALLENGES[0];
    resetGame(MODE.DAILY); mode = MODE.DAILY;
    finishRun(true);
    out.doneAfter1 = JSON.stringify(dailyDoneMap());
    renderDailyList();
    out.locked1 = items().filter(function(x){ return /今日已完成/.test(x.textContent); }).length;
    out.clickable1 = items().filter(function(x){ return /点击出击/.test(x.textContent); }).length;
    out.firstLocked = /今日已完成/.test(items()[0].textContent);
    out.secondOpen = /点击出击/.test(items()[1].textContent);
    out.state = document.getElementById('dailyState').textContent;
    out.hint1 = document.getElementById('dailyHint').textContent;
    // 打完第二个
    dailyChallenge = DAILY_CHALLENGES[1];
    resetGame(MODE.DAILY); mode = MODE.DAILY;
    finishRun(true);
    out.doneAfter2 = JSON.stringify(dailyDoneMap());
    out.state2 = (function(){ initMenu(); return document.getElementById('dailyState').textContent; })();
    // 居中面板（每日挑战）里不该再弹右侧预览层
    $('dailyOvl').classList.remove('hidden');
    showPortrait('assets/portraits/w_main.png');
    out.previewInCentered = document.getElementById('portraitPreview').classList.contains('show');
    $('dailyOvl').classList.add('hidden');
    // 跨天：昨天的表不该锁今天
    save.daily.date = '2000-01-01';
    out.afterRollover = dailyDoneCount();
    renderDailyList();
    out.lockedAfterRollover = items().filter(function(x){ return /今日已完成/.test(x.textContent); }).length;
    return out;
  })()`);
  console.log('\n=== ② 每日挑战 ===');
  console.log('  挑战总数 ' + d.total + '（期望 5）');
  console.log('  初始：可挑战 ' + d.clickable0 + ' 个 / 已锁 ' + d.locked0 + ' 个' + (d.locked0 === 0 && d.clickable0 === 5 ? '  ✓ 每天 5 个都能打' : '  ✗'));
  console.log('  提示语：' + d.hint0);
  console.log('  打通第 1 个后 done=' + d.doneAfter1 + '  → 已锁 ' + d.locked1 + ' 个 / 可挑战 ' + d.clickable1 + ' 个');
  console.log('    第 1 个锁定=' + d.firstLocked + '，第 2 个仍可打=' + d.secondOpen + (d.firstLocked && d.secondOpen ? '  ✓ 只锁打过的那个' : '  ✗'));
  console.log('  主页状态：' + d.state + '   提示语：' + d.hint1);
  console.log('  再打通第 2 个 → done=' + d.doneAfter2 + '   主页状态：' + d.state2);
  console.log('  居中面板里弹预览层 = ' + d.previewInCentered + (d.previewInCentered ? '  ✗ 还会盖住面板' : '  ✓ 已拦掉'));
  console.log('  跨天重置：次日已锁数 = ' + d.lockedAfterRollover + '（期望 0）' + (d.lockedAfterRollover === 0 ? '  ✓' : '  ✗'));

  win.destroy();
  app.quit();
});
