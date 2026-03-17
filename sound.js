// ============================================================
// SOUND ENGINE — レトロ8bit・控えめ (Web Audio API)
// ============================================================
const SFX = (() => {
  let ctx = null;
  let vol = 0.14; // 控えめ master volume

  function ac() {
    if (!ctx) ctx = new (window.AudioContext || window.webkitAudioContext)();
    if (ctx.state === 'suspended') ctx.resume();
    return ctx;
  }

  // 矩形波の���いビー���
  function beep(freq, dur, v, t0) {
    const c = ac(), t = t0 ?? c.currentTime;
    const o = c.createOscillator();
    const g = c.createGain();
    o.type = 'square';
    o.frequency.value = freq;
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(v * vol, t + 0.004);
    g.gain.setValueAtTime(v * vol, t + dur - 0.015);
    g.gain.linearRampToValueAtTime(0, t + dur);
    o.connect(g); g.connect(c.destination);
    o.start(t); o.stop(t + dur + 0.02);
  }

  // 正弦波ベル
  function bell(freq, dur, v, t0) {
    const c = ac(), t = t0 ?? c.currentTime;
    const o = c.createOscillator();
    const g = c.createGain();
    o.type = 'sine';
    o.frequency.value = freq;
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(v * vol, t + 0.005);
    g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    o.connect(g); g.connect(c.destination);
    o.start(t); o.stop(t + dur + 0.02);
  }

  // 周波数スイープ
  function sweep(f0, f1, dur, v, t0) {
    const c = ac(), t = t0 ?? c.currentTime;
    const o = c.createOscillator();
    const g = c.createGain();
    o.type = 'square';
    o.frequency.setValueAtTime(f0, t);
    o.frequency.exponentialRampToValueAtTime(f1, t + dur);
    g.gain.setValueAtTime(v * vol, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    o.connect(g); g.connect(c.destination);
    o.start(t); o.stop(t + dur + 0.02);
  }

  // ノイズ（ドラム・爆発用）
  function noise(dur, v, cutoff, t0) {
    const c = ac(), t = t0 ?? c.currentTime;
    const buf = c.createBuffer(1, Math.ceil(c.sampleRate * dur), c.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    const src = c.createBufferSource();
    src.buffer = buf;
    const filt = c.createBiquadFilter();
    filt.type = 'lowpass'; filt.frequency.value = cutoff;
    const g = c.createGain();
    g.gain.setValueAtTime(v * vol, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    src.connect(filt); filt.connect(g); g.connect(c.destination);
    src.start(t); src.stop(t + dur);
  }

  return {
    setVol(v) { vol = v; },

    // ── 牌を引く: 短いカチッ ──────────────────────────────
    draw() {
      const c = ac(), t = c.currentTime;
      noise(0.04, 0.5, 1800, t);
      beep(480, 0.04, 0.12, t);
    },

    // ── 牌を捨てる: コツン ───────────────────────────────
    discard() {
      const c = ac(), t = c.currentTime;
      noise(0.05, 0.4, 700, t);
      beep(280, 0.05, 0.15, t);
    },

    // ── リーチ: ビシッ（上昇スイープ） ───────────────────
    riichi() {
      const c = ac(), t = c.currentTime;
      sweep(180, 720, 0.10, 0.45, t);
      beep(720, 0.12, 0.30, t + 0.08);
    },

    // ── ダブルリーチ: リーチ×強 ──────────────────────────
    doubleRiichi() {
      const c = ac(), t = c.currentTime;
      sweep(180, 900, 0.12, 0.5, t);
      beep(900, 0.08, 0.3, t + 0.10);
      beep(1200, 0.10, 0.25, t + 0.20);
    },

    // ── ツモ上がり: 8bitファンファーレ ───────────────────
    tsumo() {
      const c = ac(), t = c.currentTime;
      [[523,0],[659,0.07],[784,0.14],[1047,0.21]].forEach(([f,dt]) => beep(f, 0.10, 0.35, t+dt));
      bell(1047, 0.5, 0.3, t + 0.36);
    },

    // ── ロン: 重めの和音 ─────────────────────────────────
    ron() {
      const c = ac(), t = c.currentTime;
      beep(294, 0.25, 0.30, t);
      beep(370, 0.25, 0.25, t + 0.02);
      beep(440, 0.25, 0.20, t + 0.04);
      bell(880, 0.4, 0.25, t + 0.08);
    },

    // ── 役満: 派手なファンファーレ ───────────────────────
    yakuman() {
      const c = ac(), t = c.currentTime;
      [262,330,392,523,659,784,1047].forEach((f,i) => beep(f, 0.10, 0.4, t + i*0.07));
      bell(1047, 0.8, 0.35, t + 0.56);
    },

    // ── ポン ────────────────────────────────────────────
    pon() {
      const c = ac(), t = c.currentTime;
      beep(440, 0.06, 0.3, t);
      beep(660, 0.07, 0.25, t + 0.05);
    },

    // ── カン ─────────────────────────────────────────────
    kan() {
      const c = ac(), t = c.currentTime;
      sweep(350, 160, 0.18, 0.4, t);
      noise(0.12, 0.35, 600, t);
    },

    // ── 北抜き: シャリン ─────────────────────────────────
    kita() {
      const c = ac(), t = c.currentTime;
      [784, 1047, 1319].forEach((f,i) => bell(f, 0.18, 0.28, t + i*0.05));
    },

    // ── 地雷設置: ピッピッ ───────────────────────────────
    minePlant() {
      const c = ac(), t = c.currentTime;
      beep(880, 0.05, 0.28, t);
      beep(880, 0.05, 0.28, t + 0.10);
    },

    // ── 地雷爆発: ドカーン！ ─────────────────────────────
    mineExplode() {
      const c = ac(), t = c.currentTime;
      // 爆発初動: 高周波バースト
      noise(0.6, 0.06, 4000, t);
      // 重低音の衝撃波
      sweep(180, 25, 0.55, 0.9, t + 0.02);
      beep(55, 0.45, 0.7, t + 0.02);
      beep(80, 0.35, 0.5, t + 0.04);
      // 中音の破裂音
      noise(0.5, 0.4, 1200, t + 0.03);
      noise(0.3, 0.3, 500, t + 0.1);
      // 余韻のゴロゴロ
      sweep(120, 30, 0.2, 0.6, t + 0.35);
      noise(0.15, 0.5, 200, t + 0.4);
    },

    // ── スチール: シュッ ─────────────────────────────────
    steal() {
      const c = ac(), t = c.currentTime;
      sweep(600, 1400, 0.09, 0.35, t);
    },

    // ── 白変換: ポーン ───────────────────────────────────
    haku() {
      const c = ac(), t = c.currentTime;
      bell(1047, 0.35, 0.32, t);
      bell(1319, 0.28, 0.22, t + 0.06);
    },

    // ── 闇: ドロン ──────────────────────────────────────
    yami() {
      const c = ac(), t = c.currentTime;
      sweep(420, 80, 0.28, 0.35, t);
      noise(0.18, 0.2, 400, t + 0.08);
    },

    // ── 光: キラン ──────────────────────────────────────
    light() {
      const c = ac(), t = c.currentTime;
      sweep(500, 2000, 0.18, 0.28, t);
      [1047,1319,1568].forEach((f,i) => bell(f, 0.15, 0.2, t + 0.15 + i*0.05));
    },

    // ── カンドラ ─────────────────────────────────────────
    dora() {
      const c = ac(), t = c.currentTime;
      bell(1319, 0.3, 0.3, t);
      bell(1661, 0.25, 0.2, t + 0.04);
    },

    // ── テンパイ ─────────────────────────────────────────
    tenpai() {
      const c = ac(), t = c.currentTime;
      beep(660, 0.08, 0.22, t);
      beep(880, 0.09, 0.20, t + 0.07);
    },

    // ── ゲーム開始 ───────────────────────────────────────
    gameStart() {
      const c = ac(), t = c.currentTime;
      [262,330,392,523].forEach((f,i) => beep(f, 0.09, 0.3, t + i*0.07));
      bell(523, 0.4, 0.28, t + 0.32);
    },

    // ── 汎用UIボタン ─────────────────────────────────────
    btn() {
      const c = ac(), t = c.currentTime;
      beep(440, 0.06, 0.18, t);
    },

    // ── 選択 ─────────────────────────────────────────────
    select() {
      const c = ac(), t = c.currentTime;
      beep(660, 0.06, 0.15, t);
    },
  };
})();



// ============================================================
// BGM ENGINE — MP3ストリーミング (GitHub raw)
// ============================================================
const BGM_TRACKS = {
  title: [
    '秋月の夜',
    'ファーストステップ',
    'yourself',
  ],
  game: [
    '思考のパズル',
    'シンキング',
    'ファーストステップ',
    'yourself',
  ],
};
const BGM_BASE = 'https://raw.githubusercontent.com/teddybeerbear/teddybeerbear/main/BGM/';

const BGM = (() => {
  let audio = null;
  let _scene = null;          // 'title' | 'game'
  let _trackIdx = 0;
  let _fadeTimer = null;
  let _volume = 0.35;
  let _muted = false;

  function _url(name){
    return BGM_BASE + encodeURIComponent(name) + '.mp3';
  }

  function _clearFade(){
    if(_fadeTimer){ clearInterval(_fadeTimer); _fadeTimer = null; }
  }

  function _stop(){
    _clearFade();
    if(audio){
      audio.pause();
      audio.onended = null;
      audio.onerror = null;
      audio = null;
    }
  }

  function _play(url, vol){
    _stop();
    audio = new Audio(url);
    audio.volume = vol ?? _volume;
    audio.preload = 'auto';
    audio.onended = () => { _next(); };
    audio.onerror = () => {
      console.warn('BGM load error:', url);
      setTimeout(_next, 1000);
    };
    // ユーザー操作後でないと再生できないブラウザへの対応
    const p = audio.play();
    if(p) p.catch(()=>{});
  }

  function _next(){
    if(!_scene) return;
    const list = BGM_TRACKS[_scene];
    if(!list || list.length === 0) return;
    _trackIdx = (_trackIdx + 1) % list.length;
    _play(_url(list[_trackIdx]));
  }

  function fadeIn(scene){
    if(!scene || !BGM_TRACKS[scene]) return;
    _scene = scene;
    const list = BGM_TRACKS[scene];
    // シーン切り替え時はランダムスタート
    _trackIdx = Math.floor(Math.random() * list.length);
    _play(_url(list[_trackIdx]), 0);
    // フェードイン
    _clearFade();
    let v = 0;
    _fadeTimer = setInterval(() => {
      v = Math.min(v + 0.02, _volume);
      if(audio) audio.volume = _muted ? 0 : v;
      if(v >= _volume){ _clearFade(); }
    }, 60);
  }

  function fadeOut(cb){
    _clearFade();
    if(!audio){ if(cb) cb(); return; }
    let v = audio.volume;
    _fadeTimer = setInterval(() => {
      v = Math.max(v - 0.025, 0);
      if(audio) audio.volume = v;
      if(v <= 0){
        _clearFade();
        _stop();
        if(cb) cb();
      }
    }, 60);
  }

  function setMute(on){
    _muted = on;
    if(audio) audio.volume = on ? 0 : _volume;
  }
  function setVolume(v){
    _volume = Math.max(0, Math.min(1, v));
    if(audio && !_muted) audio.volume = _volume;
  }

  return { fadeIn, fadeOut, setMute, setVolume,
    get scene(){ return _scene; } };
})();

// ── BGM遷移ヘルパー ────────────────────────────────────────
function bgmToTitle(){
  BGM.fadeOut(() => BGM.fadeIn('title'));
}
function bgmToGame(){
  BGM.fadeOut(() => BGM.fadeIn('game'));
}

// ============================================================
