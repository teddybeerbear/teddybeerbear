// WIN MODAL
// ============================================================
function showWinModalData(d){
  const w=G.players.find(p=>p.id===d.winnerId)||G.players[0];
  showWinModal(w,d.hand,d.winTile,d.isTsumo,d.losidx,d.yakus,d.score,d.han);
}
function showWinModal(winner,hand,winTile,isTsumo,losidx,yakus,score,han){
  const ln=losidx>=0?G.players[losidx].name:'';
  document.getElementById('mTitle').textContent=isTsumo?'🀄 ツモ上がり！':'🀄 ロン上がり！';
  document.getElementById('mSub').textContent=`${winner.name} が${isTsumo?'ツモ':`${ln}からロン`}`;
  const doras=getDoras();
  document.getElementById('mHand').innerHTML=sortTiles(hand).map(t=>{
    const id=doras.some(d=>teq(d,t));
    const iw=teq(t,winTile);
    return`<div class="tile ${tc(t)}${iw?' selected':''}">${emj(t)}${id?'<div class="tile-dora"></div>':''}</div>`;
  }).join('');
  document.getElementById('mYakuBody').innerHTML=yakus.map(y=>
    `<tr><td>${y.name}</td><td>${y.han>=52?'４倍役満':y.han>=39?'３倍役満':y.han>=26?'２倍役満':y.han>=13?'役満':y.han+'翻'}</td></tr>`
  ).join('');
  document.getElementById('mScore').textContent=`+${score.toLocaleString()} 点`;
  document.getElementById('mScoreSub').textContent=`${han}翻 / ${winner.isDealer?'親':'子'}`;
  timerStop(); document.getElementById('winOverlay').classList.add('show');
  _startWinTimer();
}

// ============================================================
// LOG
// ============================================================
function addLog(msg,cls){
  G.log.unshift({msg,cls});if(G.log.length>30)G.log.pop();
  const el=document.getElementById('gameLog');
  if(el)el.innerHTML=G.log.slice(0,14).map((e,i)=>
    `<span class="${i===0?e.cls:''}">${e.msg}</span>`).join('<br>');
}

// ============================================================
// RENDER
// ============================================================
function renderAll(){
  renderHeader();renderTable();renderActions();
  // ペンボタン: ペン能力所持時のみ表示
  const ptb=document.getElementById('penToggleBtn');
  if(ptb) ptb.style.display=(PROFILE.ability==='pen')?'':'none';
  renderCornerAbilityBtns();
}

function renderHeader(){
  document.getElementById('hRound').textContent=`${G.roundWind}${G.roundNum}局`;
  document.getElementById('hHonba').textContent=`${G.honba}本場`;
  document.getElementById('hDeck').textContent=`${G.deck.length}枚`;
  document.getElementById('hRiichiPot').textContent=(G.riichiPot/10)+'本';
  document.getElementById('tcRound').textContent=`${G.roundWind}${G.roundNum}局`;
  document.getElementById('tcRiichi').textContent='';
  renderWall();
  // doraCanvas is rendered in renderTable (via requestAnimationFrame after DOM insert)
}


// ── 右下コーナー能力ボタン ────────────────────────────────
function renderCornerAbilityBtns(){
  const cb=document.getElementById('cornerBtns');
  if(!cb) return;

  // 既存の動的ボタンをリセット
  Array.from(cb.querySelectorAll('.corner-ability-btn')).forEach(el=>el.remove());

  if(!G_ABILITY_MODE||!G.players) return;
  const myIdx=NET.myIdx;
  const p=G.players[myIdx];
  if(!p) return;

  const ab=PROFILE.ability;
  const phase=G.phase;
  const isMyTurn=G.current===myIdx;

  // ペンボタンの前に挿入するヘルパー
  const penBtn=cb.querySelector('#penToggleBtn');
  const add=(label,color,borderColor,onclick,title='')=>{
    const b=document.createElement('button');
    b.className='corner-ability-btn';
    b.textContent=label; b.title=title;
    b.onclick=onclick;
    b.style.cssText=`font-size:.85rem;padding:8px 14px;border-radius:7px;border:1.5px solid ${borderColor};` +
      `cursor:pointer;background:#030a10;transition:all .2s;white-space:nowrap;` +
      `letter-spacing:.04em;color:${color};`;
    cb.insertBefore(b,penBtn);
    return b;
  };

  // ── 地雷 💣 ─────────────────────────────────────────────
  if(ab==='mine'&&G.mineCount<3&&G.deck.length>0&&!G.minePlantMode){
    add('💣 地雷','#ff8866','#884422',()=>{G.minePlantMode=true;renderAll();},'地雷を仕掛ける');
  }

  // ── 光 ☀️ ───────────────────────────────────────────────
  if(ab==='light'&&!p.abilityUsed&&!G.lightMode){
    if(!G.minePlantMode&&!G.stealMode){
      add('☀️ 表にする','#ffee22','#886600',()=>{G.lightMode='pick';G.lightUserIdx=myIdx;renderAll();},'山牌・ドラ山・相手手牌から1枚表にする（ドラ追加）');
      // 闇牌(手牌or捨て牌)が存在する場合に「闇を解く」表示
      const hasYami=G.players.some((op,oi)=>{
        if(op.yamiTileIdx>=0&&op.yamiTileIdx<op.hand.length)return true;
        if(op.discards.some(t=>t._yami))return true;
        return false;
      });
      if(hasYami) add('☀️ 闇を解く','#cc99ff','#7744aa',()=>{G.lightMode='yami';G.lightUserIdx=myIdx;renderAll();},'闇牌を普通の牌に戻す');
    }
  }

  // ── スチール 🃏 ──────────────────────────────────────────
  // 山から引く前（draw_wait）のみ使用可能
  if(ab==='steal'&&!p.abilityUsed&&!p.tenpai&&!G.stealMode&&phase==='draw_wait'){
    // 捨て牌がある相手がいるか確認
    const hasTarget=G.players.some((op,i)=>i!==myIdx&&op.discards.length>0);
    if(hasTarget)
      add('🃏 スチール','#88ff88','#44aa44',()=>{G.stealMode=true;renderAll();},'捨て牌から1枚盗む');
  }

  // ── 白 🀆 ───────────────────────────────────────────────
  if(ab==='haku'&&!p.abilityUsed&&(phase==='discard'||phase==='draw_wait')&&isMyTurn){
    if(!G.hakuSelectMode){
      const hakuSet=p.hakuTileId!=null;
      if(!hakuSet){
        add('🀆 白','#eeeeff','#5555aa',()=>{G.hakuSelectMode=true;renderAll();},'手牌を白に変換');
      }
    }
  }

  // ── 闇 🌑 ───────────────────────────���───────────────────
  if(ab==='yami'&&!p.abilityUsed&&(phase==='discard')&&isMyTurn){
    if(!G.yamiSelectMode){
      const yamiSet=p.yamiTileIdx>=0&&p.yamiTileIdx<p.hand.length;
      if(!yamiSet)
        add('🌑 闇','#cc99ff','#7744aa',()=>{G.yamiSelectMode=true;renderAll();},'捨て牌を裏向��に');
    }
  }
}

// ─── Wall Canvas constants ───────────────────────────────
const W_TW=36, W_TH=48, W_GAP=2, W_COLS=15;
let   _wallCanvasInited=false;
let   _penModeOn=false;
const _penImgCache={}; // ペンON/OFFトグル
// wall canvas上のドロー中フラグ
let   _wallPenActive=false, _wallPenLX=0, _wallPenLY=0;
// 各スロットの描画データ: {idx: ImageData} — canvas座標に対応
// 描画はG.penDrawings[idx]にdataURL保存

function togglePenMode(){
  _penModeOn=!_penModeOn;
  if(_penModeOn){ _initPenToolbar(); }
  const btn=document.getElementById('penToggleBtn');
  if(btn) btn.classList.toggle('pen-active',_penModeOn);
  const tb=document.getElementById('penToolbarFloat');
  if(tb) tb.style.display=_penModeOn?'flex':'none';
  const wc=document.getElementById('wallCanvas');
  if(wc){
    wc.classList.toggle('pen-on',_penModeOn);
    wc.classList.toggle('pick-on',!_penModeOn);
  }
  renderWall();
  renderDoraCanvas();
}

function _wallSlotAt(x,y){
  // ピクセル座標からスロットインデックスを返す
  const col=Math.floor(x/(W_TW+W_GAP));
  const row=Math.floor(y/(W_TH+W_GAP));
  if(col<0||col>=W_COLS) return -1;
  const idx=row*W_COLS+col;
  if(idx<0||!G.deckSlots||idx>=G.deckSlots.length) return -1;
  return idx;
}

function _wallTileRect(idx){
  const col=idx%W_COLS;
  const row=Math.floor(idx/W_COLS);
  return {
    x: col*(W_TW+W_GAP),
    y: row*(W_TH+W_GAP),
    w: W_TW, h: W_TH
  };
}

const _wallImgCache={};
const _doraImgCache={};
  function tileImgUrl(t){
    if(!t)return null;
    
    if(t.suit==='honor'){return TILE_IMG.honor[t.num]||null;}
    return (TILE_IMG[t.suit]&&TILE_IMG[t.suit][t.num])||null;
  }
  function renderWall(){
  const lbl=document.getElementById('wallLabel');
  if(lbl&&G.deck) lbl.textContent=`山牌 ${G.deck.length}/${G.deckSlots?.length||0}枚`;

  const wc=document.getElementById('wallCanvas');
  if(!wc||!G.deckSlots) return;

  const total=G.deckSlots.length;
  const rows=Math.ceil(total/W_COLS);
  const cw=W_COLS*(W_TW+W_GAP)-W_GAP;
  const ch=rows*(W_TH+W_GAP)-W_GAP;

  // canvasサイズ設定
  if(wc.width!==cw||wc.height!==ch){ wc.width=cw; wc.height=ch; }

  const ctx=wc.getContext('2d');
  ctx.clearRect(0,0,cw,ch);

  const canPick  = G.phase==='draw_wait' && G.current===NET.myIdx;
  const plantMode= !!G.minePlantMode;
  const lightPickMode = G.lightMode==='pick';
  const amMineOwner= G_ABILITY_MODE && PROFILE.ability==='mine';
  const isPinzuMode= G_ABILITY_MODE && PROFILE.ability==='pinzu' && G.players[NET.myIdx]?.isDealer;

  for(let i=0;i<total;i++){
    const slot=G.deckSlots[i];
    const r=_wallTileRect(i);

    if(slot===null){
      // 引き済み: 透明（何も描かない）
      continue;
    }

    const isMine    = amMineOwner && G.mineOwners?.[i] === NET.myIdx;
    const isRevealed= !!(G.lightRevealedSlots?.[i]);
    const isPinzu   = isPinzuMode && slot.suit==='pin';
    const penImg    = slot?._pkey ? G.penDrawings?.[slot._pkey] : null; // _pkeyベース

    // 牌の背景グラデーション
    const grad=ctx.createLinearGradient(r.x,r.y,r.x+r.w,r.y+r.h);
    if(isRevealed){
      grad.addColorStop(0,'#f0e8d0'); grad.addColorStop(1,'#e0d0b0');
    } else if(isMine){
      grad.addColorStop(0,'#3a1a10'); grad.addColorStop(1,'#1a0a08');
    } else {
      grad.addColorStop(0,'#1a3a50'); grad.addColorStop(1,'#0d2035');
    }
    ctx.fillStyle=grad;
    _roundRect(ctx,r.x,r.y,r.w,r.h,3,true,false);

    // ボーダー
    const isPickable= (canPick||plantMode||lightPickMode) && !_penModeOn;
    const isPenTarget= _penModeOn && !isRevealed;
    ctx.strokeStyle= isPickable ? '#6aaa6a'
      : isPenTarget ? '#3ada8a55'
      : isMine ? '#cc4422'
      : '#2a5a70';
    ctx.lineWidth= isPickable ? 1.5 : 1;
    _roundRect(ctx,r.x,r.y,r.w,r.h,3,false,true);

    // ペン描画: 牌の後に multiply で合成（透明背景のストロークのみ）
    if(penImg){
      const _pimgKey=slot?._pkey;
      const cached=_pimgKey?_penImgCache[_pimgKey]:null;
      const drawPen=(img)=>{
        ctx.globalCompositeOperation='source-over';
        ctx.drawImage(img,r.x,r.y,r.w,r.h);
        // ボーダー再描画
        ctx.strokeStyle=isMine?'#cc4422':'#2a5a70'; ctx.lineWidth=1;
        _roundRect(ctx,r.x,r.y,r.w,r.h,3,false,true);
      };
      if(cached&&cached.complete&&cached._src===penImg){
        drawPen(cached);
      } else {
        const img=new Image();
        img._src=penImg;
        if(_pimgKey)_penImgCache[_pimgKey]=img;
        img.onload=()=>{if(_pimgKey)_penImgCache[_pimgKey]=img;renderWall();};
        img.src=penImg;
      }
    }

    // 表にした牌: 発光ボーダー
    if(isRevealed){
      ctx.strokeStyle='#ffee22'; ctx.lineWidth=2;
      _roundRect(ctx,r.x,r.y,r.w,r.h,3,false,true);
    }
    // テキスト（絵文字 or アイコン）
    ctx.font=`${isRevealed?44:28}px serif`;
    ctx.textAlign='center'; ctx.textBaseline='middle';
    if(isRevealed){
      // 光で表にした牌: 画像があれば描画
      const imgUrl=tileImgUrl(slot);
      if(imgUrl){
        const cached=_wallImgCache[imgUrl];
        if(cached&&cached.complete){
          ctx.drawImage(cached,r.x+2,r.y+2,r.w-4,r.h-4);
        } else if(!cached){
          const img=new Image();
          _wallImgCache[imgUrl]=img;
          img.onload=()=>renderWall();
          img.src=imgUrl;
        }
      } else {
        // 白(haku)など画像なし: 空白
      }
    } else if(isMine){
      ctx.font='34px serif'; ctx.fillText('💣',r.x+r.w/2,r.y+r.h/2);
    } else if(isPinzu){
      ctx.font='34px serif'; ctx.fillText('🔵',r.x+r.w/2,r.y+r.h/2);
    } else if(!penImg){
      // 裏面アイコン（小さく）
      ctx.fillStyle='#3a6a8a'; ctx.font='28px serif';
      ctx.fillText('🀫',r.x+r.w/2,r.y+r.h/2);
    }
  }

  // ペン描き込み中: offscreen canvas をリアルタイムプレビュー
  // _penOC は renderWall内では参照できないのでグローバル経由
  if(window._activePenOC){
    ctx.globalCompositeOperation='source-over';
    ctx.drawImage(window._activePenOC,0,0);
  }

  // イベント設定（初回のみ）
  if(!_wallCanvasInited){
    _wallCanvasInited=true;
    _initWallCanvasEvents(wc);
  }

  // pick-on クラス更新
  wc.classList.toggle('pen-on', _penModeOn);
  wc.classList.toggle('pick-on', (canPick||plantMode||lightPickMode)&&!_penModeOn);
}

function _roundRect(ctx,x,y,w,h,r,fill,stroke){
  ctx.beginPath();
  ctx.moveTo(x+r,y);
  ctx.lineTo(x+w-r,y); ctx.quadraticCurveTo(x+w,y,x+w,y+r);
  ctx.lineTo(x+w,y+h-r); ctx.quadraticCurveTo(x+w,y+h,x+w-r,y+h);
  ctx.lineTo(x+r,y+h); ctx.quadraticCurveTo(x,y+h,x,y+h-r);
  ctx.lineTo(x,y+r); ctx.quadraticCurveTo(x,y,x+r,y);
  ctx.closePath();
  if(fill) ctx.fill();
  if(stroke) ctx.stroke();
}

function _initWallCanvasEvents(wc){
  const getPos=(e)=>{
    const r=wc.getBoundingClientRect();
    const pt=e.touches?e.touches[0]:e;
    return {
      x:(pt.clientX-r.left)*(wc.width/r.width),
      y:(pt.clientY-r.top)*(wc.height/r.height)
    };
  };

  // ─── ペンモード描き込み ───────────────────────────
  let _strokeSlots=new Set();
  // ── ペン用 offscreen canvas（透明背景にストロークのみ）
  // wc と同サイズ。ストロークはここに描いて、renderWall時に multiply 合成する
  let _penOC=null; // offscreen canvas
  function _getPenOC(){
    if(!_penOC||_penOC.width!==wc.width||_penOC.height!==wc.height){
      _penOC=document.createElement('canvas');
      _penOC.width=wc.width; _penOC.height=wc.height;
    }
    window._activePenOC=_penOC;
    return _penOC;
  }
  const penDown=(e)=>{
    if(!_penModeOn) return;
    e.preventDefault();
    _wallPenActive=true;
    _strokeSlots.clear();
    const p=getPos(e);
    _wallPenLX=p.x; _wallPenLY=p.y;
    const oc=_getPenOC();
    const ctx=oc.getContext('2d');
    ctx.globalCompositeOperation='source-over';
    ctx.strokeStyle=_penColor; ctx.fillStyle=_penColor;
    ctx.lineWidth=_penSize;
    ctx.lineCap='round'; ctx.lineJoin='round';
    ctx.beginPath(); ctx.arc(p.x,p.y,ctx.lineWidth/2,0,Math.PI*2); ctx.fill();
    const si=_wallSlotAt(p.x,p.y); if(si>=0) _strokeSlots.add(si);
    // リアルタイムプレビュー: wc に multiply 合成
    _applyPenOC(wc,oc);
  };
  const penMove=(e)=>{
    if(!_penModeOn||!_wallPenActive) return;
    e.preventDefault();
    const p=getPos(e);
    const oc=_getPenOC();
    const ctx=oc.getContext('2d');
    ctx.globalCompositeOperation='source-over';
    ctx.strokeStyle=_penColor;
    ctx.lineWidth=_penSize;
    ctx.lineCap='round'; ctx.lineJoin='round';
    ctx.beginPath(); ctx.moveTo(_wallPenLX,_wallPenLY); ctx.lineTo(p.x,p.y); ctx.stroke();
    _wallPenLX=p.x; _wallPenLY=p.y;
    const si=_wallSlotAt(p.x,p.y); if(si>=0) _strokeSlots.add(si);
    _applyPenOC(wc,oc);
  };
  function _applyPenOC(wc,oc){
    // wc を再描画してから oc を multiply 合成
    renderWall();
  }
  const penUp=(e)=>{
    if(!_penModeOn||!_wallPenActive) return;
    e.preventDefault();
    _wallPenActive=false;
    _saveWallPenDrawingsFromOC(_penOC, _strokeSlots);
    _penOC=null; window._activePenOC=null; // offscreen クリア
    _strokeSlots=new Set();
    renderWall();
  };

  // ─── クリックモード（ツモ・地雷等）─────────────────
  const wallClick=(e)=>{
    if(_penModeOn) return; // ペンON中はクリック無効
    const p=getPos(e);
    const si=_wallSlotAt(p.x,p.y);
    if(si<0||G.deckSlots[si]===null) return;
    const plantMode=!!G.minePlantMode;
    if(plantMode){ plantMine(si); }
    else if(G.lightMode==='pick'){ lightRevealWall(si); }
    else if(G.phase==='draw_wait'&&G.current===NET.myIdx){ humanPickWall(si); }
  };

  wc.addEventListener('mousedown',  penDown);
  wc.addEventListener('mousemove',  penMove);
  wc.addEventListener('mouseup',    penUp);
  wc.addEventListener('mouseleave', (e)=>{ if(_wallPenActive){ penUp(e); } });
  wc.addEventListener('touchstart', penDown, {passive:false});
  wc.addEventListener('touchmove',  penMove, {passive:false});
  wc.addEventListener('touchend',   penUp,   {passive:false});
  wc.addEventListener('click',      wallClick);
}

function _saveWallPenDrawingsFromOC(oc, changedSlots){
  if(!G.penDrawings) G.penDrawings={};
  if(!G.deckSlots||!oc) return;
  const slots = changedSlots && changedSlots.size>0
    ? Array.from(changedSlots)
    : Array.from({length:G.deckSlots.length},(_,i)=>i);
  for(const i of slots){
    const tile=G.deckSlots[i];
    if(!tile?._pkey) continue;
    const r=_wallTileRect(i);
    // offscreen から牌領域だけ切り出し（透明背景のストロークのみ）
    const tmp=document.createElement('canvas');
    tmp.width=r.w; tmp.height=r.h;
    tmp.getContext('2d').drawImage(oc,r.x,r.y,r.w,r.h,0,0,r.w,r.h);
    // 実際に何か描かれているかチェック（空スロットをスキップ）
    const pixels=tmp.getContext('2d').getImageData(0,0,r.w,r.h).data;
    const hasContent=pixels.some((v,i)=>i%4===3&&v>10); // alpha > 10 の画素
    const key=tile._pkey;
    if(hasContent){
      // 既存の描画と合成: 既存があれば重ねる
      if(G.penDrawings[key]){
        const merged=document.createElement('canvas');
        merged.width=r.w; merged.height=r.h;
        const mc=merged.getContext('2d');
        const prevImg=new Image();
        prevImg.src=G.penDrawings[key];
        // 既存を先に描いてから今回のを multiply 合成
        mc.drawImage(prevImg,0,0);
        mc.globalCompositeOperation='multiply';
        mc.drawImage(tmp,0,0);
        mc.globalCompositeOperation='source-over';
        G.penDrawings[key]=merged.toDataURL('image/webp',0.65);
      } else {
        G.penDrawings[key]=tmp.toDataURL('image/webp',0.65);
      }
    }
    delete _penImgCache[key];
  }
  _syncPenDrawings(slots.reduce((o,i)=>{const t=G.deckSlots[i];if(t?._pkey&&G.penDrawings[t._pkey])o[t._pkey]=G.penDrawings[t._pkey];return o;},{}));
}
// 後方互換用（呼び出し元がある場合）
function _saveWallPenDrawings(wc, changedSlots){ _saveWallPenDrawingsFromOC(wc, changedSlots); }


// ============================================================
// PEN ABILITY — ツールバー変数（wallCanvas直接描き込み）
// ============================================================
// プレイヤー別ペン色 (idx 0=赤 1=青 2=黄 3=緑)
const PEN_PLAYER_COLORS = ['#ff4444','#44aaff','#ffee33','#44ff88'];

let _penColor  = '#ff4444';
let _penSize   = 3;
let _penEraser = false;

function _initPenToolbar(){
  const row = document.getElementById('penColorRow');
  if(!row) return;
  row.innerHTML = '';
  const myColor = PEN_PLAYER_COLORS[NET.myIdx % PEN_PLAYER_COLORS.length];
  // 自分の色スウォッチ
  const sw = document.createElement('div');
  sw.className = 'pen-color active';
  sw.style.background = myColor;
  sw.dataset.color = myColor;
  sw.dataset.eraser = '0';
  sw.onclick = () => { _penEraser=false; _penColor=myColor; sw.classList.add('active'); };
  row.appendChild(sw);
  // 初期色を自分の色にセット
  _penColor = myColor;
  _penEraser = false;
}

function setPenColor(el){
  _penEraser = el.dataset.eraser === '1';
  _penColor  = el.dataset.color;
  document.querySelectorAll('.pen-color').forEach(e => e.classList.remove('active'));
  el.classList.add('active');
}
function setPenSize(el){
  _penSize = parseInt(el.dataset.size);
  document.querySelectorAll('.pen-size').forEach(e => e.classList.remove('active'));
  el.classList.add('active');
}
function penCanvasClear(){
  if(!G.deckSlots) return;
  G.penDrawings = {};
  Object.keys(_penImgCache).forEach(k=>delete _penImgCache[k]);
  _wallCanvasInited = false;
  _doraCanvasInited = false;
  renderWall();
  renderDoraCanvas();
  if(NET.online && !amIHost()){ netSend({type:'penClear'}); }
  else { broadcastState(); }
}

// ── ペン描画同期ヘルパー ──────────────────────────────
function _syncPenDrawings(changedKeys){
  if(!NET.online){ return; }
  if(amIHost()){
    broadcastState();
  } else {
    // ゲスト: 変更分だけホストに送信
    netSend({type:'penSync', changedKeys: changedKeys});
  }
}


// ──────────────────────────────────────────────────────
// DORA CANVAS
// ──────────────────────────────────────────────────────
const DC_W=36, DC_H=48, DC_GAP=2;
let _doraCanvasInited=false;

// ドラ山スロット定義 (新):
// 上段 (y=0):    di=0..6 → 嶺上牌7枚 (col 0..6, 右揃え)
// 下段 (y=DC_H+DC_GAP): di=7: 表ドラ(col3), di=8..10: カンドラ(col4..6)
// 裏ドラ: 非表示
// Canvas幅: 7列
function _doraTileRect(di){
  if(di<=6) return { x: di*(DC_W+DC_GAP), y:0, w:DC_W, h:DC_H };
  // 下段: 右揃え (表ドラ=col3, カンドラ1=col4, 2=col5, 3=col6)
  const col = di-7+3; // di=7→col3, di=8→col4, di=9→col5, di=10→col6
  return { x: col*(DC_W+DC_GAP), y:DC_H+DC_GAP, w:DC_W, h:DC_H };
}

function renderDoraCanvas(){
  const dc=document.getElementById('doraCanvas');
  if(!dc||!G.doraPile) return;
  const ctx=dc.getContext('2d');
  ctx.clearRect(0,0,dc.width,dc.height);

  const usedR=G.rinshanIdx;
  const amMineOwnerDP=G_ABILITY_MODE&&PROFILE.ability==='mine';
  const plantModeDP=!!G.minePlantMode;
  const hasPen=PROFILE.ability==='pen';

  for(let di=0;di<11;di++){ // 裏ドラ(di=11..14)は非表示
    const r=_doraTileRect(di);
    let tile_for_pen;
    if(di<7)         tile_for_pen=G.doraPile[8+di];    // 嶺上
    else if(di===7)  tile_for_pen=G.doraPile[0];        // 表ドラ
    else if(di<11)   tile_for_pen=G.doraPile[di-7];     // カンドラ
    else             tile_for_pen=G.doraPile[di-7];     // 裏ドラ di=11→[4],12→[5],13→[6],14→[7]
    const penKey=tile_for_pen?._pkey?'dora_'+tile_for_pen._pkey:null;
    const penImg=penKey?G.penDrawings?.[penKey]:null;

    // ── セル種別判定 ──
    let gone=false, isBack=true, isMine=false, isDora=false, isDoraMark=false;
    let _tileForDraw=null;
    let isUra=false; // 裏ドラ（透明）
    let label='';
    const isLightRevealed=!!(G.lightRevealedSlots?.['dc_'+di]);

    if(di<7){
      // 嶺上牌
      if(di<usedR){ gone=true; }
      else if(isLightRevealed){
        // 光で表にした嶺上牌: 表面表示
        isBack=false; isDora=true; isDoraMark=true;
        _tileForDraw=G.doraPile[8+di];label='x';
      } else {
        isMine=!!(amMineOwnerDP&&G.mineRinshanOwners?.[di]===NET.myIdx);
        if(isMine) label='💣';
      }
    } else if(di===7){
      // 表ドラ表示牌
      const dt0=G.doraPile[0];
      if(dt0?.suit){ isBack=false; isDora=true; isDoraMark=true; _tileForDraw=dt0;label='x'; }
    } else if(di<11){
      // カンドラ 8-10 → doraPile[1..3]
      const c=di-8;
      const revealed=c<G.kanDoraCount||isLightRevealed;
      const dt=G.doraPile[c+1];
      if(revealed&&dt?.suit){ isBack=false; isDora=true; isDoraMark=true; _tileForDraw=dt;label='x'; }
    } else {
      // 下段: 裏ドラ di=11..14 → doraPile[4..7]（透明枠のみ）
      isUra=true;
    }

    if(gone){ continue; } // 使用済み嶺上牌は空白

    // 裏ドラ: 透明（枠のみ薄く）
    if(isUra){
      // ペン描画のみ描く（枠を薄く）
      if(penImg){
        const _ucached=penKey?_penImgCache[penKey]:null;
        if(_ucached&&_ucached.complete&&_ucached._src===penImg){
          ctx.globalAlpha=0.9; ctx.drawImage(_ucached,r.x,r.y,r.w,r.h); ctx.globalAlpha=1.0;
        } else {
          const img=new Image(); img._src=penImg;
          if(penKey)_penImgCache[penKey]=img;
          img.onload=()=>{ if(penKey)_penImgCache[penKey]=img; renderDoraCanvas(); };
          img.src=penImg;
        }
      } else {
        ctx.strokeStyle='#1a3a5044'; ctx.lineWidth=1;
        _roundRect(ctx,r.x,r.y,r.w,r.h,3,false,true);
      }
      continue;
    }

    // 背景
    if(isBack){
      const grad=ctx.createLinearGradient(r.x,r.y,r.x+r.w,r.y+r.h);
      if(isMine){ grad.addColorStop(0,'#3a1a10'); grad.addColorStop(1,'#1a0a08'); }
      else      { grad.addColorStop(0,'#1a3a50'); grad.addColorStop(1,'#0d2035'); }
      ctx.fillStyle=grad;
    } else {
      ctx.fillStyle=isDora?'#f0e8d0':'#eee8d0';
    }
    _roundRect(ctx,r.x,r.y,r.w,r.h,3,true,false);

    // ボーダー
    const isLightPickable=G.lightMode==='pick'&&di>=7&&di<=10&&!isLightRevealed; // ドラ表示牌（裏含む）
    const isLightPickableBack=G.lightMode==='pick'&&isBack&&di<7&&di>=usedR; // 嶺上牌
    const isAlreadyRevealed=isLightRevealed; // 表になった牌は発光ボーダー
    if(isAlreadyRevealed){ ctx.strokeStyle='#ffee22'; ctx.lineWidth=2; }
    else if(isLightPickable||isLightPickableBack){ ctx.strokeStyle='#ffee22'; ctx.lineWidth=2; }
    else if(isDoraMark) { ctx.strokeStyle='#c9a84c'; ctx.lineWidth=1.5; }
    else if(isMine){ ctx.strokeStyle='#cc4422'; ctx.lineWidth=1; }
    else if(plantModeDP&&di<7&&di>=usedR){ ctx.strokeStyle='#6aaa6a'; ctx.lineWidth=1.5; }
    else if(hasPen&&_penModeOn){ ctx.strokeStyle='#3ada8a55'; ctx.lineWidth=1; }
    else           { ctx.strokeStyle='#2a5a70'; ctx.lineWidth=1; }
    _roundRect(ctx,r.x,r.y,r.w,r.h,3,false,true);

    // ペン描画を復元
    if(penImg){
      const dcached=penKey?_penImgCache[penKey]:null;
      if(dcached&&dcached.complete&&dcached._src===penImg){
        ctx.globalCompositeOperation='source-over';
        ctx.drawImage(dcached,r.x,r.y,r.w,r.h);
        ctx.globalCompositeOperation='source-over';
        ctx.strokeStyle=isDoraMark?'#c9a84c':'#2a5a70'; ctx.lineWidth=1;
        _roundRect(ctx,r.x,r.y,r.w,r.h,3,false,true);
      } else {
        const img=new Image(); img._src=penImg;
        if(penKey)_penImgCache[penKey]=img;
        img.onload=()=>{ if(penKey)_penImgCache[penKey]=img; renderDoraCanvas(); };
        img.src=penImg;
      }
    }

    // ペンプレビュー（描き込み中のみ）
    if(window._activeDoraOC){
      ctx.globalCompositeOperation='source-over';
      ctx.drawImage(window._activeDoraOC,r.x,r.y,r.w,r.h,r.x,r.y,r.w,r.h);
    }
    // テキスト
    if(_tileForDraw){
      const _dUrl=tileImgUrl(_tileForDraw);
      if(_dUrl){
        const _dCached=_doraImgCache[_dUrl];
        if(_dCached&&_dCached.complete&&_dCached.naturalWidth>0){
          const pad=3;ctx.drawImage(_dCached,r.x+pad,r.y+pad,r.w-pad*2,r.h-pad*2);
        } else if(!_dCached){
          const _dImg=new Image();_doraImgCache[_dUrl]=_dImg;
          _dImg.onload=()=>renderDoraCanvas();_dImg.src=_dUrl;
        }
      } else {
        const _dEmoji=(EMJ[_tileForDraw.suit]&&EMJ[_tileForDraw.suit][_tileForDraw.num])||(_tileForDraw.num||'?');
        ctx.font='44px serif';ctx.textAlign='center';ctx.textBaseline='middle';
        ctx.fillStyle=isDora?'#111':'#ff4422';ctx.fillText(_dEmoji,r.x+r.w/2,r.y+r.h/2);
      }
    } else if(isBack&&!penImg){
      ctx.fillStyle='#3a6a8a'; ctx.font='14px serif';
      ctx.textAlign='center'; ctx.textBaseline='middle';
      ctx.fillText('🀫', r.x+r.w/2, r.y+r.h/2);
    }
  }

  // イベント初期化
  if(!_doraCanvasInited){
    _doraCanvasInited=true;
    _initDoraCanvasEvents(dc);
  }
  dc.classList.toggle('pen-on',_penModeOn);
  dc.style.cursor=(G.lightMode==='pick'&&!_penModeOn)?'pointer':'';
}

function _initDoraCanvasEvents(dc){
  const getPos=(e)=>{
    const rect=dc.getBoundingClientRect();
    const pt=e.touches?e.touches[0]:e;
    return {
      x:(pt.clientX-rect.left)*(dc.width/rect.width),
      y:(pt.clientY-rect.top)*(dc.height/rect.height)
    };
  };
  const getDI=(x,y)=>{
    const row=Math.round(y/(DC_H+DC_GAP));
    const col=Math.floor(x/(DC_W+DC_GAP));
    if(row===0) return (col>=0&&col<7)?col:-1;
    if(row===1&&col>=3&&col<=6) return col-3+7; // ドラ表示牌 di=7..10
    return -1;
  };

  let _doraPenActive=false, _doraPenLX=0, _doraPenLY=0;
  let _doraStrokeSet=new Set();

  const down=(e)=>{
    if(!_penModeOn) return;
    e.preventDefault();
    _doraPenActive=true; _doraStrokeSet.clear();
    const p=getPos(e); _doraPenLX=p.x; _doraPenLY=p.y;
    if(!window._activeDoraOC||window._activeDoraOC.width!==dc.width){const oc=document.createElement('canvas');oc.width=dc.width;oc.height=dc.height;window._activeDoraOC=oc;}
    const ctx=window._activeDoraOC.getContext('2d');
    ctx.globalCompositeOperation='source-over';
    ctx.strokeStyle=ctx.fillStyle=_penColor;
    ctx.lineWidth=_penSize;
    ctx.lineCap=ctx.lineJoin='round';
    ctx.beginPath(); ctx.arc(p.x,p.y,ctx.lineWidth/2,0,Math.PI*2); ctx.fill();
    const di=getDI(p.x,p.y); if(di>=0) _doraStrokeSet.add(di);
    renderDoraCanvas();
  };
  const move=(e)=>{
    if(!_penModeOn||!_doraPenActive) return;
    e.preventDefault();
    const p=getPos(e);
    if(!window._activeDoraOC) return;
    const ctx=window._activeDoraOC.getContext('2d');
    ctx.globalCompositeOperation='source-over';
    ctx.strokeStyle=_penColor;
    ctx.lineWidth=_penSize;
    ctx.lineCap=ctx.lineJoin='round';
    ctx.beginPath(); ctx.moveTo(_doraPenLX,_doraPenLY); ctx.lineTo(p.x,p.y); ctx.stroke();
    _doraPenLX=p.x; _doraPenLY=p.y;
    const di=getDI(p.x,p.y); if(di>=0) _doraStrokeSet.add(di);
    renderDoraCanvas();
  };
  const up=(e)=>{
    if(!_penModeOn||!_doraPenActive) return;
    e.preventDefault();
    _doraPenActive=false;
    _saveDoraFromOC(window._activeDoraOC, _doraStrokeSet);
    window._activeDoraOC=null;
    _doraStrokeSet=new Set();
    renderDoraCanvas();
  };

  dc.addEventListener('dblclick', e=>e.preventDefault());
  dc.addEventListener('mousedown',  down);
  dc.addEventListener('mousemove',  move);
  dc.addEventListener('mouseup',    up);
  dc.addEventListener('mouseleave', (e)=>{ if(_doraPenActive) up(e); });
  dc.addEventListener('touchstart', down, {passive:false});
  dc.addEventListener('touchmove',  move, {passive:false});
  dc.addEventListener('touchend',   up,   {passive:false});

  // クリック（ペンOFF時: 地雷設置 or 光能力）
  dc.addEventListener('click',(e)=>{
    if(_penModeOn) return;
    const p=getPos(e);
    const di=getDI(p.x,p.y);
    if(di<0) return;
    // 光: 山を表にする（嶺上牌 di=0-6、ドラ表示牌 di=7-10）
    if(G.lightMode==='pick'){
      if(di<7){
        const usedR=G.rinshanIdx;
        if(di>=usedR) lightRevealDoraCanvas(di); // 未使用嶺上牌
      } else if(di>=7&&di<=10){
        lightRevealDoraCanvas(di); // ドラ表示牌
      }
      return;
    }
    // 地雷設置（嶺上牌のみ）
    if(di>=7) return;
    const usedR=G.rinshanIdx;
    if(di<usedR) return;
    if(G.minePlantMode) plantMineRinshan(di);
  });
}

function _saveDoraFromOC(oc, changedSet){
  if(!G.penDrawings) G.penDrawings={};
  if(!G.doraPile||!oc) return;
  const slots=changedSet&&changedSet.size>0?Array.from(changedSet):Array.from({length:15},(_,i)=>i);
  for(const di of slots){
    let tile;
    if(di<7)        tile=G.doraPile[8+di];
    else if(di===7) tile=G.doraPile[0];
    else            tile=G.doraPile[di-7];
    if(!tile?._pkey) continue;
    const key='dora_'+tile._pkey;
    const r=_doraTileRect(di);
    const tmp=document.createElement('canvas');
    tmp.width=r.w; tmp.height=r.h;
    tmp.getContext('2d').drawImage(oc,r.x,r.y,r.w,r.h,0,0,r.w,r.h);
    const pixels=tmp.getContext('2d').getImageData(0,0,r.w,r.h).data;
    const hasContent=pixels.some((v,i)=>i%4===3&&v>10);
    if(hasContent){
      if(G.penDrawings[key]){
        const merged=document.createElement('canvas');
        merged.width=r.w; merged.height=r.h;
        const mc=merged.getContext('2d');
        const prev=new Image(); prev.src=G.penDrawings[key];
        mc.drawImage(prev,0,0);
        mc.globalCompositeOperation='multiply';
        mc.drawImage(tmp,0,0);
        mc.globalCompositeOperation='source-over';
        G.penDrawings[key]=merged.toDataURL('image/webp',0.65);
      } else {
        G.penDrawings[key]=tmp.toDataURL('image/webp',0.65);
      }
    }
    delete _penImgCache[key];
  }
  _syncPenDrawings(slots.reduce((o,di)=>{let tile;if(di<7)tile=G.doraPile[8+di];else if(di===7)tile=G.doraPile[0];else tile=G.doraPile[di-7];const k='dora_'+(tile?._pkey||'');if(k!=='dora_'&&G.penDrawings[k])o[k]=G.penDrawings[k];return o;},{}));
}
function _saveDoraCanvasPenDrawings(dc, changedSet){
  if(!G.penDrawings) G.penDrawings={};
  if(!G.doraPile) return;
  const slots=changedSet&&changedSet.size>0?Array.from(changedSet):Array.from({length:15},(_,i)=>i);
  for(const di of slots){
    let tile;
    if(di<7)        tile=G.doraPile[8+di];
    else if(di===7) tile=G.doraPile[0];
    else            tile=G.doraPile[di-7];
    if(!tile?._pkey) continue;
    const key='dora_'+tile._pkey;
    const r=_doraTileRect(di);
    const tmp=document.createElement('canvas');
    tmp.width=r.w; tmp.height=r.h;
    tmp.getContext('2d').drawImage(dc,r.x,r.y,r.w,r.h,0,0,r.w,r.h);
    G.penDrawings[key]=tmp.toDataURL('image/webp',0.65);
    delete _penImgCache[key];
  }
  _syncPenDrawings(slots.reduce((o,di)=>{let tile;if(di<7)tile=G.doraPile[8+di];else if(di===7)tile=G.doraPile[0];else tile=G.doraPile[di-7];const k='dora_'+(tile?._pkey||'');if(k!=='dora_'&&G.penDrawings[k])o[k]=G.penDrawings[k];return o;},{}));
}

// ドラ山セル1枚レンダリング
function renderDpCell(cell){
  if(!cell) return '';
  if(cell.gone) return `<div class="dp-cell back gone"></div>`;
  switch(cell.type){
    case 'rinshan':
      return `<div class="dp-cell back"></div>`;
    case 'ura':
      return `<div class="dp-cell back"></div>`;
    case 'kan':
      if(cell.revealed && cell.tile)
        return `<div class="dp-cell face dora-ind">${emj(cell.tile)}</div>`;
      return `<div class="dp-cell back"></div>`;
    case 'dora':
      if(cell.tile)
        return `<div class="dp-cell face dora-ind">${emj(cell.tile)}</div>`;
      return `<div class="dp-cell back"></div>`;
    default: return '';
  }
}

function renderTable(){
  const table=document.getElementById('mahjongTable');
  // Remove old seats and discard-abs
  ['seat-bottom','seat-top','seat-left','seat-right'].forEach(cls=>{
    const el=table.querySelector('.'+cls);if(el)el.remove();
  });
  table.querySelectorAll('.discard-abs').forEach(el=>el.remove());
  const _tc2=document.getElementById('tableCenter'); if(_tc2) _tc2.querySelectorAll('.discard-abs').forEach(el=>el.remove());

  // Seat layout by player count:
  // 2p: 0=bottom, 1=top (face-to-face)
  // 3p: 0=bottom, 1=right, 2=top
  // 4p: 0=bottom, 1=right, 2=top, 3=left
  // オンライン時は操作プレイヤーが常にbottomに来るようローテーション
  let seatMap; // seatMap[seatIdx] = playerIdx or -1 (empty)
  const myIdx = NET.online ? getMyPlayerSeatIdx() : 0;
  if(numPlayers===2){
    // 2人: bottom=自分, top=相手
    seatMap=[myIdx, -1, (myIdx+1)%2, -1];
  } else if(numPlayers===3){
    // 3人: bottom=自分, right=次, top=その次
    seatMap=[myIdx, (myIdx+1)%3, (myIdx+2)%3, -1];
  } else {
    // 4人: bottom=自分, right=次, top=その次, left=その次
    seatMap=[myIdx, (myIdx+1)%4, (myIdx+2)%4, (myIdx+3)%4];
  }
  const seatClasses=['seat-bottom','seat-right','seat-top','seat-left'];

  for(let si=0;si<4;si++){
    const pidx=seatMap[si];
    const cls=seatClasses[si];
    const div=document.createElement('div');
    div.className=cls;

    if(pidx<0){
      div.classList.add('empty');
      table.insertBefore(div,document.getElementById('tableCenter'));
      continue;
    }

    const p=G.players[pidx];
    const isHuman = pidx === getMyPlayerSeatIdx();
    const isActive=G.current===pidx;
    const doras=getDoras();

    // All seat content goes into seat-inner (this is what gets rotated via CSS)
    const inner=document.createElement('div');
    inner.className='seat-inner';

    // Strip
    const stripDiv=document.createElement('div');
    stripDiv.className=`player-strip${isActive?' active-p':''}${p.riichi?' riichi-p':''}`;

    const badges=[
      p.isDealer?`<span class="badge" style="background:#1a0800;border:1px solid #7a4010;color:#c07040;">親</span>`:'',
      p.riichi&&p.openRiichi&&p.doubleRiichi?`<span class="badge" style="background:#1a0030;border:1px solid #aa55ff;color:#ee99ff;letter-spacing:-.02em;">Ｄオープンリーチ</span>`
        :p.riichi&&p.openRiichi?`<span class="badge" style="background:#1a0020;border:1px solid #8844cc;color:#cc88ff;letter-spacing:-.02em;">オープンリーチ</span>`
        :p.riichi?`<span class="badge badge-riichi">リーチ</span>`:'',
      (p.tenpai&&!p.riichi&&pidx===NET.myIdx)?`<span class="badge badge-tenpai">テンパイ</span>`:'',
      p.kitaCount>0?`<span class="badge badge-dora">���×${p.kitaCount}</span>`:'',
    ].join('');

    const riichiStick=p.riichi?`<span class="riichi-stick">リーチ</span>`:''; 
    const afkBadge=((isHuman&&playerAFK)||p.isDisconnected)?`<span class="badge" style="background:#1a0000;border:1px solid #cc3333;color:#ff6666;">離席</span>`:'';

    const abilityLabels2={'':'','mine':'💣 地雷','light':'☀️ 光','yami':'🌑 闇','haku':'🀆 白','sanctuary':'🏛️ 聖域','pinzu':'🔵 ピンズー教','steal':'🃏 スチール','pen':'🖊️ ペン'};
    const abilityBadge = (G_ABILITY_MODE && p.ability) ? `<span class="ability-badge">${abilityLabels2[p.ability]||p.ability}</span>` : '';
    stripDiv.innerHTML=`
      <div class="wind-orb${p.isDealer?' dealer-orb':''}">${p.wind}</div>
      <div style="display:flex;flex-direction:column;gap:1px;">
        ${abilityBadge}
      </div>
      ${riichiStick}
      <div class="p-badges">${badges}${afkBadge}</div>
      ${p.iconId ? `<img src="${gachaIconUrl(p.iconId)}" alt="" style="width:24px;height:24px;border-radius:3px;" onerror="console.error('アイコン画像読み込みエラー:', '${p.iconId}');">` : `<!-- アイコンなし: pidx=${pidx}, myIdx=${NET.myIdx}, iconId=${p.iconId} -->`}
      <span class="p-name">${p.name}</span>
      <span class="p-score">${p.score.toLocaleString()}点</span>
    `;
    console.log(`プレイヤー${pidx}(${p.name}) アイコンID: ${p.iconId}`);
    // stripDiv は全員 handOuter に追加（後述）

    // Melds + kita
    if(p.melds.length>0||p.kitaCount>0){
      const mw=document.createElement('div');mw.style.cssText='display:flex;gap:3px;align-items:center;flex-wrap:wrap;justify-content:center;';
      if(p.melds.length>0){
        const meld=document.createElement('div');meld.className='melds-wrap';
        meld.innerHTML=p.melds.map(m=>`<div class="meld-group">${m.tiles.map(t=>`<div class="tile ${tc(t)}">${emj(t)}</div>`).join('')}</div>`).join('');
        mw.appendChild(meld);
      }
      if(p.kitaCount>0){
        const kw=document.createElement('div');kw.className='kita-wrap';
        kw.innerHTML=Array(p.kitaCount).fill(`<div class="tile honor kita-tile">${EMJ.honor['北']}</div>`).join('');
        mw.appendChild(kw);
      }
      // 自分の席はmeldKitaArea(マット右)のみ表示、innerには追加しない
      if(!isHuman) inner.appendChild(mw);
      if(isHuman){
        const mka=document.getElementById('meldKitaArea');
        if(mka){
          mka.innerHTML='';
          if(p.melds.length>0){
            const meld2=document.createElement('div');
            meld2.style.cssText='display:flex;gap:2px;flex-wrap:wrap;justify-content:flex-end;';
            meld2.innerHTML=p.melds.map(m=>`<div class="meld-group" style="transform:scale(.85);transform-origin:right center;">${m.tiles.map(t=>`<div class="tile ${tc(t)}">${emj(t)}</div>`).join('')}</div>`).join('');
            mka.appendChild(meld2);
          }
          if(p.kitaCount>0){
            const kw2=document.createElement('div');
            kw2.style.cssText='display:flex;gap:1px;flex-wrap:wrap;justify-content:flex-end;';
            kw2.innerHTML=Array(p.kitaCount).fill(`<div class="tile honor kita-tile" style="transform:scale(.8);transform-origin:right center;">${EMJ.honor['北']}</div>`).join('');
            mka.appendChild(kw2);
          }
        }
      }
    } else if(isHuman){
      const mka=document.getElementById('meldKitaArea');
      if(mka) mka.innerHTML=''; // クリア
    }

    // Hand — use data-idx attributes; event listeners added after insert (no inline onclick on rotated elements)
    const handWrap=document.createElement('div');
    handWrap.className=`hand-wrap${isActive?' active-hand':''}${p.riichi?' riichi-hand':''}`;
    // 手牌ラベル削除

    // handOuter: position:relative ラッパー
    const handOuter = document.createElement('div');
    handOuter.style.cssText='position:relative;display:inline-flex;align-items:flex-end;gap:0;';

    // ── リーチ/オープンリーチ: 手牌の上中央に絶対配置 ──
    const isOR = p.riichi && p.openRiichi;
    const isDOR = p.riichi && p.openRiichi && p.doubleRiichi;
    if(p.riichi){
      const rLabel = document.createElement('div');
      rLabel.style.cssText='position:absolute;top:-18px;left:50%;transform:translateX(-50%);white-space:nowrap;z-index:5;font-size:.55rem;font-weight:700;pointer-events:none;';
      if(isDOR)      rLabel.innerHTML='<span style="color:#ee99ff;background:#1a0030;border:1px solid #aa55ff;border-radius:3px;padding:1px 4px;">Ｄオープンリーチ</span>';
      else if(isOR)  rLabel.innerHTML='<span style="color:#cc88ff;background:#1a0020;border:1px solid #8844cc;border-radius:3px;padding:1px 4px;">オープンリーチ</span>';
      else           rLabel.innerHTML='<span style="color:#ff8888;background:#1a0000;border:1px solid #cc4444;border-radius:3px;padding:1px 4px;">リーチ</span>';
      handOuter.appendChild(rLabel);
    }

    // ── 離席: 手牌の左上に絶対配置 ──
    if((isHuman && playerAFK) || p.isDisconnected){
      const afkEl=document.createElement('div');
      afkEl.style.cssText='position:absolute;top:-22px;left:228px;font-size:.75rem;color:#ff6666;background:#1a0000;border:1px solid #cc3333;border-radius:4px;padding:2px 7px;z-index:5;pointer-events:none;font-weight:700;';
      afkEl.textContent='離席';
      handOuter.appendChild(afkEl);
    }

    // ── 左: wind orb + 名前（牌1.5倍サイズ・牌3個分=120px離す） ──
    const leftPanel = document.createElement('div');
    leftPanel.style.cssText='display:flex;flex-direction:column;align-items:center;justify-content:center;gap:4px;width:108px;flex-shrink:0;margin-right:120px;';
    const windOrb2 = document.createElement('div');
    windOrb2.className='wind-orb'+(p.isDealer?' dealer-orb':'');
    const _orbIconId = isHuman ? (PROFILE&&PROFILE.iconId||'') : (p.iconId||'');
    if(_orbIconId){
      windOrb2.style.cssText='width:80px;height:112px;flex-shrink:0;border-radius:8px;overflow:hidden;background:transparent;display:flex;align-items:center;justify-content:center;';
      const _orbImg=document.createElement('img');
      _orbImg.src=gachaIconUrl(_orbIconId);
      _orbImg.style.cssText='width:80px;height:112px;object-fit:contain;border-radius:8px;';
      windOrb2.appendChild(_orbImg);
    } else {
      windOrb2.style.cssText='width:68px;height:68px;font-size:2rem;flex-shrink:0;line-height:68px;text-align:center;border-radius:8px;';
      windOrb2.textContent=p.wind;
    }
    const nameEl2 = document.createElement('span');
    nameEl2.style.cssText='font-size:1.1rem;color:var(--gold);font-weight:700;max-width:200px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;text-align:center;';
    nameEl2.textContent=(p.name||'').slice(0,10);
    leftPanel.appendChild(windOrb2);
    leftPanel.appendChild(nameEl2);
    // seat-inner が回転されている場合、leftPanelを逆回転で正立
    const _seatRotMap=[0,-180,0,-90,90]; // si=0:bottom,1:right,2:top,3:left の seat-inner 回転
    // seat-inner rotate: top=180, right=-90, left=90 → leftPanelは逆に
    if(si===1) leftPanel.style.transform='rotate(90deg)';
    else if(si===2){ leftPanel.style.transform='rotate(180deg)'; leftPanel.style.position='relative'; leftPanel.style.top='50px'; }
    else if(si===3) leftPanel.style.transform='rotate(-90deg)';
    else if(si===0){ leftPanel.style.position='relative'; leftPanel.style.top='48px'; }
    handOuter.appendChild(leftPanel);

    // ── 中央: 手牌 ──
    handOuter.appendChild(handWrap);

    // ── 右パネル: 場風・持ち点横並び(牌と同高48px) + 能力縦 ──
    const rightPanel = document.createElement('div');
    rightPanel.style.cssText='display:flex;flex-direction:column;align-items:flex-start;gap:3px;margin-left:8px;flex-shrink:0;';

    // 場風・持ち点: 横並び・高さ48px
    const scoreRow = document.createElement('div');
    scoreRow.style.cssText='display:flex;align-items:center;gap:4px;height:48px;';
    const windBadge = document.createElement('div');
    windBadge.style.cssText='display:flex;align-items:center;justify-content:center;height:48px;min-width:36px;font-size:.9rem;font-weight:700;color:#7acc99;background:#041a10;border:1px solid #1a4a2a;border-radius:4px;padding:0 6px;white-space:nowrap;';
    windBadge.textContent=p.wind;
    scoreRow.appendChild(windBadge);
    const scoreBadge = document.createElement('div');
    const scoreColor=p.score<0?'#44ccff':'var(--gold)';
    scoreBadge.style.cssText='display:flex;align-items:center;justify-content:center;height:48px;min-width:60px;font-size:.85rem;color:'+scoreColor+';font-weight:700;background:#0a0a00;border:1px solid #3a3010;border-radius:4px;padding:0 6px;white-space:nowrap;';
    scoreBadge.textContent=p.score.toLocaleString()+'点';
    scoreRow.appendChild(scoreBadge);
    rightPanel.appendChild(scoreRow);

    // 能力バッジをscoreRowの右に追加
    if(G_ABILITY_MODE && p.ability){
      const abilityLabels3={'mine':'💣','light':'☀️','yami':'🌑','haku':'🀆','sanctuary':'🏛️','pinzu':'🔵','steal':'🃏','pen':'🖊️'};
      const abBadge = document.createElement('div');
      abBadge.style.cssText='display:flex;align-items:center;justify-content:center;height:48px;min-width:48px;font-size:.85rem;background:#0a0a00;border:1px solid #3a3010;border-radius:4px;padding:0 6px;white-space:nowrap;';
      abBadge.textContent=(abilityLabels3[p.ability]||'');
      scoreRow.appendChild(abBadge);
    }
    handOuter.appendChild(rightPanel);

    // stripDiv は使わない（情報をrightPanelに移動）
    stripDiv.style.cssText='display:none;';

    if(isHuman){
      for(let i=0;i<p.hand.length;i++){
        const t=p.hand[i];
        const isDrawn=p.drawnTile&&teq(t,p.drawnTile)&&i===p.hand.length-1;
        const isSel=selIdx===i;
        const isDora=doras.some(d=>teq(d,t));
        const isKita=t.suit==='honor'&&t.num==='北';
        const canSel=isActive&&G.phase==='discard'&&!p.riichi;
        const isPR=!!G.pendingRiichi;
        const isValid=isPR&&G.riichiValidIdx&&G.riichiValidIdx.includes(i);
        const isDimmed=isPR&&!isValid;
        // 闇指定牌: 自分には見えるが紫ハイライト
        const isYamiMarked = (p.yamiTileIdx===i);
        const isHaku = !!(p.hand[i]._isHaku);
        const isHakuSelectable = G.hakuSelectMode && isActive && G.phase==='discard' && !p.riichi && !isHaku;
        // 闇選択モード中はクリック可能に
        const canSelYami = G.yamiSelectMode && isActive && G.phase==='discard' && !p.riichi;
        // オープンリーチ中の闇指定牌: 自分には薄暗く見える
        const isYamiOpenHide = p.riichi && p.openRiichi && isYamiMarked;
        let cls=`tile ${tc(t)}${(canSel||canSelYami||isHakuSelectable)?' selectable':''}${isSel?' selected':''}${isDrawn?' drawn':''}${isKita?' kita-tile':''}${isYamiMarked?' yami-marked':''}${isHaku?' haku-converted':''}`;

        // 引いた牌スペース: drawnTileがある時のみ最後の牌の直前に挿入
        if(p.drawnTile&&i===p.hand.length-1&&i>0){
          const sep=document.createElement('div');
          sep.className='drawn-sep';
          sep.style.cssText='width:8px;flex-shrink:0;';
          handWrap.appendChild(sep);
        }

        const tileEl=document.createElement('div');
        tileEl.className=cls;
        tileEl.dataset.idx=i;
        if(isDimmed)tileEl.style.opacity='0.32', tileEl.style.cursor='not-allowed';
        // オープンリーチ中の闇牌: 本物は見えるが薄暗く（裏向きになることを示す）
        tileEl.innerHTML=(isYamiOpenHide?'🌑':'')+(isDimmed?'':emj(t))+(isDora&&!isDimmed?'<div class="tile-dora"></div>':'');
        if(!isDimmed&&!isYamiOpenHide) tileEl.innerHTML=emj(t)+(isDora?'<div class="tile-dora"></div>':'');
        if(isYamiOpenHide) tileEl.innerHTML=`<span style="font-size:.55em;opacity:.5;">${emj(t)}</span>`;

        if(canSel){
          tileEl.addEventListener('click',()=>{
            if(selIdx===i) humanDiscard();
            else humanSelect(i);
          });
        } else if(canSelYami||isHakuSelectable){
          tileEl.addEventListener('click',()=>humanSelect(i));
        }
        handWrap.appendChild(tileEl);
        // タイマーはdrawn牌の上にabsolute配置（drawn牌の処理後に一度だけ追加）
        if(isDrawn && G_TIME_MODE){
          const tw=document.createElement('span');
          tw.id='handTimerWrap';
          tw.style.cssText='position:absolute;top:-24px;left:165px;display:inline-flex;align-items:center;gap:1px;font-variant-numeric:tabular-nums;font-weight:700;white-space:nowrap;pointer-events:none;';
          tw.innerHTML='<span id="handTimerBase" style="font-size:1.44rem;color:#ff9933;min-width:1.2em;text-align:right;"></span><span style="font-size:1.2rem;color:transparent;">+</span><span id="handTimerBonus" style="font-size:1.44rem;color:#44cc88;min-width:1em;text-align:left;"></span>';
          handWrap.appendChild(tw);
        }
      }
      // drawn牌がない場合: 透明ダミー枠で位置確保
      if(!p.drawnTile){
        const dummy=document.createElement('div');
        dummy.style.cssText='width:36px;height:48px;flex-shrink:0;border-radius:4px;opacity:0;pointer-events:none;';
        handWrap.appendChild(dummy);
      }
      // タイマーspan: drawn牌がない場合も同位置に追加
      if(G_TIME_MODE && !p.drawnTile){
        const tw=document.createElement('span');
        tw.id='handTimerWrap';
        tw.style.cssText='position:absolute;top:-24px;left:165px;display:inline-flex;align-items:center;gap:1px;font-variant-numeric:tabular-nums;font-weight:700;white-space:nowrap;pointer-events:none;';
        tw.innerHTML='<span id="handTimerBase" style="font-size:1.44rem;color:#ff9933;min-width:1.2em;text-align:right;"></span><span style="font-size:1.2rem;color:transparent;">+</span><span id="handTimerBonus" style="font-size:1.44rem;color:#44cc88;min-width:1em;text-align:left;"></span>';
        handWrap.appendChild(tw);
      }

    }else{
      const isLightHandMode = G.lightMode==='pick';
      // オープンリーチ中は手牌全公開（闇牌は🌑のまま）
      const isOpenRiichi = p.riichi && p.openRiichi;
      const yamiIdx = (isOpenRiichi && typeof p.yamiTileIdx==='number' && p.yamiTileIdx>=0) ? p.yamiTileIdx : -1;
      for(let i=0;i<p.hand.length;i++){
        const isRevealedByLight = !!(G.lightRevealedHand&&p.hand[i]&&G.lightRevealedHand[p.hand[i]._id]);
        const bt=document.createElement('div');
        bt.style.cssText='width:36px;height:48px;font-size:2.8rem;border-radius:4px;overflow:visible;';
        if(isRevealedByLight){
          const t=p.hand[i];
          bt.className=`tile ${tc(t)} light-revealed`;
          bt.innerHTML=emj(t);
        } else if(isOpenRiichi && yamiIdx===i){
          // 闇指定牌: 光の「闇を解く」モード時はクリック可能
          bt.className=`tile back yami-hidden${G.lightMode==='yami'?' steal-target':''}`;
          bt.textContent='🌑';
          if(G.lightMode==='yami') bt.onclick=()=>lightDispelHandYami(pidx);
        } else if(isOpenRiichi){
          // オープンリーチ: 全牌を表向きに公開
          const t=p.hand[i];
          bt.className=`tile ${tc(t)}`;
          bt.innerHTML=emj(t);
        } else if(isLightHandMode&&pidx!==NET.myIdx){
          bt.className='tile back light-target-tile';
          bt.textContent='🀫';
          bt.dataset.lpidx=pidx;
          bt.dataset.lidx=i;
        } else {
          bt.className='tile back';
          bt.textContent='🀫';
        }
        // CPU: 5枚(drawn有)の時のみ最後の牌の直前にスペーサー
        if(p.hand.length>=5&&i===p.hand.length-1){
          const sep2=document.createElement('div');
          sep2.style.cssText='width:8px;flex-shrink:0;';
          handWrap.appendChild(sep2);
        }
        handWrap.appendChild(bt);
      }
      // CPU: drawn牌なし(4枚)なら透明ダミー枠
      if(p.hand.length<=4){
        const dummy2=document.createElement('div');
        dummy2.style.cssText='width:36px;height:48px;flex-shrink:0;border-radius:4px;opacity:0;pointer-events:none;';
        handWrap.appendChild(dummy2);
      }
      if(isActive&&G.phase==='draw'){
        const dot=document.createElement('div');
        dot.className='thinking-dots';
        dot.style.cssText='position:absolute;top:-18px;left:50%;transform:translateX(-50%);font-size:.6rem;color:#4a8a6a;white-space:nowrap;pointer-events:none;z-index:5;';
        handWrap.appendChild(dot);
      }
    }
    // タイマー数字を引いた牌の直後に挿入（isDrawnのtileElの後に追加）
    // → タイマー span は tileEl ループ内で挿入済み（下記ループ内で処理）
    // Discards — 6-column grid (shown ABOVE hand)
    const dw=document.createElement('div');dw.className='discard-wrap';
    const dl=document.createElement('span');dl.className='discard-label';dl.textContent='捨て牌';
    dw.appendChild(dl);
    const dg=document.createElement('div');dg.className='discard-grid';
    dg.innerHTML=p.discards.map((t,di)=>{
      const isLast=di===p.discards.length-1;
      const isRiichiTile=p.riichi&&di===p.riichiDiscardIdx;
      const isYamiDiscard=!!t._yami;
      // 闇捨て: 他プレイヤーには🌑、自分には本物を薄暗く
      if(isYamiDiscard && pidx!==NET.myIdx){
        const isYamiTarget=G.lightMode==='yami';
        return`<div class="tile back yami-hidden${isLast?' last-discard':''}${isRiichiTile?' riichi-discard':''}${isYamiTarget?' steal-target':''}" ${isYamiTarget?`onclick="lightDispelDiscardYami(${pidx},${di})"`:''}>🌑</div>`;
      }
      if(isYamiDiscard && pidx===NET.myIdx){
        return`<div class="tile ${tc(t)}${isLast?' last-discard':''}${isRiichiTile?' riichi-discard':''}" style="opacity:.55;border-color:#553377;"><span style="font-size:.5em;position:absolute;top:1px;left:1px;">🌑</span>${emj(t)}</div>`;
      }
      const isStealTarget = G.stealMode && pidx!==NET.myIdx && !t._yami;
      const isDoraDiscard = getDoras().some(d=>teq(d,t));
      return`<div class="tile ${tc(t)}${isLast?' last-discard':''}${isRiichiTile?' riichi-discard':''}${isStealTarget?' steal-target':''}" ${isStealTarget?`onclick="humanSteal(${pidx},${di})"`:''} style="position:relative;">${emj(t)}${isDoraDiscard?'<div class="tile-dora"></div>':''}</div>`;
    }).join('');
    dw.appendChild(dg);
    // ドラ山は doraPileFixed に固定表示（seat-innerには追加しない）
    if(p.isDealer && G.doraPile){
      const dc=document.getElementById('doraCanvas');
      if(dc){
        dc.width=7*(DC_W+DC_GAP)-DC_GAP;
        dc.height=2*(DC_H+DC_GAP)-DC_GAP;
        requestAnimationFrame(()=>renderDoraCanvas());
      }
    }

    // 全員 handOuter を seat-inner に追加
    inner.appendChild(handOuter);
    // 捨て牌配置
    const _si=si;
    const _sideNames2=['bottom','right','top','left'];
    const _sideName=_sideNames2[_si];
    dw.classList.add('discard-abs','discard-abs-'+_sideName);
    dw.dataset.discardSide=_si;
    if(_si===1||_si===3){
      // left/right: table-center の子として position:absolute で外側��定
      const tcEl2=document.getElementById('tableCenter');
      tcEl2.querySelectorAll('.discard-abs-'+_sideName).forEach(el=>el.remove());
      tcEl2.appendChild(dw);
    } else {
      // bottom/top: mahjong-table の子として rAF で座標計算
      table.querySelectorAll('.discard-abs-'+_sideName).forEach(el=>el.remove());
      table.appendChild(dw);
    }

    // 右下クイックボタン（北抜き/ポン/カン）: 自分の席のみ
    if(isHuman && si===0){
      const qb=document.createElement('div');
      qb.className='quick-btns';
      // ポン（ポン対象が自分の場合のみ）
      const ponTarget = pendingAction?.target ?? NET.myIdx;
      if(G.phase==='pending_pon' && ponTarget===NET.myIdx){
        const pb=document.createElement('button');
        pb.className='quick-btn quick-btn-pon';
        pb.textContent='ポン '+emj(pendingAction?.tile||{suit:'honor',num:'東'});
        pb.onclick=humanPon;
        qb.appendChild(pb);
        // ポン対象牌でカンできる場合もボタン表示
        const ponTile=pendingAction?.tile;
        if(ponTile){
          const cnt=cntMap(p.hand);
          if((cnt[tk(ponTile)]||0)>=3){
            const kb=document.createElement('button');
            kb.className='quick-btn quick-btn-kan';
            kb.textContent='カン '+emj(ponTile);
            kb.onclick=()=>humanMinkan();
            qb.appendChild(kb);
          }
        }
      }
      // 加槓
      if(G.phase==='discard'&&G.current===NET.myIdx){
        for(let ki=0;ki<p.hand.length;ki++){
          const kt=p.hand[ki];
          const hasPon=p.melds.some(m=>m.type==='pon'&&teq(m.tiles[0],kt));
          if(hasPon){
            const kab=document.createElement('button');
            kab.className='quick-btn quick-btn-kan';
            kab.textContent='加槓 '+emj(kt);
            kab.onclick=()=>humanKakan(ki);
            qb.appendChild(kab);
          }
        }
        // 暗槓
        const ankans=canAnkan(NET.myIdx);
        for(const a of ankans){
          const kab=document.createElement('button');
          kab.className='quick-btn quick-btn-kan';
          kab.textContent='暗槓 '+emj(a.tile);
          const akey=a.key;
          kab.onclick=()=>humanAnkan(akey);
          qb.appendChild(kab);
        }
      }
      if(qb.children.length>0) div.appendChild(qb);
    }

    div.appendChild(inner);

    // Insert before center
    const center=document.getElementById('tableCenter');
    table.insertBefore(div,center);
  }

  // rAFでDOMが確定した後に捨て牌の座標を計算・手牌中央補正
  requestAnimationFrame(()=>{_positionDiscards(table);_centerHandSeats(table);});
}

function _positionDiscards(table){
  const tc=document.getElementById('tableCenter');
  if(!tc||!table) return;
  // scale対応: offset系を使い、scale前のpx座標で配置
  const tcLeft   = tc.offsetLeft;
  const tcTop    = tc.offsetTop;
  const tcW2     = tc.offsetWidth;
  const tcH2     = tc.offsetHeight;
  const tcBottom = tcTop + tcH2;
  const GAP = 4;
  // 捨て牌グリッド外枠幅: 15列×36px + 14gap×2 + padding5×2 + border1×2 = 580px
  const DW2 = 580;

  table.querySelectorAll('.discard-abs').forEach(dw=>{
    const si=parseInt(dw.dataset.discardSide);
    const dh=dw.offsetHeight;
    if(si===0){
      dw.style.left=(tcLeft + 5)+'px';
      dw.style.top =(tcBottom + GAP)+'px';
      dw.style.transform='';
    } else if(si===2){
      dw.style.left=(tcLeft + tcW2 - 5 - DW2)+'px';
      dw.style.top =(tcTop - GAP - dh)+'px';
      dw.style.transform='rotate(180deg)';
    }
  });

  // left/right: table-center基準で座標設定
  // rotate(-90deg) origin(0,0): top=DW2(幅分下げる)でtc上端に揃う, left=tcWidth+GAP
  // rotate(90deg) origin(100%,0): top=0, right側に出す
  const tcW=tc.offsetWidth;
  const tcH=tc.offsetHeight;
  const GRID_W=314; // 捨て牌外枠幅 left/right（8列, padding+border込み）

  // 右: rotate(-90deg) origin(0,0)
  // top=GRID_W → 回��後の上端=top-GRID_W=0 → tc上端に揃う
  // left=tcW+GAP → tc右辺外にぴったり
  tc.querySelectorAll('.discard-abs-right').forEach(dw=>{
    dw.style.left=(tcW+GAP)+'px';
    dw.style.top=(GRID_W-2)+'px';
    dw.style.transform='rotate(-90deg)';
    dw.style.transformOrigin='0 0';
  });

  // 左: rotate(90deg) origin(0,0) — 右の左右鏡像
  // rotate(90deg) origin(0,0): 左上(0,0)固定、右上(W,0)→(0,W)、左下(0,H)→(-H,0)
  // 回転後: 右端=left、上端=top、左端=left-H、下端=top+W
  // 右端をtc左辺-GAPに → left=-GAP
  // 上端をtc上端(0)に → top=0
  tc.querySelectorAll('.discard-abs-left').forEach(dw=>{
    dw.style.left=(-GAP)+'px';
    dw.style.top='0px';
    dw.style.transform='rotate(90deg)';
    dw.style.transformOrigin='0 0';
  });


  // Light hand target delegation
  if(G.lightMode==='pick'){
    table.querySelectorAll('.light-target-tile[data-lpidx]').forEach(el=>{
      el.addEventListener('click',()=>{
        const pidx=parseInt(el.dataset.lpidx);
        const idx=parseInt(el.dataset.lidx);
        lightRevealHand(pidx,idx);
      });
    });
  }
}

function renderActions(){
  const area=document.getElementById('actionArea');
  if(!G.players||!G.players[NET.myIdx]){area.innerHTML='';return;}
  const p=G.players[NET.myIdx];
  let html='';

  if(G.phase==='discard'&&G.current===NET.myIdx){
    const hasKita=p.hand.some(t=>t.suit==='honor'&&t.num==='北');
    const canWinNow=canWin(p.hand);
    const isPR=!!G.pendingRiichi;
    const vrd=(!p.riichi&&p.melds.length===0&&p.hand.length===5)?getRiichiDiscards(p.hand):[];
    const canRiichi=vrd.length>0&&!isPR;

    if(p.riichi){
      const drn=p.hand[p.hand.length-1];
      const pinzuNoTsumo=G_ABILITY_MODE&&PROFILE.ability==="pinzu"&&p.isDealer;
if(canWinNow&&!pinzuNoTsumo)html+=`<button class="btn btn-tsumo" onclick="humanTsumo()">ツモ上がり！</button>`;
      html+=`<button class="btn btn-primary" onclick="humanDiscard()">ツモ切り [${emj(drn)}]</button>`;
      if(hasKita)html+=`<button class="btn btn-kita" onclick="humanKita()">北抜き ${emj({suit:'honor',num:'北'})}</button>`;
      // リーチ中の暗槓（待ちが変わらない場合のみ canAnkan が返す）
      // 暗槓は右下クイックボタンへ
    }else if(isPR){
      const sel=selIdx>=0?p.hand[selIdx]:null;
      const vs=sel&&G.riichiValidIdx&&G.riichiValidIdx.includes(selIdx);
      html+=`<span class="action-hint" style="color:#ff7777;">🀄 ${G.pendingRiichi==='open'?'オープン':''}リーチ — テンパイを保つ牌をダブルクリック or タップ→捨てる</span>`;
      if(vs)html+=`<button class="btn btn-primary" onclick="humanDiscard()">捨てる [${emj(sel)}]</button>`;
      html+=`<button class="btn btn-danger" onclick="humanCancelRiichi()">キャンセル</button>`;
    }else{
      const pinzuNoTsumo=G_ABILITY_MODE&&PROFILE.ability==="pinzu"&&p.isDealer;
if(canWinNow&&!pinzuNoTsumo)html+=`<button class="btn btn-tsumo" onclick="humanTsumo()">ツモ上がり！</button>`;

      if(hasKita&&!p.riichi)html+=`<button class="btn btn-kita" onclick="humanKita()">北抜き ${emj({suit:'honor',num:'北'})}</button>`;
      if(canRiichi){
        const dbl=canDoubleRiichi();
        html+=`<button class="btn btn-riichi" onclick="humanDeclareRiichi('riichi')">${dbl?'ダブルリーチ':'リーチ'}</button>`;
        html+=`<button class="btn btn-open-riichi" onclick="humanDeclareRiichi('open')">${dbl?'ダブルオープンリーチ':'オープンリーチ'}</button>`;
      }
      // 白・闇: セレクトモード中のヒント+キャンセルのみ（ボタン本体はcornerBtns）
      if(G_ABILITY_MODE&&PROFILE.ability==='haku'&&G.hakuSelectMode){
        html+=`<span class="action-hint" style="color:#e8e8ff;">🀆 白に変���る手牌をクリック！</span>`;
        html+=`<button class="btn btn-danger" onclick="G.hakuSelectMode=false;renderAll();">キャンセル</button>`;
      }
      if(G_ABILITY_MODE&&PROFILE.ability==='yami'&&G.yamiSelectMode){
        html+=`<span class="action-hint" style="color:#cc99ff;">🌑 闇にする手牌をクリック！</span>`;
        html+=`<button class="btn btn-danger" onclick="G.yamiSelectMode=false;renderAll();">キャ���セル</button>`;
      }
      // 加槓チェック(右下ボタンへ移動済み): ポン済み牌と同じ牌が手牌にある
      for(let ki=0;ki<p.hand.length;ki++){
        const kt=p.hand[ki];
        const hasPon=p.melds.some(m=>m.type==='pon'&&teq(m.tiles[0],kt));
        if(hasPon)html+=`<button class="btn btn-default" onclick="humanKakan(${ki})">加槓 ${emj(kt)}</button>`;
      }
      // 暗槓チェック: 手牌に4枚同じ牌がある（リーチ中も待ちが変わらなければ可）
      if(!p.riichi||p.riichi){  // リーチ中も含めて canAnkan でフィルタ
        const ankans=canAnkan(NET.myIdx);
        for(const a of ankans){
          html+=`<button class="btn btn-default" onclick="humanAnkan('${a.key}')">暗槓 ${emj(a.tile)}</button>`;
        }
      }
      // action-hint removed
    }
  }else if(G.phase==='pending_ron'){
    // ロン対象が自分の場合のみ表示（オンラインではtargetで判定）
    const ronTarget = pendingAction?.target ?? NET.myIdx;
    if(ronTarget===NET.myIdx){
      html+=`<button class="btn btn-ron" onclick="humanRon()">ロン！ ${emj(pendingAction?.tile)}</button>`;
      html+=`<button class="btn btn-danger" onclick="humanSkipRon()">スキップ</button>`;
    }
  }
  // ポン可能: ロンの有無に関わらず表示
  if(G.phase==='pending_pon'){
    // ポン対象が自分の場合のみ表示（オンラインではtargetで判定）
    const ponTarget = pendingAction?.target ?? NET.myIdx;
    if(ponTarget===NET.myIdx){
      html+=`<button class="btn btn-default" onclick="humanPon()">ポン ${emj(pendingAction?.tile)}</button>`;
      {const _pt=pendingAction?.tile;const _p=G.players[NET.myIdx];if(_pt&&_p){const _cnt=cntMap(_p.hand);if((_cnt[tk(_pt)]||0)>=3)html+=`<button class="btn btn-default" onclick="humanMinkan()">カン ${emj(_pt)}</button>`;}}
      html+=`<button class="btn btn-danger" onclick="humanSkipPon()">スキップ</button>`;
    }
  }else if(G.phase==='draw_wait'&&G.current===NET.myIdx){
    // 能力ボタン → cornerBtns (renderCornerAbilityBtns)
    if(G.minePlantMode){
      html+=`<span class="action-hint" style="color:#ff8844;">💣 地雷を仕掛ける山牌をクリック！</span>`;
      html+=`<button class="btn btn-danger" onclick="G.minePlantMode=false;renderAll();">キャンセル</button>`;
    } else if(G.lightMode==='pick'){
      html+=`<span class="action-hint" style="color:#ffee66;">☀️ 表にする山牌をクリック！</span>`;
      html+=`<button class="btn btn-danger" onclick="G.lightMode=false;renderAll();">キャンセル</button>`;
    } else if(G.lightMode==='pick'){
      html+=`<span class="action-hint" style="color:#ffee66;">☀️ 表にする相手の手牌をクリック！</span>`;
      html+=`<button class="btn btn-danger" onclick="G.lightMode=false;renderAll();">キャンセル</button>`;
    } else if(G.lightMode==='yami'){
      html+=`<span class="action-hint" style="color:#cc99ff;">☀️ 解除する闇牌をクリック！</span>`;
      html+=`<button class="btn btn-danger" onclick="G.lightMode=false;renderAll();">キャンセル</button>`;
    } else {
      // スチール使用中のキャンセルのみ表示（ボタン自体はcornerBtns）
      if(G.stealMode){
        html+=`<span class="action-hint" style="color:#88ff88;">🃏 盗む捨て牌をクリック！</span>`;
        html+=`<button class="btn btn-danger" onclick="G.stealMode=false;renderAll();">キャンセル</button>`;
      }
    }
  }else if(G.current!==NET.myIdx){
    if(G.minePlantMode){
      html+=`<span class="action-hint" style="color:#ff8844;">💣 地雷を仕掛ける山牌をクリック！</span>`;
      html+=`<button class="btn btn-danger" onclick="G.minePlantMode=false;renderAll();">キャンセル</button>`;
    } else if(G.lightMode==='pick'){
      html+=`<span class="action-hint" style="color:#ffee66;">☀️ 表にする山牌をクリック！</span>`;
      html+=`<button class="btn btn-danger" onclick="G.lightMode=false;renderAll();">キャンセル</button>`;
    } else if(G.lightMode==='pick'){
      html+=`<span class="action-hint" style="color:#ffee66;">☀️ 表にする相手の手牌をクリック！</span>`;
      html+=`<button class="btn btn-danger" onclick="G.lightMode=false;renderAll();">キャンセル</button>`;
    } else if(G.stealMode){
      html+=`<span class="action-hint" style="color:#88ff88;">🃏 盗む捨て牌をクリック！</span>`;
      html+=`<button class="btn btn-danger" onclick="G.stealMode=false;renderAll();">キャンセル</button>`;
    } else {
      // CPU番表示なし
    }
  }

  area.innerHTML=html;
}

selectCount(3);

// スチール: 捨て牌から1枚盗む
function humanSteal(fromPidx, discardIdx){
  if(!G.stealMode) return;
  const myIdx=NET.myIdx;
  const from=G.players[fromPidx];
  if(!from||discardIdx<0||discardIdx>=from.discards.length) return;
  // 闇捨て牌（_yami）は盗めない
  const tile=from.discards[discardIdx];
  if(tile._yami) return;
  if(NET.online&&!amIHost()){
    netSend({type:'steal',myIdx,fromPidx,discardIdx});
    G.stealMode=false;renderAll();return;
  }
  _doSteal(myIdx,fromPidx,discardIdx);
}
function _doSteal(myIdx,fromPidx,discardIdx){
  const from=G.players[fromPidx];
  const tile=from.discards.splice(discardIdx,1)[0];
  const p=G.players[myIdx];
  p.hand.push(tile);p.drawnTile=tile;
  G.players[myIdx].abilityUsed=true;G.stealMode=false;
  SFX.steal();
  addLog(`🃏 スチール！${from.name}の捨て牌 ${emj(tile)} を盗んだ`,'log-dora');
  G.phase='discard';updateTenpai(p);
  renderAll();broadcastState();
  // CPUのスチール後: ターンを継続してcpuDiscardを呼ぶ
  const isCpu = !NET.online ? myIdx!==0 : (NET.isHost && myIdx!==NET.myIdx);
  if(isCpu) setTimeout(cpuDiscard, 600);
}

// ============================================================
