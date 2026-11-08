// 存档码（离线跨设备同步）验证：
// 入口挂载 / 往返无损 / 截断与篡改可识别 / 覆盖忠实还原 / 失败不写盘
const { app, BrowserWindow } = require('electron');
// ★ 测试隔离：独立 userData，绝不碰玩家真实存档（%APPDATA%/Electron）
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

  // 造一份「有内容」的本机存档：3 个槽，其中一个满配
  await js(`(function(){
    localStorage.clear();
    localStorage.setItem(slotKey(0), JSON.stringify({gold:29356, playerLevel:30, best:99999,
      stars:{'1':3,'2':3,'3':3}, unlocked:12, kills:4321, playTime:7265,
      ships:{agile:true,heavy:true,balanced:true}, selectedShip:'heavy',
      weaponLevels:{main:5,laser:3}, enchantPerm:{pierce:2,chain:1}}));
    localStorage.setItem(slotKey(1), JSON.stringify({gold:45, playerLevel:3, best:800, stars:{'1':1}}));
    localStorage.setItem('stellar_gunner_active_slot', '0');
    return 1; })()`);
  win.webContents.reload();
  await wait(1800);

  // ---------- ① 入口挂载 ----------
  console.log('\n=== ① 存档管理面板里的入口 ===');
  let r = await js(`(function(){
    document.getElementById('menu').classList.add('hidden');
    openSave();
    var e = document.getElementById('saveCodeEntry');
    var btns = e ? e.querySelectorAll('button') : [];
    return { mounted: !!e,
             btnCount: btns.length,
             labels: [].map.call(btns, function(b){ return b.textContent.trim(); }),
             text: e ? e.textContent : '',
             saveListOk: document.querySelectorAll('#saveList > div').length,
             panelVisible: !document.getElementById('saveOvl').classList.contains('hidden') };
  })()`);
  chk('入口已挂到存档面板', r.mounted === true);
  chk('两个按钮：导出 / 导入', r.btnCount === 2 && r.labels[0].indexOf('导出') >= 0 && r.labels[1].indexOf('导入') >= 0, r.labels);
  chk('入口没有破坏原有 6 格列表', r.saveListOk === 6, r.saveListOk);
  chk('面板仍正常打开', r.panelVisible === true);

  // ---------- ② 生成 + 往返无损 ----------
  console.log('\n=== ② 存档码往返无损 ===');
  r = await js(`(function(){
    var code = SaveCode.makeCode();
    var parsed = SaveCode.parseCode(code);
    var a = SaveCode.collectKeys();
    var b = parsed.ok ? parsed.payload.keys : {};
    var ka = Object.keys(a).sort(), kb = Object.keys(b).sort();
    var same = ka.join('|') === kb.join('|');
    if (same) for (var i=0;i<ka.length;i++) if (a[ka[i]] !== b[kb[i]]) { same = false; break; }
    return { ok: parsed.ok, len: code.length,
             head: code.slice(0, 22),
             localKeys: ka.length, codeKeys: kb.length,
             identical: same,
             jsonEqual: JSON.stringify(a) === JSON.stringify(b) };
  })()`);
  chk('生成的码能被自己解析', r.ok === true);
  chk('码头是 SGSAVE1-…', r.head.indexOf('SGSAVE1-') === 0, r.head);
  chk('导出 key 数与本机一致', r.localKeys === r.codeKeys, [r.localKeys, r.codeKeys]);
  chk('每个 key 的原文逐字一致（无损）', r.identical === true && r.jsonEqual === true);
  chk('码长度合理（<12k 字符）', r.len > 100 && r.len < 12000, r.len);

  // ---------- ③ 预览数据正确 ----------
  console.log('\n=== ③ 导入预览的槽位摘要 ===');
  r = await js(`(function(){
    var p = SaveCode.parseCode(SaveCode.makeCode());
    var slots = (function(k){
      var out=[];
      for (var i=0;i<6;i++){
        var raw = k['stellar_gunner_v5_s'+i];
        out.push(raw ? JSON.parse(raw) : null);
      }
      return out;
    })(p.payload.keys);
    return { s0gold: slots[0].gold, s0lv: slots[0].playerLevel, s1gold: slots[1].gold,
             s2: slots[2], active: p.payload.keys['stellar_gunner_active_slot'] };
  })()`);
  chk('0 号槽读到满配数据', r.s0gold === 29356 && r.s0lv === 30, [r.s0gold, r.s0lv]);
  chk('1 号槽读到小号数据', r.s1gold === 45, r.s1gold);
  chk('2 号槽为空', r.s2 === null);
  chk('当前槽位记在码里', r.active === '0', r.active);

  // ---------- ④ 截断 / 篡改 / 异种码 必须被拒 ----------
  console.log('\n=== ④ 坏码识别（且绝不写盘）===');
  r = await js(`(function(){
    var code = SaveCode.makeCode();
    var before = JSON.stringify(SaveCode.collectKeys());
    var cases = {
      truncated: SaveCode.parseCode(code.slice(0, code.length - 40)),
      tampered:  SaveCode.parseCode(code.slice(0, 30) + 'X' + code.slice(31)),
      garbage:   SaveCode.parseCode('随便一段文字，不是存档码'),
      empty:     SaveCode.parseCode(''),
      foreign:   SaveCode.parseCode('SGSAVE1-10-zz-abcdefghij'),
      ok:        SaveCode.parseCode(code)
    };
    var after = JSON.stringify(SaveCode.collectKeys());
    var out = {};
    for (var k in cases) out[k] = { ok: cases[k].ok, msg: cases[k].msg || '' };
    out.untouched = (before === after);
    return out;
  })()`);
  chk('截断被拒 + 提示「截断」', r.truncated.ok === false && r.truncated.msg.indexOf('截断') >= 0, r.truncated.msg);
  chk('篡改被拒 + 提示校验失败', r.tampered.ok === false && r.tampered.msg.indexOf('校验') >= 0, r.tampered.msg);
  chk('乱文字被拒', r.garbage.ok === false, r.garbage.msg);
  chk('空输入被拒', r.empty.ok === false, r.empty.msg);
  chk('异种/非法码被拒', r.foreign.ok === false, r.foreign.msg);
  chk('正常码仍能通过', r.ok.ok === true);
  chk('解析失败全程未改 localStorage', r.untouched === true);

  // ---------- ⑤ 导入覆盖：忠实还原（多出的 key 会被清掉）----------
  console.log('\n=== ⑤ 导入覆盖 ===');
  r = await js(`(function(){
    // 造一段「另一台设备」的码：只有 0、4 号槽，且内容不同
    var other = {};
    other['stellar_gunner_v5_s0'] = JSON.stringify({gold:777, playerLevel:9, best:1, stars:{'1':1}, playTime:60});
    other['stellar_gunner_v5_s4'] = JSON.stringify({gold:8888, playerLevel:12, best:2, stars:{'1':3,'2':3}, playTime:900});
    other['stellar_gunner_active_slot'] = '4';
    other['stellar_gunner_slots'] = JSON.stringify({0:{level:9,gold:777},4:{level:12,gold:8888}});
    var payload = { app:'stellar_gunner', v:1, at: Date.now(), keys: other };
    var body = btoa(unescape(encodeURIComponent(JSON.stringify(payload))))
                 .replace(/\\+/g,'-').replace(/\\//g,'_').replace(/=+$/,'');
    var h=5381; for (var i=0;i<body.length;i++) h=((h<<5)+h+body.charCodeAt(i))>>>0;
    var code = 'SGSAVE1-' + body.length + '-' + h.toString(36) + '-' + body;
    var parsed = SaveCode.parseCode(code);
    var n = parsed.ok ? SaveCode.applyKeys(parsed.payload.keys) : -1;
    return { parsedOk: parsed.ok, applied: n,
             s0: JSON.parse(localStorage.getItem('stellar_gunner_v5_s0') || 'null'),
             s1raw: localStorage.getItem('stellar_gunner_v5_s1'),
             s4: JSON.parse(localStorage.getItem('stellar_gunner_v5_s4') || 'null'),
             active: localStorage.getItem('stellar_gunner_active_slot') };
  })()`);
  chk('外来码解析成功', r.parsedOk === true);
  chk('写入了 4 项', r.applied === 4, r.applied);
  chk('0 号槽已被覆盖成 777', r.s0 && r.s0.gold === 777 && r.s0.playerLevel === 9, r.s0 && r.s0.gold);
  chk('4 号槽新增成功', r.s4 && r.s4.gold === 8888, r.s4 && r.s4.gold);
  chk('本机多出的 1 号槽被清掉（忠实还原）', r.s1raw === null, r.s1raw === null ? 'null' : 'still-there');
  chk('当前槽位跟着码走', r.active === '4', r.active);

  // ---------- ⑥ 导入后游戏真的读到新档 ----------
  console.log('\n=== ⑥ 重新载入后游戏读到的档 ===');
  win.webContents.reload();
  await wait(1800);
  r = await js(`(function(){ return { active: activeSlot, gold: save.gold, lv: save.playerLevel }; })()`);
  chk('游戏切到 4 号槽', r.active === 4, r.active);
  chk('游戏读到 8888 金币 / Lv12', r.gold === 8888 && r.lv === 12, [r.gold, r.lv]);

  // ---------- ⑦ 空档导出有提示 ----------
  console.log('\n=== ⑦ 空档导出 ===');
  r = await js(`(function(){
    localStorage.clear();
    SaveCode.openExport();
    var ovl = document.getElementById('saveCodeOvl');
    var r2 = { visible: !ovl.classList.contains('hidden'),
               hint: document.querySelector('#saveCodeOvl p').textContent,
               taLen: document.querySelector('#saveCodeOvl textarea').value.length };
    SaveCode.openImport();
    r2.importHint = document.querySelector('#saveCodeOvl p').textContent;
    r2.warnsOverwrite = r2.importHint.indexOf('覆盖') >= 0;
    return r2;
  })()`);
  chk('导出面板能打开', r.visible === true);
  chk('空档导出有告警文案', r.hint.indexOf('还没有任何存档') >= 0, r.hint.slice(0, 40));
  chk('空档也能生成一个合法码', r.taLen > 20, r.taLen);
  chk('导入面板提示会覆盖', r.warnsOverwrite === true);

  console.log('\n' + (fails === 0 ? '✅ 全部通过' : '❌ 失败 ' + fails + ' 项'));
  win.destroy(); app.quit();
});
