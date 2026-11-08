// 面板重叠审计：开每个浮层，找「可见元素两两几何重叠」的情况
// 判定：两个元素都不是对方的祖先/后代，rect 相交面积 > 阈值，且都真的可见（有尺寸、非透明）
const { app, BrowserWindow } = require('electron');
// ★ 测试隔离：使用独立 userData，绝不碰玩家真实存档（%APPDATA%/Electron）
try { require('fs').rmSync(__dirname + '/_testprofile', { recursive: true, force: true }); } catch {}
app.setPath('userData', __dirname + '/_testprofile');

app.disableHardwareAcceleration();

const SIZES = [[1200, 800], [900, 700], [620, 760]];

// 每个浮层的打开方式（尽量走真实入口）
const CASES = [
  ['menu',            null],
  ['levelSelect',     "renderLevelSelect(); $('levelSelect').classList.remove('hidden')"],
  ['practiceOvl',     "openPractice()"],
  ['arsenalOvl',      "startPractice(); openArsenal(false)"],
  ['dailyOvl',        "renderDailyList(); $('dailyOvl').classList.remove('hidden')"],
  ['achieveOvl',      "$('mAchieve').click()"],
  ['saveOvl',         "openSave()"],
  ['hangarOvl',       "openHangar()"],
  ['shopOvl',         "openShop()"],
  ['weaponPanel',     "renderWeaponPanel(); $('weaponPanel').classList.remove('hidden')"],
  ['upgradeOvl',      "renderUpgrade(); $('upgradeOvl').classList.remove('hidden')"],
  ['pauseMenu',       "$('pauseMenu').classList.remove('hidden')"],
  ['defeatOvl',       "$('defeatOvl').classList.remove('hidden')"],
  ['gameOver',        "$('gameOver').classList.remove('hidden')"],
  ['successOvl',      "$('successOvl').classList.remove('hidden')"],
  ['confirmOvl',      "$('confirmOvl').classList.remove('hidden')"],
  ['cgOvl',           "showCg(1)"],
];

app.whenReady().then(async () => {
  const win = new BrowserWindow({ width: 1200, height: 800, show: false,
    webPreferences: { offscreen: true, backgroundThrottling: false } });
  await win.loadFile('星际射手.html');
  await new Promise(r => setTimeout(r, 2200));

  await win.webContents.executeJavaScript(
    'window.requestAnimationFrame=function(){};' +
    'window.updateHud=window.updateBossBar=window.updateRunProgress=window.updateArsenalBtn=window.updateBombHud=function(){};1');

  const AUDIT = `(function(){
    function vis(e){
      const c = getComputedStyle(e);
      if (c.display==='none'||c.visibility==='hidden') return false;
      if (parseFloat(c.opacity) < 0.2) return false;
      const r = e.getBoundingClientRect();
      if (r.width < 2 || r.height < 2) return false;
      if (r.bottom < 0 || r.top > innerHeight || r.right < 0 || r.left > innerWidth) return false;
      return true;
    }
    // 只取「交互控件 / 文本叶子」，避免把容器之间的正常嵌套算成重叠
    function decorative(e){
      // 纯装饰层（背景大图 / pointer-events:none 的立绘层）不算重叠
      for (let n = e; n && n !== document.body; n = n.parentElement) {
        if (getComputedStyle(n).pointerEvents === 'none') return true;
      }
      const r = e.getBoundingClientRect();
      return (r.width * r.height) > innerWidth * innerHeight * 0.55;   // 铺满屏的背景
    }
    function leaves(root){
      const out = [];
      root.querySelectorAll('*').forEach(function(e){
        if (!vis(e) || decorative(e)) return;
        const tag = e.tagName;
        const isCtl = (tag==='BUTTON'||tag==='INPUT'||tag==='IMG'||tag==='CANVAS'||e.classList.contains('close-btn'));
        let hasText = false;
        for (const n of e.childNodes) if (n.nodeType===3 && n.textContent.trim()) hasText = true;
        if (!isCtl && !hasText) return;
        out.push(e);
      });
      return out;
    }
    // 真实「字形」矩形：有文字的取文字节点 Range 的并集，纯控件取元素框
    function inkRect(e){
      let r = null;
      for (const n of e.childNodes) {
        if (n.nodeType !== 3 || !n.textContent.trim()) continue;
        const rg = document.createRange(); rg.selectNodeContents(n);
        for (const q of rg.getClientRects()) {
          if (q.width < 1 || q.height < 1) continue;
          r = r ? { left:Math.min(r.left,q.left), top:Math.min(r.top,q.top),
                    right:Math.max(r.right,q.right), bottom:Math.max(r.bottom,q.bottom) }
                : { left:q.left, top:q.top, right:q.right, bottom:q.bottom };
        }
      }
      if (r) return r;
      const b = e.getBoundingClientRect();
      return { left:b.left, top:b.top, right:b.right, bottom:b.bottom };
    }
    const res = [];
    document.querySelectorAll('.ovl:not(.hidden)').forEach(function(ovl){
      const els = leaves(ovl);
      for (let i=0;i<els.length;i++){
        for (let j=i+1;j<els.length;j++){
          const a=els[i], b=els[j];
          if (a.contains(b) || b.contains(a)) continue;
          const ra=inkRect(a), rb=inkRect(b);
          const ox = Math.min(ra.right,rb.right) - Math.max(ra.left,rb.left);
          const oy = Math.min(ra.bottom,rb.bottom) - Math.max(ra.top,rb.top);
          if (ox <= 1 || oy <= 1) continue;
          res.push({ a: a.tagName+'.'+(a.className||''), at:(a.textContent||'').trim().slice(0,14),
                     b: b.tagName+'.'+(b.className||''), bt:(b.textContent||'').trim().slice(0,14),
                     area: Math.round(ox*oy) });
        }
      }
    });
    return res;
  })()`;

  for (const [w, h] of SIZES) {
    win.setContentSize(w, h);
    await new Promise(r => setTimeout(r, 400));
    console.log('\n########## ' + w + 'x' + h + ' ##########');
    for (const [id, opener] of CASES) {
      await win.webContents.executeJavaScript(
        '(function(){ try{ hideAllOvl(); ' + (opener || '') + ' }catch(e){ return ' + JSON.stringify('OPEN_FAIL:' + id) + '; }' +
        ' var el=document.getElementById(' + JSON.stringify(id) + ');' +
        ' if(!el) return ' + JSON.stringify('NO_EL:' + id) + ';' +
        ' el.classList.remove("hidden");' +
        ' if(!el.classList.contains("ovl")) el.classList.remove("hidden");' +
        ' return 1; })()').then(v => { if (typeof v === 'string') console.log('  !' + v); });
      await new Promise(r => setTimeout(r, 180));
      const r = await win.webContents.executeJavaScript(AUDIT);
      if (r && r.length) {
        console.log('  [' + id + '] 重叠 ' + r.length + ' 处：');
        r.slice(0, 6).forEach(o =>
          console.log('      ' + o.a + '「' + o.at + '」  ✕  ' + o.b + '「' + o.bt + '」  面积=' + o.area));
      } else {
        console.log('  [' + id + '] ok');
      }
    }
  }
  win.destroy(); app.quit();
});
