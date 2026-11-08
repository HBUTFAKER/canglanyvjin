"use strict";
/* ============================================================
   星际射手 Stellar Gunner  ·  v4 完整版
   赛博风格竖屏飞行射击
   ============================================================ */

/* ---------- Canvas ---------- */
const canvas = document.getElementById('game');
const ctx = canvas.getContext('2d');
let W = 0, H = 0, DPR = 1;
let appliedW = 0, appliedH = 0;   // 已真正套用的画布 CSS 尺寸（用于逐帧自愈比对）
function resize() {
  DPR = Math.min(window.devicePixelRatio || 1, 2);
  let w = window.innerWidth, h = window.innerHeight;
  // 【黑屏修复】部分内嵌浏览器 / 隐藏面板在文档尚未布局时 innerWidth/Height 返回 0，
  // 直接采用会把画布设成 0×0 —— HUD 是 DOM 照常显示，只有战场全黑，极难发现。
  // 这里逐级降级取尺寸，最后给一个可用兜底，保证画布永远不为 0。
  if (!(w > 40)) w = document.documentElement.clientWidth || document.body.clientWidth || 0;
  if (!(h > 40)) h = document.documentElement.clientHeight || document.body.clientHeight || 0;
  if (!(w > 40) || !(h > 40)) { w = 450; h = 800; }
  appliedW = w; appliedH = h; W = w; H = h;
  const pw = Math.floor(w * DPR), ph = Math.floor(h * DPR);
  if (canvas.width  !== pw) canvas.width  = pw;    // 尺寸没变就别赋值（赋值会清空画布）
  if (canvas.height !== ph) canvas.height = ph;
  canvas.style.width = w + 'px'; canvas.style.height = h + 'px';
  ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
}
window.addEventListener('resize', resize);
window.addEventListener('orientationchange', resize);
if (window.visualViewport) window.visualViewport.addEventListener('resize', resize);
if (typeof ResizeObserver !== 'undefined') new ResizeObserver(() => resize()).observe(document.documentElement);
resize();

/* ---------- 工具 ---------- */
const rnd = (a, b) => a + Math.random() * (b - a);
const dist = (x1, y1, x2, y2) => Math.hypot(x2 - x1, y2 - y1);
const clamp = (v, a, b) => v < a ? a : v > b ? b : v;
const $ = id => document.getElementById(id);

/* ---------- 战机贴图预加载（透明底 PNG，金属质感建模） ---------- */
const SHIP_IMG = {};
const SHIP_IMG_LIST = {
  agile:'assets/ships/agile.png', heavy:'assets/ships/heavy.png',
  balanced:'assets/ships/balanced.png', ghost:'assets/ships/ghost.png',
  fortress:'assets/ships/fortress.png', enemy:'assets/ships/enemy.png',
  elite:'assets/ships/elite.png', boss:'assets/ships/boss.png',
  // 12 关 Boss 立绘（AI 生成，透明底，每关造型完全不同）
  boss_interceptor:'assets/bosses/b01_interceptor.png',
  boss_striker:    'assets/bosses/b02_gunship.png',
  boss_phantom:    'assets/bosses/b03_stealth.png',
  boss_stealth:    'assets/bosses/b04_radar.png',
  boss_heavyFighter:'assets/bosses/b05_heavy.png',
  boss_ace:        'assets/bosses/b06_ace.png',
  boss_dreadnought:'assets/bosses/b07_dreadnought.png',
  boss_cruiser:    'assets/bosses/b08_cruiser.png',
  boss_titan:      'assets/bosses/b09_titan.png',
  boss_flagship:   'assets/bosses/b10_flagship.png',
  boss_doomShip:   'assets/bosses/b11_doomship.png',
  boss_voidCore:   'assets/bosses/b12_voidcore.png',
};
let shipImgReady = false;
(function preloadShipImages(){
  const keys = Object.keys(SHIP_IMG_LIST);
  let pending = keys.length;
  if (pending === 0) { shipImgReady = true; return; }
  keys.forEach(k => {
    const im = new Image();
    im.onload = ()=>{ if (--pending === 0) shipImgReady = true; };
    im.onerror = ()=>{ if (--pending === 0) shipImgReady = true; };
    im.src = SHIP_IMG_LIST[k];
    SHIP_IMG[k] = im;
  });
})();

/* ---------- 战斗背景预加载（NASA/ESA 公有领域星图，本地已压暗处理） ---------- */
const BG_IMG = {};
const BG_LIST = {
  deep_starfield:  'assets/bg/deep_starfield.jpg',    // 银河深处的尘埃星海
  galaxy_andromeda:'assets/bg/galaxy_andromeda.jpg',  // 仙女座星系
  galaxy_cluster:  'assets/bg/galaxy_cluster.jpg',    // 深空星系军团
  nebula_carina:   'assets/bg/nebula_carina.jpg',     // 船底座星云
  nebula_pillars:  'assets/bg/nebula_pillars.jpg',    // 创生之柱
  nebula_orion:    'assets/bg/nebula_orion.jpg',      // 猎户座星云
  planet_jupiter:  'assets/bg/planet_jupiter.jpg',    // 木星
  planet_earth:    'assets/bg/planet_earth.jpg',      // 地球
  planet_saturn:   'assets/bg/planet_saturn.jpg',     // 土星
  star_sun:        'assets/bg/star_sun.jpg',          // 恒星表面
};
(function preloadBg(){
  Object.keys(BG_LIST).forEach(k => {
    const im = new Image();
    im.src = BG_LIST[k];
    BG_IMG[k] = im;
  });
})();

// 当前场景该用哪张背景
// —— 四个模式各用一套：无尽=木星、每日=地球、练习=土星、战役=按剧情分 6 段推进
//    （战役一局就是一关，关卡号即剧情进度）
function bgKeyFor(m, wv) {
  if (m === MODE.ENDLESS)  return 'planet_jupiter';
  if (m === MODE.DAILY)    return 'planet_earth';
  if (m === MODE.PRACTICE) return 'planet_saturn';
  const seg = Math.min(5, Math.floor((Math.max(1, wv) - 1) / 2));
  return ['deep_starfield','galaxy_andromeda','galaxy_cluster',
          'nebula_carina','nebula_pillars','nebula_orion'][seg];
}

// 背景交叉淡入状态（换背景时 1.2 秒淡入，避免硬切）
let bgCurrent = null, bgPrev = null, bgFade = 1;
function bgTick(dt) {
  const k = bgKeyFor(mode, wave);
  if (k !== bgCurrent) { bgPrev = bgCurrent; bgCurrent = k; bgFade = 0; }
  if (bgFade < 1) bgFade = Math.min(1, bgFade + dt / 1.2);
  bgTickDecor(dt);
}

/* ---------- 背景动效档案 ----------
   full:true  = 连续单向旋转（一圈 6~10 分钟，是"星河在缓慢转动"的感觉）
   full:false = 缓摆（行星/恒星，幅度小，免把土星环转歪）
   zoom 为旋转余量：连续旋转必须放大到 2.0 才能保证任何角度都铺满屏幕 */
const BG_MOTION = {
  deep_starfield:   { full:true,  rot:  0.60, zoom:2.00, period:60, drift:26 },
  galaxy_andromeda: { full:true,  rot:  0.42, zoom:2.00, period:70, drift:18 },
  galaxy_cluster:   { full:true,  rot:  0.55, zoom:2.00, period:55, drift:22 },
  nebula_carina:    { full:true,  rot:  0.38, zoom:2.00, period:80, drift:16 },
  nebula_pillars:   { full:true,  rot:  0.32, zoom:2.00, period:90, drift:14 },
  nebula_orion:     { full:true,  rot:  0.46, zoom:2.00, period:65, drift:20 },
  planet_jupiter:   { full:false, rot: 11,    zoom:1.10, period:150, drift:10, breath:0.045 },
  planet_earth:     { full:false, rot:  9,    zoom:1.10, period:170, drift:10, breath:0.050 },
  planet_saturn:    { full:false, rot: 12,    zoom:1.12, period:160, drift: 8, breath:0.040 },
  star_sun:         { full:false, rot:  7,    zoom:1.10, period:130, drift: 6, breath:0.060 },
};

// 背景贴图：铺满 + 缓慢转动 + 呼吸缩放 + 缓慢漂移（静态贴图也能"动起来"）
function drawBgImage(key, alpha) {
  const im = BG_IMG[key];
  if (!im || !im.complete || !im.naturalWidth) return false;
  const mo = BG_MOTION[key] || BG_MOTION.deep_starfield;
  const s = Math.max(W / im.naturalWidth, H / im.naturalHeight) * mo.zoom;
  const dw = im.naturalWidth * s, dh = im.naturalHeight * s;
  const P = mo.period || 60;
  const ph = gameTime * 2 * Math.PI / P;
  // 角度：连续转 or 缓摆
  const deg = mo.full
    ? (gameTime * mo.rot) % 360
    : Math.sin(ph) * mo.rot;
  const br = 1 + (mo.breath || 0) * Math.sin(ph * 1.7 + 0.6);
  const dy = Math.min(mo.drift || 0, Math.max(0, (dh - H) * 0.28)) * Math.sin(ph * 0.8);
  ctx.globalAlpha = alpha;
  ctx.save();
  ctx.translate(W / 2, H / 2);
  ctx.rotate(deg * Math.PI / 180);
  ctx.scale(br, br);
  ctx.drawImage(im, -dw / 2, -dh / 2 + dy, dw, dh);
  ctx.restore();
  ctx.globalAlpha = 1;
  return true;
}

/* ---------- 背景装饰：远景战斗机编队 + 人物立绘 ----------
   战斗机用游戏里现成的透明底立绘，缩到 16~44px 当"远处的友军/敌机"，横穿背景
   人物立绘是巨大的低透明度剪影，在星云深处缓缓浮现又淡去，给战役模式加剧情味 */
const BG_FIG_IMG = {};
(function preloadBgFig(){
  const list = {
    // 正派
    pilot:     'assets/portraits/pilot.png',      // 主角（你）
    mechanic:  'assets/portraits/mechanic.png',   // 机械师 · 老韩
    copilot:   'assets/portraits/copilot.png',    // 副驾驶 · 岚
    commander: 'assets/portraits/commander.png',  // 舰队长 · 铁砧
    medic:     'assets/portraits/medic.png',      // 医官 · 白鸽
    // 反派
    ace:       'assets/portraits/ace.png',        // 敌国王牌 · 赤鸦
    inquisitor:'assets/portraits/inquisitor.png', // 督战官 · 铁面
    hierarch:  'assets/portraits/hierarch.png',   // 深渊主教 · 玄
  };
  Object.keys(list).forEach(k => { const im = new Image(); im.src = list[k]; BG_FIG_IMG[k] = im; });
})();

/* ---------- 人物小传（战斗背景 / 剧情 CG 共用） ---------- */
const CHAR_INFO = {
  pilot:     { name:'你',           role:'流浪飞行员', side:'ally' },
  mechanic:  { name:'老韩',         role:'随舰机械师', side:'ally' },
  copilot:   { name:'岚',           role:'副驾驶',     side:'ally' },
  commander: { name:'铁砧',         role:'舰队长',     side:'ally' },
  medic:     { name:'白鸽',         role:'随舰医官',   side:'ally' },
  ace:       { name:'赤鸦',         role:'敌国王牌',   side:'foe'  },
  inquisitor:{ name:'铁面',         role:'督战官',     side:'foe'  },
  hierarch:  { name:'玄',           role:'深渊主教',   side:'foe'  },
};
// 战役每一幕的登场人物（CG 同步展示；战斗背景取该幕所在剧情段）
const STORY_CAST = [
  ['pilot','inquisitor'], ['pilot'],               // 1-2 幕：炮灰 / 阵亡名单
  ['medic','pilot'],      ['pilot','inquisitor'],  // 3-4 幕：苍蓝星 / 名单
  ['copilot','pilot'],    ['hierarch','pilot'],    // 5-6 幕：战友之死 / 教团真相
  ['pilot'],             ['commander','inquisitor'], // 7-8 幕：双面为敌 / 出卖
  ['pilot','hierarch'],   ['pilot','inquisitor'],  // 9-10 幕：禁忌兵器 / 复仇
  ['pilot','hierarch'],   ['pilot','hierarch'],    // 11-12 幕：最后防线 / 抉择
];
// 战斗背景：左=正派 / 右=反派，随剧情段换人
const BG_CAST_BY_SEG = [
  { ally:'pilot',     foe:'inquisitor' },   // 第 1~2 关
  { ally:'medic',     foe:'ace'        },   // 第 3~4 关
  { ally:'copilot',   foe:'ace'        },   // 第 5~6 关
  { ally:'commander', foe:'inquisitor' },   // 第 7~8 关
  { ally:'commander', foe:'inquisitor' },   // 第 9~10 关
  { ally:'pilot',     foe:'hierarch'   },   // 第 11~12 关
];
// 其他模式各配一对（不再是永远只有主角）
// ⚠️ 不能写成顶层对象字面量的计算键（[MODE.ENDLESS]）—— MODE 在本文件靠后才是 const 声明，
//    文件顶部求值会撞上 TDZ 报错，整个脚本直接不执行（表现就是全黑屏）。
function bgSegFor(wv) { return Math.min(5, Math.floor((Math.max(1, wv) - 1) / 2)); }
function bgCastFor(m, wv) {
  if (m === MODE.CAMPAIGN) return BG_CAST_BY_SEG[bgSegFor(wv)];
  if (m === MODE.ENDLESS)  return { ally:'copilot',  foe:'ace'        };
  if (m === MODE.PRACTICE) return { ally:'mechanic', foe:'inquisitor' };
  if (m === MODE.DAILY)    return { ally:'medic',    foe:'hierarch'   };
  return BG_CAST_BY_SEG[0];
}
let bgFlyers = [];
function bgTickDecor(dt) {
  if (!ACTIVE_MODES.includes(mode)) return;
  // —— 战斗机编队 ——
  if (bgFlyers.length === 0) {
    const keys = ['enemy', 'elite'];
    if (BG_IMG['__noop__'] || true) keys.push(player && player.shipId ? player.shipId : 'balanced');
    for (let i = 0; i < 4; i++) bgFlyers.push(bgNewFlyer(keys, i * 1.7));
  }
  for (let i = bgFlyers.length - 1; i >= 0; i--) {
    const f = bgFlyers[i];
    f.x += f.vx * dt; f.y += f.vy * dt; f.t += dt;
    if (f.x < -90 || f.x > W + 90 || f.y < -110 || f.y > H + 110) {
      bgFlyers.splice(i, 1);
      bgFlyers.push(bgNewFlyer(['enemy', 'elite', 'balanced', 'heavy'], rnd(0, 3)));
    }
  }
}
function bgNewFlyer(keys, delay) {
  const key = keys[(Math.random() * keys.length) | 0];
  const im = SHIP_IMG[key];
  const dir = Math.random() < 0.5 ? 1 : -1;          // 左→右 or 右→左
  const sc = rnd(20, 54);
  return {
    key, im, t: -delay,
    x: dir > 0 ? -60 - Math.random() * 120 : W + 60 + Math.random() * 120,
    y: rnd(H * 0.06, H * 0.9),
    vx: dir * rnd(26, 62),
    vy: rnd(-16, 16),
    w: sc, h: sc,
    a: rnd(0.20, 0.46),
    rot: (dir > 0 ? 1 : -1) * rnd(0.24, 0.55),        // 机头朝飞行方向斜切
  };
}
// 单张背景人物淡影：呼吸透明度 + 双轴缓慢漂移（flip=true 水平镜像，用于反派）
function drawGhostFig(key, cx, cy, hh, baseA, period, phase, driftP, flip) {
  const im = BG_FIG_IMG[key];
  if (!im || !im.complete || !im.naturalWidth) return;
  const cyc = (Math.sin(gameTime * 2 * Math.PI / period + phase) + 1) / 2;   // 0~1 缓慢呼吸
  const a = baseA * 0.55 + baseA * cyc;
  const ww = hh * (im.naturalWidth / im.naturalHeight);
  const x = cx + Math.sin(gameTime * 2 * Math.PI / driftP + phase) * W * 0.055;
  const y = cy + Math.sin(gameTime * 2 * Math.PI / (driftP * 0.78) + 1 + phase) * H * 0.035;
  ctx.globalAlpha = a;
  if (flip) {
    ctx.save();
    ctx.translate(x, y); ctx.scale(-1, 1);
    ctx.drawImage(im, -ww / 2, -hh / 2, ww, hh);
    ctx.restore();
  } else {
    ctx.drawImage(im, x - ww / 2, y - hh / 2, ww, hh);
  }
  ctx.globalAlpha = 1;
}
function drawBgDecor() {
  // 1) 背景人物：左正派 / 右反派 双立绘。两边周期不同，不会同步呼吸；
  //    反派做水平镜像，视觉上"隔着战场对峙"。人物随模式 / 剧情段更换。
  const cast = bgCastFor(mode, wave);
  drawGhostFig(cast.ally, W * 0.27, H * 0.44, H * 0.64, 0.150, 46, 0.0,  96, false);
  drawGhostFig(cast.foe,  W * 0.73, H * 0.50, H * 0.58, 0.135, 58, 1.9,  84, true);
  // 2) 远景战斗机编队
  for (const f of bgFlyers) {
    if (f.t < 0) continue;                       // 出场延迟
    const im = SHIP_IMG[f.key];
    if (!im || !im.complete || !im.naturalWidth) continue;
    const box = shipBoxOf(im, f.w);
    const fade = Math.min(1, f.t / 1.5);          // 淡入
    ctx.save();
    ctx.translate(f.x, f.y);
    ctx.rotate(f.rot + Math.sin(f.t * 0.7) * 0.05);
    ctx.globalAlpha = f.a * fade * 0.75;
    ctx.drawImage(im, -box.w / 2, -box.h / 2, box.w, box.h);
    ctx.globalAlpha = f.a * fade * 0.35;          // 尾迹光
    ctx.fillStyle = '#8fd0ff';
    ctx.beginPath();
    ctx.ellipse(0, box.h * 0.34, box.w * 0.10, box.h * 0.26, 0, 0, 6.28);
    ctx.fill();
    ctx.restore();
    ctx.globalAlpha = 1;
  }
}

// 贴图绘制尺寸：等面积等比缩放
// —— 立绘原始尺寸各不相同（0.65~1.07 的宽高比），直接塞进正方形会把机身横向拉宽变形。
//    这里按"面积不变"换算，既保住原本的视觉分量，又不会把飞机压扁/抻长。
function shipBoxOf(im, size) {
  const nw = im.naturalWidth || 1, nh = im.naturalHeight || 1;
  const k = size / Math.sqrt(nw * nh);
  return { w: nw * k, h: nh * k };
}
// 绘制贴图辅助：居中铺满，未加载完成时回退
function drawShipImage(key, size) {
  const im = SHIP_IMG[key];
  if (!im || !im.complete || im.naturalWidth === 0) return false;
  const b = shipBoxOf(im, size);
  ctx.drawImage(im, -b.w/2, -b.h/2, b.w, b.h);
  return true;
}
// Boss 贴图尺寸
// —— Boss 立绘宽高比差异极大（0.39 的超长无畏舰 ~ 0.99 的圆形堡垒），
//    若按"长边对齐"会让细长舰占满整屏、圆形舰显得很小；改按"短边对齐碰撞直径"，
//    保证玩家能打到的地方一定看得见机体，再给长边设上限防止超出画面。
function bossBox(R, type) {
  const im = SHIP_IMG['boss_' + type];
  if (!im || !im.complete || im.naturalWidth === 0) return { w: R*2.5, h: R*2.5 };
  const nw = im.naturalWidth, nh = im.naturalHeight;
  const short = Math.min(nw, nh), long = Math.max(nw, nh);
  let k = (R * 2.5) / short;                 // 短边 = 碰撞直径 × 1.25
  if (long * k > R * 6.8) k = (R * 6.8) / long;   // 长边上限 = 碰撞直径 × 3.4
  return { w: nw * k, h: nh * k };
}

/* ---------- 音效（真实采样音效文件，Kenney CC0 素材） ---------- */
const Sfx = (() => {
  let ac = null, master = null, muted = false;
  let sfxGain = null;            // 音效独立增益
  let sfxVolume = 0.8;           // 音效音量 0~1
  let musicVolume = 0.35;        // 音乐音量 0~1（用户反馈 BGM 太吵，初始值砍半：0.7 → 0.35）
  let musicPlaying = false;
  let musicEl = null;            // BGM <audio> 元素
  // 音效节流：避免同帧多个同类音效叠成噪音（如群杀时爆炸声堆叠）
  const lastTimes = {};
  const throttle = (key, ms) => {
    const now = (ac && ac.currentTime) || (Date.now()/1000);
    const last = lastTimes[key] || 0;
    if (now - last < ms/1000) return true;   // 被节流，跳过
    lastTimes[key] = now;
    return false;
  };

  // 采样音效文件映射（相对路径）
  const SFX_FILES = {
    shoot:     'assets/sfx/laser_small_000.ogg',
    shoot2:    'assets/sfx/laser_small_001.ogg',
    laser:     'assets/sfx/laser_large_000.ogg',
    laser2:    'assets/sfx/laser_large_001.ogg',
    explode:   'assets/sfx/explosion_crunch_000.ogg',
    explode2:  'assets/sfx/explosion_crunch_001.ogg',
    explode3:  'assets/sfx/explosion_crunch_002.ogg',
    boom:      'assets/sfx/low_frequency_explosion_000.ogg',
    hit:       'assets/sfx/impact_metal_000.ogg',
    hit2:      'assets/sfx/impact_metal_001.ogg',
    hurt:      'assets/sfx/hurt_heavy.ogg',
    zap:       'assets/sfx/glitch.wav',
    missile:   'assets/sfx/thruster_fire_000.ogg',
    pickup:    'assets/sfx/pickup.wav',
    weapon:    'assets/sfx/weapon.wav',
    select:    'assets/sfx/select.wav',
    over:      'assets/sfx/error.wav',
    thunder:   'assets/sfx/thunder_crackle.wav',
    zapHit:    'assets/sfx/zap_hit.wav',
    charge:    'assets/sfx/charge.wav',
    snap:      'assets/sfx/snaploop.wav',
    recharge:  'assets/sfx/recharge.wav',
  };
  const BGM_DEFAULT = 'assets/sfx/combat-determined-pursuit.ogg';
  let musicFile = BGM_DEFAULT;   // 当前播放的 BGM 文件（用于避免同曲重复重启）

  const ensure = () => {
    if (ac) return;
    try {
      ac = new (window.AudioContext || window.webkitAudioContext)();
      master = ac.createGain();
      master.gain.value = 1.0;
      master.connect(ac.destination);
      sfxGain = ac.createGain();
      sfxGain.gain.value = sfxVolume;
      sfxGain.connect(master);
    } catch (e) { ac = null; }
  };
  const resume = () => { if (ac && ac.state === 'suspended') ac.resume(); };
  const toggleMute = () => { muted = !muted; return muted; };
  const isMuted = () => muted;
  const setVolume = (v) => { return setSfxVolume(v); };
  const getVolume = () => sfxVolume;
  const setSfxVolume = (v) => { sfxVolume = clamp(v, 0, 1); if (sfxGain) sfxGain.gain.value = sfxVolume; return sfxVolume; };
  const setMusicVolume = (v) => { musicVolume = clamp(v, 0, 1); if (musicEl) musicEl.volume = musicVolume * 0.8; return musicVolume; };
  const getSfxVolume = () => sfxVolume;
  const getMusicVolume = () => musicVolume;

  // 采样缓冲缓存：键=文件名，值=AudioBuffer
  const bufferCache = {};
  // 预加载所有采样
  const preload = () => {
    ensure();
    if (!ac) return;
    Object.values(SFX_FILES).forEach(url => {
      if (bufferCache[url]) return;
      fetch(url).then(r => { if (!r.ok) throw 0; return r.arrayBuffer(); })
        .then(ab => ac.decodeAudioData(ab))
        .then(buf => { bufferCache[url] = buf; })
        .catch(() => {});
    });
  };

  // 播放一个采样（支持变调 rate、音量、循环子集可选）
  const play = (key, opts = {}) => {
    if (muted) return;
    ensure();                        // ★ 必须先建上下文：菜单阶段 ac 为空会吞掉所有 UI 音效
    if (!ac) return;
    const fire = () => {
      const url = SFX_FILES[key];
      if (!url) return;
      const buf = bufferCache[url];
      if (!buf) {
        // 尚未解码完成：即时加载，解码完再播一次
        fetch(url).then(r => r.arrayBuffer()).then(ab => ac.decodeAudioData(ab)).then(b => {
          bufferCache[url] = b;
          spawnBuffer(b, opts);
        }).catch(() => {});
        return;
      }
      spawnBuffer(buf, opts);
    };
    // 浏览器自动播放策略：上下文未解锁时先 resume，成功后再发声（保证首次点击也听得到）
    if (ac.state === 'suspended') { ac.resume().then(fire).catch(() => {}); }
    else fire();
  };
  const spawnBuffer = (buf, opts) => {
    if (!ac) return;
    const src = ac.createBufferSource();
    src.buffer = buf;
    const g = ac.createGain();
    const vol = opts.vol != null ? opts.vol : 1.0;
    const rate = opts.rate || 1.0;
    const t0 = ac.currentTime;
    const playDur = opts.duration || buf.duration;   // 可截取采样片段
    src.playbackRate.value = rate;
    // 音高扫频：制造"加速拐弯"之类的感觉（如导弹追踪音效）
    if (opts.rateEnd) {
      src.playbackRate.setValueAtTime(rate, t0);
      src.playbackRate.linearRampToValueAtTime(opts.rateEnd, t0 + playDur / rate);
    }
    // 起音：默认瞬起（打击感强）；opts.attack 可做淡入，削掉瞬态"啪"的锐利感（柔化用）
    if (opts.attack > 0) {
      g.gain.setValueAtTime(0.0001, t0);
      g.gain.exponentialRampToValueAtTime(Math.max(vol, 0.0002), t0 + opts.attack);
    } else {
      g.gain.setValueAtTime(vol, t0);
    }
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + playDur / rate + 0.03);
    let tail = src;
    // 低通滤波：柔化高频刺耳感（激光/导弹等）
    if (opts.lowpass) {
      const lp = ac.createBiquadFilter();
      lp.type = 'lowpass';
      lp.frequency.value = opts.lowpass;
      src.connect(lp);
      tail = lp;
    }
    tail.connect(g); g.connect(sfxGain || master);
    src.start(t0, opts.offset || 0, opts.duration || undefined);
  };

  // 从一组候选里随机挑一个播放（避免同一声重复的机械感）
  const playAny = (keys, opts = {}) => {
    const k = keys[Math.floor(Math.random() * keys.length)];
    play(k, opts);
  };

  return {
    ensure, resume, toggleMute, isMuted, setVolume, getVolume,
    setSfxVolume, setMusicVolume, getSfxVolume, getMusicVolume, preload,

    // ==== 真实采样音效（Kenney CC0，市面射击游戏质感）====

    /* 音量基准（K 加权短时峰值实测，环形 = 1.00x 基准）
       —— 上一轮曾把全部武器统一到环形的 1.45 倍，结果整体过响、且高频项刺耳。
          本轮降回：瞬发主炮/侧翼 0.50~0.82x（它们是每 40ms 就响的常驻音，必须最轻），
          其余 0.95~1.00x。主炮 b / 侧翼 / 连锁 2kHz+ 占比 81~95%，是"刺耳"根源，加低通磨刺。
          vol 均由 _test_audio_sweep.js 按目标响度反解得出，不是拍脑袋 */
    // 主炮射击：短促激光弹（随机两个采样避免机械感）
    shoot()   {
      if (throttle('shoot', 40)) return;
      if (Math.random() < 0.5) play('shoot2', { vol: 0.77, lowpass: 3200 });  // 亮采样：低通去毛刺
      else                      play('shoot',  { vol: 0.62 });                // 暗采样：本就厚重，无需低通
    },
    // 激光武器：低通压高频，不刺耳（柔和能量束）
    laser()   { playAny(['laser', 'laser2'], { vol: 0.20, rate: 0.82, lowpass: 1700 }); },
    // 导弹：音高上扬扫频，一听就是加速拐弯的追踪弹
    missile() {
      if (throttle('missile', 120)) return;
      play('missile', { vol: 0.67, rate: 0.65, rateEnd: 1.3, lowpass: 1400 });
    },
    // 环形波：低通 1000 + 起音淡入 12ms，削掉锐利的"呲"感（响度基准，不动）
    ring()    { play('laser', { vol: 0.23, rate: 0.88, lowpass: 1000, attack: 0.012 }); },
    // 侧翼弹幕：连发密集，音量压到极限值 0.50x；采样最亮，低通 4200 去掉最扎耳的那层
    sideShoot(){ if (throttle('side', 50)) return; play('shoot2', { vol: 0.42, rate: 1.05, lowpass: 4200 }); },
    // 等离子炮：厚重的能量发射声（音色不变，只降响度）
    plasma()  { if (throttle('plasma', 60)) return; play('laser', { vol: 0.19, rate: 0.6, lowpass: 1300 }); },
    // 穿透附魔：轻微"子弹打过纸"的嗖声
    pierce()  { if (throttle('pierce', 80)) return; play('shoot2', { vol: 0.20, rate: 1.7, lowpass: 4000 }); },
    // UI 悬停：很轻的滑动声
    hover()   { if (throttle('hover', 60)) return; play('select', { vol: 0.24, rate: 1.5 }); },
    // UI 点击（确定/返回/按钮）：轻快确认声（音量拉高保证听得见）
    uiClick() { if (throttle('uiClick', 80)) return; play('select', { vol: 0.7 }); },
    // 命中：金属弹着
    hit()     {
      if (throttle('hit', 50)) return;
      playAny(['hit', 'hit2'], { vol: 0.6 });
    },
    // 敌机爆炸：真实爆炸采样（随机三个，厚重真实）
    explode() {
      if (throttle('explode', 90)) return;
      playAny(['explode', 'explode2', 'explode3'], { vol: 0.85 });
    },
    // 大爆炸/炸弹：低频大爆炸
    boom()    { play('boom', { vol: 1.0 }); },
    bossHit() { play('hit2', { vol: 0.7 }); },
    // Boss 击毁：低频大爆炸 + 金属碰撞
    bossDie() { play('boom', { vol: 1.0, rate: 0.9 }); setTimeout(() => play('explode2', { vol: 0.8 }), 120); },
    // 受击：金属重击
    hurt()    { play('hurt', { vol: 0.8 }); },
    // 传导/电击伤害：电子故障电流声
    zapped()  { play('zap', { vol: 0.6, rate: 1.2 }); },
    // 连锁附魔：电弧噼啪电流声
    // —— snaploop 前 1.1s 恰好是整段最弱的区间（实测 K 峰值仅环形的 0.13 倍，等于没声音），
    //    改从 3.8s 处的最强电弧段截取；rate 1.2 保留原来那种尖锐"滋啦"音色
    //    （备选 zap_hit / glitch 实测过零率仅 2720 / 26，是低频"嗡"，会退回敲钟感，故不用）
    //    snaploop 2kHz+ 占比 95%，是全套里最"扎耳"的一项，故加 6000 低通磨掉高频毛刺
    chain()   {
      if (throttle('chain', 150)) return;
      play('snap', { vol: 1.09, rate: 1.2, offset: 3.8, duration: 0.85, lowpass: 6000 });
    },
    // 爆炸附魔：小型范围爆炸（独立节流，避免被击杀爆炸吞掉）
    blast()   {
      if (throttle('blast', 120)) return;
      playAny(['explode', 'explode2', 'explode3'], { vol: 0.55 });
    },
    pickup()  { play('pickup', { vol: 0.7 }); },
    // 收银特效音：三连清脆"叮"（带钟形泛音）+ 硬币落盘"哗啦"（合成，无需采样）
    cash() {
      ensure();
      if (!ac || muted) return;
      const fire = () => {
        const t0 = ac.currentTime;
        const bus = ac.createGain();
        bus.gain.value = 0.85;
        bus.connect(sfxGain || master);
        // 1) 三连敲击：音高递增（C6→E6→A6），每音叠 3 层泛音做出金属钱币的"亮"
        [[1046.5, 0], [1318.5, 0.075], [1760.0, 0.15]].forEach(([f, dt]) => {
          const t = t0 + dt;
          [1, 2.01, 3.02].forEach((mul, i) => {
            const o = ac.createOscillator();
            o.type = i === 0 ? 'triangle' : 'sine';
            o.frequency.value = f * mul;
            const g = ac.createGain();
            const v = 0.32 / (i + 1);
            g.gain.setValueAtTime(0.0001, t);
            g.gain.linearRampToValueAtTime(v, t + 0.006);
            g.gain.exponentialRampToValueAtTime(0.0001, t + 0.36 - i * 0.08);
            o.connect(g); g.connect(bus);
            o.start(t); o.stop(t + 0.42);
          });
        });
        // 2) 硬币落盘：短促白噪声 + 高通，只在开头"哗啦"一下
        const len = Math.floor(ac.sampleRate * 0.26);
        const nb = ac.createBuffer(1, len, ac.sampleRate);
        const nd = nb.getChannelData(0);
        for (let i = 0; i < len; i++) { const k = 1 - i / len; nd[i] = (Math.random() * 2 - 1) * k * k * k; }
        const ns = ac.createBufferSource(); ns.buffer = nb;
        const hp = ac.createBiquadFilter(); hp.type = 'highpass'; hp.frequency.value = 2600;
        const ng = ac.createGain(); ng.gain.value = 0.26;
        ns.connect(hp); hp.connect(ng); ng.connect(bus);
        ns.start(t0 + 0.02); ns.stop(t0 + 0.3);
      };
      if (ac.state === 'suspended') { ac.resume().then(fire).catch(() => {}); }
      else fire();
    },
    weapon()  { play('weapon', { vol: 0.8 }); },
    wave()    { play('select', { vol: 0.6 }); },
    bossWarn(){ play('select', { vol: 0.7, rate: 0.8 }); setTimeout(() => play('select', { vol: 0.7, rate: 0.8 }), 250); },
    over()    { play('over', { vol: 0.8 }); },

    // ==== 背景音乐（多曲目 CC0 素材，按模式/关卡切换，循环播放）====
    startMusic(track) {
      ensure(); resume();
      const file = track || BGM_DEFAULT;
      if (musicPlaying && musicFile === file) return;   // 同一首不重启
      if (!musicEl) {
        musicEl = new Audio();
        musicEl.loop = true;
        musicEl.volume = musicVolume * 0.8;
      }
      musicFile = file;
      musicPlaying = true;
      musicEl.src = file;
      musicEl.currentTime = 0;
      musicEl.play().catch(() => {});
    },
    stopMusic() {
      musicPlaying = false;
      if (musicEl) { musicEl.pause(); }
    },
  };
})();

/* ---------- 存档 · 六槽位 ---------- */
const SAVE_BASE = 'stellar_gunner_v5';             // 旧版单存档 key（保留作备份，不再写入）
const SLOT_COUNT = 6;
const SLOT_META_KEY = 'stellar_gunner_slots';      // { 槽号: 摘要 } —— 列表页只读它，不解析整份存档
const ACTIVE_SLOT_KEY = 'stellar_gunner_active_slot';
function slotKey(i) { return SAVE_BASE + '_s' + i; }
// 当前槽位（0~5）
let activeSlot = (() => {
  const v = parseInt(localStorage.getItem(ACTIVE_SLOT_KEY), 10);
  return (v >= 0 && v < SLOT_COUNT) ? v : 0;
})();
// 老存档迁移：首次启动把单档数据搬进 1 号槽（原 key 保留，不删，可回退）
(function migrateLegacySave() {
  try {
    const legacy = localStorage.getItem(SAVE_BASE);
    if (legacy && !localStorage.getItem(slotKey(0))) localStorage.setItem(slotKey(0), legacy);
  } catch {}
})();
let save = (() => { try { return JSON.parse(localStorage.getItem(slotKey(activeSlot))) || {}; } catch { return {}; } })();
save.best = save.best || 0;
save.kills = save.kills || 0;
save.gold = save.gold || 0;               // 金币（货币）
save.stars = save.stars || {};
save.unlocked = save.unlocked || 1;
save.achieve = save.achieve || {};
save.daily = save.daily || {};
save.daily.done = save.daily.done || {};  // { 挑战id: true } —— 每个挑战每天各可打一次
save.difficulty = save.difficulty || 1;   // 难度索引（0简单/1普通/2困难/3地狱）
save.playTime = save.playTime || 0;       // 累计游玩秒数（存档列表显示用）
// —— 玩家等级系统（驾驶员）——
save.playerLevel = save.playerLevel || 1;
save.playerExp = save.playerExp || 0;
// —— 机型与养成 ——
save.ships = save.ships || { 'agile':true, 'heavy':true, 'balanced':true };  // 已解锁机型
save.selectedShip = save.selectedShip || 'balanced';                          // 当前选择机型
// 每机型的永久升级等级（引擎/装甲/火力/射速 各从0起）
save.shipUpgrades = save.shipUpgrades || {};
// 磨损度：每机型 { hull:0..100, weapons:{main:0..100,...} }
save.wear = save.wear || {};
// 商店永久武器等级 / 附魔等级（跨局生效）
save.weaponLevels = save.weaponLevels || {};   // { main:0, laser:0, ... }
save.enchantPerm = save.enchantPerm || {};     // { pierce:0, chain:0, ... }
function saveStore() {
  try { localStorage.setItem(slotKey(activeSlot), JSON.stringify(save)); updateSlotMeta(); } catch {}
}

/* ---------- 六槽位管理 ---------- */
function readSlotMeta() { try { return JSON.parse(localStorage.getItem(SLOT_META_KEY)) || {}; } catch { return {}; } }
function writeSlotMeta(m) { try { localStorage.setItem(SLOT_META_KEY, JSON.stringify(m)); } catch {} }
function slotHasData(i) { try { const r = localStorage.getItem(slotKey(i)); return !!r && r.length > 2; } catch { return false; } }
// 把当前存档的关键指标写进槽位摘要（供列表显示）
function updateSlotMeta() {
  const m = readSlotMeta();
  m[activeSlot] = {
    level: save.playerLevel || 1,
    gold: save.gold || 0,
    best: save.best || 0,
    cleared: Object.keys(save.stars || {}).filter(k => (save.stars[k] || 0) > 0).length,
    playTime: Math.floor(save.playTime || 0),
    updatedAt: Date.now(),
  };
  writeSlotMeta(m);
}
// 读取某槽（不切换），用于列表显示兜底
function slotPeek(i) {
  try { return JSON.parse(localStorage.getItem(slotKey(i))) || null; } catch { return null; }
}
// 切换槽位：直接重载页面，避免热切换时全局状态（save/loadout/player…）不同步
function switchSlot(i) {
  if (i < 0 || i >= SLOT_COUNT) return;
  try { localStorage.setItem(ACTIVE_SLOT_KEY, String(i)); } catch {}
  location.reload();
}
// 清空某槽并切过去（=「新建存档」/「覆盖」/「重置此档」）
function wipeSlot(i) {
  try {
    localStorage.removeItem(slotKey(i));
    const m = readSlotMeta(); delete m[i]; writeSlotMeta(m);
  } catch {}
  switchSlot(i);
}
// 纯删除：删的是当前档则跳到第一个还有数据的槽（没有就跳 0 号空槽）
function deleteSlot(i) {
  try {
    localStorage.removeItem(slotKey(i));
    const m = readSlotMeta(); delete m[i]; writeSlotMeta(m);
  } catch {}
  if (i === activeSlot) {
    let target = 0;
    for (let k = 0; k < SLOT_COUNT; k++) if (k !== i && slotHasData(k)) { target = k; break; }
    switchSlot(target);
    return;
  }
  renderSaveList();
}
// 槽位列表里显示「刚玩过 / 3 天前」
function timeAgo(ts) {
  if (!ts) return '未使用';
  const d = Math.floor((Date.now() - ts) / 1000);
  if (d < 60) return '刚刚';
  if (d < 3600) return Math.floor(d / 60) + ' 分钟前';
  if (d < 86400) return Math.floor(d / 3600) + ' 小时前';
  if (d < 86400 * 30) return Math.floor(d / 86400) + ' 天前';
  return new Date(ts).toLocaleDateString('zh-CN');
}
function fmtPlayTime(sec) {
  sec = Math.max(0, Math.floor(sec || 0));
  const h = Math.floor(sec / 3600), m = Math.floor((sec % 3600) / 60);
  if (h > 0) return h + ' 小时 ' + m + ' 分';
  if (m > 0) return m + ' 分 ' + (sec % 60) + ' 秒';
  return sec + ' 秒';
}

/* 每机型独立升级/磨损初始化 */
function shipUpgradesOf(id) { if (!save.shipUpgrades[id]) save.shipUpgrades[id] = { engine:0, armor:0, power:0, rate:0 }; return save.shipUpgrades[id]; }
function shipWearOf(id) { if (!save.wear[id]) save.wear[id] = { hull:0, weapons:{} }; return save.wear[id]; }

/* ---------- 玩家等级系统 ---------- */
function expNeeded(level) { return level * 100; }          // 升级所需经验
function levelDropBonus() { return save.playerLevel * 0.003; }    // 掉落率加成（每级+0.3%）
function levelWearReduction() { return save.playerLevel * 0.01; } // 磨损减缓（每级-1%，上限50%）
// 给玩家加经验，返回是否升级
function gainExp(amount) {
  save.playerExp += amount;
  let leveled = false;
  while (save.playerExp >= expNeeded(save.playerLevel)) {
    save.playerExp -= expNeeded(save.playerLevel);
    save.playerLevel++;
    leveled = true;
  }
  if (leveled) toast('⭐ 驾驶员升级', '等级 ' + save.playerLevel + ' · 掉率/磨损加成提升');
  return leveled;
}

/* ---------- 游戏状态 ---------- */
const MODE = { MENU:0, CAMPAIGN:1, ENDLESS:2, PRACTICE:3, DAILY:4, PAUSE:5, OVER:6, UPGRADE:7 };
const DAILY_WAVE_LEN = 12;   // 每日挑战单波时长（秒）：速通局，总时长控制在 40 秒内
let mode = MODE.MENU;
let lastRunMode = MODE.CAMPAIGN;   // 上一局模式（失败画面"重新出击"用）
let modeBeforePause = MODE.CAMPAIGN;

/* ---------- BGM 选曲：每个模式/关卡/挑战各一首战斗风音乐（10 首互不相同） ---------- */
function bgmTrackFor(m, wave) {
  if (m === MODE.CAMPAIGN) {
    if (wave <= 4) return 'assets/sfx/battle-theme-a.mp3';            // 第1-4关：教团遭遇·史诗序曲
    if (wave <= 8) return 'assets/sfx/combat-random-encounter.ogg';   // 第5-8关：幽灵舰队·黑暗战纪
    return 'assets/sfx/combat-determined-pursuit.ogg';                // 第9-12关：虚空决战·死战追击
  }
  if (m === MODE.ENDLESS)  return 'assets/sfx/combat-loop.ogg';        // 无尽：快节奏太空缠斗
  if (m === MODE.PRACTICE) return 'assets/sfx/bgm-action-1.mp3';       // 练习：轻快战阵操演
  if (m === MODE.DAILY) {                                             // 每日：5 个挑战各一首战斗曲
    const id = (dailyChallenge && dailyChallenge.id) || 'bounty';
    const map = {
      bounty:   'assets/sfx/bgm-final-battle.ogg',   // 赏金猎杀：终局追逐战
      supply:   'assets/sfx/bgm-action-2.mp3',       // 补给争夺：突围强攻
      training: 'assets/sfx/bgm-action-3.mp3',       // 老兵特训：操演进行曲
      defense:  'assets/sfx/bgm-action-4.mp3',       // 守卫星门：死守终章
      raid:     'assets/sfx/bgm-action-5.mp3',       // 废墟清扫：突入战区
    };
    return map[id] || 'assets/sfx/bgm-action-2.mp3';
  }
  return 'assets/sfx/battle-theme-a.mp3';
}
function startBGM(m, wave) {
  const t = bgmTrackFor(m, wave);
  if (t) Sfx.startMusic(t); else Sfx.stopMusic();
}

/* ---------- 难度系统 ---------- */
// 4 档难度：影响敌人强度（血量/攻击/移速）与奖励倍率（金币/经验/掉落）
const DIFFICULTIES = [
  { id:'easy',   name:'简单', color:'#6dffb0', enemyMul:0.8,  rewardMul:0.8,  desc:'休闲体验 · 奖励 80%' },
  { id:'normal', name:'普通', color:'#35e0ff', enemyMul:1.0,  rewardMul:1.0,  desc:'标准难度 · 奖励 100%' },
  { id:'hard',   name:'困难', color:'#ff9a3c', enemyMul:1.35, rewardMul:1.5,  desc:'高手挑战 · 奖励 150%' },
  { id:'hell',   name:'地狱', color:'#ff3c3c', enemyMul:1.8,  rewardMul:2.2,  desc:'极限生存 · 奖励 220%' },
];
let difficulty = (typeof save !== 'undefined' && save.difficulty != null) ? save.difficulty : 1;   // 当前难度索引（从存档读取）
function diffEnemyMul() { return DIFFICULTIES[difficulty].enemyMul; }
function diffRewardMul() { return DIFFICULTIES[difficulty].rewardMul; }

/* ---------- 运行时对象 ---------- */
let player, bullets, eBullets, enemies, particles, stars, pickups, effects;
let score, kills, alloyGain, wave, waveTimer, spawnTimer, shake, flashTimer;
let bossRef = null, nextWavePending = 0, gameTime = 0, threat = 1.0;
let playTimeFlush = 0;   // 游玩时长落盘节流计时
let hurtFlash = 0;   // 受伤红色四周渐变特效强度（0~1，掉血瞬间拉满后衰减）
let weapon, loadout = [], wingmanLevel = 0, enchantLevels = { pierce:0, chain:0, slow:0, blast:0, lifesteal:0 };
let dailySeed = 0;

const BOMB_MAX = 3;
const PL_HIT_R = 12;
const PL_R = 18;

/* ---------- 机型定义 ---------- */
// 每机型基础属性：速度/血量/护甲/攻击力/射速系数
// speed: 移动速度(px/s)  hp/armor/atk 沿用玩家属性  rate: 射速系数(越大越快)
const SHIP_TYPES = {
  agile:    { name:'敏捷型',   icon:'⚡', color:'#35e0ff',
    speed:340, hp:75,  armor:6,  atk:8,  rate:1.5, desc:'移速射速极快，但血薄防低，靠走位取胜', img:'assets/portraits/ship_agile.png' },
  heavy:    { name:'重炮型',   icon:'💥', color:'#ff8a3c',
    speed:190, hp:150, armor:22, atk:15, rate:0.7, desc:'移速射速缓慢，但伤害高、护甲厚、血量足', img:'assets/portraits/ship_heavy.png' },
  balanced: { name:'均衡型',   icon:'🛡️', color:'#6dffb0',
    speed:280, hp:100, armor:10, atk:10, rate:1.0, desc:'各项指标均衡，最稳妥的选择', img:'assets/portraits/ship_balanced.png' },
  ghost:    { name:'幽灵型',   icon:'👻', color:'#b06bff',
    speed:400, hp:60,  armor:4,  atk:9,  rate:1.8, desc:'极限机动，射速飞快，但脆如纸，极易被秒',
    unlock: { type:'level', val:6 }, img:'assets/portraits/ship_ghost.png' },
  fortress: { name:'堡垒型',   icon:'🏰', color:'#ffd08a',
    speed:150, hp:200, armor:30, atk:12, rate:0.5, desc:'移动极慢，但血厚如山、甲高如城，重火力压制',
    unlock: { type:'level', val:9 }, img:'assets/portraits/ship_fortress.png' },
};

/* ---------- 武器定义 ---------- */
const WEAPON_TYPES = {
  main:    { name:'主炮',     color:'#7cc4ff', glow:'#3aa0ff', img:'assets/portraits/w_main.png' },
  laser:   { name:'激光',     color:'#35e0ff', glow:'#35e0ff', img:'assets/portraits/w_laser.png' },
  missile: { name:'追踪导弹', color:'#ff8a3c', glow:'#ff8a3c', img:'assets/portraits/w_missile.png' },
  side:    { name:'侧翼弹幕', color:'#b06bff', glow:'#b06bff', img:'assets/portraits/w_side.png' },
  ring:    { name:'环形弹',   color:'#ffd08a', glow:'#ffb84d', img:'assets/portraits/w_ring.png' },
  plasma:  { name:'等离子炮', color:'#ff4d8f', glow:'#ff4d8f', img:'assets/portraits/w_plasma.png' },
};

const ENCHANT = {
  pierce: { name:'穿透', color:'#35e0ff', desc:'子弹贯穿敌人', img:'assets/portraits/e_pierce.png' },
  chain:  { name:'连锁', color:'#b06bff', desc:'闪电链传导', img:'assets/portraits/e_chain.png' },
  slow:   { name:'减速', color:'#6dffb0', desc:'命中减速', img:'assets/portraits/e_slow.png' },
  blast:  { name:'爆炸', color:'#ff8a3c', desc:'范围爆炸', img:'assets/portraits/e_blast.png' },
  lifesteal: { name:'吸血', color:'#ff5a7a', desc:'命中回复生命', img:'assets/portraits/e_lifesteal.png' },
};

/* ---------- 每日挑战（同一世界观，与主线关系不大的支线人物，奖励各异） ---------- */
const DAILY_CHALLENGES = [
  {
    id:'bounty', name:'赏金猎杀', icon:'💰', color:'#ffd700',
    desc:'追猎通缉犯「铁爪·卡尔」，他靠劫掠补给舰为生，赏金丰厚。',
    enemy:'铁爪·卡尔', enemyPool:['grunt','elite','rammer','chief'], bossType:{name:'铁爪·卡尔', type:'ace', color:'#ffd08a'},
    rewardType:'gold', rewardDesc:'金币奖励 +60%',
    bonus: ()=>{ /* 局末结算时金币 +60% */ },
  },
  {
    id:'supply', name:'补给争夺', icon:'📦', color:'#35e0ff',
    desc:'拦截走私舰队，缴获的战利品能大幅提升武器掉落率。',
    enemy:'走私头子·独眼龙', enemyPool:['scout','shield','splitter','tank'], bossType:{name:'走私头子·独眼龙', type:'cruiser', color:'#5ad8ff'},
    rewardType:'droprate', rewardDesc:'掉落率 +40%',
    bonus: ()=>{ /* 击杀掉落率临时 +40% */ },
  },
  {
    id:'training', name:'老兵特训', icon:'🎖️', color:'#6dffb0',
    desc:'与退役王牌「白隼·雷」切磋，他承诺战后传授实战经验。',
    enemy:'白隼·雷', enemyPool:['grunt','scout','elite','sniper'], bossType:{name:'白隼·雷', type:'heavyFighter', color:'#6dffb0'},
    rewardType:'exp', rewardDesc:'驾驶员经验 +100%',
    bonus: ()=>{ /* 经验 +100% */ },
  },
  {
    id:'defense', name:'守卫星门', icon:'🛡️', color:'#ff8a3c',
    desc:'协防边境星门，抵御「掠夺者·血旗」的入侵舰队。',
    enemy:'掠夺者·血旗', enemyPool:['elite','orbiter','shield','tank'], bossType:{name:'掠夺者·血旗', type:'flagship', color:'#ff8a3c'},
    rewardType:'wearless', rewardDesc:'磨损减免 50%',
    bonus: ()=>{ /* 本局磨损减半 */ },
  },
  {
    id:'raid', name:'废墟清扫', icon:'💥', color:'#b06bff',
    desc:'清剿荒废空间站里的「游荡者·灰烬」，它们由战火中的难民变异而来。',
    enemy:'游荡者·灰烬', enemyPool:['splitter','rammer','orbiter','sniper','chief'], bossType:{name:'游荡者·灰烬', type:'doomShip', color:'#b06bff'},
    rewardType:'both', rewardDesc:'金币 +30% 且 经验 +30%',
    bonus: ()=>{ /* 金币和经验各 +30% */ },
  },
];

// 当前选中的每日挑战 id 和奖励倍率
let dailyChallenge = null;
let dailyGoldMul = 1, dailyDropMul = 1, dailyExpMul = 1, dailyWearMul = 1;

/* ---------- 每日挑战：进度按「挑战」逐个记，不是一天只能打一个 ---------- */
function dailyToday() { return new Date().toISOString().slice(0,10); }
// 取今日完成表（跨天自动清空）
function dailyDoneMap() {
  if (save.daily.date !== dailyToday()) {
    save.daily.date = dailyToday();
    save.daily.done = {};
    save.daily.played = false;
    saveStore();
  }
  if (!save.daily.done) save.daily.done = {};
  return save.daily.done;
}
function dailyDoneCount() { return Object.keys(dailyDoneMap()).length; }
function dailyAllDone() { return dailyDoneCount() >= DAILY_CHALLENGES.length; }

/* ---------- 敌人类型 ---------- */
const ENEMY_TYPES = {
  grunt:   { hp:2,  r:15, score:10,  speed:90,  color:'#ff6b7a', name:'普通兵', atk:12 },
  scout:   { hp:1,  r:11, score:15,  speed:210, color:'#ffb84d', name:'侦察兵', atk:10 },
  elite:   { hp:6,  r:20, score:35,  speed:70,  color:'#c77bff', name:'精英', fire:true, atk:16 },
  chief:   { hp:16, r:30, score:80,  speed:45,  color:'#ff4d8f', name:'首领', fire:true, radial:true, atk:22 },
  // —— 新增机制型敌人（随关卡逐步解锁）——
  splitter:{ hp:4,  r:16, score:30,  speed:120, color:'#8affc1', name:'分裂者', split:true, atk:13 },
  rammer:  { hp:3,  r:13, score:40,  speed:120, color:'#ff9a3c', name:'冲撞者', ram:true, atk:20 },
  shield:  { hp:8,  r:22, score:55,  speed:50,  color:'#5ad8ff', name:'护盾者', shield:true, fire:true, atk:15 },
  orbiter: { hp:5,  r:14, score:45,  speed:110, color:'#e0a3ff', name:'环绕者', orbit:true, fire:true, atk:14 },
  sniper:  { hp:3,  r:12, score:50,  speed:160, color:'#ffd08a', name:'狙击手', sniper:true, atk:24 },
  tank:    { hp:22, r:32, score:100, speed:35,  color:'#ff5d5d', name:'重装兵', radial:true, fire:true, atk:26 },
};

/* ---------- 成就 ---------- */
const ACHIEVES = [
  { id:'first',  name:'初次启航',  desc:'完成第 1 关',  check:()=> (save.stars['1']||0)>0, prog:()=> (save.stars['1']||0)>0?1:0, unit:'完成第1关' },
  { id:'k100',   name:'百人斩',    desc:'累计击杀 100', check:()=> save.kills>=100, prog:()=> Math.min(1, save.kills/100), unit:'击杀' },
  { id:'k1000',  name:'千军万马',  desc:'累计击杀 1000', check:()=> save.kills>=1000, prog:()=> Math.min(1, save.kills/1000), unit:'击杀' },
  { id:'s5k',    name:'五千分',    desc:'单局达到 5000 分', check:()=> save.best>=5000, prog:()=> Math.min(1, save.best/5000), unit:'最高分' },
  { id:'wing',   name:'双翼齐飞',  desc:'获得僚机',     check:()=> wingmanLevel>0, prog:()=> wingmanLevel>0?1:0, unit:'获得僚机' },
  { id:'full',   name:'火力全开',  desc:'集齐 6 种武器', check:()=> loadout.length>=6, prog:()=> Math.min(1, loadout.length/6), unit:'种武器' },
];

/* ---------- 剧情（暗黑向，12关CG） ---------- */
const STORY = [
  { title:'第一幕 · 炮灰', img:'assets/cg/cg01.png',
    text:'战争打了百年，精锐早就打光了。联邦开始把平民、囚犯、孤儿塞进廉价的量产战机，当作炮灰送上前线。\n\n你，就是其中之一。督战官「铁面」站在舷梯上，面具后的红眸扫过你们这群人："你们是耗材。能换掉几艘敌舰，就算够本。"' },
  { title:'第二幕 · 阵亡名单', img:'assets/cg/cg02.png',
    text:'你又活了下来，但整个中队，只剩你一个。\n\n把你从扭曲的驾驶舱里拖出来的，是随舰医官「白鸽」。她一边给你缠绷带，一边低声说："广播里……一个字都没提他们。"\n\n你盯着成排的阵亡名单，第一次意识到——在联邦眼里，你们的命，甚至不值得一个名字。' },
  { title:'第三幕 · 苍蓝星', img:'assets/cg/cg03.png',
    text:'你悄悄潜回了母星"苍蓝星"。副驾驶「岚」没有多问一句，只是陪你把战机停在废墟上。\n\n苍蓝星不在了。焦黑的废墟里，你找到了家人的遗骸，还有一枚不该出现在这里的——联邦军队的识别牌，牌号属于舰队长「铁砧」的直属部队。\n\n毁灭苍蓝星的，不是敌人，是自己人。' },
  { title:'第四幕 · 名单', img:'assets/cg/cg04.png',
    text:'你黑进联邦的加密档案，看到了一份"待清洗星球"名单。苍蓝星只是其中一个被划掉的名字，后面还有一串——那些星球上，都还住着活生生的人。\n\n名单最后的接收栏写着：督战官「铁面」。你终于明白：这是一场有预谋的屠杀。' },
  { title:'第五幕 · 战友之死', img:'assets/cg/cg05.png',
    text:'唯一愿意相信你的战友——「岚」，死在你眼前。击落她的是"友军"的火炮，理由只有四个字："没有价值"。\n\n你握着操纵杆的手在发抖。这条命，和岚的命，到底算什么？' },
  { title:'第六幕 · 教团真相', img:'assets/cg/cg06.png',
    text:'你孤身深入敌后，在教团的地下圣所里，第一次见到了湮灭教团的主教——「玄」。\n\n他没有攻击你。他只是掀开长袍，露出满身灼伤："我们不是恶魔。我们是被联邦烧掉家园的人——老人、妇女、孩子，和你家乡的人没什么两样。"\n\n原来所谓的敌人，也不过是一群受害者。' },
  { title:'第七幕 · 双面为敌', img:'assets/cg/cg07.png',
    text:'联邦的通缉令上有了你的名字，教团的追杀名单上也有。只有机械师「老韩」还愿意给你的战机补上装甲。\n\n"你现在谁的人都不是。"他把扳手扔进工具箱，"所以谁都想要你的命。"\n\n你不属于联邦，也不属于教团。你只是这架战争机器里，一颗随时会被拧下来的螺丝。' },
  { title:'第八幕 · 出卖', img:'assets/cg/cg08.png',
    text:'你的行踪被联邦掌握了。带队的，是督战官「铁面」。\n\n而告密的人，是你曾经亲手救过的人。\n\n那一刻，你感到的不是愤怒，而是一种彻骨的冷。原来信任这种东西，在战争里早就死了。' },
  { title:'第九幕 · 禁忌兵器', img:'assets/cg/cg09.png',
    text:'你终于找到了联邦的"虚空兵器"。真相让你作呕——它以活人为燃料，容器里封存着的，是还没死透的人。\n\n苍蓝星上的人，就是被填进了这里。而负责押送燃料的，正是「铁面」的督战队。' },
  { title:'第十幕 · 复仇', img:'assets/cg/cg10.png',
    text:'你杀进了联邦司令部，一路血洗。督战官「铁面」的面具在爆炸中裂开，第一次露出惊恐的表情。\n\n可当最后一个仇人倒下时，你只感到一种巨大的空虚。复仇完成了，然后呢？' },
  { title:'第十一幕 · 最后防线', img:'assets/cg/cg11.png',
    text:'联邦放出了终极兵器。侧翼，敌国王牌「赤鸦」的座机正等着你；而废墟上，主教「玄」跪着念谁也听不懂的祷词。\n\n你听清了它的轰鸣里夹杂着的惨叫——其中有一个，是你故乡邻居的声音。\n\n他们到最后，都没能逃过被当作燃料的命运。' },
  { title:'终幕 · 抉择', img:'assets/cg/cg12.png',
    text:'你站在虚空兵器的核心前。通讯器里，「白鸽」和「老韩」的声音断断续续："回来吧……""别把自己也烧进去。"\n\n三个选择摆在面前：\n\n① 引爆它，与一切同归于尽。\n② 摧毁它，然后从银河中消失，做一个幽灵。\n③ 留下它，成为新的暴君。\n\n这里没有完美的结局。战争里，从来没有英雄，只有幸存者和帮凶。' },
];

/* ============================================================
   初始化
   ============================================================ */
// 计算某机型经永久升级+磨损后的最终属性
function shipStats(id) {
  const s = SHIP_TYPES[id] || SHIP_TYPES.balanced;
  const up = shipUpgradesOf(id);
  const wear = shipWearOf(id);
  const hullWear = wear.hull || 0;   // 0~100，越高越差
  // 磨损衰减：性能乘 (1 - wear*0.005)，磨损100时衰减50%
  const wearMul = 1 - (hullWear * 0.005);
  return {
    speed: s.speed * (1 + up.engine*0.05) * wearMul,
    maxHp: Math.round(s.hp * (1 + up.armor*0.04)),
    armor: Math.round(s.armor * (1 + up.armor*0.06)),
    atk:   Math.round(s.atk  * (1 + up.power*0.05)),
    rate:  s.rate * (1 + up.rate*0.08),
  };
}

function makePlayer() {
  // 血条型生命：maxHp 100，护甲减伤，攻击力影响子弹伤害
  const st = shipStats(save.selectedShip);
  const p = { x: W/2, y: H*0.8, hp:st.maxHp, maxHp:st.maxHp, armor:st.armor, atk:st.atk,
    rate:st.rate, speed:st.speed, invuln:0, fireCd:0, bombs:BOMB_MAX, slow:0,
    shipId: save.selectedShip };
  return p;
}

function resetGame(m) {
  mode = m;
  modeBeforePause = m;   // 暂停回退基准（练习模式调参面板依赖它判定）
  player = makePlayer();
  bullets = []; eBullets = []; enemies = []; particles = []; pickups = []; effects = [];
  score = 0; kills = 0; alloyGain = 0; wave = 1; waveTimer = 0; spawnTimer = 0.8;
  shake = 0; flashTimer = 0; hurtFlash = 0; gameTime = 0; threat = 1.0;
  bossRef = null; nextWavePending = 0;
  $('bossBar').classList.add('hidden');   // 确保开局 Boss 血条隐藏
  // 开局装备 = 商店永久武器等级 + 永久附魔等级（本局基准）
  loadout = buildLoadoutFromShop();
  enchantLevels = buildEnchantFromShop();
  wingmanLevel = 0;
  if (m === MODE.PRACTICE) {
    // 练习模式：使用自定义装备（菜单面板设定；战斗中也可用调参面板随时改）
    applyEditorToLive();
    player.hp = 999; player.maxHp = 999;
  }
  // 非每日挑战模式进入时，清空每日挑战标记（避免残留上次的奖励加成）
  if (m !== MODE.DAILY) { dailyChallenge = null; dailyGoldMul = dailyDropMul = dailyExpMul = dailyWearMul = 1; }
  spawnStars();
  updateHud();
  updateDailyBuffHud();
  updateBombHud();
  hideAllOvl();
  Sfx.ensure(); Sfx.resume(); Sfx.preload(); startBGM(m, wave);   // 进游戏才放音乐（菜单静音）
}

// 由商店永久武器等级构建开局装备（本局基准）
function buildLoadoutFromShop() {
  const list = [{ type:'main', level:1 }];
  for (const t of Object.keys(WEAPON_TYPES)) {
    const lv = save.weaponLevels[t] || 0;
    if (t !== 'main' && lv > 0) list.push({ type:t, level:lv });
  }
  if (save.weaponLevels.main) list[0].level = Math.max(1, save.weaponLevels.main);
  return list;
}
function buildEnchantFromShop() {
  const e = { pierce:0, chain:0, slow:0, blast:0, lifesteal:0 };
  for (const k of Object.keys(e)) e[k] = save.enchantPerm[k] || 0;
  return e;
}

function hideAllOvl() {
  ['menu','levelSelect','pauseMenu','gameOver','defeatOvl','upgradeOvl','weaponPanel','achieveOvl','hangarOvl','shopOvl','cgOvl','confirmOvl','practiceOvl','arsenalOvl','dailyOvl','successOvl','saveOvl'].forEach(id => $(id).classList.add('hidden'));
}

// 判断机型是否已解锁
function shipUnlocked(id) {
  if (save.ships[id]) return true;
  const s = SHIP_TYPES[id];
  if (!s || !s.unlock) return false;
  if (s.unlock.type === 'level') return save.unlocked >= s.unlock.val;
  return false;
}
function shipUnlockText(id) {
  const s = SHIP_TYPES[id];
  if (!s || !s.unlock) return '';
  if (s.unlock.type === 'level') return '通关第 ' + s.unlock.val + ' 关解锁';
  return '';
}

// 立绘预览（悬停显示，大尺寸铺满背景，移开即消失）
function showPortrait(img) {
  if (!img) { hidePortrait(); return; }
  // 只在「左半屏面板」（机库/商店/练习/调参）里弹预览——这些界面右侧本来就是空的。
  // 居中的面板（每日挑战/成就/升级…）右侧没地方，弹出来只会盖住自己的按钮。
  if (!document.querySelector('.half-ovl:not(.hidden)')) { hidePortrait(); return; }
  const p = $('portraitPreview');
  // 保留 .p-bg 背景层，只替换图片
  let im = p.querySelector('img');
  if (!im) { im = document.createElement('img'); p.appendChild(im); }
  im.src = img;
  im.alt = '立绘';
  p.classList.add('show');
}
function hidePortrait() { $('portraitPreview').classList.remove('show'); }
// 预览层固定 pointer-events:none（见 CSS 注释），所以不能用它自己收点击——
// 改为：点到行以外的地方就收起（手机上没有 mouseleave，靠这个收）
document.addEventListener('pointerdown', (e)=>{
  const t = e.target;
  if (t && t.closest && t.closest('.ui-item')) return;   // 还在项目上，保留预览
  hidePortrait();
}, true);

// 确认弹窗
let confirmFn = null;
function confirmDialog(title, msg, fn) {
  $('confirmTitle').textContent = title;
  $('confirmMsg').textContent = msg;
  confirmFn = fn;
  $('confirmOvl').classList.remove('hidden');
}
$('confirmYes').onclick = ()=>{ const f = confirmFn; confirmFn = null; $('confirmOvl').classList.add('hidden'); if (f) f(); };
$('confirmNo').onclick = ()=>{ confirmFn = null; $('confirmOvl').classList.add('hidden'); };

function spawnStars() {
  stars = [];
  const palette = ['rgba(180,210,255,', 'rgba(210,200,255,', 'rgba(160,230,240,', 'rgba(255,220,190,'];
  for (let i=0;i<110;i++) stars.push({ x:rnd(0,W), y:rnd(0,H), s:rnd(0.4,2.6), sp:rnd(8,30), c:palette[(Math.random()*palette.length)|0] });
}

/* ============================================================
   武器发射
   ============================================================ */
function fireWeapons() {
  const wear = shipWearOf(player.shipId);
  for (const w of loadout) {
    // 武器磨损降低实际发挥等级：磨损100时最多降2级
    const ww = (wear.weapons[w.type] || 0);
    const effLevel = Math.max(1, w.level - Math.round(ww * 0.02));
    fireWeapon(w.type, effLevel);
  }
  for (let i=1;i<=wingmanLevel;i++) {
    const side = i%2===0 ? 1 : -1;
    const wx = player.x + side * (36 + Math.floor((i-1)/2)*14);
    bullets.push({ x:wx, y:player.y-8, vx:0, vy:-560, dmg:1, r:3.5, color:'#6dffb0', glow:'#6dffb0', pierce:false, remaining:0, hit:new Set() });
  }
}

function fireWeapon(type, level) {
  const isPierce = enchantLevels.pierce > 0;
  const pierceCount = enchantLevels.pierce;
  if (type==='laser') Sfx.laser();
  else if (type==='missile') Sfx.missile();
  else if (type==='ring') Sfx.ring();
  else if (type==='side') Sfx.sideShoot();
  else if (type==='plasma') Sfx.plasma();
  else Sfx.shoot();
  switch(type) {
    case 'main': {
      const n = Math.min(7, 1 + level);
      const spread = 0.10;
      for (let i=0;i<n;i++) {
        const t = (i-(n-1)/2) * spread;
        spawnBullet({ x:player.x, y:player.y-16, vx:Math.sin(t)*560, vy:-Math.cos(t)*560, dmg:1, r:4, color:'#7cc4ff', glow:'#3aa0ff', pierce:isPierce, remaining:isPierce?pierceCount+1:0, track:false });
      }
      break;
    }
    case 'laser': {
      const n = Math.min(5, level);
      const spread = 0.07;
      for (let i=0;i<n;i++) {
        const t = (i-(n-1)/2) * spread;
        spawnBullet({ x:player.x, y:player.y-16, vx:Math.sin(t)*900, vy:-Math.cos(t)*900, dmg:2, r:6, color:'#35e0ff', glow:'#35e0ff', pierce:true, remaining:99, track:false, laser:true });
      }
      break;
    }
    case 'missile': {
      const n = Math.min(3, Math.ceil(level/2));
      for (let i=0;i<n;i++) {
        spawnBullet({ x:player.x + (i-(n-1)/2)*10, y:player.y-14, vx:0, vy:-380, dmg:3, r:7, color:'#ff8a3c', glow:'#ff8a3c', pierce:false, remaining:0, track:true, missile:true });
      }
      break;
    }
    case 'side': {
      const n = Math.min(4, level);
      const ang = 0.6;
      for (let i=1;i<=n;i++) {
        spawnBullet({ x:player.x, y:player.y-6, vx:-Math.sin(ang)*420, vy:-Math.cos(ang)*420, dmg:1, r:4, color:'#b06bff', glow:'#b06bff', pierce:isPierce, remaining:isPierce?pierceCount+1:0, track:false });
        spawnBullet({ x:player.x, y:player.y-6, vx:Math.sin(ang)*420, vy:-Math.cos(ang)*420, dmg:1, r:4, color:'#b06bff', glow:'#b06bff', pierce:isPierce, remaining:isPierce?pierceCount+1:0, track:false });
      }
      if (level >= 4) {
        spawnBullet({ x:player.x, y:player.y-6, vx:-420, vy:0, dmg:1, r:4, color:'#b06bff', glow:'#b06bff', pierce:isPierce, remaining:isPierce?pierceCount+1:0, track:false });
        spawnBullet({ x:player.x, y:player.y-6, vx:420, vy:0, dmg:1, r:4, color:'#b06bff', glow:'#b06bff', pierce:isPierce, remaining:isPierce?pierceCount+1:0, track:false });
      }
      break;
    }
    case 'ring': {
      const n = 8 + level*2;
      const a0 = gameTime * 2;
      for (let i=0;i<n;i++) {
        const a = a0 + (i/n)*Math.PI*2;
        spawnBullet({ x:player.x, y:player.y, vx:Math.cos(a)*260, vy:Math.sin(a)*260, dmg:1, r:4, color:'#ffd08a', glow:'#ffb84d', pierce:isPierce, remaining:isPierce?pierceCount+1:0, track:false });
      }
      break;
    }
    case 'plasma': {
      const n = Math.min(5, Math.ceil(level/1.5));
      for (let i=0;i<n;i++) {
        const t = (i-(n-1)/2) * 0.12;
        spawnBullet({ x:player.x, y:player.y-20, vx:Math.sin(t)*620, vy:-Math.cos(t)*620, dmg:5, r:9, color:'#ff4d8f', glow:'#ff4d8f', pierce:true, remaining:6, track:false, plasma:true });
      }
      break;
    }
  }
}

function spawnBullet(o) {
  // 攻击力加成：基础攻击力 10 对应 1.0 倍伤害
  o.dmg = Math.max(1, Math.round(o.dmg * (player.atk / 10)));
  bullets.push(Object.assign({ hit:new Set(), life:0 }, o));
}

/* ============================================================
   炸弹
   ============================================================ */
function useBomb() {
  if (![MODE.CAMPAIGN, MODE.ENDLESS, MODE.DAILY].includes(mode)) return;
  if (player.bombs <= 0) return;
  player.bombs--; updateBombHud();
  Sfx.boom();
  eBullets = [];
  flashTimer = 0.35; shake = Math.max(shake, 16);
  for (const e of enemies) { e.hp -= 8; if (e.hp<=0) killEnemy(e); }
  if (bossRef) { bossRef.hp -= 12; spawnParticles(bossRef.x,bossRef.y,'#ffd08a',40,260); if (bossRef.hp<=0) killBoss(); }
}

/* ============================================================
   敌人
   ============================================================ */
function spawnEnemy(type) {
  const t = ENEMY_TYPES[type];
  const dm = diffEnemyMul();   // 难度系数
  const pm = enemyPowerMul();  // 战力补偿：小兵血量随玩家养成成长（原先完全不看战力）
  const hp = t.hp * (1 + wave*0.12) * dm * pm;
  const e = { type, x:rnd(30,W-30), y:-30, hp, maxHp:hp, r:t.r, score:t.score, color:t.color,
    speed:t.speed * Math.min(1.5, 1 + (dm-1)*0.4), fire:!!t.fire, radial:!!t.radial, fireCd:rnd(1.2,2.5), wob:rnd(0,6.28), slowT:0, atk:t.atk*(1+wave*0.06)*dm*(1+(pm-1)*0.5),
    split:!!t.split, ram:!!t.ram, shield:!!t.shield, shieldHp:(t.shield?3:0), orbit:!!t.orbit, orbitAng:rnd(0,6.28),
    sniper:!!t.sniper, aimT:(t.sniper?rnd(0.6,1.2):0) };
  enemies.push(e);
}

// 随关卡逐步解锁敌人类型，越往后机制越复杂
const WAVE_ENEMY_POOL = [
  ['grunt'],
  ['grunt','scout'],
  ['grunt','scout','elite'],
  ['grunt','scout','elite','splitter'],
  ['grunt','scout','elite','splitter','rammer'],
  ['grunt','elite','splitter','rammer','shield'],
  ['elite','splitter','rammer','shield','orbiter'],
  ['elite','rammer','shield','orbiter','sniper','chief'],
  ['elite','splitter','shield','orbiter','sniper','chief'],
  ['elite','rammer','shield','orbiter','sniper','chief','tank'],
  ['elite','splitter','rammer','shield','orbiter','sniper','chief','tank'],
  ['elite','splitter','rammer','shield','orbiter','sniper','chief','tank'],
];

function spawnWaveEnemy() {
  let pool;
  if (mode === MODE.DAILY && dailyChallenge) {
    pool = dailyChallenge.enemyPool;   // 每日挑战用专属敌人池
  } else {
    const w = Math.min(wave, 12);
    pool = WAVE_ENEMY_POOL[w-1] || WAVE_ENEMY_POOL[11];
  }
  // 高波次优先出更难的敌人（后半段敌人权重更高）
  const idx = Math.floor(Math.pow(Math.random(), 1.5) * pool.length);
  spawnEnemy(pool[idx]);
}

/* ============================================================
   Boss
   ============================================================ */
// 12 关反派（对应暗黑剧情），每关不同造型 type
// scale = 体型系数（越靠后越庞大，最后一两关明显更具压迫感）
const BOSS_TYPES = [
  { name:'教团·侦察队长', type:'interceptor', color:'#ff6b7a', scale:0.86 },  // 第1关 轻型拦截机
  { name:'教团·前锋官',   type:'striker',     color:'#ff8a3c', scale:0.92 },  // 第2关 攻击机
  { name:'幽灵舰队·指挥官', type:'phantom',    color:'#b06bff', scale:0.98 },  // 第3关 隐形战机
  { name:'内鬼·通讯官',   type:'stealth',     color:'#5ad8ff', scale:1.00 },  // 第4关 电子战机
  { name:'联邦·上校',     type:'heavyFighter', color:'#ff5d5d', scale:1.04 },  // 第5关 重型战斗机
  { name:'叛徒·上校座机', type:'ace',         color:'#ffd08a', scale:1.06 },  // 第6关 王牌座机
  { name:'虚空教团·主教', type:'dreadnought', color:'#c77bff', scale:1.12 },  // 第7关 无畏舰
  { name:'教团·审判官',   type:'cruiser',     color:'#ff4d8f', scale:1.14 },  // 第8关 巡洋舰
  { name:'禁忌兵器·守卫', type:'titan',       color:'#ff9a3c', scale:1.20 },  // 第9关 泰坦机甲
  { name:'联邦·元帅',     type:'flagship',    color:'#35e0ff', scale:1.24 },  // 第10关 旗舰
  { name:'湮灭巨舰',      type:'doomShip',    color:'#ff3c3c', scale:1.34 },  // 第11关 湮灭巨舰
  { name:'终局·虚空核心', type:'voidCore',    color:'#e0a3ff', scale:1.32 },  // 第12关 虚空核心
];

function spawnBoss() {
  // —— Boss 血量曲线 ——
  // 基准由"实战 DPS 实测"反推：第 1 关约 30 秒能打死，之后逐关拉长，
  // 第 10~12 关明显更久（终局要打出艰难感）。
  // 再做一次战力归一化（当前战力 vs 该关预期战力），避免满配两秒秒杀、新号磨十分钟。
  const bw = Math.min(wave, 12);
  // 注意：以下是「理论站桩输出」（TTK 测试：玩家无敌、Boss 不开火、全程贴脸）下的血量。
  // 真实玩家要躲弹幕、会失误，体感时长 ≈ TTK 的 2~2.5 倍，故标定时以 TTK 为准，
  // 例如第 1 关 TTK 9.4s ↔ 玩家实际体感约 20~30s（对应"第一关 30 秒左右"的要求）。
  let hpBase = 75 + 46*(bw-1) + 6.0*Math.pow(bw-1, 3.4);
  // 无尽模式：12 波之后继续增长（原为 +260/波 的线性，涨不过玩家养成 → 后期越打越轻松）
  if (wave > 12) hpBase += (wave - 12) * 260 + 60 * Math.pow(wave - 12, 2);
  // 「预期战力」曲线 = 玩家打到第 N 关时该有的养成水平。
  // 旧公式（纯平方）在第 6 关只给到 2.08，而实际中配战力已 ≈5.7 → 归一化把中配 Boss 血量
  // 顶到 2.27 倍，这是"中配卡死在中期"的主因。改成 平方 + 线性 后第 6 关预期 ≈6.0。
  const expectedPower = 0.06*(bw-1)*(bw-1) + 0.9*(bw-1);
  const hpMul = clamp((1 + combatPower()) / (1 + expectedPower), 0.5, 3.2);   // 上限 2.5 → 3.2
  // 每日挑战是速通局（单波 12 秒 + 击破首领即结算），首领血量按比例下调，保证一把 40 秒内
  const dailyScale = (mode === MODE.DAILY) ? 0.72 : 1;
  const hp = Math.round(hpBase * hpMul * diffEnemyMul() * dailyScale);
  // 高关卡解锁额外机制；概率与数量随关卡渐进（详见 bossAttack 末尾注释）
  const extraMode = wave >= 6;   // 第6关起解锁"旋转激光阵"
  const doublePhase = wave >= 9; // 第9关起解锁"弹幕翻倍"
  const extraChance = extraMode   ? Math.min(0.50, 0.14 + (wave-6)*0.06) : 0;  // 第6关 14% → 第12关 50%
  const dblChance   = doublePhase ? Math.min(0.50, 0.16 + (wave-9)*0.08) : 0;  // 第9关 16% → 第12关 40%
  // Boss 造型：每日挑战用专属反派，否则每关对应不同反派（无限模式循环使用）
  let bi;
  if (mode === MODE.DAILY && dailyChallenge) {
    bi = dailyChallenge.bossType;
  } else {
    bi = BOSS_TYPES[Math.min(wave,12)-1] || BOSS_TYPES[11];
  }
  // 体型：随关卡增大，并按该 Boss 的体型系数放大（第 11/12 关明显更庞大）
  const r = Math.round((46 + Math.min(wave,12)*2.6) * (bi.scale || 1));
  bossRef = { x:W/2, y:-90, r, hp, maxHp:hp, phase:1, phaseTimer:0, atkCd:1.0, atkMode:0, enter:true,
    name:bi.name, bossType:bi.type, color:bi.color, extraMode, doublePhase, extraChance, dblChance };
  Sfx.bossWarn();
  $('bossName').textContent = bossRef.name;
  // 血条在 Boss 入场完成后才显示（bossUpdate 里 enter 结束再 remove hidden）
  updateBossBar();
}

function updateBossBar() {
  const p = clamp(bossRef.hp/bossRef.maxHp, 0, 1);
  $('bossFill').style.width = (p*100)+'%';
}

function bossAttack() {
  const b = bossRef;
  if (b.atkCd > 0) return;
  const easy = wave === 1;      // 第一关削弱
  const m = easy ? 0.75 : 1;    // 第一关弹幕速度系数
  if (b.phase === 1) {
    b.atkMode = (b.atkMode+1)%3;
    if (b.atkMode===0) {
      const n=easy?14:22; for(let i=0;i<n;i++){const a=(i/n)*Math.PI*2+b.phaseTimer; eBullets.push({x:b.x,y:b.y,vx:Math.cos(a)*160*m,vy:Math.sin(a)*160*m,r:5,color:'#ff7a5d',atk:14});} b.atkCd=easy?1.8:1.4;
    } else if (b.atkMode===1) {
      const base=Math.atan2(player.y-b.y,player.x-b.x); const n=easy?5:7;
      for(let i=0;i<n;i++){const a=base+(i-(n-1)/2)*0.18; eBullets.push({x:b.x,y:b.y,vx:Math.cos(a)*220*m,vy:Math.sin(a)*220*m,r:5,color:'#ffb84d',atk:14});} b.atkCd=easy?1.5:1.1;
    } else {
      for(let k=0;k<(easy?2:3);k++){const a=Math.atan2(player.y-b.y,player.x-b.x)+rnd(-0.1,0.1); eBullets.push({x:b.x,y:b.y,vx:Math.cos(a)*330*m,vy:Math.sin(a)*330*m,r:6,color:'#ff5d5d',atk:16});} b.atkCd=easy?1.3:0.9;
    }
  } else if (b.phase === 2) {
    b.atkMode = (b.atkMode+1)%3;
    if (b.atkMode===0) {
      const n=easy?22:32; for(let i=0;i<n;i++){const a=(i/n)*Math.PI*2+b.phaseTimer*1.5; eBullets.push({x:b.x,y:b.y,vx:Math.cos(a)*180*m,vy:Math.sin(a)*180*m,r:5,color:'#ff7a5d',atk:14});} b.atkCd=easy?1.6:1.2;
    } else if (b.atkMode===1) {
      const n=easy?18:26; for(let i=0;i<n;i++){const a=(i/n)*Math.PI*2; const off=Math.sin(b.phaseTimer*3+i*0.5)*0.3; eBullets.push({x:b.x,y:b.y,vx:Math.cos(a+off)*200*m,vy:Math.sin(a+off)*200*m,r:4,color:'#c77bff',atk:14});} b.atkCd=easy?1.4:1.0;
    } else {
      // 原追踪弹改为高速扇形弹（不追踪）
      const base=Math.atan2(player.y-b.y,player.x-b.x); const n=easy?5:7;
      for(let k=0;k<n;k++){const a=base+(k-(n-1)/2)*0.16; eBullets.push({x:b.x,y:b.y,vx:Math.cos(a)*260*m,vy:Math.sin(a)*260*m,r:6,color:'#ff9a3c',atk:18});} b.atkCd=easy?1.7:1.3;
    }
  } else {
    b.atkMode = (b.atkMode+1)%2;
    if (b.atkMode===0) {
      const n=easy?24:34; for(let i=0;i<n;i++){const a=(i/n)*Math.PI*2; eBullets.push({x:b.x,y:b.y,vx:Math.cos(a)*210*m,vy:Math.sin(a)*210*m,r:5,color:'#ff5d5d',atk:16}); eBullets.push({x:b.x,y:b.y,vx:Math.cos(a+b.phaseTimer)*170*m,vy:Math.sin(a+b.phaseTimer)*170*m,r:4,color:'#ffb84d',atk:16});} b.atkCd=easy?1.5:1.15;
    } else {
      const n=easy?14:18; const base=Math.atan2(player.y-b.y,player.x-b.x);
      for(let i=0;i<n;i++){const a=base+(i-(n-1)/2)*0.14; eBullets.push({x:b.x,y:b.y,vx:Math.cos(a)*290*m,vy:Math.sin(a)*290*m,r:5,color:'#ff7a5d',atk:16});}
      // 原追踪弹改为扩散弹（不追踪）
      for(let k=0;k<(easy?2:3);k++){const a=Math.atan2(player.y-b.y,player.x-b.x)+rnd(-0.35,0.35); eBullets.push({x:b.x,y:b.y,vx:Math.cos(a)*250*m,vy:Math.sin(a)*250*m,r:6,color:'#ff9a3c',atk:18});}
      b.atkCd=easy?1.3:1.0;
    }
  }
  // 额外弹幕机制（两者【互斥】触发：同一轮只出一个，防止第 9 关起单轮弹幕爆量）
  // 概率与数量都随关卡渐进，避免"第 6 关解锁 / 第 9 关再解锁"两次台阶式跳变。
  const extraRoll = Math.random();
  if (b.extraMode && extraRoll < (b.extraChance||0)) {
    // 旋转激光阵：数量随关卡渐进 6 → 14 发
    const n = 6 + Math.min(8, Math.max(0, wave - 6));
    for(let i=0;i<n;i++){const a=(i/n)*6.28 + b.phaseTimer*1.2; eBullets.push({x:b.x,y:b.y,vx:Math.cos(a)*150,vy:Math.sin(a)*150,r:4,color:'#35e0ff',atk:15});}
  } else if (b.doublePhase && extraRoll < (b.extraChance||0) + (b.dblChance||0)) {
    // 弹幕翻倍：数量随关卡渐进 5 → 11 发
    const n = 5 + Math.min(6, Math.max(0, wave - 9));
    for(let i=0;i<n;i++){const a=(i/n)*6.28 + rnd(-0.2,0.2); eBullets.push({x:b.x,y:b.y,vx:Math.cos(a)*180,vy:Math.sin(a)*180,r:4,color:'#b06bff',atk:15});}
  }
}

function bossUpdate(dt) {
  const b = bossRef;
  // 停留高度按"贴图实际半高"算：AI 立绘里有超长舰（无畏舰/旗舰），
  // 若只按碰撞半径 b.r 算，机体会有一大截停在屏幕外
  const bb = bossBox(b.r, b.bossType);
  const enterY = Math.max(H*0.18, bb.h/2 + 8);
  if (b.enter) {
    b.y += 55*dt;
    if (b.y >= enterY) { b.enter=false; b.atkCd=1.0; $('bossBar').classList.remove('hidden'); }
    return;
  }
  b.x += Math.sin(gameTime*1.1)*70*dt;
  b.x = clamp(b.x, b.r, W-b.r);
  b.phaseTimer += dt;
  b.atkCd -= dt;
  const ratio = b.hp/b.maxHp;
  if (ratio < 0.33) b.phase = 3; else if (ratio < 0.66) b.phase = 2;
  bossAttack();
}

function killBoss() {
  Sfx.bossDie();
  spawnParticles(bossRef.x, bossRef.y, '#ffd08a', 140, 420);
  shake=22; flashTimer=0.4;
  score += 500 + wave*80;
  $('bossBar').classList.add('hidden');
  bossRef = null;
  nextWavePending = 1.2;
  pickups.push({ x:W/2, y:H*0.4, type:'weapon', vy:60 });
  // Boss 必掉金币（大额）—— 仅闯关/每日挑战掉金币
  if (mode === MODE.CAMPAIGN || mode === MODE.DAILY) {
    const goldVal = 20 + wave*10;
    pickups.push({ x:W/2-30, y:H*0.4, type:'gold', vy:60, val: goldVal });
    pickups.push({ x:W/2+30, y:H*0.4, type:'gold', vy:60, val: goldVal });
  }
}

function killEnemy(e) {
  const i = enemies.indexOf(e);
  if (i>=0) enemies.splice(i,1);
  kills++; score += e.score;
  Sfx.explode();
  spawnParticles(e.x, e.y, e.color, 16, 200);
  // 分裂者：死亡后分裂出两个小侦察兵
  if (e.split) {
    for (const dx of [-1, 1]) {
      enemies.push({ type:'scout', x:clamp(e.x+dx*14, 20, W-20), y:e.y, hp:1, maxHp:1, r:9,
        score:8, color:'#8affc1', speed:160, wob:rnd(0,6.28), slowT:0, atk:8 });
    }
  }
  // 金币掉落：击毁敌方战机有概率掉落金币（临时掉落，本局结算），受驾驶员等级加成
  // 仅闯关/每日挑战掉金币，无限/练习模式不掉；每日挑战"补给争夺"加成掉落率、"赏金猎杀"加成金币量；难度越高掉越多
  const dropRate = (mode===MODE.DAILY && dailyChallenge) ? (0.35 + levelDropBonus()) * dailyDropMul : 0.35 + levelDropBonus();
  if ((mode === MODE.CAMPAIGN || mode === MODE.DAILY) && Math.random() < dropRate) {
    const goldVal = Math.round(((rnd(2,6)|0) + Math.floor(wave*0.5)) * dailyGoldMul * diffRewardMul());
    pickups.push({ x:e.x, y:e.y, type:'gold', vy:80, val: goldVal });
  }
  // 临时强化掉落（本局生效，局末还原）
  if (Math.random() < 0.08 + levelDropBonus()*0.5 && loadout.length < 6) {
    pickups.push({ x:e.x, y:e.y, type:'weapon', vy:80 });
  } else if (Math.random() < 0.06 + levelDropBonus()*0.4) {
    pickups.push({ x:e.x, y:e.y, type:'enchant', vy:80 });
  } else if (Math.random() < (player.hp < player.maxHp*0.6 ? 0.055 : 0.012) + levelDropBonus()*0.4) {
    // 修理掉落加「血量门控」：满血时几乎不掉，掉到 60% 以下才正常掉
    //（原先恒 5% 掉率，长局里满地修理 → 血量等于没有上限）
    pickups.push({ x:e.x, y:e.y, type:'repair', vy:80 });
  } else if (Math.random() < 0.04 + levelDropBonus()*0.3) {
    pickups.push({ x:e.x, y:e.y, type:'buff', vy:80 });
  }
}

/* ============================================================
   粒子
   ============================================================ */
function spawnParticles(x,y,color,n,speed=160) {
  for(let i=0;i<n;i++){const a=rnd(0,6.28),s=rnd(speed*0.3,speed); particles.push({x,y,vx:Math.cos(a)*s,vy:Math.sin(a)*s,life:rnd(0.2,0.6),maxLife:0.6,color,size:rnd(1.5,3.5)});}
}

/* ============================================================
   主循环
   ============================================================ */
let last = performance.now();
// 运行异常兜底：单帧出错不再让主循环直接死掉（否则画面会永远停在黑屏），
// 并把第一条错误显示在屏幕上，方便定位
let errShown = false;
function reportRuntimeError(e) {
  console.error('[星射] 运行异常：', e);
  if (errShown) return;
  errShown = true;
  try {
    const d = document.createElement('div');
    d.style.cssText = 'position:fixed;left:8px;bottom:8px;z-index:999;max-width:70vw;padding:6px 10px;' +
      'border-radius:6px;background:rgba(120,20,20,.88);color:#fff;font:12px/1.5 monospace;white-space:pre-wrap;';
    d.textContent = '运行异常：' + ((e && e.message) ? e.message : e);
    document.body.appendChild(d);
  } catch (_) {}
}
function loop(now) {
  const dt = Math.min((now-last)/1000, 0.05);
  last = now;
  // 尺寸自愈：内嵌浏览器有时根本不派发 resize 事件，逐帧比对一次，代价可忽略
  if (window.innerWidth > 40 && window.innerHeight > 40 &&
      (window.innerWidth !== appliedW || window.innerHeight !== appliedH)) resize();
  try { update(dt); } catch (e) { reportRuntimeError(e); }
  try { draw(); }     catch (e) { reportRuntimeError(e); }
  requestAnimationFrame(loop);
}

const ACTIVE_MODES = [MODE.CAMPAIGN, MODE.ENDLESS, MODE.PRACTICE, MODE.DAILY];

function update(dt) {
  gameTime += dt;
  for (const s of stars) { s.y += s.sp*dt; if (s.y>H){s.y=-5;s.x=rnd(0,W);} }
  bgTick(dt);   // 背景换场：模式切换 / 战役推进时交叉淡入新场景
  updateArsenalBtn();     // HUD 调参快捷钮显隐（仅练习模式）
  updateRunProgress();    // 底部推进条 / 无尽提示（非战斗模式自动隐藏）
  // 累计游玩时长（只算战斗时间；每 5 秒落盘一次，避免频繁写 localStorage）
  if (ACTIVE_MODES.includes(mode)) {
    save.playTime = (save.playTime || 0) + dt;
    playTimeFlush += dt;
    if (playTimeFlush >= 5) { playTimeFlush = 0; saveStore(); }
  }
  if (!ACTIVE_MODES.includes(mode)) return;

  if (player.invuln>0) player.invuln -= dt;
  if (player.slow>0) player.slow -= dt;
  player.fireCd -= dt;
  // 射速受机型/升级影响：基础0.5s / rate系数
  if (player.fireCd <= 0) { player.fireCd = 0.5 / (player.rate || 1); fireWeapons(); }

  // 我方子弹
  for (let i=bullets.length-1;i>=0;i--) {
    const b = bullets[i];
    b.life += dt;
    if (b.track) {
      let tgt=null, md=1e9;
      for (const e of enemies) { const d=dist(b.x,b.y,e.x,e.y); if(d<md){md=d;tgt=e;} }
      if (!tgt && bossRef) tgt = bossRef;
      if (tgt) {
        const a=Math.atan2(tgt.y-b.y,tgt.x-b.x), cur=Math.atan2(b.vy,b.vx);
        let diff=a-cur; while(diff>Math.PI)diff-=6.28; while(diff<-Math.PI)diff+=6.28;
        const na=cur+clamp(diff,-4*dt,4*dt), sp=Math.hypot(b.vx,b.vy);
        b.vx=Math.cos(na)*sp; b.vy=Math.sin(na)*sp;
      }
    }
    b.x += b.vx*dt; b.y += b.vy*dt;
    if (b.y<-40 || b.x<-40 || b.x>W+40 || b.y>H+40) { bullets.splice(i,1); continue; }
    let removed=false;
    for (const e of enemies) {
      if (dist(b.x,b.y,e.x,e.y) < e.r+b.r && !b.hit.has(e)) {
        b.hit.add(e);
        applyHit(e, b);
        if (!b.pierce) { bullets.splice(i,1); removed=true; break; }
        // 穿透：结算剩余穿透次数。此前 pierceCount 只存不读，任何等级都是「无限穿透」，
        // 现在 Lv1 只能穿 2 只、Lv5 穿 6 只，等级真正起作用。
        if (b.remaining != null && b.remaining > 0) {
          b.remaining--;
          if (b.remaining <= 0) { bullets.splice(i,1); removed=true; break; }
        }
        // 穿透：在贯穿接触点炸出"贯穿十字 + 能量环"，让"一枪打穿一排"看得见
        //（数量上限保护：激光/等离子每发都能穿多只，不加限会瞬时堆出上千特效）
        if (effects.length < 70) effects.push({ type:'pierce', x:e.x, y:e.y, r:e.r, ang:Math.atan2(b.vy,b.vx), life:0.26 });
        if (enchantLevels.pierce>0) Sfx.pierce();   // 穿透附魔：子弹穿过敌人的轻微嗖声（激光/等离子自带穿透不响）
      }
    }
    if (removed) continue;
    if (bossRef && dist(b.x,b.y,bossRef.x,bossRef.y) < bossRef.r+b.r && !b.hit.has(bossRef)) {
      b.hit.add(bossRef);
      bossRef.hp -= b.dmg;
      updateBossBar();
      Sfx.bossHit();
      spawnParticles(b.x,b.y,'#ffd08a',4,120);
      if (bossRef.hp<=0) killBoss();
      if (!b.pierce) { bullets.splice(i,1); continue; }
      // 打 Boss 同样消耗穿透次数（否则穿甲弹打 Boss 可以无限刮）
      if (b.remaining != null && b.remaining > 0) {
        b.remaining--;
        if (b.remaining <= 0) { bullets.splice(i,1); continue; }
      }
    }
  }

  // 敌方子弹
  for (let i=eBullets.length-1;i>=0;i--) {
    const b = eBullets[i];
    if (b.track) {
      const a=Math.atan2(player.y-b.y,player.x-b.x), cur=Math.atan2(b.vy,b.vx);
      let diff=a-cur; while(diff>Math.PI)diff-=6.28; while(diff<-Math.PI)diff+=6.28;
      const na=cur+clamp(diff,-2*dt,2*dt), sp=Math.hypot(b.vx,b.vy);
      b.vx=Math.cos(na)*sp; b.vy=Math.sin(na)*sp;
    }
    b.x+=b.vx*dt; b.y+=b.vy*dt;
    if (b.y<-40||b.y>H+40||b.x<-40||b.x>W+40){eBullets.splice(i,1);continue;}
    if (mode!==MODE.PRACTICE && player.invuln<=0 && dist(b.x,b.y,player.x,player.y)<PL_HIT_R+b.r) {
      eBullets.splice(i,1); hurtPlayer(b.atk || 10);
    }
  }

  // 敌人
  for (let i=enemies.length-1;i>=0;i--) {
    const e = enemies[i];
    e.wob += dt*3;
    const spd = e.slowT>0 ? e.speed*0.4 : e.speed;
    if (e.slowT>0) e.slowT-=dt;
    // 环绕者：横向蛇形 + 持续向玩家侧移
    if (e.orbit) {
      e.orbitAng += dt*4;
      e.x += Math.sin(e.orbitAng)*90*dt;
      e.x += (player.x - e.x) * 0.6 * dt;
      e.y += spd*dt;
    } else {
      e.x += Math.sin(e.wob)*22*dt;
      e.y += spd*dt;
    }
    // 冲撞者：加速冲向玩家
    if (e.ram) {
      const a = Math.atan2(player.y-e.y, player.x-e.x);
      e.x += Math.cos(a)*180*dt;
      e.y += Math.sin(a)*180*dt;
    }
    // 狙击手：瞄准后高速射击
    if (e.sniper) {
      e.aimT -= dt;
      if (e.aimT<=0 && e.y>0 && e.y<H*0.7) {
        e.aimT = rnd(1.6,2.6);
        const a = Math.atan2(player.y-e.y, player.x-e.x);
        for (let k=0;k<3;k++) {
          eBullets.push({x:e.x,y:e.y,vx:Math.cos(a+(k-1)*0.08)*340,vy:Math.sin(a+(k-1)*0.08)*340,r:4,color:'#ffd08a',atk:e.atk});
        }
      }
    }
    if (e.fire) {
      e.fireCd -= dt;
      if (e.fireCd<=0 && e.y>0 && e.y<H*0.6) {
        e.fireCd = rnd(1.6,3);
        if (e.radial) {
          const n=8; for(let k=0;k<n;k++){const a=(k/n)*6.28; eBullets.push({x:e.x,y:e.y,vx:Math.cos(a)*170,vy:Math.sin(a)*170,r:4,color:'#ff4d8f',atk:e.atk});}
        } else {
          const a=Math.atan2(player.y-e.y,player.x-e.x);
          eBullets.push({x:e.x,y:e.y,vx:Math.cos(a)*200,vy:Math.sin(a)*200,r:4.5,color:'#c77bff',atk:e.atk});
        }
      }
    }
    if (mode!==MODE.PRACTICE && player.invuln<=0 && dist(e.x,e.y,player.x,player.y)<e.r+PL_R) {
      // 冲撞者撞击伤害更高
      const dmg = e.ram ? e.atk : (e.atk || 12);
      enemies.splice(i,1); hurtPlayer(dmg); continue;
    }
    if (e.y>H+40) enemies.splice(i,1);
  }

  if (bossRef) bossUpdate(dt);

  // 掉落
  for (let i=pickups.length-1;i>=0;i--) {
    const p = pickups[i];
    p.y += p.vy*dt;
    if (dist(p.x,p.y,player.x,player.y)<PL_R+12) {
      if (p.type==='weapon') { gainWeapon(); Sfx.weapon(); }
      else if (p.type==='gold') { alloyGain += p.val; Sfx.pickup(); toast('+' + p.val + ' 金币', '局末结算'); }
      else if (p.type==='enchant') { gainEnchant(); Sfx.weapon(); }
      else if (p.type==='buff') { gainBuff(); Sfx.weapon(); }
      else if (p.type==='repair') { player.hp = Math.min(player.maxHp, player.hp+15); Sfx.pickup(); }
      pickups.splice(i,1);
    } else if (p.y>H+30) pickups.splice(i,1);
  }

  updateWaves(dt);

  for (let i=particles.length-1;i>=0;i--) { const p=particles[i]; p.x+=p.vx*dt;p.y+=p.vy*dt;p.life-=dt; if(p.life<=0)particles.splice(i,1); }
  // 清理特效（连锁闪电/爆炸），否则线条会永久残留
  for (let i=effects.length-1;i>=0;i--) { effects[i].life -= dt; if (effects[i].life<=0) effects.splice(i,1); }
  if (flashTimer>0) flashTimer-=dt;
  if (hurtFlash>0) hurtFlash=Math.max(0, hurtFlash-dt*3.2);
  if (shake>0) shake=Math.max(0,shake-60*dt);

  updateHud();
}

// 吸血内置冷却：附魔按「每次命中」回血，而玩家子弹数随武器等级暴涨（群怪场景 67 次命中/秒），
// 若每次都回血，Lv1 就能回 33.6 HP/s（满血才 100），5 级直接 201.8 HP/s = 每秒回 2 倍血。
// 加 0.25s 冷却把「子弹数量」这个乘数彻底去掉，回血速率只由附魔等级决定（Lv1 2.6 / Lv5 6.6 HP/s）。
let lsLast = -9;

function applyHit(e, b) {
  // 护盾者：优先扣护盾，护盾未破前不扣本体血
  if (e.shield && e.shieldHp > 0) {
    e.shieldHp -= b.dmg;
    Sfx.hit();
    spawnParticles(e.x, e.y, '#5ad8ff', 4, 120);
    if (e.shieldHp <= 0) { e.shield = false; toast('护盾击破', '敌机护盾被摧毁'); }
    else return;
  }
  e.hp -= b.dmg;
  Sfx.hit();   // 命中反馈：金属弹着（之前只有护盾分支有，普通命中一直没声音）
  spawnParticles(e.x, e.y, e.color, 3, 90);
  if (enchantLevels.chain>0) {
    Sfx.chain();   // 连锁附魔生效：命中即响雷电声（不再要求附近必须有第二敌人）
    // 连锁等级此前完全无效（半径恒 120px、伤害恒 dmg*0.5，Lv1=Lv5）。
    // 现在两项都随等级成长；数值经过靶场实测校准，Lv5 增益不与爆炸（+462%）失衡。
    const cRad  = 90 + 20*enchantLevels.chain;            // 半径 Lv1 110px → Lv5 190px
    const cDmg  = b.dmg * (0.22 + 0.06*enchantLevels.chain);  // 传导伤害 Lv1 0.28 → Lv5 0.52 倍
    for (const other of enemies) {
      if (other===e) continue;
      if (dist(e.x,e.y,other.x,other.y) < cRad) {
        other.hp -= cDmg;
        // 存快照坐标，避免引用已被击杀移除的敌人对象导致线条残留
        // 数量上限：每次开火都会对 120px 内每只敌人推一条电弧，不加限会瞬间堆到几百条互相叠白
        if (effects.length < 46) effects.push({ x:other.x, y:other.y, type:'chain', life:0.3, from:{x:e.x, y:e.y} });
      }
    }
  }
  if (enchantLevels.slow>0) e.slowT = 1.5 + enchantLevels.slow*0.5;
  if (enchantLevels.blast>0) {
    const r = 60 + enchantLevels.blast*20;
    if (effects.length < 46) effects.push({ x:e.x, y:e.y, type:'blast', life:0.4, r });
    Sfx.blast();   // 爆炸附魔生效：命中即响爆炸声
    for (const other of enemies) {
      if (other!==e && dist(e.x,e.y,other.x,other.y)<r) other.hp -= b.dmg*0.6;
    }
  }
  if (enchantLevels.lifesteal>0 && Math.abs(gameTime - lsLast) >= 0.25) {
    lsLast = gameTime;
    const heal = 0.4 + 0.25*enchantLevels.lifesteal;   // Lv1 0.65 → Lv5 1.65（冷却 0.25s，每秒最多 4 次）
    player.hp = Math.min(player.maxHp, player.hp + heal);
  }
  if (e.hp<=0) killEnemy(e);
}

function gainWeapon() {
  const owned = new Set(loadout.map(w=>w.type));
  const available = Object.keys(WEAPON_TYPES).filter(t=>!owned.has(t));
  if (available.length>0) {
    const t = available[Math.floor(Math.random()*available.length)];
    loadout.push({ type:t, level:1 });
    toast('获得武器', WEAPON_TYPES[t].name);
  } else {
    const w = loadout[Math.floor(Math.random()*loadout.length)];
    w.level = Math.min(6, w.level+1);
    toast('武器升级', WEAPON_TYPES[w.type].name + ' Lv' + w.level);
  }
}

// 局内临时获得附魔（本局生效，结束还原）
function gainEnchant() {
  const keys = Object.keys(enchantLevels);
  const k = keys[Math.floor(Math.random()*keys.length)];
  enchantLevels[k] = (enchantLevels[k]||0) + 1;
  toast('附魔·' + ENCHANT[k].name, '本局临时生效');
}

// 局内临时属性强化（本局生效，结束还原）
function gainBuff() {
  const r = Math.random();
  if (r < 0.34) { player.atk += 5; toast('火力强化', '本局攻击力 +5'); }
  else if (r < 0.67) { player.armor += 8; toast('护甲强化', '本局护甲 +8'); }
  else { player.maxHp += 20; player.hp += 20; toast('装甲强化', '本局血量上限 +20'); }
}

/* ---------- 主角战力评估：越强 → 小兵越密（击毁/打击/附魔音效可持续不断） ---------- */
function combatPower() {
  let p = Math.max(0, (save.playerLevel - 1)) * 0.35;   // 驾驶员永久等级
  let wsum = 0;
  for (const w of loadout) wsum += (w.level || 1);       // 局内武器等级总和（含商店等级）
  p += Math.max(0, wsum - 1) * 0.22;
  let esum = 0;
  for (const k in enchantLevels) esum += (enchantLevels[k] || 0);   // 局内附魔总等级
  p += esum * 0.3;
  p += (wingmanLevel || 0) * 0.4;                        // 僚机
  return Math.max(0, p);
}

// 敌机「战力补偿」系数：让敌机的质量也随玩家养成成长。
// 原先敌机血量只看波次（1+wave*0.12）和难度，完全不看战力；玩家 DPS 从新号到满配涨约 32 倍，
// 而出怪频率上限仅 2.4 倍 → 满配一路横扫。这里给小兵血量也挂上战力系数（新号 ×1 → 满配 ×3）。
// 注意：补偿从战力 8 才起算 —— AI 实战实测低战力段本来就难（新号连第 1 关都过不去），
// 若从 0 起算会把中配一起打死，实测中配第 6 关从"撑 63 秒"直接掉到"9.7 秒阵亡"。
function enemyPowerMul() { return 1 + Math.min(1.6, Math.max(0, combatPower() - 8) * 0.09); }

function updateWaves(dt) {
  const power = combatPower();
  // 战力越高 → 小兵生成更快、场上允许更多（有上限，避免变成弹幕地狱）
  // 数量补偿同样从战力 6 起算：低战力段保持原样，只压制"满配后出怪清不干净"的碾压
  const densityMul = 1 + Math.min(1.4, Math.max(0, power - 6) * 0.07);   // 最多约 2.4 倍（低战力段为 1 倍）
  const squadCap = 12 + Math.floor(Math.min(16, Math.max(0, power - 6) * 0.9));   // 12 → 28
  // 一次生成几只：战力上去后有概率成批涌出，形成"小兵潮"
  const rollBurst = () => {
    let burst = 1;
    if (enemies.length + 3 < squadCap && power >= 4) {
      if (Math.random() < Math.min(0.6, power * 0.035)) burst++;
      if (power >= 10 && Math.random() < 0.3) burst++;
    }
    return burst;
  };
  if ([MODE.CAMPAIGN, MODE.ENDLESS, MODE.DAILY].includes(mode)) {
    if (nextWavePending>0) {
      nextWavePending -= dt;
      if (nextWavePending<=0) nextWave();
    }
    waveTimer += dt;
    // 每日挑战是「一把打完」的速通局（见 nextWave）：单波压到 12 秒，保证总时长 40 秒内
    const waveLength = (mode === MODE.DAILY) ? DAILY_WAVE_LEN : (20 + wave*3);
    threat = 1 + wave*0.35;
    if (!bossRef && nextWavePending<=0) {
      if (waveTimer > waveLength) spawnBoss();
      else {
        spawnTimer -= dt;
        if (spawnTimer<=0) {
          const burst = rollBurst();
          for (let i=0;i<burst;i++) spawnWaveEnemy();
          spawnTimer = Math.max(0.22, 1.2 - wave*0.05) * rnd(0.7,1.3) / densityMul;
        }
      }
    } else if (bossRef) {
      spawnTimer -= dt;
      if (spawnTimer<=0) {
        if (enemies.length < squadCap) { const burst = Math.min(rollBurst(), squadCap - enemies.length); for (let i=0;i<burst;i++) spawnWaveEnemy(); }
        spawnTimer = rnd(2.5,4) / densityMul;
      }
    }
  } else if (mode===MODE.PRACTICE) {
    // 练习模式：难度随时间推移递增 —— 每 25 秒提升一个强度档（1 → 12 档封顶）。
    // 直接写 wave，敌方出怪池、血量/攻击的 wave 缩放就全部跟着走，和关卡内的感受一致。
    const tw = Math.min(12, 1 + Math.floor(gameTime / 25));
    if (tw !== wave) {
      wave = tw; waveTimer = 0;
      $('waveLabel').textContent = '强度 ' + wave;   // 练习模式不叫"关"，叫强度档
      toast('强度提升', '已进入第 ' + wave + ' 档 · 敌军更凶了');
    }
    spawnTimer -= dt;
    if (spawnTimer<=0) {
      const burst = rollBurst();
      for (let i=0;i<burst;i++) spawnWaveEnemy();
      // 出怪速度同时随强度档与战力加快（上限约 2.5 倍）
      spawnTimer = rnd(0.4,1) / ((1 + Math.min(0.8, power * 0.06)) * (1 + (wave-1)*0.08));
    }
  }
}

function nextWave() {
  wave++;
  waveTimer=0; spawnTimer=1;
  Sfx.wave();
  $('waveLabel').textContent = '第 ' + wave + ' 关';
  player.hp = Math.min(player.maxHp, player.hp + 20);
  spawnParticles(player.x,player.y,'#8fd0ff',30,220);
  if (mode===MODE.CAMPAIGN) {
    // 战役：每打完一关 Boss 即为一局结束 → 结算并回主菜单
    const ratio = player.hp / player.maxHp;
    const stars = ratio>=0.9 ? 3 : (ratio>=0.5 ? 2 : 1);
    save.stars[wave-1] = stars;
    save.unlocked = Math.max(save.unlocked, Math.min(12, wave));
    finishRun(true);   // 通关结算（回主菜单）
  } else if (mode===MODE.DAILY) {
    // 每日挑战：一把速通 —— 击破本场首领即结算（原逻辑会无休止地循环下去，不存在"打完一把"）
    finishRun(true);
  } else {
    // 无尽/日常：每关结束清空临时掉落（武器/附魔/属性），回到本局基准
    loadout = buildLoadoutFromShop();
    enchantLevels = buildEnchantFromShop();
    resetPlayerStats();
    wingmanLevel = 0;
    toast('第 '+wave+' 波', '临时强化已清空 · 生命 +20');
  }
}

// 将玩家属性重置为本局基准（清除局内临时 buff，保留当前血量比例）
function resetPlayerStats() {
  const st = shipStats(player.shipId);
  const ratio = player.hp / player.maxHp;
  player.maxHp = st.maxHp;
  player.armor = st.armor;
  player.atk = st.atk;
  player.rate = st.rate;
  player.speed = st.speed;
  player.hp = Math.min(st.maxHp, Math.round(st.maxHp * ratio));
}

// 一局结束统一结算：金币 + 磨损度 + 经验 + 存档（cleared=是否通关而非死亡）
function finishRun(cleared) {
  Sfx.stopMusic();
  const runMode = mode;   // 记录本局模式（用于失败画面"重新出击"）
  lastRunMode = runMode;
  if (score>save.best) save.best=score;
  save.kills += kills;
  // 每日挑战奖励倍率（金币/经验/磨损减免）
  const goldMul = (mode===MODE.DAILY && dailyChallenge) ? dailyGoldMul : 1;
  const expMul  = (mode===MODE.DAILY && dailyChallenge) ? dailyExpMul  : 1;
  // 难度奖励倍率（练习模式无奖励，其余模式叠加难度倍率）
  const dm = (mode===MODE.PRACTICE) ? 1 : diffRewardMul();
  const endBonus = Math.floor((score / 40 + wave * 30) * goldMul * dm);
  const alloyGold = Math.floor(alloyGain * goldMul * dm);
  const earned = alloyGold + endBonus;
  save.gold += earned;
  const wearBefore = (shipWearOf(player.shipId).hull||0);
  addWear();
  const wearAfter = (shipWearOf(player.shipId).hull||0);
  // 驾驶员经验：得分 + 波次（每日挑战可加成，难度加成）
  const expGain = Math.floor((Math.floor(score/50) + wave*3) * expMul * dm);
  const lvBefore = save.playerLevel;
  gainExp(expGain);
  const lvAfter = save.playerLevel;
  // 每日挑战完成后：只标记「这一个」挑战已完成（其他挑战当天仍可打）
  if (mode===MODE.DAILY && dailyChallenge) {
    const done = dailyDoneMap();
    done[dailyChallenge.id] = true;
    save.daily.date = dailyToday();
    save.daily.played = dailyAllDone();   // played 仅表示"今天全打通了"
  }
  saveStore();
  checkAchieve();
  // 填结算界面（wave 已递增，实际通关的是 wave-1 关）
  const clearedLevel = wave - 1;
  $('overWave').textContent = '第 '+clearedLevel+' 关';
  // 星级显示（战役模式结算，读取本关星星）
  const starN = cleared ? (save.stars[clearedLevel] || 0) : 0;
  $('overStars').innerHTML = starN>0
    ? '<span style="color:var(--gold)">'+'★'.repeat(starN)+'</span><span style="color:#3a4356">'+'☆'.repeat(3-starN)+'</span>'
    : '';
  $('overScore').textContent = score;
  $('overBest').textContent = save.best;
  $('overKills').textContent = kills;
  $('overGold').textContent = '+'+ earned;
  // 奖励明细
  const lines = [];
  if (alloyGain>0) lines.push('击落掉落金币　<span style="color:var(--gold)">+'+alloyGain+'</span>');
  if (endBonus>0) lines.push('过关奖励　<span style="color:var(--gold)">+'+endBonus+'</span>');
  if (earned<=0) lines.push('本局无金币进账');
  lines.push('驾驶员经验　<span style="color:var(--cyan)">+'+expGain+'</span>' + (lvAfter>lvBefore ? ' <span style="color:var(--green)">（升级 Lv'+lvAfter+'！）</span>' : ''));
  $('overRewards').innerHTML = lines.join('<br>');
  // 磨损提示
  $('overWear').textContent = '本局磨损：机体 ' + Math.round(wearAfter) + '%' + (wearAfter>wearBefore ? '（+'+Math.round(wearAfter-wearBefore)+'%，可在商店修复）' : '');
  // 标题
  const titleEl = $('overTitle');
  if (cleared) {
    titleEl.textContent = '关卡通关';
    titleEl.style.color = 'var(--green)';
  } else {
    titleEl.textContent = '战机被击毁';
    titleEl.style.color = 'var(--danger)';
  }
  mode = MODE.OVER;
  // 通关且该关有剧情 → 先播 CG，再显示结算；死亡 → 显示独立失败画面
  if (cleared) {
    // 剧情 CG 只属于战役主线：每日挑战是支线速通局（打完首领即结算），
    // 若不加模式判断，它会因为 clearedLevel=1 而误播"第一幕·炮灰"的主线剧情。
    if (runMode === MODE.CAMPAIGN && STORY[Math.min(clearedLevel,12)-1]) {
      playCG(clearedLevel, ()=>{ $('gameOver').classList.remove('hidden'); });
    } else {
      $('gameOver').classList.remove('hidden');
    }
  } else {
    // 失败画面：填充战损统计
    $('defeatWave').textContent = '第 '+clearedLevel+' 关';
    $('defeatScore').textContent = score;
    $('defeatKills').textContent = kills;
    $('defeatBest').textContent = save.best;
    $('defeatRewards').innerHTML = lines.join('<br>');
    $('defeatOvl').classList.remove('hidden');
  }
}

// 失败画面"重新出击"：按上一局模式重开
function restartCurrent() {
  const m = lastRunMode || MODE.CAMPAIGN;
  if (m === MODE.DAILY && dailyChallenge) startDaily();
  else if (m === MODE.ENDLESS) startEndless();
  else if (m === MODE.PRACTICE) startPractice();
  else startCampaign();
}

// 播放剧情 CG（通关后）
let cgOnDone = null;
let cgTypeTimer = null;
let cgDone = false;          // 台词是否已播完（播完后显示"点击继续"）
function playCG(level, onDone) {
  const s = STORY[Math.min(level, 12) - 1] || STORY[0];
  $('cgImg').src = s.img;
  $('cgTitle').textContent = s.title;
  // CG 同步人物卡：把本幕登场的人物（正派/反派）一起放出来，随剧情推进换人
  const castEl = $('cgCast');
  if (castEl) {
    castEl.innerHTML = '';
    const keys = STORY_CAST[Math.min(level, 12) - 1] || ['pilot'];
    for (const k of keys) {
      const info = CHAR_INFO[k] || {};
      const d = document.createElement('div');
      d.className = 'cc ' + (info.side === 'foe' ? 'foe' : 'ally');
      const src = (BG_FIG_IMG[k] && BG_FIG_IMG[k].src) || '';
      d.innerHTML = '<span class="cc-img"><img src="' + src + '" alt=""></span>' +
                    '<span class="cc-name">' + escapeHtml(info.name || '') + '</span>' +
                    '<span class="cc-role">' + escapeHtml(info.role || '') + '</span>';
      castEl.appendChild(d);
    }
  }
  cgOnDone = onDone;
  cgDone = false;
  mode = MODE.OVER;  // 暂停战斗循环
  hideAllOvl();
  $('cgHint').style.visibility = 'hidden';   // 播完前不显示提示
  $('cgOvl').classList.remove('hidden');
  Sfx.ensure(); Sfx.resume(); startBGM(MODE.CAMPAIGN, level);   // CG 配对应关卡的背景音乐
  // 台词逐字滚动出现，最后停留完整台词
  const box = $('cgText');
  box.innerHTML = '';
  const full = s.text || '';
  let i = 0;
  clearInterval(cgTypeTimer);
  cgTypeTimer = setInterval(()=>{
    i++;
    box.innerHTML = escapeHtml(full.slice(0, i)) + '<span class="typing-caret">▍</span>';
    if (i >= full.length) {
      box.innerHTML = escapeHtml(full);   // 停留完整台词
      clearInterval(cgTypeTimer); cgTypeTimer = null;
      cgDone = true;
      $('cgHint').style.visibility = 'visible';   // 播完显示提示
    }
  }, 42);
}
function escapeHtml(str){ return str.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;'); }
// 点击任意处继续（点击即跳过）
function cgContinue() {
  clearInterval(cgTypeTimer); cgTypeTimer = null;
  $('cgOvl').classList.add('hidden');
  Sfx.stopMusic();
  const f = cgOnDone; cgOnDone = null;
  if (f) f();
}
$('cgOvl').addEventListener('click', cgContinue);

function hurtPlayer(atkDmg) {
  if (mode===MODE.PRACTICE) return;
  // LOL 护甲减伤：减伤 = 护甲/(护甲+100)，伤害 = 攻击力 × (1-减伤)
  const reduction = player.armor / (player.armor + 100);
  const dmg = Math.max(1, Math.round(atkDmg * (1 - reduction)));
  player.hp -= dmg;
  player.invuln=1.2; shake=Math.max(shake,10); hurtFlash=1.0;   // 掉血 → 红色四周渐变特效
  Sfx.hurt();
  spawnParticles(player.x,player.y,'#ff5d5d',30,220);
  if (player.hp<=0) gameOver();
}

function gameOver() {
  Sfx.over();
  finishRun(false);
}

// 每局结束增加磨损度（机体 + 已使用武器），受驾驶员等级减缓
function addWear() {
  const w = shipWearOf(player.shipId);
  const reduction = 1 - levelWearReduction();   // 等级越高磨损越慢（上限50%减免）
  const dailyWear = (mode===MODE.DAILY && dailyChallenge) ? dailyWearMul : 1;  // 每日挑战磨损减免
  w.hull = Math.min(100, (w.hull||0) + (6 + wave*1.5) * reduction * dailyWear);
  for (const wp of loadout) {
    const cur = w.weapons[wp.type] || 0;
    w.weapons[wp.type] = Math.min(100, cur + (4 + wave) * reduction * dailyWear);
  }
  save.wear[player.shipId] = w;
}

/* ============================================================
   强化
   ============================================================ */
function openUpgrade() {
  mode = MODE.UPGRADE;
  $('upgradeSub').textContent = '第 '+(wave-1)+' 关完成 · 金币 '+save.gold;
  const opts = $('upgradeOpts');
  opts.innerHTML='';
  const weaponOpts = Object.keys(WEAPON_TYPES).map(t=>({ name:WEAPON_TYPES[t].name+' 强化', desc:'提升等级', fn:()=>{ upgradeWeaponType(t); } }));
  const enchantOpts = Object.keys(ENCHANT).map(e=>({ name:'附魔·'+ENCHANT[e].name, desc:ENCHANT[e].desc, fn:()=>{ enchantLevels[e]=(enchantLevels[e]||0)+1; } }));
  const otherOpts = [
    { name:'修复机体', desc:'回复 30 点生命', fn:()=>{ player.hp=Math.min(player.maxHp,player.hp+30); } },
    { name:'强化护甲', desc:'护甲 +15（减伤提升）', fn:()=>{ player.armor += 15; } },
    { name:'强化火力', desc:'攻击力 +8（子弹伤害提升）', fn:()=>{ player.atk += 8; } },
    { name:'补给弹药', desc:'炸弹 +1', fn:()=>{ player.bombs=Math.min(BOMB_MAX,player.bombs+1); } },
    { name:'升级僚机', desc:'获得/强化僚机', fn:()=>{ wingmanLevel=Math.min(3,wingmanLevel+1); } },
    { name:'解锁武器', desc:'随机获得一把新武器', fn:()=>{ gainWeapon(); } },
  ];
  const all = [...weaponOpts, ...enchantOpts, ...otherOpts];
  const chosen = [];
  const copy = [...all];
  for (let i=0;i<3 && copy.length;i++) {
    const idx = Math.floor(Math.random()*copy.length);
    chosen.push(copy.splice(idx,1)[0]);
  }
  for (const c of chosen) {
    const d = document.createElement('div');
    d.className='opt';
    d.innerHTML = '<span class="t">'+c.name+'</span><span class="d">'+c.desc+'</span>';
    d.onclick = ()=>{ c.fn(); updateHud(); updateBombHud(); $('upgradeOvl').classList.add('hidden'); mode=MODE.CAMPAIGN; };
    opts.appendChild(d);
  }
  $('upgradeOvl').classList.remove('hidden');
}

function upgradeWeaponType(t) {
  const w = loadout.find(x=>x.type===t);
  if (w) w.level = Math.min(6, w.level+1);
  else loadout.push({ type:t, level:1 });
}

/* ============================================================
   成就
   ============================================================ */
function checkAchieve() {
  for (const a of ACHIEVES) {
    if (!save.achieve[a.id] && a.check()) {
      save.achieve[a.id] = true;
      toast('🏆 成就解锁', a.name);
    }
  }
  saveStore();
}

function renderAchieve() {
  const el = $('achieveList');
  el.innerHTML='';
  for (const a of ACHIEVES) {
    const done = !!save.achieve[a.id];
    const p = a.prog ? a.prog() : (done?1:0);
    const pct = Math.round(p*100);
    const d = document.createElement('div');
    d.style.cssText = 'padding:9px 0;border-bottom:1px solid #232a36;color:'+(done?'var(--text)':'var(--dim)')+';';
    let barColor = done ? 'linear-gradient(90deg,#6ee07a,#2fa34a)' : 'linear-gradient(90deg,#4a6b8a,#2b4a6a)';
    d.innerHTML = '<div style="display:flex;justify-content:space-between;align-items:center;">'
      + '<b>'+(done?'✓ ':'')+a.name+'</b>'
      + '<span style="font-size:11px;color:'+(done?'var(--green)':'var(--muted)')+';">'+(done?'已完成':pct+'%')+'</span></div>'
      + '<div style="font-size:11px;color:var(--muted);margin:3px 0 5px;">'+a.desc+'</div>'
      + '<div style="height:8px;background:#0d1219;border:1px solid #333d4d;border-radius:5px;overflow:hidden;">'
      + '<div style="height:100%;width:'+pct+'%;background:'+barColor+';border-radius:4px;transition:width .3s;"></div></div>';
    el.appendChild(d);
  }
}

/* ============================================================
   HUD
   ============================================================ */
function updateHud() {
  $('score').textContent = score;
  $('best').textContent = save.best;
  $('gold').textContent = save.gold;
  // 左上角头像下的血条（主角生命）+ 经验条 + 等级/掉率状态
  const hpPct = clamp(player.hp / player.maxHp, 0, 1);
  const fill = $('hudHpFill');
  fill.style.width = (hpPct*100) + '%';
  // 低血量时血条变红闪烁
  fill.style.background = hpPct < 0.3
    ? 'linear-gradient(90deg,#ff3c3c,#ff6b6b)'
    : 'linear-gradient(90deg,#ff5d5d,#ff9a3c)';
  const need = expNeeded(save.playerLevel);
  const expPct = Math.min(100, Math.round(save.playerExp / need * 100));
  $('hudExpFill').style.width = expPct + '%';
  $('hudMeta').textContent = 'Lv' + save.playerLevel + ' · 掉率 +' + Math.round(levelDropBonus()*100) + '%';
  $('threatLabel').textContent = '威胁 ' + threat.toFixed(1);
  $('waveLabel').textContent = '第 ' + wave + ' 关';
  updateRunProgress();
}

/* ---------- 底部关卡推进条 / 无尽进程提示 ----------
   战役 / 每日挑战：一条真实推进度（小兵阶段占 65%，首领战占 35%）
   无尽 / 练习    ：没有终点，轨道改成循环扫光 + 「无限进程」文案
   —— 值不变时不碰 DOM（每帧调用，避免无谓重排）                       */
let rpCacheKey = '';
function updateRunProgress() {
  const el = $('runProgress');
  if (!ACTIVE_MODES.includes(mode)) {
    if (rpCacheKey !== 'off') { rpCacheKey = 'off'; el.classList.add('hidden'); }
    return;
  }
  if (el.classList.contains('hidden')) el.classList.remove('hidden');

  // 无尽 / 练习：无限进程
  if (mode === MODE.ENDLESS || mode === MODE.PRACTICE) {
    const key = 'inf|' + mode + '|' + wave;
    if (key === rpCacheKey) return;
    rpCacheKey = key;
    el.classList.add('inf');
    el.classList.remove('boss');
    $('rpLabel').textContent = '∞ 无尽进程';
    $('rpRight').textContent = (mode === MODE.PRACTICE)
      ? '自由演练 · 没有终点'
      : '第 ' + wave + ' 波 · 没有终点';
    return;
  }

  // 战役 / 每日挑战：本关（本波）推进度
  let ratio, bossPhase = !!bossRef;
  if (nextWavePending > 0)      ratio = 1;                       // 首领已清，等待下一关
  else if (bossRef)             ratio = 0.65 + 0.35 * clamp(1 - bossRef.hp / (bossRef.maxHp || 1), 0, 1);
  else                          ratio = 0.65 * clamp(waveTimer / (mode===MODE.DAILY ? DAILY_WAVE_LEN : (20 + wave * 3)), 0, 1);
  const pct = Math.round(ratio * 100);

  const base = (mode === MODE.DAILY && dailyChallenge)
    ? dailyChallenge.name + ' · 第 ' + wave + ' 波'
    : '第 ' + wave + ' 关';
  const label = bossPhase ? (base + ' · 首领战') : base;
  const key = 'bar|' + label + '|' + pct;
  if (key === rpCacheKey) return;
  rpCacheKey = key;
  el.classList.remove('inf');
  el.classList.toggle('boss', bossPhase);
  el.style.setProperty('--rp', ratio.toFixed(4));   // 战机位置
  $('rpLabel').textContent = label;
  $('rpRight').textContent = pct + '%';
  $('rpFill').style.width = pct + '%';
}

// 左上角显示每日挑战的奖励加成（仅每日挑战模式），让玩家随时看到当前增益
function updateDailyBuffHud() {
  const el = $('dailyBuff');
  if (mode === MODE.DAILY && dailyChallenge) {
    const c = dailyChallenge;
    let buffText = '';
    switch (c.rewardType) {
      case 'gold':     buffText = '💰 金币 +60%'; break;
      case 'droprate': buffText = '📦 掉落率 +40%'; break;
      case 'exp':      buffText = '🎖️ 经验 +100%'; break;
      case 'wearless': buffText = '🛡️ 磨损 -50%'; break;
      case 'both':     buffText = '💥 金币+经验 +30%'; break;
    }
    el.textContent = c.icon + ' ' + c.name + ' · ' + buffText;
    el.style.borderColor = c.color;
    el.style.color = c.color;
    el.style.background = c.color + '22';
    el.classList.remove('hidden');
  } else {
    el.classList.add('hidden');
  }
}
function updateBombHud() {
  $('bombCount').textContent = player.bombs;
}

function renderWeaponPanel() {
  const el = $('weaponList');
  el.innerHTML='';
  for (const t of Object.keys(WEAPON_TYPES)) {
    const w = loadout.find(x=>x.type===t);
    const d = document.createElement('div');
    d.style.cssText = 'padding:7px 0;border-bottom:1px solid var(--line);';
    const lv = w ? 'Lv'+w.level : '未解锁';
    d.innerHTML = '<b style="color:'+(w?WEAPON_TYPES[t].color:'var(--dim)')+'">'+WEAPON_TYPES[t].name+'</b> <span style="float:right;color:var(--muted)">'+lv+'</span>';
    el.appendChild(d);
  }
  const enc = document.createElement('div');
  enc.style.cssText='margin-top:10px;';
  enc.innerHTML = '附魔：'+Object.keys(ENCHANT).map(e=>ENCHANT[e].name+' <b style="color:'+ENCHANT[e].color+'">'+(enchantLevels[e]||0)+'</b>').join(' · ');
  el.appendChild(enc);
}

/* ---------- 练习模式自定义装备（菜单面板 & 战斗内调参面板共用一套数据） ---------- */
const MAX_PRACTICE_LV = 6;
let practiceWeaponLv = {};   // { weaponType: level }
let practiceEnchantLv = {};  // { enchantKey: level }
let practiceWingman = 0;     // 僚机数量

function openPractice() {
  // 初始化为当前商店永久等级（作为默认基准）
  practiceWeaponLv = {};
  for (const t of Object.keys(WEAPON_TYPES)) practiceWeaponLv[t] = save.weaponLevels[t] || 0;
  practiceEnchantLv = {};
  for (const k of Object.keys(ENCHANT)) practiceEnchantLv[k] = save.enchantPerm[k] || 0;
  practiceWingman = 0;
  renderEditor('menu');
  $('menu').classList.add('hidden');
  $('practiceOvl').classList.remove('hidden');
}

// 生成一行「缩略立绘 + 名称 + − 数值 ＋」
// 布局在 CSS 里（.ed-row / .ed-body / .ed-ctl）：宽面板单行，窄面板自动折两行
function editorRow(label, color, lv, key, kind, img) {
  const d = document.createElement('div');
  d.className = 'ui-item ed-row';   // 复用悬停/点击 UI 音效委托
  const on = lv > 0;
  // 常驻缩略立绘：未启用时灰度压暗，启用后描边发光（一眼看出哪些已开）
  const thumb = img
    ? '<span class="ed-thumb" style="border-color:'+(on?color:'#2b333d')+';'+(on?('box-shadow:0 0 8px '+color+'66;'):'')+'">'+
      '<img src="'+img+'" alt="" style="filter:'+(on?'saturate(1.05)':'grayscale(1) brightness(.5)')+'"></span>'
    : '';
  d.innerHTML = thumb +
    '<span class="ed-body">' +
      '<b class="ed-name" style="color:'+(on?color:'var(--dim)')+'">'+label+'</b>' +
      '<span class="ed-ctl">' +
        '<button class="lv-btn" data-k="'+key+'" data-kind="'+kind+'" data-d="-1">−</button>' +
        '<span class="lv-val" style="color:'+(on?'var(--text)':'var(--dim)')+'">'+(on?'Lv'+lv:'关')+'</span>' +
        '<button class="lv-btn" data-k="'+key+'" data-kind="'+kind+'" data-d="1">＋</button>' +
      '</span>' +
    '</span>';
  // 悬停放大看整张立绘
  if (img) {
    d.addEventListener('mouseenter', ()=> showPortrait(img));
    d.addEventListener('mouseleave', hidePortrait);
  }
  return d;
}

// 右侧陪练立绘（练习模式的随舰机械师）
function renderPracArt(scope) {
  const pre = scope === 'live' ? 'arsenal' : 'practice';
  const im = $(pre + 'ArtImg'), nm = $(pre + 'ArtName'), rl = $(pre + 'ArtRole');
  if (!im) return;
  const cast = bgCastFor(MODE.PRACTICE, 1);
  const info = CHAR_INFO[cast.ally] || {};
  const src = 'assets/portraits/' + cast.ally + '.png';
  if (im.getAttribute('src') !== src) im.src = src;
  if (nm) nm.textContent = info.name || '陪练';
  if (rl) rl.textContent = (info.role || '陪练') + (scope === 'live' ? ' · 场边待命' : ' · 本场陪练');
}

// scope: 'menu' = 菜单练习面板；'live' = 战斗内调参面板
function renderEditor(scope) {
  const ids = scope === 'live'
    ? ['arsenalWeapons','arsenalEnchants','arsenalWingman','arsenalOvl']
    : ['practiceWeapons','practiceEnchants','practiceWingman','practiceOvl'];
  const wEl = $(ids[0]), eEl = $(ids[1]), gEl = $(ids[2]), root = $(ids[3]);
  if (!wEl || !eEl || !root) return;
  wEl.innerHTML = ''; eEl.innerHTML = '';
  if (gEl) gEl.innerHTML = '';
  for (const t of Object.keys(WEAPON_TYPES)) {
    wEl.appendChild(editorRow(WEAPON_TYPES[t].name, WEAPON_TYPES[t].color, practiceWeaponLv[t] || 0, t, 'weapon', WEAPON_TYPES[t].img));
  }
  for (const k of Object.keys(ENCHANT)) {
    eEl.appendChild(editorRow(ENCHANT[k].name, ENCHANT[k].color, practiceEnchantLv[k] || 0, k, 'enchant', ENCHANT[k].img));
  }
  if (gEl) gEl.appendChild(editorRow('僚机编队', '#6dffb0', practiceWingman || 0, 'wing', 'wing', 'assets/portraits/ship_balanced.png'));
  renderPracArt(scope);

  root.querySelectorAll('.lv-btn').forEach(btn => {
    btn.onclick = () => {
      const k = btn.dataset.k, d = parseInt(btn.dataset.d, 10), kind = btn.dataset.kind;
      if (kind === 'weapon')        practiceWeaponLv[k] = clamp((practiceWeaponLv[k] || 0) + d, 0, MAX_PRACTICE_LV);
      else if (kind === 'enchant')  practiceEnchantLv[k] = clamp((practiceEnchantLv[k] || 0) + d, 0, MAX_PRACTICE_LV);
      else                          practiceWingman = clamp((practiceWingman || 0) + d, 0, MAX_PRACTICE_LV);
      renderEditor(scope);
      if (scope === 'live') applyEditorToLive();   // 边调边生效
    };
  });
}
function renderPracticePanel() { renderEditor('menu'); }   // 兼容旧调用

// 面板数值 → 本局实时装备（重建 loadout / enchantLevels / 僚机）
function applyEditorToLive() {
  if (mode !== MODE.PRACTICE && !(mode === MODE.PAUSE && modeBeforePause === MODE.PRACTICE)) return;
  loadout = [{ type:'main', level: Math.max(1, practiceWeaponLv.main || 0) }];
  for (const t of Object.keys(WEAPON_TYPES)) {
    if (t === 'main') continue;
    const lv = practiceWeaponLv[t] || 0;
    if (lv > 0) loadout.push({ type:t, level:lv });
  }
  for (const k of Object.keys(enchantLevels)) enchantLevels[k] = practiceEnchantLv[k] || 0;
  wingmanLevel = practiceWingman || 0;
}

// 本局实时装备 → 面板数值（打开面板时同步，保证「看到的就是正在用的」）
function syncEditorFromLive() {
  practiceWeaponLv = {};
  for (const t of Object.keys(WEAPON_TYPES)) {
    const w = loadout.find(x => x.type === t);
    practiceWeaponLv[t] = w ? (w.level || 0) : 0;
  }
  practiceEnchantLv = {};
  for (const k of Object.keys(ENCHANT)) practiceEnchantLv[k] = enchantLevels[k] || 0;
  practiceWingman = wingmanLevel || 0;
}

/* ---------- 战斗内调参面板（暂停打开 → 返回即生效） ---------- */
let arsenalFromPause = false;
function openArsenal(fromPause) {
  if (mode !== MODE.PRACTICE && mode !== MODE.PAUSE) return;
  if (mode === MODE.PRACTICE) { modeBeforePause = mode; mode = MODE.PAUSE; }   // 直接暂停
  if (modeBeforePause !== MODE.PRACTICE) return;                              // 仅练习模式开放
  arsenalFromPause = !!fromPause;
  syncEditorFromLive();
  renderEditor('live');
  $('pauseMenu').classList.add('hidden');
  $('arsenalOvl').classList.remove('hidden');
  Sfx.uiClick();
}
function closeArsenal() {
  applyEditorToLive();
  $('arsenalOvl').classList.add('hidden');
  if (arsenalFromPause) $('pauseMenu').classList.remove('hidden');  // 回到暂停菜单
  else resumeGame();                                                // 直接回战场
}

// HUD 快捷钮：仅练习模式显示（状态变化才动 DOM）
let arsenalBtnShown = null;
function updateArsenalBtn() {
  const show = mode === MODE.PRACTICE;
  if (show === arsenalBtnShown) return;
  arsenalBtnShown = show;
  const b = $('arsenalBtn');
  if (b) b.classList.toggle('hidden', !show);
}

/* ============================================================
   绘制
   ============================================================ */
function draw() {
  ctx.clearRect(0,0,W,H);
  ctx.save();
  if (shake>0) ctx.translate(rnd(-shake,shake),rnd(-shake,shake));

  const bg = ctx.createLinearGradient(0,0,0,H);
  bg.addColorStop(0,'#04060c'); bg.addColorStop(0.5,'#0a1226'); bg.addColorStop(1,'#04060c');
  ctx.fillStyle=bg; ctx.fillRect(-20,-20,W+40,H+40);

  // 战斗背景贴图：每个模式一套 / 战役按剧情换景（换场景时交叉淡入）
  let bgDrawn = false;
  if (ACTIVE_MODES.includes(mode)) {
    if (bgPrev && bgFade < 1) drawBgImage(bgPrev, 1 - bgFade);
    bgDrawn = drawBgImage(bgCurrent, bgFade) || bgDrawn;
    if (bgDrawn) {
      // 顶部压深 + 底部压深：贴图再暗也可能有亮区，不压会把弹幕和机体糊掉
      const vg = ctx.createLinearGradient(0, 0, 0, H);
      vg.addColorStop(0,    'rgba(3,5,10,0.66)');
      vg.addColorStop(0.35, 'rgba(3,5,10,0.30)');
      vg.addColorStop(0.68, 'rgba(3,5,10,0.36)');
      vg.addColorStop(1,    'rgba(3,5,10,0.74)');
      ctx.fillStyle = vg; ctx.fillRect(0, 0, W, H);
      drawBgDecor();   // 远景战斗机编队 + 人物立绘（画在压深之后，亮度已受控）
    }
  }

  // 星河背景：星云色斑（没有贴图时兜底，缓慢漂移）
  if (ACTIVE_MODES.includes(mode) && !bgDrawn) {
    const nebulae = [
      { x:W*0.22, y:H*0.30, r:W*0.5, c:'rgba(43,80,150,0.10)' },
      { x:W*0.78, y:H*0.62, r:W*0.45, c:'rgba(120,50,160,0.08)' },
      { x:W*0.50, y:H*0.18, r:W*0.40, c:'rgba(30,120,140,0.08)' },
      { x:W*0.15, y:H*0.85, r:W*0.42, c:'rgba(160,70,60,0.07)' },
    ];
    for (const nb of nebulae) {
      const nx = nb.x + Math.sin(gameTime*0.05 + nb.r)*20;
      const ny = nb.y + Math.cos(gameTime*0.04 + nb.r)*15;
      const g = ctx.createRadialGradient(nx, ny, 0, nx, ny, nb.r);
      g.addColorStop(0, nb.c); g.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = g; ctx.beginPath(); ctx.arc(nx, ny, nb.r, 0, 6.28); ctx.fill();
    }
  }

  for(const s of stars){
    // 星星：白色/淡蓝/淡紫，按大小分层发光
    const hue = s.c || 'rgba(180,210,255,';
    ctx.fillStyle = hue + (0.25+s.s/2.2) + ')';
    ctx.fillRect(s.x, s.y, s.s, s.s);
    // 大星星加光晕
    if (s.s > 1.6) {
      ctx.globalAlpha = 0.25;
      ctx.fillStyle = '#9ac8ff';
      ctx.beginPath(); ctx.arc(s.x, s.y, s.s*2.2, 0, 6.28); ctx.fill();
      ctx.globalAlpha = 1;
    }
  }

  if (ACTIVE_MODES.includes(mode)) {
    for(const p of pickups) drawPickup(p);
    for(const e of enemies) drawEnemy(e);
    if (bossRef) drawBoss();
    for(const b of bullets) drawBullet(b);
    for(const b of eBullets) drawEBullet(b);
    for(const ef of effects) drawEffect(ef);
    drawPlayer();
    for(const p of particles){ ctx.globalAlpha=clamp(p.life/p.maxLife,0,1); ctx.fillStyle=p.color; ctx.beginPath(); ctx.arc(p.x,p.y,p.size,0,6.28); ctx.fill(); }
    ctx.globalAlpha=1;
  }
  ctx.restore();
  if (flashTimer>0){ ctx.fillStyle='rgba(255,255,255,'+clamp(flashTimer*3,0,0.7)+')'; ctx.fillRect(0,0,W,H); }
  drawHurtVignette();
}

// 受伤红色四周渐变特效 + 低血量持续脉动（血量越低越明显、不停闪）
function drawHurtVignette() {
  if (!ACTIVE_MODES.includes(mode) || !player || !player.maxHp) return;
  const hpRatio = clamp(player.hp / player.maxHp, 0, 1);
  const lowK = (hpRatio > 0 && hpRatio < 0.3) ? (0.3 - hpRatio) / 0.3 : 0;  // 血量<30% 开始，越低越强
  let a = clamp(hurtFlash, 0, 1) * 0.8;                                     // 掉血瞬间：四周红光闪现
  if (lowK > 0) {
    const pulse = 0.5 + 0.35 * (0.5 + 0.5 * Math.sin(gameTime * 6.5));      // 心跳式脉动（持续不灭）
    a = Math.max(a, lowK * pulse);
  }
  if (a <= 0.01) return;
  const cx = W/2, cy = H/2;
  const g = ctx.createRadialGradient(cx, cy, Math.min(W,H)*0.2, cx, cy, Math.max(W,H)*0.72);
  g.addColorStop(0,    'rgba(255,30,30,0)');
  g.addColorStop(0.55, 'rgba(220,10,25,' + (a*0.28).toFixed(3) + ')');
  g.addColorStop(1,    'rgba(255,0,25,' + a.toFixed(3) + ')');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, W, H);
}

function drawPlayer() {
  if (player.invuln>0 && Math.floor(player.invuln*10)%2===0) return;
  ctx.save();
  ctx.translate(player.x, player.y);
  const R = PL_R;            // 基准半径 18
  const t = gameTime;

  // ---- 引擎尾焰（分层：白热核心 + 橙红外焰，带抖动） ----
  for (const sx of [-0.34, 0.34]) {
    const fl = rnd(13, 24) + Math.sin(t*32)*3;
    const ex = sx*R;
    const fg = ctx.createLinearGradient(ex, R*0.88, ex, R*0.88+fl+14);
    fg.addColorStop(0, 'rgba(255,255,240,0.98)');
    fg.addColorStop(0.18, 'rgba(255,200,120,0.9)');
    fg.addColorStop(0.45, 'rgba(255,120,50,0.65)');
    fg.addColorStop(0.75, 'rgba(200,50,30,0.35)');
    fg.addColorStop(1, 'rgba(80,20,20,0)');
    ctx.fillStyle = fg;
    ctx.beginPath();
    ctx.moveTo(ex-R*0.16, R*0.84);
    ctx.lineTo(ex, R*0.88+fl+14);
    ctx.lineTo(ex+R*0.16, R*0.84);
    ctx.closePath(); ctx.fill();
    // 尾焰内层蓝白核心
    const cg = ctx.createLinearGradient(ex, R*0.86, ex, R*0.86+fl*0.6);
    cg.addColorStop(0, 'rgba(200,230,255,0.95)');
    cg.addColorStop(1, 'rgba(120,160,255,0)');
    ctx.fillStyle = cg;
    ctx.beginPath();
    ctx.moveTo(ex-R*0.07, R*0.85);
    ctx.lineTo(ex, R*0.86+fl*0.6);
    ctx.lineTo(ex+R*0.07, R*0.85);
    ctx.closePath(); ctx.fill();
  }

  // ---- 机型专属涂装（对应立绘配色，accent=主霓虹, accent2/accent3=对比色霓虹） ----
  const SKIN = {
    agile:    { hi:'#7fd4c8', mid:'#3e7a74', lo:'#12221f', nose:'#0d1517', accent:'#39e0c8', accent2:'#ffd54a', accent3:'#7c4dff' },
    heavy:    { hi:'#8a9478', mid:'#4a5440', lo:'#161a12', nose:'#0e110c', accent:'#9adf4a', accent2:'#ff5a4a', accent3:'#ffd54a' },
    balanced: { hi:'#9aa6b4', mid:'#4d5866', lo:'#141922', nose:'#0c1016', accent:'#4fd6ff', accent2:'#ff4d8f', accent3:'#9dff4f' },
    ghost:    { hi:'#8a7fb0', mid:'#3e3752', lo:'#120f1a', nose:'#0b0910', accent:'#a86bff', accent2:'#35e0ff', accent3:'#ff4d8f' },
    fortress: { hi:'#7c8694', mid:'#39424e', lo:'#10141a', nose:'#0a0d12', accent:'#ff8a3c', accent2:'#ffd54a', accent3:'#4fd6ff' },
  }[player.shipId] || { hi:'#9aa6b4', mid:'#4d5866', lo:'#141922', nose:'#0c1016', accent:'#4fd6ff', accent2:'#ff4d8f', accent3:'#9dff4f' };

  // ==== 贴图渲染路径（AI 生成透明底战机，金属质感 + 霓虹特效） ====
  const shipKey = player.shipId || 'balanced';
  const im = SHIP_IMG[shipKey];
  if (im && im.complete && im.naturalWidth > 0) {
    // 机体贴图（尺寸略大于碰撞半径，贴图含翼展；等比缩放不变形）
    const SZ = R * 4.3;
    const SB = shipBoxOf(im, SZ);
    const bd = (k) => [ -SB.w*k/2, -SB.h*k/2, SB.w*k, SB.h*k ];
    ctx.drawImage(im, ...bd(1));
    // 霓虹能量描边光晕（主色 + 双对比色三光，克制亮度）
    const np = 0.35 + 0.5*Math.abs(Math.sin(t*5));
    const np2 = 0.35 + 0.5*Math.abs(Math.sin(t*5 + 1.6));
    const np3 = 0.35 + 0.5*Math.abs(Math.sin(t*4 + 3.1));
    ctx.globalCompositeOperation = 'lighter';
    // 主色轮廓光（暗，仅勾勒边缘）
    ctx.shadowColor = SKIN.accent; ctx.shadowBlur = 8*np;
    ctx.globalAlpha = 0.07*np + 0.02;
    ctx.drawImage(im, ...bd(1));
    // 对比色轮廓光
    ctx.shadowColor = SKIN.accent2; ctx.shadowBlur = 6*np2;
    ctx.globalAlpha = 0.06*np2 + 0.015;
    ctx.drawImage(im, ...bd(1));
    // 第三对比色（呼吸式）
    ctx.shadowColor = SKIN.accent3; ctx.shadowBlur = 5*np3;
    ctx.globalAlpha = 0.05*np3 + 0.01;
    ctx.drawImage(im, ...bd(1));
    ctx.globalCompositeOperation = 'source-over';
    ctx.globalAlpha = 1;
    ctx.shadowBlur = 0;
    // 引擎喷口霓虹高亮（三色交替脉冲）
    for (const sx of [-0.34, 0, 0.34]) {
      ctx.fillStyle = (sx<0) ? SKIN.accent : (sx>0 ? SKIN.accent2 : SKIN.accent3);
      ctx.shadowColor = ctx.fillStyle; ctx.shadowBlur = 5*np + 2;
      ctx.beginPath(); ctx.arc(sx*R, R*0.82, R*0.09, 0, 6.28); ctx.fill();
      ctx.shadowBlur = 0;
    }
    // 机翼流动能量光带（暗化，仅做细线条点缀）
    ctx.globalCompositeOperation = 'lighter';
    for (const sx of [-1, 1]) {
      const flow = (Math.sin(t*3 + sx*1.2) * 0.5 + 0.5);
      ctx.strokeStyle = SKIN.accent; ctx.globalAlpha = 0.25*flow + 0.06;
      ctx.lineWidth = 1.4;
      ctx.shadowColor = SKIN.accent; ctx.shadowBlur = 5;
      ctx.beginPath();
      ctx.moveTo(sx*R*0.4, -R*0.2);
      ctx.lineTo(sx*R*1.7, R*0.85);
      ctx.stroke();
      ctx.strokeStyle = SKIN.accent2; ctx.globalAlpha = 0.25*(1-flow) + 0.06;
      ctx.shadowColor = SKIN.accent2;
      ctx.beginPath();
      ctx.moveTo(sx*R*0.5, -R*0.1);
      ctx.lineTo(sx*R*1.5, R*0.75);
      ctx.stroke();
    }
    ctx.globalCompositeOperation = 'source-over';
    ctx.globalAlpha = 1; ctx.shadowBlur = 0;

    // 翼尖呼吸霓虹灯（左右翼尖各一颗，第三色呼吸闪烁，暗化）
    for (const sx of [-1, 1]) {
      const lx = sx*R*1.7, ly = R*0.9;
      const lp = 0.4 + 0.6*Math.abs(Math.sin(t*6 + sx));
      ctx.fillStyle = SKIN.accent3;
      ctx.shadowColor = SKIN.accent3; ctx.shadowBlur = 7*lp;
      ctx.beginPath(); ctx.arc(lx, ly, R*0.09*lp + 1, 0, 6.28); ctx.fill();
      ctx.shadowBlur = 0;
      // 外圈光晕
      ctx.globalCompositeOperation = 'lighter';
      ctx.globalAlpha = 0.16*lp;
      ctx.beginPath(); ctx.arc(lx, ly, R*0.18, 0, 6.28); ctx.fill();
      ctx.globalCompositeOperation = 'source-over';
      ctx.globalAlpha = 1;
    }

    // 机腹能量环（第三色旋转光点，绕机身中轴，暗化）
    const rt = t*2.2;
    const rx = Math.cos(rt)*R*0.32, ry = R*0.1 + Math.sin(rt)*R*0.12;
    ctx.fillStyle = SKIN.accent3; ctx.shadowColor = SKIN.accent3; ctx.shadowBlur = 5;
    ctx.beginPath(); ctx.arc(rx, ry, R*0.07, 0, 6.28); ctx.fill();
    ctx.shadowBlur = 0;
    // 减速状态光环
    if (player.slow>0) {
      ctx.strokeStyle='rgba(109,255,176,0.7)'; ctx.lineWidth=2;
      ctx.beginPath(); ctx.arc(0,0,R+8,0,6.28); ctx.stroke();
    }
    // 僚机
    drawWingman();
    ctx.restore();
    return;
  }

  // ---- 主翼：切尖三角翼 + 边条翼（现代隐形战机俯视特征） ----
  for (const sx of [-1, 1]) {
    const wg = ctx.createLinearGradient(sx*R*0.2, -R*0.3, sx*R*1.8, R*1.4);
    wg.addColorStop(0, SKIN.hi); wg.addColorStop(0.35, SKIN.mid); wg.addColorStop(1, SKIN.lo);
    ctx.fillStyle = wg;
    ctx.beginPath();
    // 边条翼（LERX，机头侧缘延伸）+ 主翼前缘后掠 + 翼尖切角
    ctx.moveTo(sx*R*0.30, -R*0.55);
    ctx.lineTo(sx*R*0.72, -R*0.05);          // 边条
    ctx.lineTo(sx*R*1.72, R*0.78);           // 前缘后掠
    ctx.lineTo(sx*R*1.62, R*1.02);           // 翼尖切角
    ctx.lineTo(sx*R*0.92, R*0.86);           // 后缘
    ctx.lineTo(sx*R*0.34, R*0.72);
    ctx.closePath(); ctx.fill();
    // 主翼蒙皮高光（前缘受光）
    ctx.strokeStyle = 'rgba(220,235,255,0.30)'; ctx.lineWidth = 1.3;
    ctx.beginPath(); ctx.moveTo(sx*R*0.72, -R*0.05); ctx.lineTo(sx*R*1.72, R*0.78); ctx.stroke();
    // 翼面面板刻线（多个舵面分割线，写实感关键）
    ctx.strokeStyle = 'rgba(0,0,0,0.5)'; ctx.lineWidth = 0.9;
    ctx.beginPath(); ctx.moveTo(sx*R*0.62, R*0.1); ctx.lineTo(sx*R*1.28, R*0.66); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(sx*R*0.98, R*0.5); ctx.lineTo(sx*R*0.92, R*0.86); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(sx*R*1.32, R*0.62); ctx.lineTo(sx*R*1.24, R*0.92); ctx.stroke();
    // 副翼/襟翼舵面阴影
    ctx.fillStyle = 'rgba(0,0,0,0.35)';
    ctx.beginPath();
    ctx.moveTo(sx*R*1.10, R*0.72); ctx.lineTo(sx*R*1.55, R*0.88); ctx.lineTo(sx*R*1.50, R*1.0); ctx.lineTo(sx*R*1.05, R*0.84);
    ctx.closePath(); ctx.fill();
    // 翼下导弹挂架 + 导弹（细长弹体+尖头+尾翼）
    for (const m of [0, 1]) {
      const mx = sx*(R*1.05 + m*R*0.34), my0 = R*0.66, my1 = R*1.16;
      ctx.fillStyle = '#23282f';
      ctx.beginPath(); ctx.moveTo(mx, my0); ctx.lineTo(mx-sx*1.4, my1); ctx.lineTo(mx+sx*1.4, my1);
      ctx.closePath(); ctx.fill();                       // 挂架
      ctx.fillStyle = '#3a414c';
      ctx.beginPath();
      ctx.moveTo(mx, my1+R*0.06);                        // 弹尖
      ctx.lineTo(mx-sx*1.1, my1+R*0.28); ctx.lineTo(mx+sx*1.1, my1+R*0.28);
      ctx.closePath(); ctx.fill();
      ctx.strokeStyle = 'rgba(255,255,255,0.12)'; ctx.lineWidth = 0.7;
      ctx.beginPath(); ctx.moveTo(mx, my1+R*0.06); ctx.lineTo(mx, my1+R*0.28); ctx.stroke();
    }
    // 翼尖导航灯
    const lp = 0.35 + 0.65*Math.abs(Math.sin(t*6 + (sx>0?0:2)));
    ctx.fillStyle = sx>0 ? 'rgba(80,255,120,'+lp+')' : 'rgba(255,70,70,'+lp+')';
    ctx.shadowColor = sx>0 ? '#50ff78' : '#ff4646'; ctx.shadowBlur = 6;
    ctx.beginPath(); ctx.arc(sx*R*1.66, R*0.92, 1.7, 0, 6.28); ctx.fill();
    ctx.shadowBlur = 0;
  }

  // ---- 机身：细长菱形截面 + 隐形战机棱面 ----
  const body = ctx.createLinearGradient(-R*0.55, -R*1.2, R*0.55, R*1.1);
  body.addColorStop(0, SKIN.hi);
  body.addColorStop(0.22, SKIN.mid);
  body.addColorStop(0.55, SKIN.lo);
  body.addColorStop(1, '#05070a');
  ctx.fillStyle = body;
  ctx.beginPath();
  ctx.moveTo(0, -R*1.30);                       // 超音速尖机头
  ctx.lineTo(R*0.14, -R*0.98);                  // 雷达罩锥面
  ctx.lineTo(R*0.30, -R*0.60);                  // 边条根部
  ctx.lineTo(R*0.42, -R*0.10);                  // 进气口肩部
  ctx.lineTo(R*0.46, R*0.45);                   // 机腹
  ctx.lineTo(R*0.40, R*0.92);                   // 尾部收窄
  ctx.lineTo(R*0.30, R*1.05);                   // 喷口侧
  ctx.lineTo(0, R*0.98);
  ctx.lineTo(-R*0.30, R*1.05);
  ctx.lineTo(-R*0.40, R*0.92);
  ctx.lineTo(-R*0.46, R*0.45);
  ctx.lineTo(-R*0.42, -R*0.10);
  ctx.lineTo(-R*0.30, -R*0.60);
  ctx.lineTo(-R*0.14, -R*0.98);
  ctx.closePath(); ctx.fill();
  ctx.strokeStyle = 'rgba(140,160,190,0.35)'; ctx.lineWidth = 1.1; ctx.stroke();

  // 深色雷达罩（防雷达涂层，写实特征）
  ctx.fillStyle = SKIN.nose;
  ctx.beginPath();
  ctx.moveTo(0, -R*1.30);
  ctx.lineTo(R*0.11, -R*0.96);
  ctx.quadraticCurveTo(0, -R*0.86, -R*0.11, -R*0.96);
  ctx.closePath(); ctx.fill();
  // 雷达罩分割环线
  ctx.strokeStyle = 'rgba(0,0,0,0.55)'; ctx.lineWidth = 0.8;
  ctx.beginPath(); ctx.moveTo(-R*0.085, -R*1.02); ctx.lineTo(R*0.085, -R*1.02); ctx.stroke();

  // 机身中脊高光（受顶光）
  const spine = ctx.createLinearGradient(0, -R*1.1, 0, R*0.5);
  spine.addColorStop(0, 'rgba(225,240,255,0.50)');
  spine.addColorStop(0.5, 'rgba(225,240,255,0.12)');
  spine.addColorStop(1, 'rgba(225,240,255,0)');
  ctx.fillStyle = spine;
  ctx.beginPath();
  ctx.moveTo(0, -R*1.14);
  ctx.lineTo(-R*0.07, -R*0.5);
  ctx.lineTo(-R*0.09, R*0.5);
  ctx.lineTo(R*0.09, R*0.5);
  ctx.lineTo(R*0.07, -R*0.5);
  ctx.closePath(); ctx.fill();

  // 机身侧面装甲板分割线（纵横向蒙皮接缝）
  ctx.strokeStyle = 'rgba(0,0,0,0.45)'; ctx.lineWidth = 0.8;
  for (const sx of [-1, 1]) {
    ctx.beginPath(); ctx.moveTo(sx*R*0.16, -R*0.9); ctx.lineTo(sx*R*0.38, R*0.55); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(sx*R*0.1, -R*0.3); ctx.lineTo(sx*R*0.44, -R*0.24); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(sx*R*0.12, R*0.3); ctx.lineTo(sx*R*0.42, R*0.36); ctx.stroke();
  }
  // 战损划痕
  ctx.strokeStyle = 'rgba(190,205,225,0.20)'; ctx.lineWidth = 0.7;
  ctx.beginPath(); ctx.moveTo(-R*0.4, R*0.2); ctx.lineTo(-R*0.18, R*0.34); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(R*0.3, R*0.05); ctx.lineTo(R*0.48, R*0.22); ctx.stroke();

  // ---- 蒙皮铆钉点（沿主梁两侧成排，写实装配感） ----
  ctx.fillStyle = 'rgba(180,195,215,0.30)';
  for (const sx of [-1, 1]) {
    for (let k=0;k<5;k++) {
      const ry = -R*0.7 + k*R*0.26;
      ctx.beginPath(); ctx.arc(sx*R*0.27, ry, 0.8, 0, 6.28); ctx.fill();
    }
  }
  // ---- 机背刀形天线（垂尾前的细长天线） ----
  ctx.strokeStyle = 'rgba(210,225,245,0.55)'; ctx.lineWidth = 1;
  ctx.beginPath(); ctx.moveTo(0, R*0.18); ctx.lineTo(0, R*0.34); ctx.stroke();
  ctx.fillStyle = 'rgba(255,255,255,0.7)';
  ctx.beginPath(); ctx.arc(0, R*0.36, 0.9, 0, 6.28); ctx.fill();
  // ---- 前机身光电传感器（红外/光电探头，机头侧小圆窗） ----
  for (const sx of [-1, 1]) {
    ctx.fillStyle = '#080c12';
    ctx.beginPath(); ctx.arc(sx*R*0.18, -R*0.78, R*0.05, 0, 6.28); ctx.fill();
    ctx.fillStyle = 'rgba(120,190,255,0.7)';
    ctx.beginPath(); ctx.arc(sx*R*0.18, -R*0.78, R*0.024, 0, 6.28); ctx.fill();
  }
  // ---- 机腹航迹灯（后机身红色防撞灯，闪烁） ----
  const bc = 0.4 + 0.6*Math.abs(Math.sin(t*4 + 1.2));
  ctx.fillStyle = 'rgba(255,70,70,'+bc+')';
  ctx.shadowColor = '#ff4646'; ctx.shadowBlur = 5;
  ctx.beginPath(); ctx.arc(0, R*0.7, R*0.05, 0, 6.28); ctx.fill();
  ctx.shadowBlur = 0;

  // ---- 座舱盖（水滴形整体气泡舱盖，F-22 特征） ----
  const canopy = ctx.createLinearGradient(0, -R*0.72, 0, -R*0.14);
  canopy.addColorStop(0, 'rgba(190,225,255,0.85)');
  canopy.addColorStop(0.3, '#2c4658');
  canopy.addColorStop(0.7, '#101c26');
  canopy.addColorStop(1, '#04070a');
  ctx.fillStyle = canopy;
  ctx.beginPath();
  ctx.moveTo(0, -R*0.80);                       // 舱盖尖端
  ctx.quadraticCurveTo(R*0.20, -R*0.62, R*0.17, -R*0.34);
  ctx.quadraticCurveTo(R*0.12, -R*0.16, 0, -R*0.14);
  ctx.quadraticCurveTo(-R*0.12, -R*0.16, -R*0.17, -R*0.34);
  ctx.quadraticCurveTo(-R*0.20, -R*0.62, 0, -R*0.80);
  ctx.closePath(); ctx.fill();
  // 舱盖框线
  ctx.strokeStyle = 'rgba(200,220,240,0.45)'; ctx.lineWidth = 1; ctx.stroke();
  // 舱盖斜向反光
  ctx.fillStyle = 'rgba(235,245,255,0.4)';
  ctx.beginPath(); ctx.ellipse(-R*0.05, -R*0.52, R*0.055, R*0.16, -0.25, 0, 6.28); ctx.fill();
  // 座舱内隐约的弹射座椅头靠
  ctx.fillStyle = 'rgba(10,14,18,0.9)';
  ctx.beginPath(); ctx.arc(0, -R*0.3, R*0.055, 0, 6.28); ctx.fill();

  // ---- 两侧进气道（Carey 进气口，暗黑洞口） ----
  for (const sx of [-1, 1]) {
    ctx.fillStyle = '#04060a';
    ctx.beginPath();
    ctx.moveTo(sx*R*0.30, -R*0.42);
    ctx.lineTo(sx*R*0.46, -R*0.30);
    ctx.lineTo(sx*R*0.47, R*0.10);
    ctx.lineTo(sx*R*0.32, R*0.14);
    ctx.closePath(); ctx.fill();
    // 进气口前缘唇口高光
    ctx.strokeStyle = 'rgba(180,200,225,0.30)'; ctx.lineWidth = 0.9;
    ctx.beginPath(); ctx.moveTo(sx*R*0.30, -R*0.42); ctx.lineTo(sx*R*0.46, -R*0.30); ctx.stroke();
  }

  // ---- 双垂尾（外倾双垂尾俯视投影，V 形） ----
  for (const sx of [-1, 1]) {
    const vg = ctx.createLinearGradient(0, R*0.4, 0, R*1.15);
    vg.addColorStop(0, SKIN.mid); vg.addColorStop(1, SKIN.lo);
    ctx.fillStyle = vg;
    ctx.beginPath();
    ctx.moveTo(sx*R*0.22, R*0.42);
    ctx.lineTo(sx*R*0.52, R*0.62);
    ctx.lineTo(sx*R*0.60, R*1.08);
    ctx.lineTo(sx*R*0.40, R*0.98);
    ctx.closePath(); ctx.fill();
    ctx.strokeStyle = 'rgba(200,220,240,0.22)'; ctx.lineWidth = 0.8;
    ctx.beginPath(); ctx.moveTo(sx*R*0.22, R*0.42); ctx.lineTo(sx*R*0.52, R*0.62); ctx.stroke();
  }

  // ---- 平尾（全动平尾，切尖） ----
  for (const sx of [-1, 1]) {
    const tg = ctx.createLinearGradient(0, R*0.5, 0, R*1.3);
    tg.addColorStop(0, SKIN.mid); tg.addColorStop(1, SKIN.lo);
    ctx.fillStyle = tg;
    ctx.beginPath();
    ctx.moveTo(sx*R*0.30, R*0.72);
    ctx.lineTo(sx*R*1.10, R*1.10);
    ctx.lineTo(sx*R*1.02, R*1.30);
    ctx.lineTo(sx*R*0.30, R*1.06);
    ctx.closePath(); ctx.fill();
    ctx.strokeStyle = 'rgba(0,0,0,0.4)'; ctx.lineWidth = 0.8;
    ctx.beginPath(); ctx.moveTo(sx*R*0.55, R*0.9); ctx.lineTo(sx*R*0.5, R*1.14); ctx.stroke();
  }

  // ---- 双发二元喷口（尾部矩形喷口 + 尾焰已在下方绘制） ----
  for (const sx of [-0.34, 0.34]) {
    const ex = sx*R;
    ctx.fillStyle = '#080a0e';
    ctx.beginPath();
    ctx.roundRect(ex-R*0.14, R*0.86, R*0.28, R*0.24, 2);
    ctx.fill();
    ctx.strokeStyle = 'rgba(255,160,80,0.35)'; ctx.lineWidth = 0.8; ctx.stroke();
  }

  // ---- 机头机炮口 + 机腹能量核心灯 ----
  const pulse = 0.4 + 0.6*Math.abs(Math.sin(t*5));
  ctx.fillStyle = 'rgba(255,60,80,'+(0.3+pulse*0.5)+')';
  ctx.shadowColor = '#ff3c4e'; ctx.shadowBlur = 8;
  ctx.beginPath(); ctx.arc(0, R*0.42, R*0.10, 0, 6.28); ctx.fill();
  ctx.shadowBlur = 0;

  // ---- 减速状态光环 ----
  if (player.slow>0) {
    ctx.strokeStyle='rgba(109,255,176,0.7)'; ctx.lineWidth=2;
    ctx.beginPath(); ctx.arc(0,0,R+8,0,6.28); ctx.stroke();
  }
  ctx.restore();

  drawWingman();
}

// 僚机（暗色护航小战机，带霓虹尾焰）
function drawWingman() {
  for (let i=1;i<=wingmanLevel;i++) {
    const side = i%2===0 ? 1 : -1;
    const wx = player.x + side*(40+Math.floor((i-1)/2)*16);
    ctx.save();
    ctx.translate(wx, player.y+8);
    const wg = ctx.createLinearGradient(0,-10,0,5);
    wg.addColorStop(0,'#48545f'); wg.addColorStop(1,'#0e1218');
    ctx.fillStyle=wg;
    ctx.beginPath(); ctx.moveTo(0,-11); ctx.lineTo(9,3); ctx.lineTo(5,5); ctx.lineTo(0,2); ctx.lineTo(-5,5); ctx.lineTo(-9,3); ctx.closePath(); ctx.fill();
    ctx.strokeStyle='rgba(210,70,60,0.4)'; ctx.lineWidth=1; ctx.stroke();
    ctx.fillStyle='#ff5a50';
    ctx.shadowColor='#ff5a50'; ctx.shadowBlur=4;
    ctx.beginPath(); ctx.arc(0,-2,2,0,6.28); ctx.fill();
    ctx.shadowBlur=0;
    ctx.restore();
  }
}

function drawBullet(b) {
  ctx.save();
  // 穿透弹的"能量矛"外衣：额外一层拉长的青色光刃，和普通弹一眼区分
  if (b.pierce) {
    const sp = Math.hypot(b.vx, b.vy) || 1;
    const ux = b.vx/sp, uy = b.vy/sp;
    const L = b.r*6.5;
    const g2 = ctx.createLinearGradient(b.x-ux*L, b.y-uy*L, b.x, b.y);
    g2.addColorStop(0, 'rgba(53,224,255,0)');
    g2.addColorStop(0.6, 'rgba(53,224,255,0.28)');
    g2.addColorStop(1, 'rgba(190,245,255,0.55)');
    ctx.globalCompositeOperation = 'lighter';
    ctx.strokeStyle = g2; ctx.lineWidth = b.r*1.5; ctx.lineCap = 'round';
    ctx.beginPath(); ctx.moveTo(b.x-ux*L, b.y-uy*L); ctx.lineTo(b.x, b.y); ctx.stroke();
    ctx.strokeStyle = 'rgba(255,255,255,0.5)'; ctx.lineWidth = Math.max(1, b.r*0.35);
    ctx.beginPath(); ctx.moveTo(b.x-ux*L*0.55, b.y-uy*L*0.55); ctx.lineTo(b.x, b.y); ctx.stroke();
    ctx.globalCompositeOperation = 'source-over';
  }
  if (b.laser) {
    // 激光束：粗亮芯线 + 双层光晕拖尾，非球体
    ctx.strokeStyle=b.color; ctx.lineWidth=b.r*2.2; ctx.lineCap='round';
    ctx.shadowColor=b.color; ctx.shadowBlur=14;
    ctx.beginPath(); ctx.moveTo(b.x,b.y); ctx.lineTo(b.x-b.vx*0.06, b.y-b.vy*0.06); ctx.stroke();
    ctx.strokeStyle='#fff'; ctx.lineWidth=b.r*0.8; ctx.shadowBlur=0;
    ctx.beginPath(); ctx.moveTo(b.x,b.y); ctx.lineTo(b.x-b.vx*0.04, b.y-b.vy*0.04); ctx.stroke();
  } else {
    // 能量弹：锥形弹头 + 光尾拖影（沿运动方向），去掉实心圆球
    const ang = Math.atan2(b.vy, b.vx);
    const sp = Math.hypot(b.vx, b.vy) || 1;
    ctx.translate(b.x, b.y);
    ctx.rotate(ang);
    // 光尾拖影
    const tail = ctx.createLinearGradient(-b.r*4, 0, 0, 0);
    tail.addColorStop(0, 'rgba(0,0,0,0)');
    tail.addColorStop(1, b.glow);
    ctx.globalAlpha = 0.65;
    ctx.fillStyle = tail;
    ctx.beginPath();
    ctx.moveTo(0, -b.r*0.7);
    ctx.lineTo(-b.r*3.5, 0);
    ctx.lineTo(0, b.r*0.7);
    ctx.closePath(); ctx.fill();
    ctx.globalAlpha = 1;
    // 锥形弹头（尖朝前）
    const hd = ctx.createLinearGradient(0, -b.r, 0, b.r);
    hd.addColorStop(0, '#ffffff');
    hd.addColorStop(0.4, b.color);
    hd.addColorStop(1, b.glow);
    ctx.fillStyle = hd;
    ctx.shadowColor = b.color; ctx.shadowBlur = 9;
    ctx.beginPath();
    ctx.moveTo(b.r*1.5, 0);            // 尖端
    ctx.lineTo(-b.r*0.7, -b.r*0.75);
    ctx.lineTo(-b.r*0.2, 0);
    ctx.lineTo(-b.r*0.7, b.r*0.75);
    ctx.closePath(); ctx.fill();
    ctx.shadowBlur = 0;
    // 弹头高光棱线
    ctx.strokeStyle='rgba(255,255,255,0.75)'; ctx.lineWidth=0.8;
    ctx.beginPath(); ctx.moveTo(b.r*1.3, 0); ctx.lineTo(-b.r*0.3, 0); ctx.stroke();
  }
  ctx.restore();
}

function drawEBullet(b) {
  ctx.save();
  // 敌方弹：菱形能量晶弹 + 外发光，非球体
  const ang = Math.atan2(b.vy, b.vx);
  ctx.translate(b.x, b.y);
  ctx.rotate(ang);
  // 外光晕
  ctx.globalAlpha = 0.5; ctx.fillStyle = b.color;
  ctx.shadowColor = b.color; ctx.shadowBlur = 12;
  ctx.beginPath();
  ctx.moveTo(b.r*2.0, 0);
  ctx.lineTo(0, -b.r*1.1);
  ctx.lineTo(-b.r*1.1, 0);
  ctx.lineTo(0, b.r*1.1);
  ctx.closePath(); ctx.fill();
  ctx.globalAlpha = 1;
  // 内核亮白菱形
  ctx.fillStyle = b.color;
  ctx.beginPath();
  ctx.moveTo(b.r*1.4, 0);
  ctx.lineTo(0, -b.r*0.7);
  ctx.lineTo(-b.r*0.7, 0);
  ctx.lineTo(0, b.r*0.7);
  ctx.closePath(); ctx.fill();
  ctx.fillStyle = 'rgba(255,255,255,0.9)';
  ctx.beginPath();
  ctx.moveTo(b.r*0.8, 0);
  ctx.lineTo(0, -b.r*0.4);
  ctx.lineTo(-b.r*0.4, 0);
  ctx.lineTo(0, b.r*0.4);
  ctx.closePath(); ctx.fill();
  ctx.restore();
}

// 通用写实敌机（俯视，机头朝下俯冲），按类型微调气动外形
function drawEnemyJet(R, C, type) {
  const wide = type==='tank' || type==='shield';          // 宽体重甲
  const slim = type==='sniper' || type==='rammer';        // 细长狙击/突刺
  const wingSpan = wide ? 1.85 : (slim ? 1.25 : 1.55);
  const tailR = R * (wide ? 0.92 : 0.78);

  // 主翼（后掠，机头朝下：翼从机身向后即 -y 方向展开）
  for (const sx of [-1, 1]) {
    const wg = ctx.createLinearGradient(sx*R*0.2, R*0.3, sx*wingSpan*R, -tailR);
    wg.addColorStop(0, '#6a7484'); wg.addColorStop(0.4, '#2a323e'); wg.addColorStop(1, '#080b10');
    ctx.fillStyle = wg;
    ctx.beginPath();
    ctx.moveTo(sx*R*0.26, R*0.55);
    ctx.lineTo(sx*wingSpan*R, -tailR*0.55);
    ctx.lineTo(sx*wingSpan*R*0.92, -tailR*0.85);
    ctx.lineTo(sx*R*0.3, -R*0.35);
    ctx.closePath(); ctx.fill();
    // 前缘高光
    ctx.strokeStyle = 'rgba(230,240,255,0.22)'; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(sx*R*0.26, R*0.55); ctx.lineTo(sx*wingSpan*R, -tailR*0.55); ctx.stroke();
    // 舵面刻线
    ctx.strokeStyle = 'rgba(0,0,0,0.5)'; ctx.lineWidth = 0.8;
    ctx.beginPath(); ctx.moveTo(sx*R*0.6, R*0.1); ctx.lineTo(sx*wingSpan*R*0.8, -tailR*0.6); ctx.stroke();
    // 翼尖灯（红）
    const lp = 0.35 + 0.65*Math.abs(Math.sin(gameTime*7 + (sx>0?1:0)));
    ctx.fillStyle = 'rgba(255,70,70,'+lp+')';
    ctx.shadowColor = '#ff4646'; ctx.shadowBlur = 5;
    ctx.beginPath(); ctx.arc(sx*wingSpan*R*0.95, -tailR*0.7, 1.5, 0, 6.28); ctx.fill();
    ctx.shadowBlur = 0;
  }

  // 平尾
  for (const sx of [-1, 1]) {
    ctx.fillStyle = '#141a22';
    ctx.beginPath();
    ctx.moveTo(sx*R*0.22, -R*0.42);
    ctx.lineTo(sx*R*0.85, -tailR*1.15);
    ctx.lineTo(sx*R*0.2, -R*0.8);
    ctx.closePath(); ctx.fill();
  }

  // 机身（细长，敌军深红黑涂装）
  const body = ctx.createLinearGradient(-R*0.5, R*1.1, R*0.5, -R*0.9);
  body.addColorStop(0, '#7c8494'); body.addColorStop(0.3, '#39424e'); body.addColorStop(0.65, '#171c25'); body.addColorStop(1, '#05070a');
  ctx.fillStyle = body;
  ctx.beginPath();
  ctx.moveTo(0, R*1.22);                          // 尖机头（朝下）
  ctx.lineTo(R*0.15, R*0.92);
  ctx.lineTo(R*0.34, R*0.45);
  ctx.lineTo(R*0.42, -R*0.2);
  ctx.lineTo(R*0.34, -R*0.78);
  ctx.lineTo(0, -R*0.92);
  ctx.lineTo(-R*0.34, -R*0.78);
  ctx.lineTo(-R*0.42, -R*0.2);
  ctx.lineTo(-R*0.34, R*0.45);
  ctx.lineTo(-R*0.15, R*0.92);
  ctx.closePath(); ctx.fill();
  ctx.strokeStyle = 'rgba(200,80,70,0.4)'; ctx.lineWidth = 1; ctx.stroke();

  // 深色雷达罩（朝下）
  ctx.fillStyle = '#120a0c';
  ctx.beginPath();
  ctx.moveTo(0, R*1.22);
  ctx.quadraticCurveTo(R*0.1, R*0.98, 0, R*0.9);
  ctx.quadraticCurveTo(-R*0.1, R*0.98, 0, R*1.22);
  ctx.closePath(); ctx.fill();

  // 座舱（红光，敌军特征）
  const cg = ctx.createLinearGradient(0, R*0.6, 0, R*0.2);
  cg.addColorStop(0, 'rgba(255,90,80,0.9)'); cg.addColorStop(1, 'rgba(60,10,14,0.95)');
  ctx.fillStyle = cg;
  ctx.beginPath(); ctx.ellipse(0, R*0.42, R*0.13, R*0.24, 0, 0, 6.28); ctx.fill();
  ctx.strokeStyle = 'rgba(255,120,110,0.35)'; ctx.lineWidth = 0.8; ctx.stroke();

  // 进气道
  for (const sx of [-1, 1]) {
    ctx.fillStyle = '#04060a';
    ctx.beginPath();
    ctx.moveTo(sx*R*0.3, R*0.36);
    ctx.lineTo(sx*R*0.45, R*0.28);
    ctx.lineTo(sx*R*0.44, -R*0.1);
    ctx.lineTo(sx*R*0.3, -R*0.12);
    ctx.closePath(); ctx.fill();
  }

  // 单喷口尾焰口（朝上）
  ctx.fillStyle = '#080a0e';
  ctx.beginPath(); ctx.roundRect(-R*0.16, -R*0.95, R*0.32, R*0.2, 2); ctx.fill();
  ctx.strokeStyle = 'rgba(255,120,70,0.4)'; ctx.lineWidth = 0.8; ctx.stroke();

  // 机身蒙皮刻线
  ctx.strokeStyle = 'rgba(0,0,0,0.45)'; ctx.lineWidth = 0.7;
  for (const sx of [-1, 1]) {
    ctx.beginPath(); ctx.moveTo(sx*R*0.14, R*0.85); ctx.lineTo(sx*R*0.3, -R*0.7); ctx.stroke();
  }

  // 类型特化：tank 双炮管 / rammer 前伸冲角
  if (type==='tank') {
    ctx.fillStyle = '#0a0e14';
    ctx.fillRect(-R*0.5, R*0.9, R*0.16, R*0.4);
    ctx.fillRect(R*0.34, R*0.9, R*0.16, R*0.4);
  }
  if (type==='shield') {
    ctx.fillStyle = 'rgba(90,216,255,0.16)';
    ctx.beginPath(); ctx.arc(0, 0, R*0.55, 0, 6.28); ctx.fill();
  }
}

function drawEnemy(e) {
  ctx.save(); ctx.translate(e.x,e.y);
  if (e.slowT>0) { ctx.strokeStyle='rgba(109,255,176,0.7)'; ctx.lineWidth=2; ctx.beginPath(); ctx.arc(0,0,e.r+6,0,6.28); ctx.stroke(); }
  // 护盾者：外层蓝色护盾圈
  if (e.shield) {
    ctx.strokeStyle='rgba(90,216,255,0.85)'; ctx.lineWidth=3;
    ctx.shadowColor='#5ad8ff'; ctx.shadowBlur=10;
    ctx.beginPath(); ctx.arc(0,0,e.r+7,0,6.28); ctx.stroke();
    ctx.shadowBlur=0;
  }
  const R = e.r;
  const t = gameTime;
  const C = e.color;

  // —— 敌人统一为写实敌机（机头朝下俯冲），按类型微调气动外形 ——
  // 普通敌机类型用 AI 贴图（金属质感 + 霓虹），特殊机制类型保留手绘
  const useImg = (e.type==='grunt'||e.type==='scout'||e.type==='elite'||e.type==='chief');
  const eim = useImg ? SHIP_IMG[(e.type==='elite'||e.type==='chief')?'elite':'enemy'] : null;
  if (eim && eim.complete && eim.naturalWidth > 0) {
    const SZ = R * 4.3;
    const EB = shipBoxOf(eim, SZ);          // 等比缩放，不把敌机压扁
    const ed = [ -EB.w/2, -EB.h/2, EB.w, EB.h ];
    ctx.drawImage(eim, ...ed);
    // 霓虹脉冲光边（主色红 + 对比橙 + 紫三光，威胁感，暗化）
    const ep = 0.3 + 0.45*Math.abs(Math.sin(t*6));
    const ep2 = 0.3 + 0.45*Math.abs(Math.sin(t*6 + 2));
    const ep3 = 0.3 + 0.45*Math.abs(Math.sin(t*5 + 4));
    ctx.globalCompositeOperation = 'lighter';
    ctx.globalAlpha = 0.07*ep + 0.02;
    ctx.shadowColor = C; ctx.shadowBlur = 5*ep;
    ctx.drawImage(eim, ...ed);
    ctx.globalAlpha = 0.06*ep2 + 0.015;
    ctx.shadowColor = '#ff8a3c'; ctx.shadowBlur = 4*ep2;
    ctx.drawImage(eim, ...ed);
    ctx.globalAlpha = 0.05*ep3 + 0.01;
    ctx.shadowColor = '#b06bff'; ctx.shadowBlur = 3*ep3;
    ctx.drawImage(eim, ...ed);
    ctx.globalCompositeOperation = 'source-over';
    ctx.globalAlpha = 1; ctx.shadowBlur = 0;
  } else {
    drawEnemyJet(R, C, e.type);
  }

  if (e.type==='rammer') {
    // 冲撞箭头
    const a = Math.atan2(player.y-e.y, player.x-e.x);
    ctx.save(); ctx.rotate(a);
    ctx.fillStyle='#fff'; ctx.beginPath();
    ctx.moveTo(R*0.9,0); ctx.lineTo(-R*0.3,-R*0.4); ctx.lineTo(-R*0.3,R*0.4);
    ctx.closePath(); ctx.fill(); ctx.restore();
  } else if (e.type==='splitter') {
    // 中间连线（双体感）
    ctx.strokeStyle='rgba(255,255,255,0.4)'; ctx.lineWidth=1.5; ctx.setLineDash([3,3]);
    ctx.beginPath(); ctx.moveTo(-R*0.45,0); ctx.lineTo(R*0.45,0); ctx.stroke();
    ctx.setLineDash([]);
  } else if (e.type==='sniper') {
    // 瞄准线
    ctx.strokeStyle='rgba(255,208,138,0.6)'; ctx.lineWidth=1; ctx.setLineDash([4,6]);
    ctx.beginPath(); ctx.moveTo(0,R); ctx.lineTo(player.x-e.x, player.y-e.y); ctx.stroke();
    ctx.setLineDash([]);
  } else if (e.type==='tank') {
    // 重装兵：宽体重甲战机
    const g = ctx.createLinearGradient(-R,0,R,0);
    g.addColorStop(0,'#4a3a3a'); g.addColorStop(0.5,C); g.addColorStop(1,'#1a0a0e');
    ctx.fillStyle=g;
    ctx.beginPath();
    ctx.moveTo(0,-R*0.7); ctx.lineTo(R*1.1,-R*0.1); ctx.lineTo(R*0.9,R*0.7); ctx.lineTo(-R*0.9,R*0.7); ctx.lineTo(-R*1.1,-R*0.1);
    ctx.closePath(); ctx.fill();
    ctx.strokeStyle='rgba(255,120,80,0.4)'; ctx.lineWidth=1.2; ctx.stroke();
    // 双炮管
    for (const sx of [-1,1]) {
      ctx.fillStyle='#0a0e14'; ctx.fillRect(sx*R*0.4,-R*0.7,R*0.2,R*0.3);
    }
  } else if (e.type==='orbiter') {
    // 环绕者：额外一圈环绕脉冲
    ctx.strokeStyle='rgba(255,255,255,0.25)'; ctx.lineWidth=1;
    ctx.beginPath(); ctx.arc(0,0,R*1.35,e.wob, e.wob+2.2); ctx.stroke();
  }
  // tank / elite / chief / scout / grunt 已由 drawEnemyJet 统一绘制

  // 精英/首领/重装兵的六边形装甲框
  if (e.type==='elite'||e.type==='chief'||e.type==='tank') {
    ctx.strokeStyle='#fff'; ctx.lineWidth=1.2;
    ctx.beginPath();
    for(let i=0;i<6;i++){const a=i/6*6.28+e.wob*0.5; const px=Math.cos(a)*e.r*0.85, py=Math.sin(a)*e.r*0.85; i===0?ctx.moveTo(px,py):ctx.lineTo(px,py);}
    ctx.closePath(); ctx.stroke();
  }

  if (e.hp<e.maxHp) {
    ctx.fillStyle='rgba(0,0,0,0.5)'; ctx.fillRect(-e.r,-e.r-9,e.r*2,4);
    ctx.fillStyle='#ff5d5d'; ctx.fillRect(-e.r,-e.r-9,e.r*2*(e.hp/e.maxHp),4);
  }
  ctx.restore();
}

function drawBoss() {
  const b=bossRef;
  ctx.save(); ctx.translate(b.x,b.y);
  const t = gameTime;
  const R = b.r;
  const C = b.color || '#ff5d5d';
  const phase = b.phase;

  // 光环（威胁红光/紫光，随阶段变色）
  ctx.save(); ctx.globalAlpha=0.18+0.12*Math.sin(t*5);
  const gg=ctx.createRadialGradient(0,0,0,0,0,R*2.3);
  gg.addColorStop(0, phase>=3?'#ff3c3c':(phase===2?'#b06bff':C));
  gg.addColorStop(1,'rgba(0,0,0,0)');
  ctx.fillStyle=gg; ctx.beginPath(); ctx.arc(0,0,R*2.3,0,6.28); ctx.fill();
  ctx.restore();

  // 整体投影：把整艘舰从星空里"抬"起来，避免造型发扁
  ctx.filter = 'drop-shadow(0 6px 14px rgba(0,0,0,0.82))';

  // 12 关各一套完全不同的 AI 立绘（机头/舰首统一朝下俯冲）；
  // 贴图未加载完成时回退到程序化建模，保证任何时候都有东西可画
  const bim = SHIP_IMG['boss_' + b.bossType];
  if (bim && bim.complete && bim.naturalWidth > 0) {
    const BB = bossBox(R, b.bossType);
    ctx.drawImage(bim, -BB.w/2, -BB.h/2, BB.w, BB.h);
  } else {
    switch (b.bossType) {
      case 'interceptor':  bossInterceptor(R,C);  break;   // 第1关  轻型拦截机
      case 'striker':      bossStriker(R,C);      break;   // 第2关  攻击机
      case 'phantom':      bossPhantom(R,C);      break;   // 第3关  隐形战机
      case 'stealth':      bossStealth(R,C);      break;   // 第4关  电子战机
      case 'heavyFighter': bossHeavyFighter(R,C); break;   // 第5关  重型战斗机
      case 'ace':          bossAce(R,C);          break;   // 第6关  王牌座机
      case 'dreadnought':  bossDreadnought(R,C);  break;   // 第7关  无畏舰
      case 'cruiser':      bossCruiser(R,C);      break;   // 第8关  巡洋舰
      case 'titan':        bossTitan(R,C);        break;   // 第9关  泰坦机甲
      case 'flagship':     bossFlagship(R,C);     break;   // 第10关 旗舰
      case 'doomShip':     bossDoomShip(R,C);     break;   // 第11关 湮灭巨舰
      case 'voidCore':     bossVoidCore(R,C);     break;   // 第12关 虚空核心
      default:             bossInterceptor(R,C);  break;
    }
  }

  ctx.filter = 'none';

  // 威胁色轮廓光：深色机体在深空里容易糊成一团，用 Boss 主题色描一圈让它浮出来
  if (bim && bim.complete && bim.naturalWidth > 0) {
    const BB = bossBox(R, b.bossType);
    const gp = 0.4 + 0.35*Math.abs(Math.sin(t*4));
    ctx.globalCompositeOperation = 'lighter';
    ctx.shadowColor = phase>=3?'#ff3c3c':(phase===2?'#ff9a3c':C); ctx.shadowBlur = 9*gp;
    ctx.globalAlpha = 0.10*gp + 0.03;
    ctx.drawImage(bim, -BB.w/2, -BB.h/2, BB.w, BB.h);
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = 'source-over';
  }

  // 阶段能量核心（受击弱点，随阶段变色）
  // —— AI 立绘自身细节已经很密，这里再盖一个死白圆点会像"贴上去的创可贴"。
  //    改成三层：外层加色柔光（融进机体）+ 中层相位色环 + 中心小热点，既有弱点提示又不突兀。
  const cp = 0.6 + 0.4*Math.abs(Math.sin(t*5));
  const coreCol = phase>=3?'#ff3c3c':(phase===2?'#ff9a3c':C);
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  const cg2 = ctx.createRadialGradient(0,0,0,0,0,R*0.5);
  cg2.addColorStop(0, coreCol);
  cg2.addColorStop(0.45, 'rgba(255,255,255,0)');
  ctx.globalAlpha = 0.30*cp;
  ctx.fillStyle = cg2;
  ctx.beginPath(); ctx.arc(0,0,R*0.5,0,6.28); ctx.fill();
  ctx.globalAlpha = 1;
  ctx.restore();
  ctx.strokeStyle = coreCol; ctx.lineWidth = Math.max(1, R*0.035);
  ctx.globalAlpha = 0.55 + 0.35*cp;
  ctx.beginPath(); ctx.arc(0,0,R*0.17,0,6.28); ctx.stroke();
  ctx.globalAlpha = 1;
  ctx.fillStyle = 'rgba(255,255,255,'+(0.5+0.4*cp)+')';
  ctx.shadowColor = coreCol; ctx.shadowBlur = 8;
  ctx.beginPath(); ctx.arc(0,0,R*0.075,0,6.28); ctx.fill();
  ctx.shadowBlur = 0;
  ctx.restore();
}

/* ============================================================
   Boss 造型工具箱
   统一约定：机头/舰首朝下（+y 为前），尾焰朝上（-y）
   ============================================================ */
function bossGrad(x0,y0,x1,y1, stops) {
  const g = ctx.createLinearGradient(x0,y0,x1,y1);
  for (const s of stops) g.addColorStop(s[0], s[1]);
  return g;
}
function bossPoly(pts, fill, stroke, lw) {
  ctx.beginPath();
  ctx.moveTo(pts[0][0], pts[0][1]);
  for (let i=1;i<pts.length;i++) ctx.lineTo(pts[i][0], pts[i][1]);
  ctx.closePath();
  if (fill) { ctx.fillStyle = fill; ctx.fill(); }
  if (stroke) { ctx.strokeStyle = stroke; ctx.lineWidth = lw || 1.2; ctx.stroke(); }
}
// 引擎尾焰：机头朝下，尾焰向上拖
function bossFlame(x, y, w, len, hot) {
  const t = gameTime;
  const fl = len * (0.85 + 0.28*Math.sin(t*30 + x*0.05));
  const fg = ctx.createLinearGradient(x, y, x, y-fl);
  fg.addColorStop(0, 'rgba(255,255,242,0.95)');
  fg.addColorStop(0.3, hot || 'rgba(255,150,60,0.7)');
  fg.addColorStop(0.72, 'rgba(215,55,40,0.3)');
  fg.addColorStop(1, 'rgba(70,15,15,0)');
  ctx.fillStyle = fg;
  ctx.beginPath();
  ctx.moveTo(x-w/2, y); ctx.lineTo(x, y-fl); ctx.lineTo(x+w/2, y);
  ctx.closePath(); ctx.fill();
}
// 脉冲威胁灯
function bossLight(x, y, r, color, spd) {
  const p = 0.35 + 0.65*Math.abs(Math.sin(gameTime*(spd||6) + x*0.03 + y*0.02));
  ctx.save();
  ctx.globalAlpha = p; ctx.shadowColor = color; ctx.shadowBlur = r*5; ctx.fillStyle = color;
  ctx.beginPath(); ctx.arc(x,y,r,0,6.28); ctx.fill();
  ctx.restore();
}
// 炮管（朝下伸出）
function bossGun(x, y, w, len, col) {
  ctx.fillStyle = col || '#0a0e14';
  ctx.fillRect(x-w/2, y, w, len);
  ctx.fillStyle = 'rgba(235,245,255,0.13)';
  ctx.fillRect(x-w/2, y, w*0.32, len);
}
// 金属机身渐变（统一材质语言）
const BOSS_HULL = (a,b,c,d) => [[0,a],[0.3,b],[0.68,c],[1,d]];

/* ---------- 第1关：教团·侦察队长（轻型拦截机）---------- */
function bossInterceptor(R,C) {
  bossFlame(0, -R*0.88, R*0.3, R*0.62);
  // 小后掠三角主翼
  for (const sx of [-1,1]) {
    bossPoly([[sx*R*0.24,R*0.26],[sx*R*0.66,R*0.66],[sx*R*1.36,R*0.96],[sx*R*1.2,R*1.22],[sx*R*0.5,R*1.0],[sx*R*0.26,R*0.74]],
      bossGrad(sx*R*0.3,R*0.2,sx*R*1.3,R*1.3,[[0,'#717d8d'],[0.45,'#3a4351'],[1,'#090d13']]),
      'rgba(205,228,255,0.22)',1.1);
    bossLight(sx*R*1.28, R*1.06, 1.8, C);
  }
  // 前置鸭翼
  for (const sx of [-1,1]) {
    bossPoly([[sx*R*0.2,R*0.96],[sx*R*0.76,R*1.14],[sx*R*0.62,R*1.38],[sx*R*0.2,R*1.22]],
      bossGrad(0,0,sx*R*0.8,R*1.4,[[0,'#5b6371'],[1,'#0b0f15']]), null);
  }
  // 细长箭形机身
  bossPoly([[0,R*1.56],[R*0.16,R*1.16],[R*0.24,R*0.36],[R*0.28,-R*0.34],[R*0.2,-R*0.84],[0,-R*0.94],
      [-R*0.2,-R*0.84],[-R*0.28,-R*0.34],[-R*0.24,R*0.36],[-R*0.16,R*1.16]],
    bossGrad(-R*0.4,0,R*0.4,0, BOSS_HULL('#94a0b0','#4d5766','#1a212a','#06090d')),
    'rgba(165,188,215,0.38)',1.2);
  bossPoly([[0,R*1.56],[R*0.14,R*1.2],[0,R*1.08],[-R*0.14,R*1.2]], '#120a0e', null);
  // 座舱
  bossPoly([[0,R*0.98],[R*0.17,R*0.7],[R*0.13,R*0.36],[0,R*0.28],[-R*0.13,R*0.36],[-R*0.17,R*0.7]],
    bossGrad(0,R*1.0,0,R*0.25,[[0,'rgba(255,150,130,0.8)'],[0.4,'#4c222a'],[1,'#08060a']]),
    'rgba(255,140,130,0.4)',1);
  bossPoly([[0,R*1.3],[-R*0.07,R*0.5],[-R*0.08,-R*0.5],[R*0.08,-R*0.5],[R*0.07,R*0.5]],
    bossGrad(0,R*1.3,0,-R*0.6,[[0,'rgba(232,242,255,0.38)'],[1,'rgba(232,242,255,0)']]), null);
}

/* ---------- 第2关：教团·前锋官（重火力攻击机）---------- */
function bossStriker(R,C) {
  bossFlame(-R*0.26,-R*0.86,R*0.3,R*0.58);
  bossFlame( R*0.26,-R*0.86,R*0.3,R*0.58);
  // 平直宽翼 + 翼下挂架
  for (const sx of [-1,1]) {
    bossPoly([[sx*R*0.3,R*0.18],[sx*R*1.5,R*0.4],[sx*R*1.62,R*0.92],[sx*R*0.4,R*0.96]],
      bossGrad(sx*R*0.4,R*0.2,sx*R*1.6,R*1.0,[[0,'#7a8494'],[0.42,'#414a58'],[1,'#0b0f15']]),
      'rgba(200,222,250,0.25)',1.2);
    for (const m of [0,1]) {
      const mx = sx*(R*0.74 + m*R*0.42);
      bossPoly([[mx,R*0.84],[mx-sx*R*0.07,R*0.88],[mx-sx*R*0.07,R*1.34],[mx,R*1.4],[mx+sx*R*0.07,R*1.34],[mx+sx*R*0.07,R*0.88]], '#242b35', null);
      bossLight(mx, R*1.42, 1.4, C, 9);
    }
    bossLight(sx*R*1.56, R*0.64, 1.8, C);
  }
  // 机头前伸双联炮
  bossGun(-R*0.32, R*0.78, R*0.14, R*0.76);
  bossGun( R*0.32, R*0.78, R*0.14, R*0.76);
  bossLight(-R*0.32, R*1.55, 2.2, C, 8);
  bossLight( R*0.32, R*1.55, 2.2, C, 8);
  // 粗壮机身
  bossPoly([[0,R*1.5],[R*0.3,R*1.1],[R*0.52,R*0.3],[R*0.58,-R*0.5],[R*0.44,-R*0.92],[0,-R*1.0],[-R*0.44,-R*0.92],[-R*0.58,-R*0.5],[-R*0.52,R*0.3],[-R*0.3,R*1.1]],
    bossGrad(-R*0.6,0,R*0.6,0, BOSS_HULL('#939fb0','#4e5866','#1b222b','#070a0e')),
    'rgba(170,192,220,0.38)',1.3);
  bossPoly([[0,R*1.5],[R*0.2,R*1.0],[0,R*0.86],[-R*0.2,R*1.0]], '#130b0f', null);
  bossPoly([[0,R*0.8],[R*0.22,R*0.5],[R*0.16,R*0.12],[0,R*0.04],[-R*0.16,R*0.12],[-R*0.22,R*0.5]],
    bossGrad(0,R*0.82,0,0,[[0,'rgba(255,150,120,0.78)'],[0.4,'#4a1e26'],[1,'#08060a']]));
  for (const sx of [-1,1]) {
    bossPoly([[sx*R*0.34,R*0.42],[sx*R*0.56,R*0.3],[sx*R*0.54,-R*0.2],[sx*R*0.36,-R*0.14]], '#05070b', null);
    bossPoly([[sx*R*0.26,-R*0.55],[sx*R*0.6,-R*0.72],[sx*R*0.66,-R*1.12],[sx*R*0.42,-R*1.0]],
      bossGrad(0,-R*0.5,0,-R*1.2,[[0,'#4e5866'],[1,'#0c1016']]));
  }
}

/* ---------- 第3关：幽灵舰队·指挥官（隐形融合飞翼）---------- */
function bossPhantom(R,C) {
  const t = gameTime;
  const WING = [[0,R*1.62],[R*1.52,R*0.88],[R*1.7,R*0.1],[R*0.56,-R*0.88],[0,-R*1.04],[-R*0.56,-R*0.88],[-R*1.7,R*0.1],[-R*1.52,R*0.88]];
  // 隐形扭曲辉光
  ctx.save(); ctx.globalCompositeOperation='lighter';
  ctx.globalAlpha = 0.09 + 0.05*Math.sin(t*3);
  ctx.shadowColor=C; ctx.shadowBlur=16;
  bossPoly(WING, C, null);
  ctx.restore();
  // 融合飞翼本体
  bossPoly(WING,
    bossGrad(-R*1.5,0,R*1.5,0,[[0,'#3a3358'],[0.28,'#4b4270'],[0.5,'#2b2544'],[0.74,'#171232'],[1,'#0a0716']]),
    'rgba(190,165,255,0.3)',1.3);
  // 发光棱线
  ctx.strokeStyle='rgba(195,165,255,0.5)'; ctx.lineWidth=1.1;
  for (const sx of [-1,1]) {
    ctx.beginPath(); ctx.moveTo(0,R*1.5); ctx.lineTo(sx*R*1.44,R*0.9); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(sx*R*0.5,-R*0.84); ctx.lineTo(sx*R*1.62,R*0.1); ctx.stroke();
  }
  // 锯齿后缘（隐形特征）
  for (const sx of [-1,1]) {
    bossPoly([[sx*R*1.68,R*0.1],[sx*R*1.5,R*0.9],[sx*R*1.3,R*0.62],[sx*R*1.2,R*0.92],
              [sx*R*1.0,R*0.66],[sx*R*0.72,R*0.94],[sx*R*0.56,R*0.86]], '#0a0716', null);
  }
  // 扁平菱形座舱
  bossPoly([[0,R*1.0],[R*0.26,R*0.66],[R*0.2,R*0.24],[0,R*0.14],[-R*0.2,R*0.24],[-R*0.26,R*0.66]],
    bossGrad(0,R*1.0,0,R*0.1,[[0,'rgba(222,184,255,0.75)'],[0.4,'#3a2450'],[1,'#0b0714']]),
    'rgba(200,160,255,0.42)',1);
  // 中央能量脊（脉冲）
  ctx.save(); ctx.globalCompositeOperation='lighter';
  ctx.globalAlpha = 0.32 + 0.3*Math.abs(Math.sin(t*4));
  bossPoly([[0,R*1.4],[-R*0.06,R*0.3],[-R*0.05,-R*0.72],[R*0.05,-R*0.72],[R*0.06,R*0.3]], C, null);
  ctx.restore();
  // 双扁平喷口
  for (const sx of [-0.32,0.32]) bossFlame(sx*R, -R*0.9, R*0.34, R*0.5);
}

/* ---------- 第4关：内鬼·通讯官（电子战机 / 空中预警盘）---------- */
function bossStealth(R,C) {
  const t = gameTime;
  bossFlame(-R*0.52,-R*0.5,R*0.26,R*0.46);
  bossFlame( R*0.52,-R*0.5,R*0.26,R*0.46);
  // 扁圆盘身
  const g = bossGrad(-R*1.5,0,R*1.5,0,[[0,'#3f4a56'],[0.35,'#5f6d7d'],[0.62,'#2c343e'],[1,'#0d1116']]);
  ctx.fillStyle=g;
  ctx.beginPath(); ctx.ellipse(0,R*0.06,R*1.5,R*0.76,0,0,6.28); ctx.fill();
  ctx.strokeStyle='rgba(150,220,255,0.32)'; ctx.lineWidth=1.3; ctx.stroke();
  // 环状装甲分带
  for (const k of [0.52,0.94,1.28]) {
    ctx.strokeStyle='rgba(0,0,0,0.42)'; ctx.lineWidth=1;
    ctx.beginPath(); ctx.ellipse(0,R*0.06,R*k,R*k*0.5,0,0,6.28); ctx.stroke();
  }
  // 旋转雷达天线阵（识别特征）
  ctx.save(); ctx.translate(0,R*0.08); ctx.rotate(t*1.6);
  for (let i=0;i<6;i++) {
    ctx.save(); ctx.rotate(i*Math.PI/3);
    ctx.fillStyle='#161d26';
    ctx.fillRect(R*0.16,-R*0.045,R*0.92,R*0.09);
    ctx.fillStyle='rgba(120,215,255,0.75)';
    ctx.fillRect(R*0.16,-R*0.02,R*0.92,R*0.04);
    ctx.restore();
  }
  ctx.restore();
  // 中央天线塔
  ctx.fillStyle='#232c37';
  ctx.beginPath(); ctx.ellipse(0,R*0.06,R*0.34,R*0.19,0,0,6.28); ctx.fill();
  bossLight(0,R*0.06,R*0.13,'#8fe6ff',5);
  // 侧舷信号脉冲环
  const p = (t*0.55)%1;
  ctx.save(); ctx.globalCompositeOperation='lighter';
  ctx.globalAlpha = (1-p)*0.5;
  ctx.strokeStyle=C; ctx.lineWidth=2;
  ctx.beginPath(); ctx.ellipse(0,R*0.06,R*(0.6+p*1.4),R*(0.3+p*0.72),0,0,6.28); ctx.stroke();
  ctx.restore();
  // 四角稳定鳍
  for (const sx of [-1,1]) for (const sy of [-1,1]) {
    bossPoly([[sx*R*1.16,R*0.06+sy*R*0.34],[sx*R*1.44,R*0.06+sy*R*0.5],[sx*R*1.5,R*0.06+sy*R*0.76],[sx*R*1.12,R*0.06+sy*R*0.62]], '#1a222c', null);
  }
}

/* ---------- 第5关：联邦·上校（重型战斗机）---------- */
function bossHeavyFighter(R,C) {
  for (const sx of [-0.62,-0.24,0.24,0.62]) bossFlame(sx*R, -R*0.92, R*0.26, R*0.5);
  // 厚实梯形主翼
  for (const sx of [-1,1]) {
    bossPoly([[sx*R*0.34,R*0.06],[sx*R*1.1,R*0.16],[sx*R*1.62,R*0.5],[sx*R*1.74,R*0.94],
              [sx*R*1.4,R*1.22],[sx*R*0.98,R*1.06],[sx*R*0.42,R*0.98]],
      bossGrad(sx*R*0.5,-R*0.1,sx*R*1.7,R*1.2,[[0,'#98a4b4'],[0.34,'#525c6b'],[0.72,'#252c36'],[1,'#0a0e14']]),
      'rgba(215,235,255,0.3)',1.4);
    // 翼面高光棱（前缘亮线）
    ctx.strokeStyle='rgba(228,242,255,0.5)'; ctx.lineWidth=1.5;
    ctx.beginPath(); ctx.moveTo(sx*R*0.4,R*0.1); ctx.lineTo(sx*R*1.16,R*0.2); ctx.lineTo(sx*R*1.66,R*0.54); ctx.stroke();
    // 翼面装甲板缝
    ctx.strokeStyle='rgba(0,0,0,0.5)'; ctx.lineWidth=1;
    ctx.beginPath(); ctx.moveTo(sx*R*0.8,R*0.34); ctx.lineTo(sx*R*1.5,R*0.8); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(sx*R*1.24,R*0.4); ctx.lineTo(sx*R*1.34,R*1.1); ctx.stroke();
    // 翼下重型挂架（三联）
    for (const m of [0,1,2]) {
      const mx = sx*(R*0.72 + m*R*0.32);
      bossPoly([[mx,R*0.8],[mx-sx*R*0.075,R*0.86],[mx-sx*R*0.075,R*1.28],[mx,R*1.36],[mx+sx*R*0.075,R*1.28],[mx+sx*R*0.075,R*0.86]], '#1c232c', null);
    }
    bossLight(sx*R*1.62, R*1.02, 1.9, C);
  }
  // 宽体机身
  bossPoly([[0,R*1.46],[R*0.34,R*1.06],[R*0.6,R*0.22],[R*0.64,-R*0.52],[R*0.5,-R*0.96],[0,-R*1.04],[-R*0.5,-R*0.96],[-R*0.64,-R*0.52],[-R*0.6,R*0.22],[-R*0.34,R*1.06]],
    bossGrad(-R*0.66,0,R*0.66,0, BOSS_HULL('#9aa6b6','#525c6b','#1d242e','#070a0e')),
    'rgba(175,196,224,0.4)',1.4);
  // 装甲带
  ctx.strokeStyle='rgba(0,0,0,0.5)'; ctx.lineWidth=1.1;
  for (const y of [R*0.7, R*0.2, -R*0.35]) {
    ctx.beginPath(); ctx.moveTo(-R*0.46,y); ctx.lineTo(R*0.46,y); ctx.stroke();
  }
  bossPoly([[0,R*1.46],[R*0.22,R*1.02],[0,R*0.9],[-R*0.22,R*1.02]], '#130b0f', null);
  bossPoly([[0,R*0.86],[R*0.26,R*0.56],[R*0.2,R*0.14],[0,R*0.06],[-R*0.2,R*0.14],[-R*0.26,R*0.56]],
    bossGrad(0,R*0.88,0,0.02,[[0,'rgba(255,150,120,0.8)'],[0.42,'#4a1e26'],[1,'#08060a']]));
  // 双垂尾（外倾，厚）
  for (const sx of [-1,1]) {
    bossPoly([[sx*R*0.3,-R*0.6],[sx*R*0.72,-R*0.78],[sx*R*0.8,-R*1.24],[sx*R*0.5,-R*1.06]],
      bossGrad(0,-R*0.55,0,-R*1.3,[[0,'#525c6b'],[1,'#0c1016']]));
  }
}

/* ---------- 第6关：叛徒·上校座机（前掠翼王牌机）---------- */
function bossAce(R,C) {
  const t = gameTime;
  bossFlame(-R*0.2,-R*0.88,R*0.28,R*0.56);
  bossFlame( R*0.2,-R*0.88,R*0.28,R*0.56);
  // 前掠主翼（王牌机标志，金色描边）
  for (const sx of [-1,1]) {
    bossPoly([[sx*R*0.28,R*0.06],[sx*R*1.42,-R*0.34],[sx*R*1.72,-R*0.86],[sx*R*1.44,-R*0.72],[sx*R*0.52,R*0.62]],
      bossGrad(sx*R*0.4,R*0.2,sx*R*1.6,-R*0.8,[[0,'#b9a06a'],[0.42,'#6d5a32'],[1,'#1a1409']]),
      'rgba(255,226,150,0.55)',1.5);
    // 翼面金纹
    ctx.strokeStyle='rgba(255,214,130,0.6)'; ctx.lineWidth=1.4;
    ctx.beginPath(); ctx.moveTo(sx*R*0.5,R*0.4); ctx.lineTo(sx*R*1.5,-R*0.6); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(sx*R*0.7,R*0.16); ctx.lineTo(sx*R*1.32,-R*0.44); ctx.stroke();
    // 翼尖灯
    bossLight(sx*R*1.7, -R*0.82, 2.1, '#ffe08a', 7);
  }
  // 鸭翼
  for (const sx of [-1,1]) {
    bossPoly([[sx*R*0.22,R*0.98],[sx*R*0.9,R*1.24],[sx*R*0.78,R*1.48],[sx*R*0.22,R*1.3]],
      bossGrad(0,R*0.9,sx*R*0.9,R*1.5,[[0,'#8a7645'],[1,'#181208']]),
      'rgba(255,220,150,0.4)',1.1);
  }
  // 机身（金色涂装）
  bossPoly([[0,R*1.62],[R*0.17,R*1.18],[R*0.28,R*0.34],[R*0.34,-R*0.36],[R*0.24,-R*0.9],[0,-R*1.0],[-R*0.24,-R*0.9],[-R*0.34,-R*0.36],[-R*0.28,R*0.34],[-R*0.17,R*1.18]],
    bossGrad(-R*0.44,0,R*0.44,0,[[0,'#e8d089'],[0.3,'#937c46'],[0.68,'#3a3018'],[1,'#0d0b05']]),
    'rgba(255,230,160,0.5)',1.4);
  // 队长条纹（双斜纹）
  ctx.fillStyle='rgba(20,16,8,0.7)';
  for (const off of [-R*0.5,-R*0.24]) {
    bossPoly([[-R*0.24,off],[R*0.24,off-R*0.2],[R*0.24,off-R*0.38],[-R*0.24,off-R*0.18]], 'rgba(24,18,6,0.72)', null);
  }
  bossPoly([[0,R*1.62],[R*0.15,R*1.22],[0,R*1.1],[-R*0.15,R*1.22]], '#161006', null);
  // 大座舱
  bossPoly([[0,R*1.06],[R*0.2,R*0.74],[R*0.16,R*0.34],[0,R*0.24],[-R*0.16,R*0.34],[-R*0.2,R*0.74]],
    bossGrad(0,R*1.08,0,R*0.2,[[0,'rgba(255,205,150,0.85)'],[0.42,'#5a3a1e'],[1,'#100a06']]),
    'rgba(255,215,150,0.55)',1.1);
  // 中央金色能量脊
  ctx.save(); ctx.globalCompositeOperation='lighter';
  ctx.globalAlpha = 0.3 + 0.28*Math.abs(Math.sin(t*4));
  bossPoly([[0,R*1.34],[-R*0.05,R*0.4],[-R*0.045,-R*0.6],[R*0.045,-R*0.6],[R*0.05,R*0.4]], '#ffe08a', null);
  ctx.restore();
}

/* ---------- 第7关：虚空教团·主教（无畏舰）---------- */
function bossDreadnought(R,C) {
  const t = gameTime;
  for (const sx of [-0.7,-0.38,0.38,0.7]) bossFlame(sx*R, -R*1.35, R*0.24, R*0.44);
  // 长舰体（纵向，舰首朝下）
  bossPoly([[0,R*1.62],[R*0.42,R*1.3],[R*0.72,R*0.5],[R*0.86,-R*0.5],[R*0.66,-R*1.3],[0,-R*1.5],
      [-R*0.66,-R*1.3],[-R*0.86,-R*0.5],[-R*0.72,R*0.5],[-R*0.42,R*1.3]],
    bossGrad(-R*0.9,0,R*0.9,0,[[0,'#2f3948'],[0.3,'#5b6779'],[0.52,'#3c4657'],[0.74,'#252d3a'],[1,'#0d1119']]),
    'rgba(170,195,225,0.35)',1.5);
  // 舰体分段装甲线
  ctx.strokeStyle='rgba(0,0,0,0.55)'; ctx.lineWidth=1.1;
  for (const y of [R*0.72, R*0.24, -R*0.28, -R*0.78]) {
    ctx.beginPath(); ctx.moveTo(-R*0.8,y); ctx.lineTo(R*0.8,y); ctx.stroke();
  }
  // 三座三联装主炮塔（沿轴线）
  for (const [py,k] of [[R*1.0,0.94],[R*0.1,0.82],[-R*0.78,0.7]]) {
    ctx.fillStyle= bossGrad(-R*0.5,py,R*0.5,py,[[0,'#39424f'],[0.5,'#6a7686'],[1,'#1a2029']]);
    ctx.beginPath(); ctx.ellipse(0,py,R*0.46*k,R*0.34*k,0,0,6.28); ctx.fill();
    ctx.strokeStyle='rgba(220,235,255,0.25)'; ctx.lineWidth=1; ctx.stroke();
    for (const gx of [-0.22,0,0.22]) {
      bossGun(gx*R*k, py, R*0.09*k, R*0.72*k);
      bossLight(gx*R*k, py+R*0.74*k, 1.5, C, 8);
    }
  }
  // 舰首撞角
  bossPoly([[0,R*1.62],[R*0.3,R*1.24],[R*0.16,R*1.06],[-R*0.16,R*1.06],[-R*0.3,R*1.24]], '#0f131a', 'rgba(255,120,120,0.4)', 1.2);
  // 舰桥（靠后）
  bossPoly([[-R*0.3,-R*0.5],[R*0.3,-R*0.5],[R*0.22,-R*1.0],[-R*0.22,-R*1.0]], '#1a222e', null);
  const p = 0.45+0.55*Math.abs(Math.sin(t*4));
  ctx.fillStyle='rgba('+(C==='#c77bff'?'199,123,255':'255,200,120')+','+p+')';
  ctx.fillRect(-R*0.2,-R*0.9,R*0.4,R*0.26);
  bossLight(0,-R*1.32,2.4,C,4);
}

/* ---------- 第8关：教团·审判官（箭簇巡洋舰）---------- */
function bossCruiser(R,C) {
  const t = gameTime;
  for (const sx of [-0.85,-0.45,0.45,0.85]) bossFlame(sx*R, -R*0.9, R*0.2, R*0.4);
  // 箭簇形舰体（两舷外张）
  for (const sx of [-1,1]) {
    bossPoly([[sx*R*0.2,R*1.0],[sx*R*1.5,R*0.24],[sx*R*1.66,-R*0.42],[sx*R*0.66,-R*0.86],[sx*R*0.24,-R*0.56]],
      bossGrad(sx*R*0.3,R*0.9,sx*R*1.6,-R*0.6,[[0,'#5c6878'],[0.42,'#333c49'],[1,'#0b0f16']]),
      'rgba(200,220,250,0.28)',1.3);
    // 侧舷炮列（各 5 门）
    for (let i=0;i<5;i++) {
      const px = sx*(R*(0.62+i*0.2)), py = R*(0.72-i*0.34);
      ctx.fillStyle='#0a0e14';
      ctx.fillRect(px-sx*R*0.05, py-R*0.05, sx*R*0.16, R*0.1);
      bossLight(px+sx*R*0.13, py, 1.4, C, 9);
    }
    bossLight(sx*R*1.6,R*0.2,2,C);
  }
  // 中央舰体
  bossPoly([[0,R*1.6],[R*0.3,R*1.1],[R*0.4,R*0.2],[R*0.42,-R*0.62],[R*0.26,-R*0.94],[0,-R*1.0],
      [-R*0.26,-R*0.94],[-R*0.42,-R*0.62],[-R*0.4,R*0.2],[-R*0.3,R*1.1]],
    bossGrad(-R*0.44,0,R*0.44,0, BOSS_HULL('#8d99aa','#4c5564','#1c232c','#070a0e')),
    'rgba(180,200,228,0.38)',1.3);
  // 双舰桥（并列）
  for (const sx of [-0.2,0.2]) {
    bossPoly([[sx*R-R*0.14,-R*0.42],[sx*R+R*0.14,-R*0.42],[sx*R+R*0.1,-R*0.88],[sx*R-R*0.1,-R*0.88]], '#1a222e', null);
    const p = 0.45+0.55*Math.abs(Math.sin(t*4 + sx*3));
    ctx.fillStyle='rgba('+(C==='#ff4d8f'?'255,90,140':'255,200,120')+','+p+')';
    ctx.fillRect(sx*R-R*0.09,-R*0.8,R*0.18,R*0.22);
  }
  // 舰首主炮
  bossGun(0, R*1.2, R*0.2, R*0.5);
  bossLight(0, R*1.72, 2.4, C, 7);
  // 舰首光矛（蓄能）
  ctx.save(); ctx.globalCompositeOperation='lighter';
  ctx.globalAlpha = 0.2 + 0.3*Math.abs(Math.sin(t*5));
  bossPoly([[0,R*2.0],[-R*0.08,R*1.5],[R*0.08,R*1.5]], C, null);
  ctx.restore();
}

/* ---------- 第9关：禁忌兵器·守卫（泰坦机甲）---------- */
function bossTitan(R,C) {
  const t = gameTime;
  // 背后三排推进器
  for (const sx of [-0.62,0,0.62]) bossFlame(sx*R, -R*0.86, R*0.3, R*0.5);
  // 双臂加农炮
  for (const sx of [-1,1]) {
    bossPoly([[sx*R*0.78,R*0.2],[sx*R*1.34,R*0.34],[sx*R*1.42,R*1.0],[sx*R*0.86,R*0.94]],
      bossGrad(sx*R*0.8,0,sx*R*1.4,R*1.0,[[0,'#5a6168'],[0.5,'#333a41'],[1,'#0b0e12']]),
      'rgba(255,150,90,0.35)',1.4);
    bossGun(sx*R*1.12, R*0.96, R*0.24, R*0.72, '#141a20');
    bossLight(sx*R*1.12, R*1.72, 2.6, C, 8);
    // 肩甲
    bossPoly([[sx*R*0.5,-R*0.72],[sx*R*1.36,-R*0.6],[sx*R*1.44,R*0.1],[sx*R*0.86,R*0.2]],
      bossGrad(sx*R*0.6,-R*0.7,sx*R*1.4,R*0.2,[[0,'#7b838d'],[0.55,'#3d454e'],[1,'#101419']]),
      'rgba(255,170,110,0.3)',1.4);
    bossLight(sx*R*1.3,-R*0.5,2.2,C,6);
  }
  // 躯干装甲
  bossPoly([[-R*0.72,-R*0.7],[R*0.72,-R*0.7],[R*0.9,R*0.2],[R*0.66,R*0.96],[-R*0.66,R*0.96],[-R*0.9,R*0.2]],
    bossGrad(-R,-R,R,R,[[0,'#6b6259'],[0.38,'#3a3430'],[1,'#0b0a0c']]),
    'rgba(255,150,90,0.4)',1.5);
  // 胸甲能量核心
  const p = 0.4+0.6*Math.abs(Math.sin(t*5));
  ctx.save(); ctx.globalCompositeOperation='lighter';
  ctx.globalAlpha = 0.35+p*0.5;
  ctx.shadowColor=C; ctx.shadowBlur=16;
  bossPoly([[0,R*0.5],[-R*0.3,R*0.02],[0,-R*0.28],[R*0.3,R*0.02]], C, null);
  ctx.restore();
  // 头（低矮，红光目镜）
  bossPoly([[-R*0.26,-R*0.72],[R*0.26,-R*0.72],[R*0.2,-R*1.06],[-R*0.2,-R*1.06]], '#232022', null);
  ctx.save(); ctx.shadowColor='#ff3c3c'; ctx.shadowBlur=10;
  ctx.fillStyle='rgba(255,70,70,'+(0.6+0.4*p)+')';
  ctx.fillRect(-R*0.16,-R*0.96,R*0.32,R*0.1);
  ctx.restore();
  // 装甲刻线
  ctx.strokeStyle='rgba(0,0,0,0.55)'; ctx.lineWidth=1.1;
  ctx.beginPath(); ctx.moveTo(-R*0.42,-R*0.6); ctx.lineTo(-R*0.42,R*0.9); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(R*0.42,-R*0.6); ctx.lineTo(R*0.42,R*0.9); ctx.stroke();
}

/* ---------- 第10关：联邦·元帅（超级旗舰 / 航母）---------- */
function bossFlagship(R,C) {
  const t = gameTime;
  for (const sx of [-0.78,-0.42,0.42,0.78]) bossFlame(sx*R, -R*1.2, R*0.26, R*0.5);
  // 超宽飞行甲板
  bossPoly([[-R*1.72,R*0.42],[R*1.72,R*0.42],[R*1.6,-R*0.62],[-R*1.6,-R*0.62]],
    bossGrad(0,-R*0.6,0,R*0.5,[[0,'#2a3341'],[0.4,'#4a5666'],[0.75,'#252c37'],[1,'#0e1218']]),
    'rgba(180,205,235,0.32)',1.5);
  // 甲板跑道线 + 弹射轨道灯
  ctx.strokeStyle='rgba(140,220,255,0.55)'; ctx.lineWidth=1.6;
  ctx.beginPath(); ctx.moveTo(-R*1.48,R*0.2); ctx.lineTo(R*1.48,R*0.2); ctx.stroke();
  ctx.setLineDash([R*0.18,R*0.14]);
  ctx.beginPath(); ctx.moveTo(-R*1.48,R*0.06); ctx.lineTo(R*1.48,R*0.06); ctx.stroke();
  ctx.setLineDash([]);
  const p = (t*0.8)%1;
  for (let i=0;i<9;i++) {
    const bx = -R*1.48 + (i/8)*R*2.96;
    const on = Math.abs(((i/8) - p)) < 0.08;
    bossLight(bx, R*0.32, on?2.6:1.5, on?'#d8f6ff':'rgba(120,200,255,0.55)', on?9:3);
  }
  // 舰首双层装甲
  bossPoly([[-R*1.3,R*0.42],[R*1.3,R*0.42],[R*0.9,R*1.0],[-R*0.9,R*1.0]],
    bossGrad(0,R*0.4,0,R*1.05,[[0,'#5b6675'],[0.55,'#333c48'],[1,'#0b0f15']]),
    'rgba(200,222,250,0.3)',1.3);
  // 舰首双主炮
  bossGun(-R*0.5, R*1.0, R*0.22, R*0.6);
  bossGun( R*0.5, R*1.0, R*0.22, R*0.6);
  bossLight(-R*0.5, R*1.58, 2.2, C, 8);
  bossLight( R*0.5, R*1.58, 2.2, C, 8);
  // 侧舷近防炮
  for (const sx of [-1,1]) for (let i=0;i<3;i++) {
    bossLight(sx*R*(1.18+i*0.2), R*0.24, 1.5, C, 7+i);
  }
  // 中央舰岛（多层）
  bossPoly([[-R*0.5,-R*0.6],[R*0.5,-R*0.6],[R*0.38,-R*1.12],[-R*0.38,-R*1.12]], '#1b2330', null);
  bossPoly([[-R*0.32,-R*1.1],[R*0.32,-R*1.1],[R*0.24,-R*1.46],[-R*0.24,-R*1.46]], '#232c39', null);
  const q = 0.45+0.55*Math.abs(Math.sin(t*4));
  ctx.fillStyle='rgba('+(C==='#35e0ff'?'90,225,255':'255,205,120')+','+q+')';
  ctx.fillRect(-R*0.4,-R*1.02,R*0.8,R*0.16);
  ctx.fillRect(-R*0.26,-R*1.4,R*0.52,R*0.14);
  bossLight(0,-R*1.52,2.6,C,4.5);
  // 相控阵雷达面
  for (const sx of [-1,1]) {
    bossPoly([[sx*R*0.42,-R*0.9],[sx*R*0.82,-R*0.9],[sx*R*0.74,-R*0.6],[sx*R*0.42,-R*0.6]],
      'rgba(90,200,255,'+(0.25+0.35*q)+')', 'rgba(140,225,255,0.5)', 1);
  }
}

/* ---------- 第11关：湮灭巨舰（移动堡垒 · 高压迫感）---------- */
function bossDoomShip(R,C) {
  const t = gameTime;
  for (const sx of [-0.9,-0.5,-0.15,0.15,0.5,0.9]) bossFlame(sx*R, -R*1.24, R*0.24, R*0.54);
  // 六边形装甲堡垒
  const HEX = [[0,R*1.66],[R*1.0,R*1.28],[R*1.62,R*0.42],[R*1.62,-R*0.6],[R*1.0,-R*1.24],[0,-R*1.5],
               [-R*1.0,-R*1.24],[-R*1.62,-R*0.6],[-R*1.62,R*0.42],[-R*1.0,R*1.28]];
  bossPoly(HEX,
    bossGrad(-R*1.6,0,R*1.6,0,[[0,'#2a2f38'],[0.26,'#565f6b'],[0.5,'#31383f'],[0.74,'#1c2128'],[1,'#080a0e']]),
    'rgba(255,140,140,0.42)',1.8);
  // 外层装甲棱（厚重感）
  ctx.strokeStyle='rgba(0,0,0,0.6)'; ctx.lineWidth=2.2;
  bossPoly(HEX.map(([x,y])=>[x*0.82,y*0.82]), null, 'rgba(0,0,0,0.6)', 2.2);
  bossPoly(HEX.map(([x,y])=>[x*0.58,y*0.58]), null, 'rgba(0,0,0,0.55)', 2);
  // 四角巨型炮塔
  for (const sx of [-1,1]) for (const sy of [-1,1]) {
    const px = sx*R*1.06, py = sy*R*0.78;
    ctx.fillStyle='#12161c';
    ctx.beginPath(); ctx.arc(px,py,R*0.34,0,6.28); ctx.fill();
    ctx.strokeStyle='rgba(255,140,140,0.35)'; ctx.lineWidth=1.4; ctx.stroke();
    ctx.fillStyle='#1e242c';
    ctx.beginPath(); ctx.arc(px,py,R*0.2,0,6.28); ctx.fill();
    bossGun(px, py, R*0.16, R*0.42, '#0d1116');
    bossLight(px, py+R*0.46, 2.4, C, 7);
  }
  // 中央主炮（巨型炮口，压迫感核心）
  ctx.save();
  ctx.fillStyle='#0d1015';
  ctx.beginPath(); ctx.arc(0,R*0.72,R*0.62,0,6.28); ctx.fill();
  ctx.strokeStyle='rgba(255,120,120,0.5)'; ctx.lineWidth=2; ctx.stroke();
  ctx.fillStyle='#161b22';
  ctx.beginPath(); ctx.arc(0,R*0.72,R*0.42,0,6.28); ctx.fill();
  ctx.restore();
  const chg = 0.5 + 0.5*Math.sin(t*4);
  ctx.save(); ctx.globalCompositeOperation='lighter';
  ctx.globalAlpha = 0.4 + 0.6*chg;
  ctx.shadowColor='#ff5a5a'; ctx.shadowBlur=26;
  ctx.fillStyle='#ff8a8a';
  ctx.beginPath(); ctx.arc(0,R*0.72,R*(0.14+0.1*chg),0,6.28); ctx.fill();
  ctx.restore();
  // 旋转环阵炮（外圈 8 门）
  ctx.save(); ctx.translate(0,-R*0.5); ctx.rotate(t*0.7);
  for (let i=0;i<8;i++) {
    ctx.save(); ctx.rotate(i*Math.PI/4);
    ctx.fillStyle='#0d1116';
    ctx.fillRect(R*0.52,-R*0.075,R*0.34,R*0.15);
    bossLight(R*0.86,0,1.6,C,8);
    ctx.restore();
  }
  ctx.restore();
  // 中央舰桥 + 红色警示目
  bossPoly([[-R*0.4,-R*0.86],[R*0.4,-R*0.86],[R*0.3,-R*1.34],[-R*0.3,-R*1.34]], '#151a20', null);
  ctx.save(); ctx.shadowColor='#ff3030'; ctx.shadowBlur=16;
  ctx.fillStyle='rgba(255,60,60,'+(0.65+0.35*chg)+')';
  ctx.fillRect(-R*0.26,-R*1.2,R*0.52,R*0.13);
  ctx.restore();
}

/* ---------- 第12关：终局·虚空核心（能量体 · 终极压迫感）---------- */
function bossVoidCore(R,C) {
  const t = gameTime;
  // 外侧暗能量触须光带（8 条，波动）
  ctx.save(); ctx.globalCompositeOperation='lighter';
  ctx.globalAlpha=0.4;
  ctx.strokeStyle='#d9a6ff'; ctx.lineWidth=2.4; ctx.shadowColor='#c07dff'; ctx.shadowBlur=14;
  for (let i=0;i<8;i++) {
    const a = i*Math.PI/4 + t*0.35;
    const wob = Math.sin(t*2.4 + i)*R*0.24;
    ctx.beginPath();
    ctx.moveTo(Math.cos(a)*R*0.7, Math.sin(a)*R*0.7);
    ctx.quadraticCurveTo(Math.cos(a+0.4)*(R*1.3)+wob*0.4, Math.sin(a+0.4)*(R*1.3)+wob*0.4,
                         Math.cos(a)*(R*1.7)+wob, Math.sin(a)*(R*1.7)+wob);
    ctx.stroke();
  }
  ctx.restore();
  // 三层反向旋转能量环
  for (let k=0;k<3;k++) {
    const rot = t*(1+k*0.5)*(k%2?-1:1);
    const rr = R*(1.42-k*0.26);
    ctx.save(); ctx.rotate(rot);
    ctx.strokeStyle='rgba('+(k===0?'255,140,220':(k===1?'224,163,255':'180,120,255'))+','+(0.85-k*0.2)+')';
    ctx.lineWidth = 3.2-k*0.7;
    ctx.shadowColor='#c07dff'; ctx.shadowBlur=16;
    ctx.beginPath(); ctx.ellipse(0,0,rr,rr*0.42,0,0,6.28); ctx.stroke();
    // 环上的能量节点
    for (let i=0;i<4;i++) {
      const a=i*Math.PI/2;
      ctx.fillStyle='#f0d8ff';
      ctx.beginPath(); ctx.arc(Math.cos(a)*rr, Math.sin(a)*rr*0.42, 2.4, 0, 6.28); ctx.fill();
    }
    ctx.restore();
  }
  // 虚空核心光球
  const pu = 0.72 + 0.28*Math.sin(t*4.5);
  const gg=ctx.createRadialGradient(0,0,0,0,0,R*1.05);
  gg.addColorStop(0,'#ffffff'); gg.addColorStop(0.22,'#e8c4ff');
  gg.addColorStop(0.5,'#b06bff'); gg.addColorStop(0.78,'rgba(105,40,170,0.35)'); gg.addColorStop(1,'rgba(45,10,80,0)');
  ctx.fillStyle=gg; ctx.beginPath(); ctx.arc(0,0,R*1.05,0,6.28); ctx.fill();
  // 巨眼（识别特征：竖瞳，随呼吸缩放）
  ctx.save();
  ctx.fillStyle='rgba(20,4,34,0.9)';
  ctx.beginPath(); ctx.ellipse(0,0,R*0.62,R*0.4,0,0,6.28); ctx.fill();
  ctx.strokeStyle='rgba(240,216,255,'+pu+')'; ctx.lineWidth=2; ctx.stroke();
  const eg=ctx.createLinearGradient(0,-R*0.36,0,R*0.36);
  eg.addColorStop(0,'#fff2ff'); eg.addColorStop(0.5,'#ff6ad5'); eg.addColorStop(1,'#8a1fd0');
  ctx.fillStyle=eg;
  ctx.beginPath(); ctx.ellipse(0,0,R*0.2*pu,R*0.32,0,0,6.28); ctx.fill();
  ctx.shadowColor='#ff6ad5'; ctx.shadowBlur=20;
  ctx.fillStyle='rgba(255,255,255,'+(0.55+0.45*pu)+')';
  ctx.beginPath(); ctx.arc(0,0,R*0.09,0,6.28); ctx.fill();
  ctx.restore();
  // 核心外鞘碎片（悬浮）
  ctx.save(); ctx.globalCompositeOperation='lighter'; ctx.globalAlpha=0.75;
  for (let i=0;i<6;i++) {
    const a = -i*Math.PI/3 + t*0.5;
    const rr = R*(0.95 + 0.12*Math.sin(t*3+i));
    const px=Math.cos(a)*rr, py=Math.sin(a)*rr*0.72;
    ctx.save(); ctx.translate(px,py); ctx.rotate(a+t);
    bossPoly([[0,-R*0.13],[R*0.075,0],[0,R*0.13],[-R*0.075,0]], '#d9a6ff', null);
    ctx.restore();
  }
  ctx.restore();
}

function drawPickup(p) {
  ctx.save(); ctx.translate(p.x,p.y);
  const t = gameTime;
  const bob = Math.sin(t*4 + p.x*0.1)*2;   // 上下浮动
  ctx.translate(0, bob);
  // 配色
  let main, glow, inner;
  if (p.type==='weapon')      { main='#ffd08a'; glow='#ffb84d'; inner='#5a3d00'; }
  else if (p.type==='gold')   { main='#ffd700'; glow='#ffdf40'; inner='#6b5200'; }
  else if (p.type==='enchant'){ main='#b06bff'; glow='#c88bff'; inner='#2d0030'; }
  else if (p.type==='buff')   { main='#6dffb0'; glow='#8fffca'; inner='#003a1d'; }
  else { main='#6dffb0'; glow='#8fffca'; inner='#003a1d'; }   // repair 等
  const pulse = 0.7 + 0.3*Math.abs(Math.sin(t*5 + p.x));
  // 外发光
  ctx.globalCompositeOperation = 'lighter';
  ctx.globalAlpha = 0.5*pulse;
  const g = ctx.createRadialGradient(0,0,1, 0,0,14);
  g.addColorStop(0, glow); g.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = g; ctx.beginPath(); ctx.arc(0,0,14,0,6.28); ctx.fill();
  ctx.globalCompositeOperation = 'source-over';
  ctx.globalAlpha = 1;
  // 金属菱形晶体（六边形能量核心）
  ctx.save();
  ctx.rotate(Math.PI/4);
  const cg = ctx.createLinearGradient(-9,-9,9,9);
  cg.addColorStop(0, glow); cg.addColorStop(0.45, main); cg.addColorStop(1, inner);
  ctx.fillStyle = cg;
  ctx.strokeStyle = glow; ctx.lineWidth = 1.2;
  ctx.shadowColor = glow; ctx.shadowBlur = 8;
  ctx.beginPath();
  ctx.roundRect(-8, -8, 16, 16, 3);
  ctx.fill(); ctx.stroke();
  ctx.shadowBlur = 0;
  // 高光（左上角斜面）
  ctx.fillStyle = 'rgba(255,255,255,0.7)';
  ctx.beginPath(); ctx.arc(-4, -4, 2.4, 0, 6.28); ctx.fill();
  ctx.restore();
  // 中心图标文字（清晰的小符号）
  ctx.rotate(0);
  ctx.font = 'bold 11px sans-serif'; ctx.textAlign='center'; ctx.textBaseline='middle';
  const ch = p.type==='weapon'?'W':(p.type==='gold'?'$':(p.type==='enchant'?'★':'+'));
  ctx.fillStyle = '#0a0a12';
  ctx.fillText(ch, 0, 1);
  ctx.restore();
}

function drawEffect(ef) {
  ctx.save();
  if (ef.type==='chain')       drawChainBolt(ef.from.x, ef.from.y, ef.x, ef.y, ef.life/0.3);
  else if (ef.type==='blast')  drawBlastWave(ef);
  else if (ef.type==='pierce') drawPierceHit(ef);
  ctx.restore();
}

/* 连锁闪电：锯齿折线 + 随机分叉 + 白热芯
   —— 折线每帧重新随机，做出电弧"跳动"的观感（旧版只是一根直线，太素） */
function drawChainBolt(x1,y1,x2,y2,a) {
  const len = Math.hypot(x2-x1, y2-y1) || 1;
  const segs = Math.max(4, Math.min(10, Math.round(len/26)));
  const nx = -(y2-y1)/len, ny = (x2-x1)/len;
  const pts = [[x1,y1]];
  for (let i=1;i<segs;i++) {
    const t = i/segs;
    const off = (Math.random()-0.5) * Math.min(22, len*0.22) * Math.sin(t*Math.PI);
    pts.push([ x1+(x2-x1)*t + nx*off, y1+(y2-y1)*t + ny*off ]);
  }
  pts.push([x2,y2]);
  const path = () => {
    ctx.beginPath(); ctx.moveTo(pts[0][0], pts[0][1]);
    for (let i=1;i<pts.length;i++) ctx.lineTo(pts[i][0], pts[i][1]);
    ctx.stroke();
  };
  ctx.lineCap='round'; ctx.lineJoin='round';
  ctx.globalCompositeOperation='lighter';
  // 三层：外层紫光晕 → 中层亮紫 → 白热芯
  ctx.shadowColor='#b06bff'; ctx.shadowBlur=18;
  ctx.strokeStyle='rgba(150,80,255,'+(a*0.5)+')'; ctx.lineWidth=7;   path();
  ctx.shadowBlur=9;
  ctx.strokeStyle='rgba(206,160,255,'+(a*0.85)+')'; ctx.lineWidth=3.2; path();
  ctx.shadowBlur=0;
  ctx.strokeStyle='rgba(255,255,255,'+a+')'; ctx.lineWidth=1.3;      path();
  // 分叉：从折线中段甩出 1~2 条小电弧
  ctx.strokeStyle='rgba(200,150,255,'+(a*0.6)+')'; ctx.lineWidth=1.6;
  const forks = 1 + (Math.random()<0.5 ? 1 : 0);
  for (let k=0;k<forks;k++) {
    const i = 1 + Math.floor(Math.random()*(pts.length-2));
    const bx = pts[i][0], by = pts[i][1];
    const ang = Math.atan2(y2-y1, x2-x1) + (Math.random()-0.5)*2.2;
    const fl = (14 + Math.random()*18) * a;
    ctx.beginPath(); ctx.moveTo(bx,by);
    ctx.lineTo(bx+Math.cos(ang)*fl*0.6 + (Math.random()-0.5)*6, by+Math.sin(ang)*fl*0.6 + (Math.random()-0.5)*6);
    ctx.lineTo(bx+Math.cos(ang)*fl, by+Math.sin(ang)*fl);
    ctx.stroke();
  }
  // 两端电火花
  ctx.shadowColor='#b06bff'; ctx.shadowBlur=12;
  ctx.fillStyle='rgba(255,255,255,'+(a*0.9)+')';
  ctx.beginPath(); ctx.arc(x2,y2, 3.4*a+1.2, 0, 6.28); ctx.fill();
  ctx.beginPath(); ctx.arc(x1,y1, 2.6*a+1.0, 0, 6.28); ctx.fill();
  ctx.shadowBlur=0;
}

/* 爆炸冲击环：双层扩散环 + 8 道放射碎片（旧版只有一根细圆线） */
function drawBlastWave(ef) {
  const t = ef.life/0.4;             // 1 → 0
  const k = 1 - t;                   // 0 → 1 展开进度
  const R = ef.r * (0.35 + k*0.75);
  const ph = ef.x*0.013;             // 用坐标做相位，保证同一特效每帧不抖动
  ctx.globalCompositeOperation='lighter';
  ctx.shadowColor='#ff8a3c'; ctx.shadowBlur=10;
  ctx.strokeStyle='rgba(255,150,70,'+(t*0.5)+')'; ctx.lineWidth=3.4*(0.4+t);
  ctx.beginPath(); ctx.arc(ef.x,ef.y,R,0,6.28); ctx.stroke();
  ctx.strokeStyle='rgba(255,228,185,'+(t*0.3)+')'; ctx.lineWidth=1.4;
  ctx.beginPath(); ctx.arc(ef.x,ef.y,R*0.62,0,6.28); ctx.stroke();
  ctx.strokeStyle='rgba(255,190,110,'+(t*0.42)+')'; ctx.lineWidth=1.8;
  for (let i=0;i<8;i++) {
    const a = i/8*6.28 + ph;
    ctx.beginPath();
    ctx.moveTo(ef.x+Math.cos(a)*R*0.45, ef.y+Math.sin(a)*R*0.45);
    ctx.lineTo(ef.x+Math.cos(a)*R*0.95, ef.y+Math.sin(a)*R*0.95);
    ctx.stroke();
  }
  ctx.shadowBlur=0;
}

/* 贯穿命中：垂直弹道的能量环 + 沿弹道拉开的贯穿十字 */
function drawPierceHit(ef) {
  const t = ef.life/0.26;
  const k = 1 - t;
  const R = (ef.r||18) * (0.5 + k*0.9);
  ctx.translate(ef.x, ef.y);
  ctx.rotate(ef.ang||0);
  ctx.globalCompositeOperation='lighter';
  ctx.shadowColor='#35e0ff'; ctx.shadowBlur=14;
  ctx.strokeStyle='rgba(120,220,255,'+(t*0.75)+')'; ctx.lineWidth=2.4;
  ctx.beginPath(); ctx.ellipse(0,0, R*0.35, R, 0, 0, 6.28); ctx.stroke();
  ctx.strokeStyle='rgba(255,255,255,'+(t*0.9)+')'; ctx.lineWidth=2;
  ctx.beginPath(); ctx.moveTo(-R*1.5,0); ctx.lineTo(R*1.5,0); ctx.stroke();
  ctx.strokeStyle='rgba(120,230,255,'+(t*0.6)+')'; ctx.lineWidth=1.3;
  ctx.beginPath(); ctx.moveTo(0,-R*0.85); ctx.lineTo(0,R*0.85); ctx.stroke();
  ctx.shadowBlur=0;
}

/* ============================================================
   输入
   ============================================================ */
let dragging=false;
function setPlayerPos(x,y){
  if (ACTIVE_MODES.includes(mode)) {
    player.x=clamp(x,PL_R,W-PL_R); player.y=clamp(y,PL_R,H-PL_R);
  }
}
canvas.addEventListener('pointerdown',e=>{Sfx.ensure(); Sfx.resume(); dragging=true; setPlayerPos(e.clientX,e.clientY);});
canvas.addEventListener('pointermove',e=>{if(dragging)setPlayerPos(e.clientX,e.clientY);});
window.addEventListener('pointerup',()=>dragging=false);

window.addEventListener('keydown',e=>{
  Sfx.ensure(); Sfx.resume();
  const k=e.key.toLowerCase();
  // 成功提示窗打开时：任意键先关窗（否则回车会触发"开始战役"）
  if (!$('successOvl').classList.contains('hidden') && [' ','enter','escape','p'].includes(k)) {
    e.preventDefault(); closeSuccess(); return;
  }
  // 空格/回车 = 暂停/继续切换；B = 炸弹
  if (k==='b'){e.preventDefault();useBomb();}
  // 调参面板打开时，空格/回车/P/Esc 一律先收起面板回到战场
  const arsenalOpen = !$('arsenalOvl').classList.contains('hidden');
  if (k===' '||k==='enter'){ e.preventDefault(); if(arsenalOpen){ closeArsenal(); return; } if([MODE.CAMPAIGN,MODE.ENDLESS,MODE.DAILY,MODE.PRACTICE].includes(mode))pauseGame(); else if(mode===MODE.PAUSE)resumeGame(); }
  if (k==='p'||k==='escape'){ if(arsenalOpen){ closeArsenal(); return; } if([MODE.CAMPAIGN,MODE.ENDLESS,MODE.DAILY,MODE.PRACTICE].includes(mode))pauseGame(); else if(mode===MODE.PAUSE)resumeGame(); }
  if (k==='enter' && mode===MODE.MENU){ startCampaign(); }
});
window.addEventListener('keydown',e=>{
  if (!ACTIVE_MODES.includes(mode)) return;
  const k=e.key.toLowerCase(), sp=(player.speed || 280);
  if(k==='arrowleft'||k==='a')player.x=clamp(player.x-sp*0.016,PL_R,W-PL_R);
  if(k==='arrowright'||k==='d')player.x=clamp(player.x+sp*0.016,PL_R,W-PL_R);
  if(k==='arrowup'||k==='w')player.y=clamp(player.y-sp*0.016,PL_R,H-PL_R);
  if(k==='arrowdown'||k==='s')player.y=clamp(player.y+sp*0.016,PL_R,H-PL_R);
});

function pauseGame(){
  modeBeforePause = mode; mode=MODE.PAUSE; initVolumeSliders();
  $('pauseArsenalBtn').classList.toggle('hidden', modeBeforePause !== MODE.PRACTICE);  // 练习模式才给装备调参入口
  $('pauseMenu').classList.remove('hidden');
}
function resumeGame(){ mode=modeBeforePause; $('pauseMenu').classList.add('hidden'); $('arsenalOvl').classList.add('hidden'); }

/* ============================================================
   UI
   ============================================================ */
function startCampaign(){ resetGame(MODE.CAMPAIGN); }
function startEndless(){ resetGame(MODE.ENDLESS); }
function startPractice(){ resetGame(MODE.PRACTICE); }
function startDaily(){ resetGame(MODE.DAILY); dailySeed = Math.floor(Math.random()*1e6); }

// 每日挑战选择面板
function renderDailyList() {
  const el = $('dailyList');
  el.innerHTML = '';
  const done = dailyDoneMap();
  const n = dailyDoneCount();
  const hint = $('dailyHint');
  if (hint) hint.textContent = '每日刷新 · 每个挑战当天各可挑战一次 · 今日进度 ' + n + '/' + DAILY_CHALLENGES.length;
  DAILY_CHALLENGES.forEach((c, i) => {
    const d = document.createElement('div');
    d.className = 'ui-item';   // 复用悬停/点击 UI 音效委托
    const locked = !!done[c.id];   // 只有这一个挑战打过了才锁
    d.style.cssText = 'padding:11px 13px;border-radius:10px;cursor:'+(locked?'default':'pointer')+';border:1px solid var(--line2);background:linear-gradient(180deg,#202832,#141a22);box-shadow:inset 0 1px 0 rgba(255,255,255,.06);opacity:'+(locked?'0.55':'1')+';transition:filter .12s;';
    if (!locked) { d.addEventListener('mouseenter', ()=> d.style.filter='brightness(1.12)'); d.addEventListener('mouseleave', ()=> d.style.filter=''); }
    d.innerHTML =
      '<div style="display:flex;align-items:center;gap:10px;">' +
        '<div style="font-size:24px;width:34px;text-align:center;color:'+c.color+';">'+c.icon+'</div>' +
        '<div style="flex:1;">' +
          '<div style="font-size:14px;font-weight:800;color:var(--text);">'+c.name+'</div>' +
          '<div style="font-size:11px;color:var(--muted);line-height:1.5;margin-top:2px;">'+c.desc+'</div>' +
        '</div>' +
      '</div>' +
      '<div style="margin-top:8px;padding-top:8px;border-top:1px solid var(--line);font-size:11.5px;">' +
        '<span style="color:var(--danger);">敌人：'+c.enemy+'</span>' +
        '<span style="float:right;color:'+c.color+';font-weight:700;">'+c.rewardDesc+'</span>' +
      '</div>' +
      (locked
        ? '<div style="text-align:center;font-size:11px;color:var(--dim);margin-top:6px;">今日已完成 ✓</div>'
        : '<div style="text-align:center;font-size:11px;color:'+c.color+';margin-top:6px;">点击出击 · 今日还可挑战</div>');
    if (!locked) d.onclick = ()=> selectDaily(i);
    el.appendChild(d);
  });
}

function selectDaily(idx) {
  const c = DAILY_CHALLENGES[idx];
  dailyChallenge = c;
  // 按奖励类型设定倍率
  dailyGoldMul = 1; dailyDropMul = 1; dailyExpMul = 1; dailyWearMul = 1;
  switch (c.rewardType) {
    case 'gold':     dailyGoldMul = 1.6; break;
    case 'droprate': dailyDropMul = 1.4; break;
    case 'exp':      dailyExpMul  = 2.0; break;
    case 'wearless': dailyWearMul = 0.5; break;
    case 'both':     dailyGoldMul = 1.3; dailyExpMul = 1.3; break;
  }
  // 记录每日挑战已选，进入战斗
  $('dailyOvl').classList.add('hidden');
  startDaily();
}

$('dailyClose').onclick = ()=>{ $('dailyOvl').classList.add('hidden'); $('menu').classList.remove('hidden'); };

$('mCampaign').onclick = ()=>{ $('menu').classList.add('hidden'); renderLevelSelect(); $('levelSelect').classList.remove('hidden'); };
$('mEndless').onclick = ()=>{ $('menu').classList.add('hidden'); startEndless(); };
$('mPractice').onclick = openPractice;
$('practiceClose').onclick = ()=>{ $('practiceOvl').classList.add('hidden'); $('menu').classList.remove('hidden'); };
$('practiceStart').onclick = ()=>{ $('practiceOvl').classList.add('hidden'); startPractice(); };
$('mDaily').onclick = ()=>{ $('menu').classList.add('hidden'); renderDailyList(); $('dailyOvl').classList.remove('hidden'); };
$('mAchieve').onclick = ()=>{ renderAchieve(); $('achieveOvl').classList.remove('hidden'); };
$('achieveClose').onclick = ()=> $('achieveOvl').classList.add('hidden');

// 难度选择按钮
function renderDifficultyUI() {
  const d = DIFFICULTIES[difficulty];
  $('diffHint').textContent = d.name + ' · 奖励 ' + Math.round(d.rewardMul*100) + '%';
  $('diffHint').style.color = d.color;
  document.querySelectorAll('.diff-btn').forEach(btn => {
    btn.classList.toggle('active', parseInt(btn.dataset.diff) === difficulty);
  });
}
document.querySelectorAll('.diff-btn').forEach(btn => {
  btn.onclick = () => {
    difficulty = parseInt(btn.dataset.diff);
    save.difficulty = difficulty;
    saveStore();
    renderDifficultyUI();
    Sfx.pickup();
  };
});
$('mRank').onclick = ()=>{ toast('📊 排行', '本地最高分 '+save.best+'（联网排行需后端，暂存本地）'); };
$('mWing').onclick = ()=>{ toast('✈️ 僚机', '僚机等级 '+wingmanLevel+'（通过关卡强化解锁）'); };

/* ---------- 存档管理 · 六槽位 ---------- */
function openSave() {
  $('menu').classList.add('hidden');
  $('saveOvl').classList.remove('hidden');
  renderSaveList();
}
function closeSave() {
  $('saveOvl').classList.add('hidden');
  $('menu').classList.remove('hidden');
  initMenu();
}
function renderSaveList() {
  const el = $('saveList'); if (!el) return;
  el.innerHTML = '';
  const meta = readSlotMeta();
  for (let i = 0; i < SLOT_COUNT; i++) {
    const has = slotHasData(i);
    const sm = meta[i] || {};
    const isCur = i === activeSlot;
    const cleared = sm.cleared || 0;

    const d = document.createElement('div');
    d.className = 'ui-item';
    d.style.cssText = 'padding:10px 12px;border-radius:10px;text-align:left;border:1px solid ' +
      (isCur ? '#6dffb0' : 'var(--line2)') + ';background:linear-gradient(180deg,#202832,#141a22);' +
      'box-shadow:inset 0 1px 0 rgba(255,255,255,.06)' + (isCur ? ', 0 0 0 1px #6dffb044' : '') + ';';

    let head = '<div style="display:flex;align-items:center;gap:7px;flex-wrap:wrap;">' +
      '<span style="font-size:13px;font-weight:800;color:' + (isCur ? '#6dffb0' : 'var(--text)') + ';">槽位 ' + (i + 1) + '</span>';
    if (isCur) head += '<span style="font-size:10px;padding:1px 7px;border-radius:8px;background:#6dffb01f;border:1px solid #6dffb055;color:#6dffb0;">使用中</span>';
    if (has && cleared >= 12) head += '<span style="font-size:10px;padding:1px 7px;border-radius:8px;background:#ffd7001f;border:1px solid #ffd70055;color:#ffd700;">已通关</span>';
    head += '<span style="margin-left:auto;font-size:10.5px;color:var(--dim);">' + (has ? timeAgo(sm.updatedAt) : '空存档') + '</span></div>';

    const body = has
      ? '<div style="margin-top:6px;font-size:11.5px;color:var(--muted);line-height:1.7;">' +
          '驾驶员 <b style="color:var(--cyan)">Lv' + (sm.level || 1) + '</b> · 金币 <b style="color:var(--gold)">' + (sm.gold || 0) + '</b><br>' +
          '战役 <b style="color:var(--text)">' + cleared + '/12</b> · 最高分 ' + (sm.best || 0) + ' · 时长 ' + fmtPlayTime(sm.playTime) +
        '</div>'
      : '<div style="margin-top:6px;font-size:11.5px;color:var(--dim);">还没有进度，点「新建存档」从零开始</div>';

    let btns = '';
    if (!has) {
      btns = '<button class="btn primary" data-act="new" data-slot="' + i + '" style="width:auto;padding:6px 14px;font-size:12px;">新建存档</button>';
    } else if (isCur) {
      btns = '<button class="btn" data-act="wipe" data-slot="' + i + '" style="width:auto;padding:6px 14px;font-size:12px;color:var(--danger);">重置此档</button>';
    } else {
      btns = '<button class="btn primary" data-act="load" data-slot="' + i + '" style="width:auto;padding:6px 14px;font-size:12px;">读取</button>' +
             '<button class="btn" data-act="wipe" data-slot="' + i + '" style="width:auto;padding:6px 12px;font-size:12px;">覆盖</button>' +
             '<button class="btn" data-act="del" data-slot="' + i + '" style="width:auto;padding:6px 12px;font-size:12px;color:var(--danger);">删除</button>';
    }
    d.innerHTML = head + body +
      '<div style="display:flex;gap:6px;margin-top:9px;justify-content:flex-end;flex-wrap:wrap;">' + btns + '</div>';
    el.appendChild(d);
  }
  el.querySelectorAll('button[data-act]').forEach(b => {
    b.onclick = () => {
      const i = parseInt(b.dataset.slot, 10);
      const act = b.dataset.act;
      Sfx.pickup();
      if (act === 'new' || act === 'load') switchSlot(i);
      else if (act === 'wipe') confirmDialog('覆盖 / 重置存档',
        '槽位 ' + (i + 1) + ' 的进度会全部清空，从第 1 关重新开始。此操作不可撤销，确定吗？', () => wipeSlot(i));
      else if (act === 'del') confirmDialog('删除存档',
        '确定删除槽位 ' + (i + 1) + ' 的存档吗？此操作不可撤销。', () => deleteSlot(i));
    };
  });
}
$('mSave').onclick = openSave;
$('saveClose').onclick = closeSave;

$('mHangar').onclick = openHangar;
$('mShop').onclick = openShop;
$('hangarClose').onclick = ()=>{ $('hangarOvl').classList.add('hidden'); $('menu').classList.remove('hidden'); initMenu(); };
$('shopClose').onclick = ()=>{ $('shopOvl').classList.add('hidden'); $('menu').classList.remove('hidden'); initMenu(); };

$('bombBtn').onclick = useBomb;

// —— 音量调节：音乐 / 音效 分开的滑动条（在暂停菜单内）——
function initVolumeSliders() {
  $('musicVolSlider').value = Math.round(Sfx.getMusicVolume()*100);
  $('sfxVolSlider').value = Math.round(Sfx.getSfxVolume()*100);
  $('musicVolVal').textContent = $('musicVolSlider').value + '%';
  $('sfxVolVal').textContent = $('sfxVolSlider').value + '%';
}
$('musicVolSlider').addEventListener('input', ()=>{
  const v = parseInt($('musicVolSlider').value)/100;
  Sfx.setMusicVolume(v);
  $('musicVolVal').textContent = $('musicVolSlider').value + '%';
  save.volume = Object.assign({}, save.volume, { music: v }); saveStore();
  Sfx.ensure(); Sfx.resume();
});
$('sfxVolSlider').addEventListener('input', ()=>{
  const v = parseInt($('sfxVolSlider').value)/100;
  Sfx.setSfxVolume(v);
  $('sfxVolVal').textContent = $('sfxVolSlider').value + '%';
  save.volume = Object.assign({}, save.volume, { sfx: v }); saveStore();
  Sfx.ensure(); Sfx.resume();
  if (v > 0) Sfx.pickup();   // 拖动音效条时给个即时反馈
});
// 启动时恢复上次调好的音量（音量调节要"留得住"，否则每次进游戏都回到默认值）
if (save.volume && save.volume.music != null) Sfx.setMusicVolume(save.volume.music);
if (save.volume && save.volume.sfx   != null) Sfx.setSfxVolume(save.volume.sfx);
$('pauseWeaponBtn').onclick = ()=>{ renderWeaponPanel(); $('weaponPanel').classList.remove('hidden'); };
$('pauseArsenalBtn').onclick = ()=> openArsenal(true);    // 暂停菜单 → 装备调参
$('arsenalBtn').onclick = ()=> openArsenal(false);         // HUD 快捷钮 → 暂停并调参
$('arsenalResume').onclick = closeArsenal;
$('arsenalClose').onclick = closeArsenal;
$('resumeBtn').onclick = resumeGame;
// 暂停后「重新开始」按当前模式重开（原先固定重开战役模式，练习/无限下会跳错模式）
$('restartBtn').onclick = ()=>{
  const m = modeBeforePause;
  if (m === MODE.PRACTICE) startPractice();
  else if (m === MODE.ENDLESS) startEndless();
  else if (m === MODE.DAILY) startDaily();
  else startCampaign();
};
$('quitBtn').onclick = ()=>{ Sfx.stopMusic(); mode=MODE.MENU; hideAllOvl(); $('menu').classList.remove('hidden'); initMenu(); };
$('againBtn').onclick = ()=>{ $('gameOver').classList.add('hidden'); openShop(); };
$('overMenuBtn').onclick = ()=>{ Sfx.stopMusic(); mode=MODE.MENU; hideAllOvl(); $('menu').classList.remove('hidden'); initMenu(); };
// 失败画面按钮：重新出击（回到当前模式重开）/ 返回主菜单
$('defeatAgainBtn').onclick = ()=>{ $('defeatOvl').classList.add('hidden'); restartCurrent(); };
$('defeatMenuBtn').onclick = ()=>{ Sfx.stopMusic(); mode=MODE.MENU; hideAllOvl(); $('menu').classList.remove('hidden'); initMenu(); };
$('weaponClose').onclick = ()=> $('weaponPanel').classList.add('hidden');

/* ---------- 机库 ---------- */
function openHangar() {
  $('menu').classList.add('hidden');
  renderHangar();
  $('hangarOvl').classList.remove('hidden');
}
function renderHangar() {
  $('hangarGold').textContent = save.gold;
  const el = $('shipList'); el.innerHTML='';
  for (const id of Object.keys(SHIP_TYPES)) {
    const s = SHIP_TYPES[id];
    const unlocked = shipUnlocked(id);
    const sel = save.selectedShip === id;
    const st = shipStats(id);
    const w = shipWearOf(id);
    const d = document.createElement('div');
    d.className = 'ui-item';   // 用于悬停/点击 UI 音效委托
    d.style.cssText = 'padding:11px 13px;border-radius:5px;cursor:'+(unlocked?'pointer':'default')+';border:1px solid '+(sel?'#4fd6ff':'#47525f')+';background:'+(sel?'repeating-linear-gradient(90deg, rgba(255,255,255,.03) 0 1px, transparent 1px 3px), linear-gradient(180deg,#2c4a66,#152433)':'repeating-linear-gradient(90deg, rgba(255,255,255,.025) 0 1px, transparent 1px 3px), linear-gradient(180deg,#333c48,#202832 45%,#11161e)')+';box-shadow:inset 0 1px 0 rgba(255,255,255,.2), inset 0 -2px 4px rgba(0,0,0,.55), 0 2px 5px rgba(0,0,0,.4);transition:filter .12s;';
    if (unlocked) { d.addEventListener('mouseenter', ()=> d.style.filter='brightness(1.15)'); d.addEventListener('mouseleave', ()=> d.style.filter=''); }
    const statLine = unlocked
      ? '移速 <b>'+st.speed.toFixed(0)+'</b> · 血量 <b>'+st.maxHp+'</b> · 护甲 <b>'+st.armor+'</b> · 攻击 <b>'+st.atk+'</b> · 射速 <b>x'+st.rate.toFixed(1)+'</b>'
      : '🔒 未解锁　<span style="color:var(--orange)">'+shipUnlockText(id)+'</span>';
    const wearLine = unlocked && (w.hull||0)>0 ? ' · 磨损 '+Math.round(w.hull)+'%' : '';
    d.innerHTML = '<div style="font-size:16px;font-weight:700;color:'+s.color+'">'+s.icon+' '+s.name+(sel?' <span style="color:var(--cyan)">✓ 使用中</span>':'')+'</div>'
      + '<div style="font-size:11.5px;color:var(--muted);margin-top:3px;">'+s.desc+'</div>'
      + '<div style="font-size:12px;margin-top:6px;color:var(--text);">'+statLine+'<span style="color:var(--orange)">'+wearLine+'</span></div>';
    // 悬停显示立绘
    d.addEventListener('mouseenter', ()=> showPortrait(s.img));
    d.addEventListener('mouseleave', hidePortrait);
    d.addEventListener('touchstart', ()=> showPortrait(s.img), {passive:true});
    if (unlocked && !sel) d.onclick = ()=>{ save.selectedShip = id; saveStore(); renderHangar(); toast('已切换机型', s.name); };
    el.appendChild(d);
  }
}

/* ---------- 商店 ---------- */
function openShop() {
  $('menu').classList.add('hidden');
  renderShop();
  $('shopOvl').classList.remove('hidden');
}

// 各升级项的显示与价格
const SHOP_ITEMS = [
  { key:'engine', name:'引擎升级', icon:'🚀', desc:'移速 +5%', base:40, img:'assets/portraits/u_engine.png', apply:()=>{ shipUpgradesOf(save.selectedShip).engine++; } },
  { key:'armor',  name:'装甲升级', icon:'🛡️', desc:'护甲 +6%、血量 +4%', base:50, img:'assets/portraits/u_armor.png', apply:()=>{ shipUpgradesOf(save.selectedShip).armor++; } },
  { key:'power',  name:'火力升级', icon:'⚔️', desc:'攻击力 +5%', base:45, img:'assets/portraits/u_power.png', apply:()=>{ shipUpgradesOf(save.selectedShip).power++; } },
  { key:'rate',   name:'射速升级', icon:'⚡', desc:'射速 +8%', base:55, img:'assets/portraits/u_rate.png', apply:()=>{ shipUpgradesOf(save.selectedShip).rate++; } },
];
function shopPrice(item, level) { return item.base + level * item.base; }

function renderShop() {
  $('shopGold').textContent = save.gold;
  const ship = SHIP_TYPES[save.selectedShip];
  $('shopShip').textContent = ship.icon + ' ' + ship.name;
  const w = shipWearOf(save.selectedShip);
  // 磨损提示
  const hullW = Math.round(w.hull||0);
  let weaponWear = '';
  for (const t of Object.keys(WEAPON_TYPES)) { if (w.weapons[t]) weaponWear += WEAPON_TYPES[t].name + ' ' + Math.round(w.weapons[t]) + '% · '; }
  $('shopWear').textContent = '磨损度：机体 ' + hullW + '%' + (weaponWear ? '　武器 '+weaponWear.slice(0,-3) : '') + (hullW>0||weaponWear ? '' : '（状态良好）');

  const el = $('shopBody'); el.innerHTML='';

  // —— 机体升级 ——
  const up = shipUpgradesOf(save.selectedShip);
  for (const it of SHOP_ITEMS) {
    const lv = up[it.key];
    const price = shopPrice(it, lv);
    el.appendChild(shopBtn(it.icon+' '+it.name+' <span style="color:var(--muted)">Lv'+lv+'</span>', it.desc+'　'+price+' 金币', price, ()=>{ up[it.key]++; saveStore(); renderShop(); showSuccess('upgrade', '升级成功', '<b>'+it.name+'</b> → Lv'+up[it.key]+'<br>'+it.desc, price); }, it.img));
  }

  // —— 永久武器升级 ——
  for (const t of Object.keys(WEAPON_TYPES)) {
    const lv = save.weaponLevels[t] || 0;
    const price = 30 + lv*40;
    const name = WEAPON_TYPES[t].name;
    const desc = lv===0 ? '解锁武器　'+price+' 金币' : '武器升级 → Lv'+(lv+1)+'　'+price+' 金币';
    el.appendChild(shopBtn('🔫 '+name+' <span style="color:var(--muted)">'+(lv===0?'未解锁':'Lv'+lv)+'</span>', desc, price, ()=>{ save.weaponLevels[t]=(lv||0)+1; saveStore(); renderShop(); showSuccess('buy', lv===0?'解锁成功':'购买成功', '武器 <b>'+name+'</b> → Lv'+(lv+1), price); }, WEAPON_TYPES[t].img));
  }

  // —— 永久附魔升级 ——
  for (const e of Object.keys(ENCHANT)) {
    const lv = save.enchantPerm[e] || 0;
    const price = 60 + lv*60;
    el.appendChild(shopBtn('✨ 附魔·'+ENCHANT[e].name+' <span style="color:var(--muted)">Lv'+lv+'</span>', ENCHANT[e].desc+'　'+price+' 金币', price, ()=>{ save.enchantPerm[e]=(lv||0)+1; saveStore(); renderShop(); showSuccess('buy', '购买成功', '附魔 <b>'+ENCHANT[e].name+'</b> → Lv'+(lv+1), price); }, ENCHANT[e].img));
  }

  // —— 修复磨损 ——
  const fixPrice = Math.ceil((hullW*1.5) + Object.values(w.weapons).reduce((a,b)=>a+b,0)*0.5);
  const noWear = fixPrice <= 0;   // 零磨损时点修复：给"无需修复"提示，而不是假装修好了
  el.appendChild(shopBtn('🔧 全面修复', noWear ? '当前机体状态良好，无需修整' : '清除当前机型全部磨损　'+fixPrice+' 金币', fixPrice, ()=>{
    if (noWear) { showSuccess('repair', '无需修复', '机体状态良好，<b>零磨损</b>', 0); return; }
    w.hull=0; w.weapons={}; save.wear[save.selectedShip]=w; saveStore(); renderShop();
    showSuccess('repair', '修复成功', '机体磨损已全部清除，<b>焕然一新</b>', fixPrice);
  }, 'assets/portraits/mechanic.png'));
}

function shopBtn(title, desc, price, fn, img) {
  const d = document.createElement('div');
  d.className = 'ui-item';   // 用于悬停/点击 UI 音效委托
  const afford = save.gold >= price;
  d.style.cssText = 'padding:9px 12px;border-radius:5px;border:1px solid #47525f;background:repeating-linear-gradient(90deg, rgba(255,255,255,.025) 0 1px, transparent 1px 3px), linear-gradient(180deg,#333c48,#202832 45%,#11161e);box-shadow:inset 0 1px 0 rgba(255,255,255,.2), inset 0 -2px 4px rgba(0,0,0,.55), 0 2px 5px rgba(0,0,0,.4);cursor:'+(afford?'pointer':'not-allowed')+';opacity:'+(afford?'1':'0.5')+';transition:filter .12s;';
  d.addEventListener('mouseenter', ()=>{ if(afford) d.style.filter='brightness(1.15)'; });
  d.addEventListener('mouseleave', ()=>{ d.style.filter=''; });
  d.innerHTML = '<div style="font-size:14px;font-weight:700;text-shadow:0 1px 2px rgba(0,0,0,.8);">'+title+'</div><div style="font-size:11px;color:#a6b0bf;margin-top:2px;">'+desc+'</div>';
  // 悬停显示立绘
  d.addEventListener('mouseenter', ()=> showPortrait(img));
  d.addEventListener('mouseleave', hidePortrait);
  if (afford) d.onclick = ()=>{ confirmDialog('确认升级', '确定花费 '+price+' 金币升级「'+title.replace(/<[^>]*>/g,'')+'」吗？', ()=>{ save.gold -= price; fn(); }); };
  return d;
}

function renderLevelSelect() {
  const grid = $('levelGrid'); grid.innerHTML='';
  let totalStars = 0;
  for (let i=1;i<=12;i++) {
    const stars = save.stars[i] || 0;
    totalStars += stars;
    const unlocked = i <= save.unlocked;
    const d = document.createElement('div');
    d.className = 'ui-item';   // 用于悬停/点击 UI 音效委托
    d.style.cssText = 'padding:12px 6px;border-radius:10px;text-align:center;cursor:pointer;background:'+(unlocked?'linear-gradient(135deg,#12233f,#0c1730)':'rgba(20,25,40,.4)')+';border:1px solid '+(unlocked?'var(--line2)':'var(--line)')+';color:'+(unlocked?'var(--text)':'var(--dim)')+';';
    d.innerHTML = '<div style="font-size:18px;">'+(unlocked?i:'🔒')+'</div><div style="font-size:11px;margin-top:4px;">' + '★'.repeat(stars) + '☆'.repeat(3-stars) + '</div>';
    if (unlocked) d.onclick = ()=>{ $('levelSelect').classList.add('hidden'); startCampaignAt(i); };
    grid.appendChild(d);
  }
  $('levelStars').textContent = '已获得 ★ ' + totalStars + ' / 36';
}

function startCampaignAt(level) {
  resetGame(MODE.CAMPAIGN);
  wave = level;
  threat = 1 + wave*0.35;
  $('waveLabel').textContent = '第 ' + wave + ' 关';
  startBGM(MODE.CAMPAIGN, wave);   // 按所选关卡重选对应 BGM
}

$('levelBack').onclick = ()=>{ $('levelSelect').classList.add('hidden'); $('menu').classList.remove('hidden'); };
$('resetProg').onclick = ()=>{ save.stars={}; save.unlocked=1; saveStore(); renderLevelSelect(); };

function toast(title, msg) {
  const t = document.createElement('div');
  t.className='toast';
  t.innerHTML='<h3>'+title+'</h3><p>'+(msg||'')+'</p>';
  document.body.appendChild(t);
  setTimeout(()=>t.remove(), 1400);
}

/* ============================================================
   购买 / 升级 / 修复「成功」提示 —— 收银特效小窗
   · 金色（或修复=绿色）冲击波 + 金币飞散 + 徽章旋转弹入
   · 点击任意位置（或 Esc / 空格）关闭
   ============================================================ */
const SUCCESS_KINDS = {
  buy:     { icon:'💰', title:'购买成功', cls:'' },
  upgrade: { icon:'⬆',  title:'升级成功', cls:'' },
  repair:  { icon:'🔧', title:'修复成功', cls:'k-repair' },
};
let successOpenedAt = 0;

function showSuccess(kind, title, msg, cost) {
  const cfg = SUCCESS_KINDS[kind] || SUCCESS_KINDS.buy;
  const ovl = $('successOvl');
  ovl.className = 'ovl' + (cfg.cls ? ' ' + cfg.cls : '');   // 重置类名（顺带移除 hidden）
  $('successIcon').textContent = cfg.icon;
  $('successTitle').textContent = title || cfg.title;
  $('successMsg').innerHTML = msg || '';
  // 花费金币
  const cw = $('successCostWrap');
  if (cost > 0) { $('successCost').textContent = '− ' + cost + ' 金币'; cw.style.display = ''; }
  else { cw.style.display = 'none'; }

  // —— 金币飞散粒子 ——
  const layer = $('successCoins');
  layer.innerHTML = '';
  const N = 18;
  for (let i = 0; i < N; i++) {
    const c = document.createElement('div');
    c.className = 's-coin';
    // 向上半球散开：角度 -175° ~ -5°，落回卡片下方
    const ang = (-175 + Math.random() * 170) * Math.PI / 180;
    const dist = 85 + Math.random() * 135;
    const tx = Math.cos(ang) * dist;
    const ty = Math.sin(ang) * dist + 190 + Math.random() * 70;
    c.style.setProperty('--tx', tx.toFixed(0) + 'px');
    c.style.setProperty('--ty', ty.toFixed(0) + 'px');
    c.style.setProperty('--sz', (11 + Math.random() * 8).toFixed(0) + 'px');
    c.style.setProperty('--dur', (0.78 + Math.random() * 0.55).toFixed(2) + 's');
    c.style.setProperty('--dly', (Math.random() * 0.15).toFixed(2) + 's');
    layer.appendChild(c);
  }

  successOpenedAt = Date.now();
  Sfx.cash();   // 收银音效
}

function closeSuccess() {
  const ovl = $('successOvl');
  if (ovl.classList.contains('hidden')) return;
  ovl.classList.add('hidden');
}
// 鼠标点击关闭；弹出后极短时间内的点击忽略（避免同一次点击顺带把窗关掉）
$('successOvl').addEventListener('click', () => {
  if (Date.now() - successOpenedAt < 180) return;
  closeSuccess();
});

/* ============================================================
   启动
   ============================================================ */
function initMenu() {
  $('menuBest').textContent = save.best;
  $('menuKills').textContent = save.kills;
  const total = Object.values(save.stars).reduce((a,b)=>a+b,0);
  $('menuProgress').textContent = total + '/36';
  const ship = SHIP_TYPES[save.selectedShip];
  $('menuShip').textContent = ship.icon + ' ' + ship.name;
  $('menuGold').textContent = save.gold;
  // 驾驶员等级
  $('menuLevel').textContent = 'Lv' + save.playerLevel;
  const need = expNeeded(save.playerLevel);
  const pct = Math.min(100, Math.round(save.playerExp / need * 100));
  $('menuExpBar').style.width = pct + '%';
  $('menuExpText').textContent = save.playerExp + '/' + need;
  // 左上角加成状态：掉落率 / 磨损减免
  $('menuDropBuff').textContent = '掉率 +' + Math.round(levelDropBonus()*100) + '%';
  $('menuWearBuff').textContent = '磨损 -' + Math.round(Math.min(0.5, levelWearReduction())*100) + '%';
  // 难度选择 UI
  renderDifficultyUI();
  const dn = dailyDoneCount(), dtot = DAILY_CHALLENGES.length;
  $('dailyState').textContent = dn === 0 ? '今日未挑战'
                              : dn >= dtot ? '今日已全清 ' + dn + '/' + dtot
                              : '今日 ' + dn + '/' + dtot;
}
initMenu();
spawnStars();

/* ---------- 音频解锁：菜单里的悬停/点击音效也要能响 ---------- */
Sfx.ensure();      // 提前建好 AudioContext（未解锁时是 suspended，不报错）
Sfx.preload();     // 预解码采样，避免首次点击因等待解码而丢失声音
const unlockAudio = () => { Sfx.ensure(); Sfx.resume(); };
document.addEventListener('pointerdown', unlockAudio, { once: true });
document.addEventListener('keydown', unlockAudio, { once: true });

/* ---------- UI 悬停/点击音效（全局委托：机库/商店/练习面板/关卡选择/按钮通用） ---------- */
const UI_SFX_SEL = 'button, .ui-item, .opt';
document.addEventListener('mouseover', (e) => {
  const el = e.target.closest(UI_SFX_SEL);
  if (el && !el.disabled) Sfx.hover();          // 轻微滑动声
});
document.addEventListener('click', (e) => {
  if (e.target.closest('canvas')) return;        // 战斗画布点击（拖飞机）不响
  Sfx.uiClick();                                 // 任何菜单/面板/空白点击都响确认声
});
requestAnimationFrame(loop);
