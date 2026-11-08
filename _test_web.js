// 网页版发布前自检：用真实 http 服务加载 web/ 目录，确认游戏能起来
const { app, BrowserWindow } = require('electron');
const path = require('path'), fs = require('fs');
const { spawn } = require('child_process');

// ★ 测试隔离：使用独立 userData，绝不碰玩家真实存档
try { fs.rmSync(__dirname + '/_testprofile', { recursive: true, force: true }); } catch {}
app.setPath('userData', __dirname + '/_testprofile');

app.disableHardwareAcceleration();

const PORT = 8791;
let srv;

app.whenReady().then(async () => {
  srv = spawn('C:/Users/29212/.workbuddy/binaries/python/versions/3.13.12/python.exe',
    ['-m', 'http.server', String(PORT), '--bind', '127.0.0.1'],
    { cwd: path.join(__dirname, 'web'), stdio: 'ignore' });
  await new Promise(r => setTimeout(r, 1200));

  const win = new BrowserWindow({ width: 900, height: 700, show: false,
    webPreferences: { offscreen: true, backgroundThrottling: false } });

  const errs = [];
  win.webContents.on('console-message', (e, lvl, msg) => { if (lvl >= 2) errs.push(msg); });
  win.webContents.on('did-fail-load', (e, code, desc) => errs.push('did-fail-load ' + code + ' ' + desc));

  await win.loadURL('http://127.0.0.1:' + PORT + '/index.html');
  await new Promise(r => setTimeout(r, 2500));

  const r = await win.webContents.executeJavaScript(`(function(){
    var c = document.querySelector('canvas');
    var imgOk = 0, imgBad = [];
    // 抽查几张关键贴图能否通过 http 正常加载
    var probe = ['assets/menu_bg.png','assets/portraits/pilot.png','assets/bg/planet_jupiter.jpg','assets/bosses/b01_interceptor.png'];
    return { title: document.title, canvas: c ? [c.width, c.height] : null,
      hasGunner: typeof save !== 'undefined', gold: (typeof save!=='undefined')?save.gold:null,
      menuVisible: !!document.querySelector('#menu, .menu, #menuOvl') &&
                   !(document.getElementById('menu')||{classList:{contains:function(){return false;}}}).classList.contains('hidden'),
      btnCount: document.querySelectorAll('button').length,
      bgmCount: (typeof BGMS!=='undefined')?BGMS.length:(typeof BGM_LIST!=='undefined'?BGM_LIST.length:null),
      // 存档码是否随网页版一起加载
      hasSaveCode: typeof SaveCode !== 'undefined',
      codeEntry: !!document.getElementById('saveCodeEntry'),
      codeRoundTrip: (function(){
        if (typeof SaveCode === 'undefined') return null;
        var c = SaveCode.makeCode();
        var p = SaveCode.parseCode(c);
        return { ok: p.ok, len: c.length };
      })(),
      probe: probe };
  })()`);

  // 逐张用 fetch 验证贴图在 http 下 200
  const probeRes = await win.webContents.executeJavaScript(`(function(){
    var list = ${JSON.stringify(['assets/menu_bg.png','assets/portraits/pilot.png','assets/bg/','assets/bosses/','assets/cg/','assets/sfx/','assets/ships/'])};
    return Promise.all(list.map(function(u){
      return fetch(u, {method:'HEAD'}).then(function(r){ return u+' -> '+r.status; })
        .catch(function(e){ return u+' -> ERR '+e.message; });
    }));
  })()`);

  console.log('=== 网页版自检 ===');
  console.log('  标题      : ' + r.title);
  console.log('  画布      : ' + (r.canvas ? r.canvas.join('×') : '无'));
  console.log('  脚本已加载: ' + r.hasGunner + '   金币=' + r.gold);
  console.log('  按钮数    : ' + r.btnCount);
  console.log('  存档码    : 脚本=' + r.hasSaveCode + ' 入口挂载=' + r.codeEntry +
              ' 往返=' + JSON.stringify(r.codeRoundTrip));
  console.log('  资源探测  : ' + probeRes.join(' | '));
  console.log('  运行时错误: ' + (errs.length ? errs.slice(0, 5).join(' || ') : '0 条'));

  // 出图：主页
  const d = await win.webContents.executeJavaScript("document.querySelector('canvas').toDataURL('image/png')");
  fs.mkdirSync(path.join(__dirname, '_tmpimg'), { recursive: true });
  fs.writeFileSync(path.join(__dirname, '_tmpimg', 'web_home.png'), Buffer.from(d.split(',')[1], 'base64'));
  console.log('  截图      : _tmpimg/web_home.png');

  win.destroy();
  try { srv.kill(); } catch {}
  app.quit();
});
