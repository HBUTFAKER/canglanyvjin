// 六槽存档系统验证：老档迁移 / 切槽读对数据 / 面板 6 格 / 删除 / 重置
const { app, BrowserWindow } = require('electron');
// ★ 测试隔离：使用独立 userData，绝不碰玩家真实存档（%APPDATA%/Electron）
try { require('fs').rmSync(__dirname + '/_testprofile', { recursive: true, force: true }); } catch {}
app.setPath('userData', __dirname + '/_testprofile');

app.disableHardwareAcceleration();

const wait = ms => new Promise(r => setTimeout(r, ms));
let fails = 0;
function chk(name, cond, extra) {
  console.log('  ' + (cond ? '✅' : '❌') + ' ' + name + (extra !== undefined ? '  → ' + JSON.stringify(extra) : ''));
  if (!cond) fails++;
}

app.whenReady().then(async () => {
  const win = new BrowserWindow({ width: 1200, height: 800, show: false,
    webPreferences: { offscreen: true, backgroundThrottling: false } });
  await win.loadFile('星际射手.html');
  await wait(1800);
  const js = s => win.webContents.executeJavaScript(s);

  // ---------- ① 老存档迁移 ----------
  console.log('\n=== ① 老单档 → 1 号槽迁移 ===');
  await js(`(function(){
    localStorage.clear();
    localStorage.setItem('stellar_gunner_v5', JSON.stringify({
      gold:111, playerLevel:7, best:500, stars:{'1':3,'2':1,'3':2}, unlocked:4, kills:42
    }));
    return 1; })()`);
  win.webContents.reload();
  await wait(1800);
  let r = await js(`(function(){ return {
    slotCount: SLOT_COUNT, active: activeSlot,
    hasSlot0: slotHasData(0),
    legacyKept: !!localStorage.getItem('stellar_gunner_v5'),
    gold: save.gold, lv: save.playerLevel, kills: save.kills,
    slots: (function(){ var a=[]; for(var i=0;i<6;i++) a.push(slotHasData(i)); return a; })()
  }; })()`);
  chk('槽位数为 6', r.slotCount === 6, r.slotCount);
  chk('默认使用 0 号槽', r.active === 0, r.active);
  chk('老存档已迁进 0 号槽', r.hasSlot0 === true);
  chk('老 key 保留作备份（未删）', r.legacyKept === true);
  chk('读到的数据是老档的', r.gold === 111 && r.lv === 7 && r.kills === 42, [r.gold, r.lv, r.kills]);
  chk('只有 0 号槽有数据', r.slots.join(',') === 'true,false,false,false,false,false', r.slots);

  // ---------- ② 多槽独立数据 + 切槽读对 ----------
  console.log('\n=== ② 各槽数据独立 / 切槽读对 ===');
  await js(`(function(){
    localStorage.setItem(slotKey(1), JSON.stringify({gold:222, playerLevel:2, best:100, stars:{'1':1}}));
    localStorage.setItem(slotKey(2), JSON.stringify({gold:333, playerLevel:9, best:999, stars:{'1':3,'2':3,'3':3,'4':3,'5':3,'6':3,'7':3,'8':3,'9':3,'10':3,'11':3,'12':3}}));
    localStorage.setItem('stellar_gunner_active_slot', '2');
    return 1; })()`);
  win.webContents.reload();
  await wait(1800);
  r = await js(`(function(){ return {
    active: activeSlot, gold: save.gold, lv: save.playerLevel, best: save.best,
    cleared: Object.keys(save.stars||{}).length
  }; })()`);
  chk('切到 2 号槽', r.active === 2, r.active);
  chk('读的是 2 号槽的数据', r.gold === 333 && r.lv === 9 && r.best === 999, [r.gold, r.lv, r.best]);
  chk('2 号槽 12 关全通（会显示"已通关"）', r.cleared === 12, r.cleared);

  // ---------- ③ 存档面板 6 格 + 状态标记 ----------
  console.log('\n=== ③ 存档面板 ===');
  r = await js(`(function(){
    document.getElementById('menu').classList.add('hidden');
    openSave();
    var cards = document.querySelectorAll('#saveList > div');
    var txt = document.getElementById('saveList').textContent;
    return {
      count: cards.length,
      hasCurrent: txt.indexOf('使用中') >= 0,
      hasCleared: txt.indexOf('已通关') >= 0,
      hasEmpty: txt.indexOf('空存档') >= 0,
      newBtns: document.querySelectorAll('#saveList button[data-act="new"]').length,
      wipeBtns: document.querySelectorAll('#saveList button[data-act="wipe"]').length,
      wipeCur: document.querySelectorAll('#saveList > div:nth-child(3) button[data-act="wipe"]').length,
      curTxt: document.querySelectorAll('#saveList > div:nth-child(3)')[0].textContent,
      loadBtns: document.querySelectorAll('#saveList button[data-act="load"]').length,
      delBtns: document.querySelectorAll('#saveList button[data-act="del"]').length,
      panelVisible: !document.getElementById('saveOvl').classList.contains('hidden'),
      overX: (function(){ var p=document.querySelector('#saveOvl .toast'); return p.scrollWidth - p.clientWidth; })()
    };
  })()`);
  chk('面板打开', r.panelVisible === true);
  chk('正好 6 个槽位卡片', r.count === 6, r.count);
  chk('面板无横向溢出', r.overX === 0, r.overX);
  chk('有「使用中」标记', r.hasCurrent === true);
  chk('有「已通关」标记', r.hasCleared === true);
  chk('有空槽提示', r.hasEmpty === true);
  chk('空槽=3 个「新建存档」', r.newBtns === 3, r.newBtns);
  chk('当前槽按钮是「重置此档」', r.wipeCur === 1 && r.curTxt.indexOf('重置此档') >= 0);
  chk('更新按钮共 3 个（1 重置 + 2 覆盖）', r.wipeBtns === 3, r.wipeBtns);
  chk('其它有档槽 2 个「读取」', r.loadBtns === 2, r.loadBtns);
  chk('其它有档槽 2 个「删除」', r.delBtns === 2, r.delBtns);

  // ---------- ④ 删除非当前槽 ----------
  console.log('\n=== ④ 删除槽位 ===');
  r = await js(`(function(){
    var before = slotHasData(1);
    deleteSlot(1);
    return { before: before, after: slotHasData(1), meta: !!readSlotMeta()[1],
             active: activeSlot, cards: document.querySelectorAll('#saveList > div').length };
  })()`);
  chk('删除前 1 号槽有数据', r.before === true);
  chk('1 号槽数据已删', r.after === false);
  chk('1 号槽摘要已删', r.meta === false);
  chk('删除不会切走当前槽', r.active === 2, r.active);
  chk('列表自动刷新仍 6 格', r.cards === 6, r.cards);

  // ---------- ⑤ 游玩时长落盘 ----------
  console.log('\n=== ⑤ 游玩时长 ===');
  r = await js(`(function(){
    save.playTime = 0; updateSlotMeta();
    var m1 = readSlotMeta()[2].playTime;
    save.playTime = 3725; updateSlotMeta();
    var m2 = readSlotMeta()[2].playTime;
    return { m1: m1, m2: m2, fmt: fmtPlayTime(3725), fmt2: fmtPlayTime(95), ago: timeAgo(Date.now()-120000) };
  })()`);
  chk('摘要记录游玩时长', r.m2 === 3725, r.m2);
  chk('时长格式化正确', r.fmt === '1 小时 2 分' && r.fmt2 === '1 分 35 秒', [r.fmt, r.fmt2]);
  chk('相对时间格式化', r.ago === '2 分钟前', r.ago);

  // ---------- ⑥ 作用域隔离：写 2 号槽不污染 3 号 ----------
  console.log('\n=== ⑥ 槽位互不污染 ===');
  r = await js(`(function(){
    save.gold = 7777; saveStore();
    var s2 = JSON.parse(localStorage.getItem(slotKey(2))).gold;
    var s3raw = localStorage.getItem(slotKey(3));
    var s0 = JSON.parse(localStorage.getItem(slotKey(0))).gold;
    return { s2: s2, s3exists: !!s3raw, s0: s0 };
  })()`);
  chk('当前槽写入 7777', r.s2 === 7777, r.s2);
  chk('未触碰的 3 号槽仍是空的', r.s3exists === false);
  chk('0 号槽未被污染', r.s0 === 111, r.s0);

  console.log('\n' + (fails === 0 ? '✅ 全部通过' : '❌ 失败 ' + fails + ' 项'));
  win.destroy(); app.quit();
});
