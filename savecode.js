/* 苍蓝余烬 · 存档码（离线跨设备同步）
 * ------------------------------------------------------------------
 * 设计原则（本项目「其他地方千万不要动」的约束下）：
 *  1. 零侵入 —— 不修改 gunner.js，不碰任何游戏逻辑。
 *     只读写 localStorage 里 stellar_gunner_* 的**原始字符串**，导出即搬运。
 *  2. 无损 —— 导出的是各 key 的原文，导入原样写回，任何新增字段都自动跟着走。
 *  3. 可校验 —— 码里带长度 + 校验和，粘贴被截断/换行能立刻发现，不会写坏档。
 *  4. 冲突不静默 —— 导入前先把「本机会被覆盖成什么样」摆出来，确认后才写。
 *     （上一轮丢档事故的根因就是静默覆盖，这里绝不再犯。）
 *  5. 失败不破坏 —— 解析失败/校验不过一律不写 localStorage。
 */
(function () {
  'use strict';

  var PREFIX = 'stellar_gunner_';
  var SLOT_COUNT = 6;
  var VERSION = 1;
  var MAGIC = 'SGSAVE';

  /* ================= 编解码：UTF-8 安全的 base64url ================= */
  function b64encode(str) {
    var bytes = new TextEncoder().encode(str);
    var bin = '';
    for (var i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
    return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  }
  function b64decode(s) {
    s = String(s).replace(/-/g, '+').replace(/_/g, '/');
    while (s.length % 4) s += '=';
    var bin = atob(s);
    var bytes = new Uint8Array(bin.length);
    for (var i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    return new TextDecoder().decode(bytes);
  }
  // djb2，够用来发现粘贴截断
  function checksum(s) {
    var h = 5381;
    for (var i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) >>> 0;
    return h.toString(36);
  }

  /* ================= localStorage 读写（只认本游戏的 key） ================= */
  function collectKeys() {
    var out = {};
    try {
      for (var i = 0; i < localStorage.length; i++) {
        var k = localStorage.key(i);
        if (k && k.indexOf(PREFIX) === 0) {
          var v = localStorage.getItem(k);
          if (typeof v === 'string') out[k] = v;
        }
      }
    } catch (e) {}
    return out;
  }

  /* ================= 生成 / 解析存档码 ================= */
  function makeCode() {
    var keys = collectKeys();
    var payload = { app: 'stellar_gunner', v: VERSION, at: Date.now(), keys: keys };
    var body = b64encode(JSON.stringify(payload));
    return MAGIC + VERSION + '-' + body.length + '-' + checksum(body) + '-' + body;
  }

  function parseCode(text) {
    if (!text) return { ok: false, msg: '存档码是空的。' };
    // 容忍复制时带上的空白/换行
    var s = String(text).replace(/\s+/g, '');
    var m = /^SGSAVE(\d+)-(\d+)-([0-9a-z]+)-([A-Za-z0-9\-_]+)$/.exec(s);
    if (!m) return { ok: false, msg: '这不像一段存档码（开头应该是 SGSAVE1-）。' };
    var ver = parseInt(m[1], 10);
    if (ver !== VERSION) return { ok: false, msg: '存档码版本是 ' + ver + '，当前版本只认 ' + VERSION + '。' };
    var body = m[4];
    if (body.length !== parseInt(m[2], 10)) {
      return { ok: false, msg: '存档码看起来被截断了（长度对不上），请重新完整复制。' };
    }
    if (checksum(body) !== m[3]) {
      return { ok: false, msg: '存档码校验失败，可能有字符在复制时丢失，请重新完整复制。' };
    }
    var payload;
    try {
      payload = JSON.parse(b64decode(body));
    } catch (e) {
      return { ok: false, msg: '存档码解不开，请确认复制的是完整一段。' };
    }
    if (!payload || payload.app !== 'stellar_gunner' || !payload.keys || typeof payload.keys !== 'object') {
      return { ok: false, msg: '这段码不是苍蓝余烬的存档。' };
    }
    return { ok: true, payload: payload };
  }

  /* ================= 存档预览（给用户看「会变成什么样」） ================= */
  function readJson(v) { try { return JSON.parse(v) || null; } catch (e) { return null; } }

  function slotsOf(keys) {
    var out = [];
    for (var i = 0; i < SLOT_COUNT; i++) {
      var raw = keys[PREFIX + 'v5_s' + i];
      var s = raw ? readJson(raw) : null;
      if (!s) { out.push(null); continue; }
      out.push({
        level: s.playerLevel || 1,
        gold: s.gold || 0,
        cleared: Object.keys(s.stars || {}).filter(function (k) { return (s.stars[k] || 0) > 0; }).length,
        playTime: Math.floor(s.playTime || 0),
        ship: s.selectedShip || 'balanced',
      });
    }
    return out;
  }
  function activeSlotOf(keys) {
    var v = parseInt(keys[PREFIX + 'active_slot'], 10);
    return (v >= 0 && v < SLOT_COUNT) ? v : 0;
  }
  function fmtTime(sec) {
    sec = Math.max(0, Math.floor(sec || 0));
    var h = Math.floor(sec / 3600), m = Math.floor((sec % 3600) / 60);
    if (h > 0) return h + ' 小时 ' + m + ' 分';
    if (m > 0) return m + ' 分 ' + (sec % 60) + ' 秒';
    return sec + ' 秒';
  }
  function slotLine(s) {
    if (!s) return '<span style="color:var(--dim)">空</span>';
    return 'Lv<b style="color:var(--cyan)">' + s.level + '</b> · 金币 <b style="color:var(--gold)">' + s.gold +
           '</b> · 进度 ' + s.cleared + '/36 · ' + fmtTime(s.playTime);
  }

  /* ================= 写入（唯一会动 localStorage 的地方） ================= */
  function applyKeys(keys) {
    var existing = collectKeys();
    // 先删掉本机有、码里没有的 key（保证还原是「忠实」的，而不是叠加）
    Object.keys(existing).forEach(function (k) {
      if (!Object.prototype.hasOwnProperty.call(keys, k)) {
        try { localStorage.removeItem(k); } catch (e) {}
      }
    });
    var n = 0;
    Object.keys(keys).forEach(function (k) {
      if (k.indexOf(PREFIX) !== 0) return;   // 只写本游戏命名空间，绝不碰别人的数据
      try { localStorage.setItem(k, keys[k]); n++; } catch (e) {}
    });
    return n;
  }

  /* ================= UI ================= */
  var ui = null;      // { ovl, title, hint, ta, btnA, btnB, msg }
  var mode = 'export';

  function css(el, obj) { for (var k in obj) el.style[k] = obj[k]; return el; }
  function el(tag, style, html) {
    var e = document.createElement(tag);
    if (style) css(e, style);
    if (html != null) e.innerHTML = html;
    return e;
  }

  function buildUI() {
    var ovl = el('div', null);
    ovl.className = 'ovl hidden';
    ovl.id = 'saveCodeOvl';

    var panel = el('div', {
      position: 'relative', top: 'auto', left: 'auto', transform: 'none',
      background: 'var(--panel)', border: '1px solid var(--line)',
      borderRadius: '10px', padding: '16px 14px',
      width: 'min(430px,94vw)', maxHeight: '88vh', overflow: 'auto', textAlign: 'center',
      boxSizing: 'border-box',
    });

    var title = el('h3', { margin: '0 0 6px', fontSize: '17px', color: 'var(--text)' }, '🔑 存档码');
    var hint = el('p', { fontSize: '11px', color: 'var(--muted)', margin: '0 0 10px', lineHeight: '1.6' }, '');
    var ta = el('textarea', {
      width: '100%', height: '132px', boxSizing: 'border-box',
      background: 'var(--panel2)', color: 'var(--text)',
      border: '1px solid var(--line2)', borderRadius: '6px',
      padding: '8px', fontSize: '11px', lineHeight: '1.5',
      fontFamily: 'ui-monospace, Consolas, monospace',
      resize: 'vertical', wordBreak: 'break-all', userSelect: 'text',
      WebkitUserSelect: 'text',
    });
    ta.spellcheck = false;

    var msg = el('div', {
      fontSize: '11px', lineHeight: '1.6', margin: '8px 0 0',
      whiteSpace: 'pre-wrap', textAlign: 'left', color: 'var(--muted)',
    });

    // 表格区：预览本机 / 存档码内容
    var table = el('div', { fontSize: '11px', textAlign: 'left', margin: '10px 0 0', lineHeight: '1.8' });

    var row = el('div', { display: 'flex', gap: '8px', marginTop: '10px' });
    var btnA = el('button', null, '');
    btnA.className = 'btn';
    css(btnA, { width: 'auto', flex: '1 1 auto', minWidth: '0', margin: '0', padding: '11px 10px',
                fontSize: '12px', whiteSpace: 'nowrap' });
    var btnB = el('button', null, '✕ 关闭');
    btnB.className = 'btn';
    css(btnB, { width: 'auto', flex: '0 0 auto', margin: '0', padding: '11px 13px',
                fontSize: '12px', whiteSpace: 'nowrap' });
    row.appendChild(btnA);
    row.appendChild(btnB);

    panel.appendChild(title);
    panel.appendChild(hint);
    panel.appendChild(ta);
    panel.appendChild(table);
    panel.appendChild(msg);
    panel.appendChild(row);
    ovl.appendChild(panel);
    document.body.appendChild(ovl);

    btnB.addEventListener('click', close);
    ovl.addEventListener('click', function (e) { if (e.target === ovl) close(); });

    ui = { ovl: ovl, title: title, hint: hint, ta: ta, msg: msg, table: table, btnA: btnA, btnB: btnB };
  }

  function close() { if (ui) ui.ovl.classList.add('hidden'); }

  function copyText(text) {
    // 先试剪贴板 API，失败退回 execCommand（Electron 里更稳）
    var done = function (ok) {
      setMsg(ok ? '<span style="color:var(--green)">已复制到剪贴板。</span>'
                : '<span style="color:var(--danger)">复制失败，请手动全选文本框内容复制。</span>');
    };
    try {
      if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(text).then(function () { done(true); }, function () { done(legacyCopy(text)); });
        return;
      }
    } catch (e) {}
    done(legacyCopy(text));
  }
  function legacyCopy(text) {
    try {
      if (!ui) return false;
      ui.ta.value = text;
      ui.ta.focus();
      ui.ta.select();
      return document.execCommand('copy');
    } catch (e) { return false; }
  }
  function setMsg(html) { if (ui) ui.msg.innerHTML = html; }

  function downloadCode(text) {
    try {
      var blob = new Blob([text], { type: 'text/plain;charset=utf-8' });
      var a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = '苍蓝余烬-存档码-' + new Date().toISOString().slice(0, 10) + '.txt';
      document.body.appendChild(a);
      a.click();
      setTimeout(function () { URL.revokeObjectURL(a.href); a.remove(); }, 1000);
      setMsg('<span style="color:var(--green)">已导出为 .txt 文件（在浏览器的下载目录里）。</span>');
    } catch (e) {
      setMsg('<span style="color:var(--danger)">导出文件失败，请改用「复制」。</span>');
    }
  }

  /* ---------- 导出 ---------- */
  function openExport() {
    mode = 'export';
    var code = makeCode();
    var keys = collectKeys();
    var slots = slotsOf(keys);
    var act = activeSlotOf(keys);
    var hasAny = slots.some(function (s) { return !!s; });

    ui.ovl.classList.remove('hidden');
    ui.title.textContent = '📤 导出存档码';
    ui.hint.innerHTML = hasAny
      ? '这是你本机全部 ' + SLOT_COUNT + ' 个槽位的完整快照。把下面这一整段发到另一台设备（微信/备忘录都行），在那边用「导入存档码」粘贴即可。'
      : '<span style="color:var(--orange)">本机现在还没有任何存档，导出的是空档。</span>';
    ui.table.innerHTML = slots.map(function (s, i) {
      return '<div>' + (i === act ? '▶ ' : '　') + '槽 ' + (i + 1) + '：' + slotLine(s) + '</div>';
    }).join('');
    ui.ta.value = code;
    ui.ta.readOnly = true;
    ui.ta.style.height = '132px';
    ui.btnA.textContent = '📋 复制存档码';
    ui.btnA.onclick = function () { copyText(code); };
    // 导出时加一个「导出为文件」的快捷方式：双击按钮
    ui.btnB.textContent = '💾 存为文件';
    ui.btnB.onclick = function () { downloadCode(code); };
    setMsg('<span style="color:var(--muted)">共 ' + code.length + ' 个字符。别只复制一半 —— 码里带了校验，半截会被识别出来。</span>');
  }

  /* ---------- 导入 ---------- */
  function openImport() {
    mode = 'import';
    ui.ovl.classList.remove('hidden');
    ui.title.textContent = '📥 导入存档码';
    ui.hint.innerHTML = '把另一台设备上导出的存档码整段粘进来，然后点「读取存档码」。<br><b style="color:var(--orange)">注意：导入会覆盖本机全部 ' + SLOT_COUNT + ' 个槽位。</b>';
    ui.ta.value = '';
    ui.ta.readOnly = false;
    ui.ta.placeholder = '在这里粘贴 SGSAVE1-…… 开头的整段存档码';
    ui.table.innerHTML = '';
    ui.btnA.textContent = '🔍 读取存档码';
    ui.btnA.onclick = previewImport;
    ui.btnB.textContent = '✕ 关闭';
    ui.btnB.onclick = close;
    setMsg('');
    setTimeout(function () { try { ui.ta.focus(); } catch (e) {} }, 50);
  }

  var pending = null;   // 解析成功、等待二次确认的 keys

  function previewImport() {
    if (pending) return commitImport();   // 第二次点击 = 确认执行
    var res = parseCode(ui.ta.value);
    if (!res.ok) { setMsg('<span style="color:var(--danger)">' + res.msg + '</span>'); ui.table.innerHTML = ''; return; }

    var localKeys = collectKeys();
    var localSlots = slotsOf(localKeys);
    var codeSlots = slotsOf(res.payload.keys);
    var okCount = codeSlots.filter(function (s) { return !!s; }).length;
    if (!okCount) {
      setMsg('<span style="color:var(--orange)">这段存档码里没有任何存档内容，导入会清空本机全部槽位。确定要继续吗？</span>');
    } else {
      setMsg('<span style="color:var(--muted)">读取成功。下面是覆盖前后对比，确认无误再点一次按钮执行。</span>');
    }
    ui.table.innerHTML =
      '<div style="color:var(--danger);font-weight:700;margin-bottom:4px;">覆盖后（存档码里的内容）</div>' +
      codeSlots.map(function (s, i) { return '<div>' + (i === activeSlotOf(res.payload.keys) ? '▶ ' : '　') + '槽 ' + (i + 1) + '：' + slotLine(s) + '</div>'; }).join('') +
      '<div style="color:var(--dim);font-weight:700;margin:10px 0 4px;">本机现状（会被覆盖）</div>' +
      localSlots.map(function (s, i) { return '<div>' + (i === activeSlotOf(localKeys) ? '▶ ' : '　') + '槽 ' + (i + 1) + '：' + slotLine(s) + '</div>'; }).join('');

    pending = res.payload.keys;
    ui.btnA.textContent = '⚠️ 确认覆盖并重启游戏';
    ui.ta.readOnly = true;
  }

  function commitImport() {
    if (!pending) return;
    var n = applyKeys(pending);
    pending = null;
    ui.msg.innerHTML = '<span style="color:var(--green)">已写入 ' + n + ' 项存档，正在重新载入…</span>';
    setTimeout(function () { location.reload(); }, 600);
  }

  /* ---------- 往「存档管理」面板挂入口 ---------- */
  function mountEntry() {
    var saveOvl = document.getElementById('saveOvl');
    if (!saveOvl) return false;
    if (document.getElementById('saveCodeEntry')) return true;
    var saveList = document.getElementById('saveList');
    if (!saveList || !saveList.parentNode) return false;

    var wrap = el('div', { margin: '0 0 10px', paddingTop: '6px', borderTop: '1px solid var(--line)' });
    wrap.id = 'saveCodeEntry';
    var row = el('div', { display: 'flex', gap: '8px' });
    var bExp = el('button', { flex: '1', margin: '0', padding: '10px 8px', fontSize: '12px' }, '📤 导出存档码');
    var bImp = el('button', { flex: '1', margin: '0', padding: '10px 8px', fontSize: '12px' }, '📥 导入存档码');
    bExp.className = 'btn';
    bImp.className = 'btn';
    bExp.addEventListener('click', openExport);
    bImp.addEventListener('click', openImport);
    row.appendChild(bExp); row.appendChild(bImp);
    wrap.appendChild(row);
    wrap.appendChild(el('p', { fontSize: '10px', color: 'var(--muted)', margin: '5px 0 0', lineHeight: '1.6' },
      '存档码 = 一段文本，换设备时复制过去粘贴即可，不需要登录、不依赖网络。'));
    saveList.parentNode.insertBefore(wrap, saveList);
    return true;
  }

  function boot() {
    buildUI();
    if (mountEntry()) return;
    // 存档面板可能是后建的，观察一下 DOM
    try {
      var mo = new MutationObserver(function () { if (mountEntry()) mo.disconnect(); });
      mo.observe(document.body, { childList: true, subtree: true });
      setTimeout(function () { mo.disconnect(); mountEntry(); }, 4000);
    } catch (e) { /* 没有 MutationObserver 就算了，按钮挂不上不影响游戏 */ }
  }

  window.SaveCode = {
    makeCode: makeCode,
    parseCode: parseCode,
    applyKeys: applyKeys,
    collectKeys: collectKeys,
    openExport: openExport,
    openImport: openImport,
  };

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
})();
