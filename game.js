// DORA
// ============================================================
function getDoras(){return G.doraInds.map(doraFromIndicator);}
function countDoras(hand,p){
  const doras=getDoras();
  let n=p.kitaCount||0;
  // 手牌
  for(const t of hand)for(const d of doras)if(teq(t,d))n++;
  // 鳴き面子
  for(const m of (p.melds||[])){
    for(const t of (m.tiles||[]))for(const d of doras)if(teq(t,d))n++;
  }
  // 北抜き牌自体もドラ対象（kitaCount分は上で加算済み、ここでは牌固有のドラを確認）
  return n;
}

// ============================================================
// DRAW / DISCARD
// ============================================================
function drawTile(pidx){
  if(G.deck.length===0)return null;
  const p2=G.players[pidx];
  let idx;
  // 地雷能力所持者: 地雷スロットの牌を避けて引く
  if(p2&&p2.ability==='mine'&&G.mineSlots&&G.mineSlots.length>0&&G.deck.length>1){
    const mineTile=G.deckSlots[G.mineSlots[0]]; // 最初の地雷を避ける
    if(mineTile){
      // 地雷の牌と同じsui/numでないインデックスを選ぶ
      const safeIdxs=G.deck.map((_,i)=>i).filter(i=>!(G.deck[i].suit===mineTile.suit&&G.deck[i].num===mineTile.num));
      idx=safeIdxs.length>0?safeIdxs[Math.floor(Math.random()*safeIdxs.length)]:Math.floor(Math.random()*G.deck.length);
    } else idx=Math.floor(Math.random()*G.deck.length);
  } else {
    idx=Math.floor(Math.random()*G.deck.length);
  }
  const t=G.deck.splice(idx,1)[0];
  // Mark the slot as drawn — use _pkey for exact tile identity
  if(G.deckSlots){
    let found=false;
    // 優先: _pkey一致
    for(let i=0;i<G.deckSlots.length&&!found;i++){
      const s=G.deckSlots[i];
      if(s&&s._pkey&&s._pkey===t._pkey){
        if(G.mineSlots&&G.mineSlots.includes(i)){
          G.mineSlots=G.mineSlots.filter(x=>x!==i);
          if(G.mineOwners) delete G.mineOwners[i];
          G.deckSlots[i]=null;found=true;
          const p=G.players[pidx];
          p.drawnTile=null;
          SFX.mineExplode();
          addLog(`💥 ${p.name} が地雷を踏んだ！[${emj(t)}] を強制捨て`,'log-win');
          G._mineHit={pidx,tile:t};
          return t;
        }
        G.deckSlots[i]=null;found=true;
      }
    }
    // フォールバック: suit+num一致（_pkeyなし互換）
    for(let i=0;i<G.deckSlots.length&&!found;i++){
      const s=G.deckSlots[i];
      if(s&&!s._pkey&&s.suit===t.suit&&s.num===t.num){
        if(G.mineSlots&&G.mineSlots.includes(i)){
          G.mineSlots=G.mineSlots.filter(x=>x!==i);
          if(G.mineOwners) delete G.mineOwners[i];
          G.deckSlots[i]=null;found=true;
          const p=G.players[pidx];
          p.drawnTile=null;
          SFX.mineExplode();
          addLog(`💥 ${p.name} が地雷を踏んだ！[${emj(t)}] を強制捨て`,'log-win');
          G._mineHit={pidx,tile:t};
          return t;
        }
        G.deckSlots[i]=null;found=true;
      }
    }
  }
  const p=G.players[pidx];
  p.hand.push(t);p.drawnTile=t;
  return t;
}

function drawRinshanTile(pidx){
  // 左(index=0)から順に引く
  if(G.rinshanIdx >= G.rinshan.length) return drawTile(pidx); // fallback
  const ri=G.rinshanIdx;
  const t=G.rinshan[G.rinshanIdx++];
  const p=G.players[pidx];
  // 💣 嶺上地雷チェック
  if(G.mineRinshanIdxs&&G.mineRinshanIdxs.includes(ri)){
    G.mineRinshanIdxs=G.mineRinshanIdxs.filter(x=>x!==ri);
    if(G.mineRinshanOwners) delete G.mineRinshanOwners[ri];
    p.drawnTile=null;
    SFX.mineExplode();
    addLog(`💥 ${p.name} が嶺上地雷を踏んだ！[${emj(t)}] を強制捨て`,'log-win');
    G._mineHit={pidx,tile:t};
    return t;
  }
  p.hand.push(t);p.drawnTile=t;
  return t;
}

// Reveal next kan-dora indicator
function revealKanDora(){
  // SFX.dora();
  G.kanDoraCount++;
  if(G.kanDoraCount<=3){
    G.doraInds.push(G.doraPile[G.kanDoraCount]);
    // Also update ura: next ura is doraPile[4+kanDoraCount]
    if(G.doraPile[4+G.kanDoraCount]) G.uraInds.push(G.doraPile[4+G.kanDoraCount]);
  }
}

function discardAction(pidx,tidx,isYami=false){ if(pidx===NET.myIdx){ _timerSaveBonus(); timerStop(); }
  if(pidx===NET.myIdx||!NET.online) SFX.discard();
  // CPU闇能力: _cpuNextYamiフラグがあれば闇捨て
  const pd=G.players[pidx];
  if(pd&&pd._cpuNextYami){isYami=true;pd._cpuNextYami=false;}
  const p=G.players[pidx];
  const tile=p.hand.splice(tidx,1)[0];
  p.drawnTile=null;
  // 闇捨て: タイルに印をつける＋abilityUsedをセット
  if(isYami){ tile._yami=true; p.abilityUsed=true; }
  p.discards.push(tile);
  // ソート前に闇指定牌を記憶して、ソート後に再検索
  const yamiTile = (p.yamiTileIdx>=0 && p.yamiTileIdx<p.hand.length) ? p.hand[p.yamiTileIdx] : null;
  p.hand=sortTiles(p.hand);
  // ソート後に闇指定牌のインデックスを再計算
  if(yamiTile) p.yamiTileIdx=p.hand.findIndex(t=>t===yamiTile);
  else p.yamiTileIdx=-1;
  updateTenpai(p);
  p.turnCount=(p.turnCount||0)+1;
  G.players.forEach(pl=>{if(pl.id!==pidx)pl.ippatsu=false;});

  if(isYami) addLog(`${p.name} → 🌑 を捨てた`,'log-new');
  else addLog(`${p.name} → ${emj(tile)} を捨てた`,'log-new');
  // Check ron
  for(let i=0;i<numPlayers;i++){
    if(i===pidx)continue;
    const op=G.players[i];
    if((op.hand.length===4||op.hand.length===1)&&op.tenpai&&op.waits.some(w=>teq(w,tile))){
      // オンライン: 自分自身か、ホストが管理しているゲストか判定
      const isMe = (i===NET.myIdx);
      if(isMe || isOnlineGuestIdx(i)){
        pendingAction={type:'ron',tile,from:pidx,target:i};
        G.phase='pending_ron';renderAll();broadcastState();
        if(isMe){ setTimeout(()=>{ if(G.phase==='pending_ron'&&autoWinEnabled) humanRon(); },250); }
        return;
      }else if(cpuDecideRon(i,tile)){handleRon(i,tile,pidx);return;}
    }
  }
  if(!checkPon(pidx,tile)){nextTurn((pidx+1)%numPlayers);}
  broadcastState();
}





// 加槓: ポン済みの牌に同じ牌を追加してカンにする
function handleKakan(pidx, handIdx){
  // SFX.kan();
  const p=G.players[pidx];
  const tile=p.hand[handIdx];
  // ポン済み面子を探す
  const ponMeldIdx=p.melds.findIndex(m=>m.type==='pon'&&teq(m.tiles[0],tile));
  if(ponMeldIdx<0)return;
  // 手牌から取り除く
  p.hand.splice(handIdx,1);
  // 面子をカンに変換
  p.melds[ponMeldIdx]={type:'kakan',tiles:[tile,tile,tile,tile],from:p.melds[ponMeldIdx].from};
  p.kanCount=(p.kanCount||0)+1;
  addLog(`${p.name} が加槓！ ${emj(tile)}`,'log-dora');
  // 嶺上牌を補充
  const rep=drawRinshanTile(pidx);if(!rep){handleExhausted();return;}
  revealKanDora();
  // 槍槓チェック: 他プレイヤーがこの牌でロンできるか
  for(let i=0;i<numPlayers;i++){
    if(i===pidx)continue;
    const op=G.players[i];
    if((op.hand.length===4||op.hand.length===1)&&op.tenpai&&op.waits.some(w=>teq(w,tile))){
      op.isChankan=true;
      // オンライン: 自分自身か、ホストが管理しているゲストか判定
      const isMe = (i===NET.myIdx);
      if(isMe || isOnlineGuestIdx(i)){
        pendingAction={type:'ron',tile,from:pidx,target:i};
        G.phase='pending_ron';renderAll();broadcastState();
        if(isMe){ setTimeout(()=>{ if(G.phase==='pending_ron'&&autoWinEnabled) humanRon(); },250); }
        return;
      } else if(cpuDecideRon(i,tile)){
        handleRon(i,tile,pidx);return;
      }
    }
  }
  p.hand=sortTiles(p.hand);updateTenpai(p);
  G.phase='discard';
  if(canWin(p.hand)){
    p.isRinshanKaihou=true;
    if(pidx===NET.myIdx||(NET.online&&amIHost()&&pidx!==NET.myIdx)){
      setTimeout(()=>handleWin(pidx,rep,true,-1),400);return;
    }
  }
  renderAll();broadcastState();
  // オンラインホスト: ゲストの番ならCPUを呼ばない
  if(!NET.online&&pidx!==0)setTimeout(cpuAction,700);
  if(NET.online&&amIHost()&&pidx!==NET.myIdx&&!isOnlineGuestIdx(pidx))setTimeout(cpuAction,700);
}

function humanKakan(handIdx){
  const myIdx=NET.myIdx;
  if(G.current!==myIdx||G.phase!=='discard')return;
  if(NET.online&&!amIHost()){netSend({type:'kakan',pidx:myIdx,handIdx});return;}
  handleKakan(myIdx,handIdx);
}

// 暗槓: 手牌に4枚同じ牌がある時、自分のツモ後に宣言できる
// リーチ中でも待ちが変わらない場合は可
function canAnkan(pidx){
  const p=G.players[pidx];
  if(G.phase!=='discard')return[];
  const cnt=cntMap(p.hand);
  const result=[];
  for(const[k,v] of Object.entries(cnt)){
    if(v>=4){
      // リーチ中の場合: 暗槓後もテンパイ形・待ちが変わらないかチェック
      if(p.riichi){
        const[s,n]=k.split('_');
        const kTile=mt(s,isNaN(n)?n:+n);
        const after=p.hand.filter(t=>!teq(t,kTile));
        // 待ちが同じかチェック (4枚除いた後1枚=残り手牌1枚 → 単騎のみ)
        // 5枚手牌で4枚同じ → 残り1枚が単騎待ち、待ち変化なしなら可
        if(after.length===1){
          const newWaits=getWaits(after); // 1枚だと getWaits fails (need 4)
          // 実際は暗槓後手牌1枚+嶺上で5枚になるので常に変化あり
          // リーチ中暗槓: 待ちが変わらない = 同じ待ち牌が維持される
          const oldWaits=p.waits;
          // 5枚→4枚(除く4枚)→嶺上1枚追加で5枚に戻る
          // 待ちは変わらない（単騎待ちはそのまま）
          // → 許可
        }
        result.push({key:k,tile:p.hand.find(t=>tk(t)===k)});
      } else {
        result.push({key:k,tile:p.hand.find(t=>tk(t)===k)});
      }
    }
  }
  return result;
}

function handleAnkan(pidx, tileKey){
  // SFX.kan();
  const p=G.players[pidx];
  const tiles=p.hand.filter(t=>tk(t)===tileKey);
  if(tiles.length<4)return;
  // 手牌から4枚除く
  let removed=0;
  p.hand=p.hand.filter(t=>{if(removed<4&&tk(t)===tileKey){removed++;return false;}return true;});
  p.melds.push({type:'ankan',tiles:[...tiles.slice(0,4)]});
  p.kanCount=(p.kanCount||0)+1;
  addLog(`${p.name} が暗槓！`,'log-dora');
  // 嶺上牌補充
  const rep=drawRinshanTile(pidx);if(!rep){handleExhausted();return;}
  revealKanDora();
  p.hand=sortTiles(p.hand);updateTenpai(p);
  G.phase='discard';
  if(canWin(p.hand)){
    p.isRinshanKaihou=true;
    setTimeout(()=>handleWin(pidx,rep,true,-1),400);return;
  }
  if(p.riichi){
    // リーチ中はツモ切り
    setTimeout(()=>{discardAction(pidx,p.hand.length-1);broadcastState();},600);
  }
  renderAll();broadcastState();
  // オンラインホスト: ゲストの番ならCPUを呼ばない
  if(!NET.online&&pidx!==NET.myIdx)setTimeout(cpuAction,700);
  if(NET.online&&amIHost()&&pidx!==NET.myIdx&&!isOnlineGuestIdx(pidx))setTimeout(cpuAction,700);
}

function humanAnkan(tileKey){
  const myIdx=NET.myIdx;
  if(G.current!==myIdx||G.phase!=='discard')return;
  if(NET.online&&!amIHost()){netSend({type:'ankan',pidx:myIdx,tileKey});return;}
  handleAnkan(myIdx,tileKey);
}

function checkPon(fromPidx,tile){
  for(let i=0;i<numPlayers;i++){
    if(i===fromPidx)continue;
    const p=G.players[i];
    if(p.riichi)continue; // リー��中はポン不可
    const cnt=cntMap(p.hand);
    if((cnt[tk(tile)]||0)>=2){
      // オンライン: 自分自身か、ホストが管理しているゲストか判定
      const isMe = (i===NET.myIdx);
      if(isMe || isOnlineGuestIdx(i)){
        pendingAction={type:'pon',tile,from:fromPidx,target:i};
        G.phase='pending_pon';renderAll();broadcastState();
        if(fromPidx!==NET.myIdx&&!_timerTick) timerOnMyTurn(); // ポン選択中もタイマー継続
        return true;
      }else if(cpuDecidePon(i,tile)){handlePon(i,tile,fromPidx);return true;}
    }
  }
  return false;
}

function handlePon(pidx,tile,fromPidx){
  // SFX.pon();
  const p=G.players[pidx];
  let rm=0;p.hand=p.hand.filter(t=>{if(rm<2&&teq(t,tile)){rm++;return false;}return true;});
  p.melds.push({type:'pon',tiles:[tile,tile,tile],from:fromPidx});
  const yamiTileP = (p.yamiTileIdx>=0&&p.yamiTileIdx<p.hand.length)?p.hand[p.yamiTileIdx]:null;
  p.hand=sortTiles(p.hand);
  p.yamiTileIdx = yamiTileP ? p.hand.findIndex(t=>t===yamiTileP) : -1;
  updateTenpai(p);
  addLog(`${p.name} がポン！ ${emj(tile)}`,'log-new');
  G.current=pidx;G.phase='discard';renderAll();broadcastState();
  if(pidx===NET.myIdx){ timerOnMyTurn(); }
  // オンラインホスト: ゲストの番ならCPUを呼ばない
  if(!NET.online&&pidx!==0)setTimeout(cpuAction,700);
  if(NET.online&&amIHost()&&pidx!==NET.myIdx&&!isOnlineGuestIdx(pidx))setTimeout(cpuAction,700);
}

function nextTurn(pidx){
  G.current=pidx;G.phase='draw';G.firstRound=false;renderAll();
  // Online: ホスト（amIHost()）だけがCPU/ドロー進行。ゲストはstate pushを待つ
  if(NET.online&&!amIHost()){broadcastState();return;}
  if(NET.online&&amIHost()){
    if(isOnlineGuestIdx(pidx) && !amIHost()){/* guest's turn – wait for guest action */broadcastState();return;}
    if(pidx!==NET.myIdx){setTimeout(cpuAction,700);return;} // CPU's turn
    // host's own turn falls through
  }
  if(!NET.online&&pidx!==0){setTimeout(cpuAction,700);return;}

  // Human draw — show wall for selection
  const myIdx=NET.myIdx;
  if(G.deck.length===0){handleExhausted();return;}
  G.phase='draw_wait'; // wait for humanPickWall()
  timerOnMyTurn(); // 制限時間モード: タイマー起動（autoDrawON時も）
  if(autoDrawEnabled){
    renderAll();broadcastState();
    setTimeout(autoPickWall,200);
    return;
  }
  addLog('山牌を選んでクリックしてください','log-new');
  renderAll();broadcastState();
}


// ═══════════════════════════════════════════════════════════════
// TURN TIMER (制限時間モード)
// ═══════════════════════════════════════════════════════════════
// 仕様:
//  - 最初の局: 20秒 + 5秒ボーナス = 25秒スタート
//  - 時間切れ時に未操作(draw_wait or discard) → 自動ツモ切り
//  - 自動ツモ切りが発生した局: 残り時間を5秒にリセット（その局は5秒秒読み）
//  - ターン開始時にタイマーリセット
//  - ペン描画中、勝利/流局オーバーレイ中は一時停止

let _timerSec   = 25;    // 残り秒数
let _timerMax   = 25;    // 今ターンの開始秒数
let _timerBase  = 20;    // ベース秒数
let _timerBonus = 5;     // 毎ターン付与ボーナス（固定5秒）
let _timerDebt  = 0;     // 局内累計消費秒数（超過分を次ターンから引く）
let _timerMaxBase = 20; // ターン開始時のベース秒（ボーナス除く）
let _timerTick  = null;
let _timerPaused= false;
let _timerAutoActFired = false;

function timerStart(sec){
  timerStop();
  _timerSec = sec;
  _timerMax = sec;
  _timerTick = setInterval(_timerStep, 1000);
  _timerRender();
}
function timerStop(){
  if(_timerTick){ clearInterval(_timerTick); _timerTick=null; }
}
function timerPause(){ _timerPaused=true; }   // ペン描画中のみ使用
function timerResume(){ _timerPaused=false; }
function timerReset(sec){
  timerStop();
  timerStart(sec??_timerMax);
}
// ターン終了時: ベース20秒超過分のみ負債加算。ボーナス5秒は毎ターン回復
function _timerSaveBonus(){
  const used = _timerMax - _timerSec; // このターンで使った秒数
  // ボーナス5秒以内に終わればノーペナルティ、超えたらベース分も消費として計上
  const baseUsed = Math.max(0, used - _timerBonus); // ベース秒の消費
  _timerDebt += baseUsed;
  _timerDebt = Math.max(0, _timerDebt);
}

function _timerStep(){
  if(G.phase==='win'||G.phase==='end') return;
  // 自分のターンでない場合は止める
  const myIdx=NET.myIdx;
  const isMyTurn=(G.current===myIdx)&&(G.phase==='draw_wait'||G.phase==='discard')||(G.phase==='pending_ron'&&G.players[myIdx])||(G.phase==='pending_pon'&&G.current===myIdx);
  if(!isMyTurn){ _timerRender(); return; }
  _timerSec--;
  _timerRender();
  if(_timerSec<=0){
    timerStop();
    _timerAutoAct();
  }
}

function _timerAutoAct(){
  const myIdx=NET.myIdx;
  if(G.current!==myIdx) return;
  _timerAutoActFired=true;
  _timerDebt=999; // 時間切れ: 以降ターンは最低1秒
  setAFK(true); // 時間切れ→離席ON
}

let _afkLoop=null;
function setAFK(on){
  const wasOn = playerAFK;
  playerAFK=on;
  _updateAFKBtn();
  if(_afkLoop){ clearInterval(_afkLoop); _afkLoop=null; }
  if(on){
    _afkLoop=setInterval(_afkTick,400);
    setTimeout(_afkTick,50); // 即時も1回
  } else if(wasOn){
    // 離席OFFに戻した時: 猶予5秒付与（負債を5秒減らす）
    _timerDebt = Math.max(0, _timerDebt - 5);
    // タイマーが動いていれば残り秒に+5
    if(_timerTick && G_TIME_MODE){
      const newSec = Math.min(_timerSec + 5, (_timerBase + _timerBonus) - Math.max(0,_timerDebt));
      _timerSec = Math.max(1, newSec);
      _timerMax = Math.max(_timerMax, _timerSec);
      _timerRender();
    }
  }
  renderAll();
}
function _afkTick(){
  if(!playerAFK){ if(_afkLoop){clearInterval(_afkLoop);_afkLoop=null;} return; }
  const myIdx=NET.myIdx;
  // 結果オーバーレイ（次の局へ）
  const wo=document.getElementById('winOverlay');
  if(wo&&wo.classList.contains('show')){ onWinOk(); return; }
  // 流局は自動進行するためスキップ不要
  if(!G.players) return;
  // ロン選択肢
  if(G.phase==='pending_ron'){ humanRon(); return; }
  // ポン選択肢 → スキップ
  if(G.phase==='pending_pon'){ humanSkipPon(); return; }
  // draw_wait
  if(G.phase==='draw_wait'&&G.current===myIdx){ autoPickWall(); return; }
  // discard
  if(G.phase==='discard'&&G.current===myIdx){ humanAutoDiscard(); return; }
}

function _updateAFKBtn(){
  const btn=document.getElementById('afkBtn');
  if(!btn) return;
  btn.textContent=playerAFK?'🚶 離席中':'🚶 離席';
  btn.style.borderColor=playerAFK?'#cc3333':'#3a1a1a';
  btn.style.color=playerAFK?'#ff6666':'#8a4a4a';
  btn.style.boxShadow=playerAFK?'0 0 8px #cc333366':'';
}
function toggleTitleSettings(){
  const p=document.getElementById('titleSettingsPanel');
  if(p) p.style.display=p.style.display==='none'?'block':'none';
}
function showTitleTab(tab){
  ['audio','rules','yaku'].forEach(t=>{
    const c=document.getElementById('titleTabContent'+t.charAt(0).toUpperCase()+t.slice(1));
    const b=document.getElementById('titleTab'+t.charAt(0).toUpperCase()+t.slice(1));
    if(c) c.style.display=t===tab?'block':'none';
    if(b){ b.style.background=t===tab?'#081a10':'#030a10'; b.style.borderColor=t===tab?'#2a5a3a':'#1a3a2a'; b.style.color=t===tab?'var(--gold)':'#5a7a6a'; }
  });
}
function toggleSettingsPanel(){
  const p=document.getElementById('settingsPanel');
  if(!p) return;
  p.style.display=p.style.display==='flex'?'none':'flex';
  const btn=document.getElementById('settingsBtn');
  if(btn){ btn.style.borderColor=p.style.display==='flex'?'#55aaff':'#2a3a4a'; btn.style.color=p.style.display==='flex'?'#55aaff':'#5a7a8a'; }
}
function toggleAutoMenu(){
  const panel=document.getElementById('autoMenuPanel');
  if(!panel) return;
  const open=panel.style.display==='flex';
  panel.style.display=open?'none':'flex';
  document.getElementById('autoMenuToggle').style.borderColor=open?'#1a3a2a':'#4a8a6a';
}
function updateAutoMenuLabel(){
  const on=[noMeldEnabled,autoDrawEnabled,autoDiscardEnabled,autoKitaEnabled,autoWinEnabled].filter(Boolean).length;
  const lbl=document.getElementById('autoMenuLabel');
  if(lbl) lbl.textContent=on>0?`設定 ${on} ▲`:'設定 ▼';
  const btn=document.getElementById('autoMenuToggle');
  if(btn){ btn.style.borderColor=on>0?'#44ff88':'#1a3a2a'; btn.style.color=on>0?'#44ff88':'#4a8a6a'; }
}
function toggleNoMeld(){
  noMeldEnabled=!noMeldEnabled;
  const btn=document.getElementById('noMeldBtn');
  if(!btn) return;
  btn.textContent=noMeldEnabled?'🚫 鳴き無し ON':'🚫 鳴き無し';
  btn.style.borderColor=noMeldEnabled?'#55cc55':'#1a3a1a';
  btn.style.color=noMeldEnabled?'#55ff55':'#4a7a4a';
  btn.style.boxShadow=noMeldEnabled?'0 0 8px #55cc5566':'';
  updateAutoMenuLabel();
}

// 自動ツモ切り: リーチ中はドロー牌を切る、それ以外は最後の牌を切る
function humanAutoDiscard(){
  const myIdx=NET.myIdx;
  const p=G.players[myIdx];
  if(!p) return;

  // 離席中: 全てのフェーズで即決（止まらない）
  if(playerAFK){
    if(G.phase==='pending_ron'){ humanRon(); return; }
    if(G.phase==='pending_pon'){ humanSkipPon(); return; } // ポンはスキップ
    if(G.phase==='discard'&&G.current===myIdx){
      const hasKita=!p.riichi&&p.hand.some(t=>t.suit==='honor'&&t.num==='北');
      // 離席中は北抜きもスキップ（鳴きなし）
    // if(hasKita){ humanKita(); ... } → 北抜きしない
      if(canWin(p.hand)){ humanTsumo(); return; }
      selIdx=p.hand.length-1; humanDiscard(); return;
    }
    return;
  }

  // ロン選択肢: 自動上がりON→ロン、OFF→止まる
  if(G.phase==='pending_ron'){
    if(autoWinEnabled) humanRon();
    return;
  }
  // ポン選択肢: 鳴き無しONならスキップ、OFFなら止まる（pending_ponはG.currentが捨て手なので条件不要）
  if(G.phase==='pending_pon'){ if(noMeldEnabled) humanSkipPon(); return; }

  if(G.phase!=='discard'||G.current!==myIdx) return;

  // ツモ上がり: 自動上がりON→ツモ
  if(autoWinEnabled && canWin(p.hand)){
    const pinzuNoTsumo=G_ABILITY_MODE&&PROFILE.ability==='pinzu'&&p.isDealer;
    if(!pinzuNoTsumo){ humanTsumo(); return; }
  }

  // 北抜き可能: 鳴き無しON→止まらない / 自動北抜きON→先に抜く / OFF→止まる
  const hasKita=!p.riichi && p.hand.some(t=>t.suit==='honor'&&t.num==='北');
  if(hasKita && !noMeldEnabled){
    if(autoKitaEnabled){
      humanKita();
      setTimeout(()=>{ if(G.current===myIdx&&G.phase==='discard') humanAutoDiscard(); }, 400);
    }
    return; // autoKitaOFFでも止まる
  }

  // カン可能（加槓・暗槓）→鳴き無しONなら止まらない
  const hasKakan=p.hand.some((kt)=>p.melds.some(m=>m.type==='pon'&&teq(m.tiles[0],kt)));
  const hasAnkan=canAnkan(myIdx).length>0;
  if((hasKakan||hasAnkan) && !noMeldEnabled) return;

  // 通常ツモ切り
  selIdx = p.hand.length-1;
  humanDiscard();
}

function _timerRender(){
  const eb=document.getElementById('handTimerBase');
  const en=document.getElementById('handTimerBonus');
  if(!eb||!en) return;
  const myIdx=NET.myIdx;
  const isMyTurn=(G.current===myIdx)&&(G.phase==='draw_wait'||G.phase==='discard')||(G.phase==='pending_ron'&&G.players&&G.players[myIdx])||(G.phase==='pending_pon'&&G.current===myIdx);
  const show=G_TIME_MODE&&isMyTurn&&G.phase!=='win'&&G.phase!=='end';
  if(!show){ eb.textContent=''; en.textContent=''; return; }
  // ベース残り秒（0〜20）、ボーナス残り（0〜5）
  const baseSec  = Math.min(_timerMaxBase, _timerSec);    // ターン開始ベース以下
  const bonusSec = Math.max(0, _timerSec - _timerMaxBase); // 0〜5
  const baseUrgent = baseSec <= 5 && bonusSec === 0;
  eb.textContent = baseSec;
  eb.style.color = baseUrgent ? '#ff4444' : _timerSec <= _timerBase ? '#ff9933' : '#4a6a5a';
  eb.classList.toggle('timer-urgent', baseUrgent);
  en.textContent = bonusSec;
  en.style.color = bonusSec > 0 ? '#44cc88' : '#1a3a2a';
}

// ターン変わり目でタイマーを起動
function timerOnMyTurn(){
  if(!G_TIME_MODE) return;
  // ベース秒は負債で減少するが最低0、ボーナス5秒は毎ターン必ず付与
  const baseSec = Math.max(0, _timerBase - _timerDebt);
  _timerMaxBase = baseSec;
  const sec = Math.max(1, baseSec + _timerBonus);
  timerStart(sec);
}

function autoPickWall(){
  if(G.phase!=='draw_wait'||G.current!==NET.myIdx)return;
  const available=G.deckSlots.map((t,i)=>t?i:-1).filter(i=>i>=0);
  if(available.length===0)return;
  const slotIdx=available[Math.floor(Math.random()*available.length)];
  humanPickWall(slotIdx);
}
function humanHakuAuto(){
  // 白能力: 最も孤立した（=捨てたい）手牌を即座に白に変換
  const myIdx=NET.myIdx;
  const p=G.players[myIdx];
  if(!G_ABILITY_MODE||PROFILE.ability!=='haku'||p.abilityUsed)return;
  if(!p||p.riichi||G.phase!=='discard')return;
  // cpuWorstTileIdxと同じロジックで孤立牌���自動選択
  const idx=cpuWorstTileIdx(p);
  if(idx<0)return;
  const t=p.hand[idx];
  if(t._isHaku)return;
  t._hakuOriginal={suit:t.suit,num:t.num};
  t.suit='honor';t.num='白';t._isHaku=true;
  p.hakuTileId=t._id;
  p.abilityUsed=true;
  G.hakuSelectMode=false;
  SFX.haku();
  addLog(`🀆 白！${emj({suit:t._hakuOriginal.suit,num:t._hakuOriginal.num})} → 🀆 白に変換`,'log-dora');
  updateTenpai(p);broadcastState();renderAll();
}

function _updateAutoDrawBtn(){
  const btn=document.getElementById('autoDrawBtn');
  if(!btn) return;
  btn.textContent=autoDrawEnabled?'🎲 自動ツモ ON':'🎲 自動ツモ';
  btn.style.borderColor=autoDrawEnabled?'#44ff88':'';
  btn.style.color=autoDrawEnabled?'#44ff88':'';
  btn.style.boxShadow=autoDrawEnabled?'0 0 8px #44ff8866':'';
}
function _updateAutoDiscardBtn(){
  const btn=document.getElementById('autoDiscardBtn');
  if(!btn) return;
  btn.textContent=autoDiscardEnabled?'✂️ 自動切り ON':'✂️ 自動切り';
  btn.style.borderColor=autoDiscardEnabled?'#ff9933':'';
  btn.style.color=autoDiscardEnabled?'#ff9933':'';
  btn.style.boxShadow=autoDiscardEnabled?'0 0 8px #ff993366':'';
}
function _updateAutoKitaBtn(){
  const btn=document.getElementById('autoKitaBtn');
  if(!btn) return;
  btn.textContent=autoKitaEnabled?'🀃 自動北抜き ON':'🀃 自動北抜き';
  btn.style.borderColor=autoKitaEnabled?'#55aaff':'';
  btn.style.color=autoKitaEnabled?'#55aaff':'';
  btn.style.boxShadow=autoKitaEnabled?'0 0 8px #55aaff66':'';
}
function _updateAutoWinBtn(){
  const btn=document.getElementById('autoWinBtn');
  if(!btn) return;
  btn.textContent=autoWinEnabled?'🀄 自動上がり ON':'🀄 自動上がり';
  btn.style.borderColor=autoWinEnabled?'#ffdd55':'';
  btn.style.color=autoWinEnabled?'#ffdd55':'';
  btn.style.boxShadow=autoWinEnabled?'0 0 8px #ffdd5566':'';
}
function toggleAutoKita(){
  autoKitaEnabled=!autoKitaEnabled;
  _updateAutoKitaBtn();
  updateAutoMenuLabel();
  if(autoKitaEnabled && G.phase==='discard' && G.current===NET.myIdx){
    const p=G.players[NET.myIdx];
    if(p&&p.hand.some(t=>t.suit==='honor'&&t.num==='北')) setTimeout(humanKita,120);
  }
}
function toggleAutoWin(){
  autoWinEnabled=!autoWinEnabled;
  _updateAutoWinBtn();
  updateAutoMenuLabel();
}
function toggleAutoDraw(){
  autoDrawEnabled=!autoDrawEnabled;
  _updateAutoDrawBtn();
  updateAutoMenuLabel();
  if(autoDrawEnabled && G.phase==='draw_wait' && G.current===NET.myIdx){
    setTimeout(autoPickWall, 120);
  }
}
function toggleAutoDiscard(){
  autoDiscardEnabled=!autoDiscardEnabled;
  _updateAutoDiscardBtn();
  updateAutoMenuLabel();
  if(autoDiscardEnabled && G.phase==='discard' && G.current===NET.myIdx){
    setTimeout(()=>{ if(G.current===NET.myIdx&&G.phase==='discard') humanAutoDiscard(); }, 120);
  }
}

function humanPickWall(slotIdx){
  if(G.phase!=='draw_wait'||G.current!==NET.myIdx)return;
  SFX.draw();
  if(G.deckSlots[slotIdx]===null)return;
  if(NET.online&&!amIHost()){
    netSend({type:'wallPick',pidx:NET.myIdx,slotIdx});
    return;
  }
  const myIdx=NET.myIdx;
  const tile=G.deckSlots[slotIdx];
  if(!tile)return;
  G.deckSlots[slotIdx]=null;
  const di=G.deck.findIndex(d=>d.suit===tile.suit&&d.num===tile.num);
  if(di>=0)G.deck.splice(di,1);
  const p=G.players[myIdx];
  p.hand.push(tile);p.drawnTile=tile;

  // 💣 Mine check
  if(G.mineSlots&&G.mineSlots.includes(slotIdx)){
    G.mineSlots=G.mineSlots.filter(s=>s!==slotIdx);
    if(G.mineOwners) delete G.mineOwners[slotIdx];
    const mineTile=p.hand.splice(p.hand.length-1,1)[0];
    p.discards.push(mineTile);p.drawnTile=null;
    updateTenpai(p);
    SFX.mineExplode();
    addLog(`💥 ${p.name} が地雷を踏んだ！[${emj(mineTile)}] を強制捨て`,'log-win');
    renderAll();broadcastState();
    setTimeout(()=>{
      if(!checkPon(myIdx,mineTile)) nextTurn((myIdx+1)%numPlayers);
      broadcastState();
    },900);
    return;
  }

  G.phase='discard';
  // タイマーはdraw_wait開始時に起動済み → ここでは継��（restartしない）
  if(!p.isDealer&&G.firstRound&&canWin(p.hand))p.isChiihou=true;
  if(canWin(p.hand)){addLog(`${emj(tile)} ツモ！上がれます`,'log-tsumo');renderAll();broadcastState();return;}
  const drawnIsKita=tile.suit==='honor'&&tile.num==='北';
  if(p.riichi&&!drawnIsKita){
    addLog(`${emj(tile)} ツモ切り（リーチ中）`,'log-riichi');
    renderAll();broadcastState();
    setTimeout(()=>{if(G.current===myIdx&&G.phase==='discard'&&G.players[myIdx].riichi){discardAction(myIdx,G.players[myIdx].hand.length-1);broadcastState();}},550);
    return;
  }
  updateTenpai(p);
  if(drawnIsKita&&p.riichi)addLog(`${emj(tile)} 北をツモ！（リーチ中）`,'log-dora');
  else if(p.tenpai)addLog(`${emj(tile)} ツモ。テンパイ中。`,'log-new');
  else addLog(`${emj(tile)} ツモ`,'log-new');
  renderAll();broadcastState();
  // 自動発火: 上がれる・北がある・autoDiscardON の時のみ
  if(G.current===myIdx && G.phase==='discard'){
    const pp=G.players[myIdx];
    const shouldAuto = (autoWinEnabled && canWin(pp.hand))
      || (autoKitaEnabled && !pp.riichi && pp.hand.some(t=>t.suit==='honor'&&t.num==='北'))
      || autoDiscardEnabled;
    if(shouldAuto) setTimeout(()=>{ if(G.current===myIdx&&G.phase==='discard') humanAutoDiscard(); }, 350);
  }
}

function handleExhausted(){
  G.phase='end';
  addLog('山牌が尽きました。流局です。','log-draw');
  const tp=G.players.filter(p=>p.tenpai);
  const np=G.players.filter(p=>!p.tenpai);
  const POT=3000;
  if(tp.length>0&&tp.length<numPlayers){
    const ea=Math.floor(POT/tp.length/100)*100;
    tp.forEach(p=>p.score+=ea);
    np.forEach(p=>p.score-=Math.floor(POT/np.length/100)*100);
    addLog(`テンパイ: ${tp.map(p=>p.name).join(', ')}`,'log-new');
  }
  G.honba++;saveScores();renderAll();broadcastState();
  setTimeout(()=>advanceRound(false),2800);
}

function handleWin(widx,winTile,isTsumo,losidx){
  G.phase='win';
  // 役満チェックは後でするのでとりあえず上がり音、役満は showWinModal で再生
  setTimeout(()=>{
    const isYM = G.players[widx] && G.players[widx].hand &&
      evalYaku([...G.players[widx].hand,winTile].slice(-5),winTile,isTsumo,G.players[widx],G.roundWind).some(y=>y.han>=13);
    if(isYM) SFX.yakuman(); else if(isTsumo) SFX.tsumo(); else SFX.ron();
  }, 50);
  const w=G.players[widx];
  const displayHand=[...w.hand];
  if(!isTsumo&&!displayHand.some(t=>teq(t,winTile)))displayHand.push(winTile);

  const yakus=evalYaku(displayHand,winTile,isTsumo,w,G.roundWind);
  const isYakumanPlus=yakus.some(y=>y.han>=13);
  if(!isYakumanPlus){
    const dc=countDoras(displayHand,w);
    if(dc>0){
      if(w.riichi){
        const ud=G.uraInds.map(doraFromIndicator);
        let uc=0;displayHand.forEach(t=>ud.forEach(d=>{if(teq(t,d))uc++;}));
        if(uc>0)yakus.push({name:`裏ドラ×${uc}`,han:uc});
      }
      yakus.push({name:`ドラ×${dc}`,han:dc});
    }
  }
  if(yakus.length===0){addLog('役なし。','log-new');G.phase='discard';renderAll();return;}

  const{score,han}=calcScore(yakus,w.isDealer,isTsumo);
  const rb=G.riichiPot;
  if(isTsumo){
    const ea=Math.round(score/(numPlayers-1));
    let totalPaid=0;
    G.players.forEach((p,i)=>{
      if(i===widx)return;
      const isSanctuary = G_ABILITY_MODE && p.ability==='sanctuary' && p.isDealer;
      if(!isSanctuary){p.score-=ea;totalPaid+=ea;}
    });
    w.score+=totalPaid+rb;
  }else{
    const loser=G.players[losidx];
    const isSanctuary = G_ABILITY_MODE && loser.ability==='sanctuary' && loser.isDealer;
    if(!isSanctuary){loser.score-=score;w.score+=score+rb;}
    else{w.score+=rb;addLog(`🏛️ 聖域！${loser.name}の支払いが免除された`,'log-dora');}
  }
  G.riichiPot=0;
  G._dealerWon=w.isDealer;
  addLog(`${w.name} の${isTsumo?'ツモ':'ロン'}上がり！ ${score}点`,'log-win');
  saveScores();
  const _wmd={winnerId:w.id,hand:displayHand,winTile,isTsumo,losidx,yakus,score,han};
  showWinModal(w,displayHand,winTile,isTsumo,losidx,yakus,score,han);renderAll();
  broadcastState({winModal:_wmd});
}

function handleRon(widx,tile,fromidx){
  const winner=G.players[widx];
  winner.hand.push(tile);
  // オープンリーチへの振り込みは役満（リーチしていない人が振り込んだ場合）
  const loser=G.players[fromidx];
  if(winner.openRiichi && !loser.riichi){
    winner._openRiichiRon=true; // evalYakuで参照
  }
  handleWin(widx,tile,false,fromidx);
  winner._openRiichiRon=false;
}

// ============================================================
// CPU AI
// ============================================================
function cpuAction(){
  if(NET.online&&!amIHost())return; // guests never run cpu
  const idx=G.current;const p=G.players[idx];
  if(['end','win','idle'].includes(G.phase))return;
  if(G.phase==='draw'){
    G._mineHit=null;
    // スチール: 山から引く前にチェック（引く代わりに捨て牌から盗む）
    if(p.ability==='steal'&&!p.abilityUsed&&!p.tenpai&&Math.random()<0.3){
      const targets=[];
      G.players.forEach((op,oi)=>{if(oi!==idx&&op.discards.length>0)targets.push({oi,di:op.discards.length-1});});
      if(targets.length>0){
        const t=targets[Math.floor(Math.random()*targets.length)];
        _doSteal(idx,t.oi,t.di);
        return;
      }
    }
    const tile=drawTile(idx);if(!tile){handleExhausted();return;}
    // 💣 CPU mine hit?
    if(G._mineHit){
      G._mineHit=null;
      G.phase='discard';
      p.discards.push(tile);updateTenpai(p);
      renderAll();broadcastState();
      setTimeout(()=>{if(!checkPon(idx,tile))nextTurn((idx+1)%numPlayers);broadcastState();},900);
      return;
    }
    G.phase='discard';
    if(canWin(p.hand)){setTimeout(()=>handleWin(idx,tile,true,-1),400);return;}
    const isKita=tile.suit==='honor'&&tile.num==='北';
    if(isKita&&!p.riichi){cpuPullKita(idx);return;}
    // 暗槓チェック
    const cpuAnkans=canAnkan(idx);
    if(cpuAnkans.length>0){
      // リーチ中は必ず暗槓、それ以外は50%
      if(p.riichi||Math.random()<0.5){
        setTimeout(()=>{handleAnkan(idx,cpuAnkans[0].key);broadcastState();},600);return;
      }
    }
    if(p.riichi){setTimeout(()=>discardAction(idx,p.hand.length-1),600);return;}
    if(!p.riichi&&p.tenpai&&p.melds.length===0){cpuDeclareRiichi(idx);return;}
    // CPU能力発動（discardフェーズ前）
    if(cpuTryAbility(idx)) return;
    setTimeout(cpuDiscard,550);
  }else if(G.phase==='discard'){
    if(p.riichi){setTimeout(()=>discardAction(idx,p.hand.length-1),600);return;}
    // CPU能力発動（discardフェーズ）
    if(cpuTryAbility(idx)) return;
    setTimeout(cpuDiscard,550);
  }
}

// CPU能力発動: 発動したらtrue
function cpuTryAbility(idx){
  const p=G.players[idx];
  if(!p.ability||p.abilityUsed) return false;
  const ab=p.ability;

  // 💣 地雷: startRoundで一括設置するのでここではスキップ
  // (cpuPlantMines()がstartRound後に呼ばれる)

  // 🃏 スチール: cpuActionのdrawフェーズ前に移動済み（drawTileの前にチェック）

  // 🌑 闇: リーチ後の捨て牌を30%で闇に（discardActionの後から難しいので、捨て時に適用）
  // → cpuDiscard側で処理するためここではスキップ

  // 🀆 白: 手牌に使えない牌があれば30%で白に変換
  if(ab==='haku' && G.phase==='discard' && !p.riichi && !p.abilityUsed && Math.random()<0.3){
    // 最も価値の低い牌を白に（自分の手牌のみ）
    const idx2=cpuWorstTileIdx(p);
    if(idx2>=0 && !p.hand[idx2]._isHaku){
      const t=p.hand[idx2];
      t._isHaku=true;t._hakuOriginal={suit:t.suit,num:t.num};
      t.suit='honor';t.num='白';
      p.hakuTileId=t._id; // リセット用に保存
      p.abilityUsed=true;
      addLog(`🀆 ${p.name}が白を使った！`,'log-dora');
      updateTenpai(p);renderAll();broadcastState();
    }
  }

  return false;
}

function cpuWorstTileIdx(p){
  // 最も孤立した牌のインデックスを返す
  let worst=-1,worstScore=Infinity;
  for(let i=0;i<p.hand.length;i++){
    const test=[...p.hand.slice(0,i),...p.hand.slice(i+1)];
    const waits=getWaits(test);
    if(waits.length<worstScore){worstScore=waits.length;worst=i;}
  }
  return worst;
}

function cpuPullKita(pidx){
  const p=G.players[pidx];
  const ki=p.hand.findIndex(t=>t.suit==='honor'&&t.num==='北');
  if(ki<0)return;
  const kt=p.hand.splice(ki,1)[0];p.kitaTiles.push(kt);p.kitaCount++;
  SFX.kita();
  addLog(`${p.name} が北を抜いた！（ドラ+1）`,'log-dora');
  const rep=drawRinshanTile(pidx);if(!rep){handleExhausted();return;}
  // 北抜きはカンドラを開かない
  G.phase='discard';updateTenpai(p);renderAll();broadcastState();
  if(p.riichi){setTimeout(()=>{discardAction(pidx,p.hand.length-1);broadcastState();},600);}
  else if(canWin(p.hand)){setTimeout(()=>{p.isRinshanKaihou=true;handleWin(pidx,rep,true,-1);broadcastState();},400);}
  else{setTimeout(cpuDiscard,550);}
}

function cpuDecideRon(pidx,tile){return true;}
function cpuDecidePon(pidx,tile){
  const p=G.players[pidx];const k=tk(tile);
  const yh=['honor_白','honor_発','honor_中',`honor_${p.wind}`,`honor_${G.roundWind}`];
  if(yh.includes(k))return true;
  return Math.random()<0.25;
}

function cpuDeclareRiichi(pidx){
  const p=G.players[pidx];
  // テンパイ時3回に1回オープンリーチ（ダブルリーチ条件時はダブル優先）
  let mode;
  if(canDoubleRiichi()) mode=Math.random()<0.333?'double-open':'double';
  else mode=Math.random()<0.333?'open':'riichi';
  G.pendingRiichi=mode;
  G.riichiValidIdx=getRiichiDiscards(p.hand);
  commitRiichi(p);
  setTimeout(cpuDiscard,550);
}

function cpuDiscard(){
  const idx=G.current;const p=G.players[idx];
  if(p.riichi){discardAction(idx,p.hand.length-1);return;}

  // オープンリーチ中のプレイヤーの待ち牌を収集（役満警戒）
  const dangerTiles=new Set();
  for(let i=0;i<numPlayers;i++){
    if(i===idx)continue;
    const op=G.players[i];
    if(op.riichi&&op.openRiichi&&op.waits){
      op.waits.forEach(w=>dangerTiles.add(tk(w)));
    }
  }

  // スコアリング: 待ち枚数 - 役満危険牌ペナルティ
  // ピンズー教CPU: 筒子以外を優先捨て（清一色狙い）
  const isPinzuCpu = p.ability==='pinzu';
  // 🌑 闇能力: 30%で次の捨て牌を闇に
  if(p.ability==='yami' && !p.abilityUsed && !p.riichi && Math.random()<0.3){
    p.abilityUsed=true;
    // 捨てる牌を闇にするフラグ
    p._cpuNextYami=true;
    addLog(`🌑 ${p.name}が闇を使う...`,'log-dora');
  }
  let best=0,bScore=-Infinity;
  for(let i=0;i<p.hand.length;i++){
    const t=p.hand[i];
    const w=getWaits(p.hand.filter((_,j)=>j!==i)).length;
    // 役満危険牌は強く避ける（-100点ペナルティ）
    const isDanger = dangerTiles.has(tk(t));
    const isNonPinzu = isPinzuCpu && t.suit!=='pin';
    // 地雷CPU: 地雷スロットの牌と同種牌を避ける（地雷が自分の手番に来そうなら）
    const isMineOwner = p.ability==='mine' && G.mineSlots&&G.mineSlots.length>0;
    const mineSlotTile = isMineOwner ? G.deckSlots[G.mineSlots[0]] : null;
    const isMineRisk = mineSlotTile && teq(t, mineSlotTile); // 使わない（引かないで捨てる戦略なし、引く順序制御不可）
    const score = w - (isDanger ? 100 : 0) - (isNonPinzu ? 50 : 0);
    if(score>bScore){bScore=score;best=i;}
  }
  discardAction(idx,best);
}

// ============================================================
// HUMAN ACTIONS
// ============================================================
function humanSelect(idx){
  if(G.current!==NET.myIdx||G.phase!=='discard')return;
  const p=G.players[NET.myIdx];
  if(p.riichi)return;
  // 白モード: クリックした牌を白に変換してモード終了
  if(G.hakuSelectMode){
    const t=p.hand[idx];
    if(!t._isHaku){
      // オンライン対戦でゲストの場合はホストへ通知してホスト側で変換する
      if(NET.online&&!amIHost()){
        G.hakuSelectMode=false;
        netSend({type:'haku',pidx:NET.myIdx,tidx:idx});
        renderAll();
        return;
      }
      t._hakuOriginal={suit:t.suit,num:t.num};
      t.suit='honor';t.num='白';t._isHaku=true;
      p.hakuTileId=t._id;
      p.abilityUsed=true;
      G.hakuSelectMode=false;
      SFX.haku();
      addLog(`🀆 白！手牌の1枚を白に変換した`,'log-dora');
      updateTenpai(p);broadcastState();renderAll();
    }
    return;
  }
  // 闇モード: クリックした牌を闇指定してモード終了
  if(G.yamiSelectMode){
    p.yamiTileIdx=idx;
    G.yamiSelectMode=false;
    SFX.yami();
    renderAll();return;
  }
  if(G.pendingRiichi&&G.riichiValidIdx&&!G.riichiValidIdx.includes(idx))return;
  selIdx=idx; renderAll();
}

function humanDiscard(){
  const myTurn = NET.online ? G.current===NET.myIdx : G.current===0;
  if(!myTurn||G.phase!=='discard')return;
  const p=G.players[NET.myIdx];
  let idx=selIdx;
  if(p.riichi)idx=p.hand.length-1;
  if(G.pendingRiichi){
    if(idx<0||!G.riichiValidIdx||!G.riichiValidIdx.includes(idx)){addLog('テンパイを保つ牌を選んでください','log-new');return;}
    if(!NET.online)commitRiichi(p);
  }
  if(idx<0||idx>=p.hand.length){addLog('捨てる牌を選んでください','log-new');return;}
  // 闇捨て: 闇指定牌を捨てる場合はフラグを立てる
  const isYamiDiscard = (p.yamiTileIdx>=0 && p.yamiTileIdx===idx);
  if(isYamiDiscard) p.abilityUsed=true;
  selIdx=-1;
  if(NET.online&&!amIHost()){
    if(G.pendingRiichi){netSend({type:'riichi',pidx:NET.myIdx,mode:G.pendingRiichi,tidx:idx});}
    else{netSend({type:'discard',pidx:NET.myIdx,tidx:idx,isYami:isYamiDiscard});}
    return;
  }
  if(G.pendingRiichi) commitRiichi(p);
  discardAction(NET.online?NET.myIdx:0,idx,isYamiDiscard);
}

function humanTsumo(){
  const myIdx=NET.myIdx;
  if(G.current!==myIdx||G.phase!=='discard')return;
  if(!canWin(G.players[myIdx].hand))return;
  // ピンズー教: 親番はツモ上がり不可
  if(G_ABILITY_MODE && PROFILE.ability==='pinzu' && G.players[myIdx].isDealer){
    addLog('🔵 ピンズー教：親番はツモ上がり不可','log-new');return;
  }
  if(NET.online&&!amIHost()){netSend({type:'tsumo',pidx:myIdx});return;}
  handleWin(myIdx,G.players[myIdx].drawnTile,true,-1);
}

function humanRon(){
  if(!pendingAction||pendingAction.type!=='ron')return;
  const{tile,from}=pendingAction;
  if(NET.online&&!amIHost()){netSend({type:'ron',pidx:NET.myIdx,tile,from});pendingAction=null;return;}
  pendingAction=null;
  handleRon(NET.myIdx,tile,from);
}

function humanSkipRon(){
  if(!pendingAction)return;
  const f=pendingAction.from;
  if(NET.online&&!amIHost()){netSend({type:'skipRon',from:f});pendingAction=null;return;}
  pendingAction=null;
  nextTurn((f+1)%numPlayers);
}

function humanPon(){
  if(!pendingAction||pendingAction.type!=='pon')return;
  const{tile,from}=pendingAction;
  if(NET.online&&!amIHost()){netSend({type:'pon',pidx:NET.myIdx,tile,from});pendingAction=null;return;}
  pendingAction=null;
  handlePon(NET.myIdx,tile,from);
}


function humanMinkan(){
  if(G.phase!=='pending_pon') return;
  const myIdx=NET.myIdx;
  const p=G.players[myIdx];
  const tile=pendingAction?.tile;
  if(!tile) return;
  const cnt=cntMap(p.hand);
  if((cnt[tk(tile)]||0)<3) return;
  if(NET.online&&!amIHost()){netSend({type:'minkan',pidx:myIdx,tile});return;}
  handleMinkan(myIdx,tile,pendingAction.from);
  broadcastState();
}
function handleMinkan(pidx,tile,fromPidx){
  const p=G.players[pidx];
  let rm=0;p.hand=p.hand.filter(t=>{if(rm<3&&teq(t,tile)){rm++;return false;}return true;});
  p.melds.push({type:'minkan',tiles:[tile,tile,tile,tile],from:fromPidx});
  p.kanCount=(p.kanCount||0)+1;
  addLog(`${p.name} が明槓！ ${emj(tile)}`,'log-dora');
  const rep=drawRinshanTile(pidx);if(!rep){handleExhausted();return;}
  revealKanDora();
  p.hand=sortTiles(p.hand);updateTenpai(p);
  G.phase='discard';G.current=pidx;
  if(canWin(p.hand)){
    p.isRinshanKaihou=true;
    if(pidx===NET.myIdx||(NET.online&&amIHost()&&pidx!==NET.myIdx)){
      setTimeout(()=>handleWin(pidx,rep,true,-1),400);return;
    }
  }
  renderAll();broadcastState();
  if(NET.online&&amIHost()&&pidx!==NET.myIdx) setTimeout(()=>cpuTurn(pidx),800);
}
function humanSkipPon(){
  if(!pendingAction)return;
  const f=pendingAction.from;
  if(NET.online&&!amIHost()){netSend({type:'skipPon',from:f});pendingAction=null;return;}
  pendingAction=null;
  nextTurn((f+1)%numPlayers);
}

function humanKita(){
  if(G.current!==NET.myIdx||G.phase!=='discard')return;
  if(NET.online&&!amIHost()){netSend({type:'kita',pidx:NET.myIdx});return;}
  const myIdx=NET.myIdx;
  const p=G.players[myIdx];
  const ki=p.hand.findIndex(t=>t.suit==='honor'&&t.num==='北');
  if(ki<0)return;
  const kt=p.hand.splice(ki,1)[0];p.kitaTiles.push(kt);p.kitaCount++;
  addLog(`北を抜いた！（ドラ+1）`,'log-dora');
  // 北抜き槍槓チェック: 他プレイヤーが北でロンできるか
  const kitaTile=kt;
  for(let i=0;i<numPlayers;i++){
    if(i===myIdx)continue;
    const op=G.players[i];
    if((op.hand.length===4||op.hand.length===1)&&op.tenpai&&op.waits.some(w=>teq(w,kitaTile))){
      op.isChankan=true; // 槍槓として扱う
      // オンライン: 自分自身か、ホストが管理しているゲストか判定
      const isMe = (i===NET.myIdx);
      if(isMe || isOnlineGuestIdx(i)){
        pendingAction={type:'ron',tile:kitaTile,from:myIdx,target:i};
        G.phase='pending_ron';renderAll();broadcastState();
        if(isMe){ setTimeout(()=>{ if(G.phase==='pending_ron'&&autoWinEnabled) humanRon(); },250); }
        return;
      } else if(cpuDecideRon(i,kitaTile)){handleRon(i,kitaTile,myIdx);return;}
    }
  }
  const rep=drawRinshanTile(myIdx);if(!rep){handleExhausted();return;}
  // 北抜きはカンドラを開かない
  updateTenpai(p);selIdx=-1;
  if(canWin(p.hand)){addLog(`${emj(rep)} 嶺上開花！`,'log-tsumo');p.isRinshanKaihou=true;renderAll();broadcastState();return;}
  if(p.riichi){
    const repIsKita=rep.suit==='honor'&&rep.num==='北';
    addLog(`${emj(rep)} ツモ切り（リーチ中）`,'log-riichi');
    renderAll();broadcastState();
    if(!repIsKita){
      setTimeout(()=>{if(G.current===myIdx&&G.phase==='discard'&&p.riichi){discardAction(myIdx,p.hand.length-1);broadcastState();}},550);
    }
  }else{
    if(p.tenpai)addLog(`${emj(rep)} ツモ。テンパイ中。`,'log-new');
    else addLog(`${emj(rep)} ツモ`,'log-new');
    renderAll();broadcastState();
  }
}


// ダブルリーチ判定: 誰も鳴いておらず北抜きもない1巡目
function canDoubleRiichi(){
  if(!G.firstRound) return false;
  return G.players.every(p=>p.melds.length===0 && p.kitaCount===0);
}
function humanDeclareRiichi(mode){
  const myIdx=NET.myIdx;
  if(G.current!==myIdx||G.phase!=='discard')return;
  const p=G.players[myIdx];
  if(p.riichi||p.melds.length>0)return;
  const vd=getRiichiDiscards(p.hand);
  if(vd.length===0)return;
  let finalMode=mode;
  const isDbl=canDoubleRiichi();
  if(mode==='riichi'&&isDbl) finalMode='double';
  else if(mode==='open'&&isDbl) finalMode='double-open';
  G.pendingRiichi=finalMode;G.riichiValidIdx=vd;
  const label=finalMode==='double-open'?'ダブルオープンリーチ':finalMode==='double'?'ダブルリーチ':finalMode==='open'?'オープンリーチ':'リーチ';
  addLog(`${label}宣言！捨て牌を選んでください。`,'log-riichi');
  renderAll();
}

function humanCancelRiichi(){
  G.pendingRiichi=null;G.riichiValidIdx=null;renderAll();
  broadcastState();
}

function commitRiichi(p){
  p.riichiDiscardIdx=p.discards.length;
  p.riichi=true;p.ippatsu=true;p.score-=10;G.riichiPot+=10;
  const mode=G.pendingRiichi;
  if(mode==='double'||mode==='double-open') SFX.doubleRiichi(); else SFX.riichi();
  if(mode==='open')p.openRiichi=true;
  else if(mode==='double')p.doubleRiichi=true;
  else if(mode==='double-open'){p.doubleRiichi=true;p.openRiichi=true;}
  const modeLabel=mode==='double-open'?'ダブルオープン':mode==='open'?'オープン':mode==='double'?'ダブル':'';
  addLog(`${p.name} が${modeLabel}リーチ！`,'log-riichi');
  G.pendingRiichi=null;G.riichiValidIdx=null;
}

// ============================================================
// ROUND MANAGEMENT
// ============================================================
function saveScores(){G.savedScores=G.players.map(p=>p.score);}
// ── Win Modal Timer + Ready System ───────────────────────────
const WIN_READY = {
  timer: null,
  countdown: 10,
  readySet: new Set(),
  selfReady: false,
  proceeded: false,
};

function _startWinTimer(){
  WIN_READY.countdown = 10;
  WIN_READY.readySet = new Set();
  WIN_READY.selfReady = false;
  WIN_READY.proceeded = false;
  const okBtn = document.getElementById('winOkBtn');
  if(okBtn){ okBtn.disabled=false; okBtn.textContent='OK →'; }
  const statusEl = document.getElementById('winReadyStatus');
  if(statusEl) statusEl.textContent = '';
  const timerEl = document.getElementById('winTimerDisplay');
  if(timerEl) timerEl.textContent = '10';
  if(WIN_READY.timer){ clearInterval(WIN_READY.timer); WIN_READY.timer=null; }
  WIN_READY.timer = setInterval(()=>{
    WIN_READY.countdown--;
    const el = document.getElementById('winTimerDisplay');
    if(el) el.textContent = WIN_READY.countdown > 0 ? WIN_READY.countdown : '';
    if(WIN_READY.countdown <= 0){
      clearInterval(WIN_READY.timer); WIN_READY.timer=null;
      if(!NET.online || amIHost()){
        nextRound();
      } else {
        onWinOk();
      }
    }
  }, 1000);
}

function onWinOk(){
  if(WIN_READY.selfReady || WIN_READY.proceeded) return;
  WIN_READY.selfReady = true;
  const okBtn = document.getElementById('winOkBtn');
  if(okBtn){ okBtn.disabled=true; okBtn.textContent='待機中…'; }
  if(NET.online && !amIHost()){
    netSend({type:'winReady'});
  } else if(NET.online && amIHost()){
    WIN_READY.readySet.add(NET.myIdx ?? 0);
    _checkAllWinReady();
  } else {
    nextRound();
  }
}

function _checkAllWinReady(){
  if(WIN_READY.proceeded) return;
  const total = numPlayers || 1;
  const statusEl = document.getElementById('winReadyStatus');
  if(statusEl) statusEl.textContent = `${WIN_READY.readySet.size}/${total}人 OK`;
  if(WIN_READY.readySet.size >= total){
    nextRound();
  }
}

function nextRound(){
  WIN_READY.proceeded = true;
  if(WIN_READY.timer){ clearInterval(WIN_READY.timer); WIN_READY.timer=null; }
  document.getElementById('winOverlay').classList.remove('show');
  if(checkEnd())return;
  advanceRound(G._dealerWon);G._dealerWon=false;
}
function advanceRound(dealerWon){
  if(!dealerWon){G.dealer=(G.dealer+1)%numPlayers;G.roundNum++;G.honba=0;}
  // numPlayers局で1周（3人なら3局、4人なら4局）
  if(G.roundNum>numPlayers){G.roundNum=1;G.roundWind=G.roundWind==='東'?'南':'東';}
  if(G.roundWind==='南'&&G.roundNum>numPlayers){showFinalResult();return;}
  startRound();
}
function checkEnd(){
  if(G.roundWind==='南'&&G.roundNum>=numPlayers){showFinalResult();return true;}
  return false;
}
function showFinalResult(){
  const sorted=[...G.players].sort((a,b)=>b.score-a.score);
  document.getElementById('resultTable').innerHTML=sorted.map((p,i)=>
    `<tr class="${i===0?'result-winner':''}"><td>${i+1}位 ${p.name}</td><td>${p.wind}</td><td>${p.score.toLocaleString()}点</td></tr>`
  ).join('');
  // コイン付与: 自分の順位を判定
  const myPlayer=G.players[NET.myIdx];
  const myRank=sorted.findIndex(p=>p===myPlayer);
  const earned=myRank===0?20:10;
  PROFILE.coins=(PROFILE.coins||0)+earned;
  saveProfileSilent();
  const rewardEl=document.getElementById('resultCoinReward');
  if(rewardEl) rewardEl.innerHTML=`🪙 +${earned} 手にビコイン獲得！（合計 ${PROFILE.coins} 枚）<br><span style="font-size:.65rem;color:#5a7a6a;">${myRank===0?'1位ボーナス：+20枚':'参加報酬：+10枚'}</span>`;

  // ランクマッチの場合、ホストがスコアを提出してレートを更新
  const ratingBox=document.getElementById('resultRatingBox');
  if(ratingBox) ratingBox.style.display='none';
  if(NET.isRankMatch && NET.isHost && RANK.matchId){
    const scores=G.players.map(p=>p.score);
    fetch('/rank/result',{
      method:'POST',
      headers:{'Content-Type':'application/json'},
      body:JSON.stringify({matchId:RANK.matchId, scores}),
    }).then(r=>r.json()).then(d=>{
      if(d.ok && d.changes) _showRatingChanges(d.changes);
    }).catch(()=>{});
  }
  // ゲスト側: ランクマッチ結果をサーバーから取得
  if(NET.isRankMatch && !NET.isHost && RANK.matchId){
    setTimeout(_fetchRankResultForGuest, 3000);
  }

  document.getElementById('resultOverlay').classList.add('show');
  broadcastState({finalResult:sorted.map(p=>({name:p.name,wind:p.wind,score:p.score}))});
}

async function _fetchRankResultForGuest(){
  try{
    const r=await fetch('/rank/result-view?matchId='+encodeURIComponent(RANK.matchId));
    if(r.ok){const d=await r.json();if(d.changes) _showRatingChanges(d.changes);}
  }catch(e){}
}

function _showRatingChanges(changes){
  const box=document.getElementById('resultRatingBox');
  const tbl=document.getElementById('resultRatingTable');
  if(!box||!tbl) return;
  tbl.innerHTML=changes.map(c=>{
    const sign=c.change>=0?'+':'';
    const col=c.change>=0?'#5adb9a':'#ff7a7a';
    return `<div style="display:flex;justify-content:space-between;align-items:center;padding:3px 0;border-bottom:1px solid #1a3a2a;">
      <span style="color:#c5e8d5;">${c.name}</span>
      <span><strong style="color:#c5e8d5;">${c.before}</strong> → <strong style="color:${col};">${c.after}</strong>
      <span style="color:${col};font-size:.85em;">(${sign}${c.change})</span></span>
    </div>`;
  }).join('');
  box.style.display='';
}
function showFinalResultData(sorted){
  document.getElementById('resultTable').innerHTML=sorted.map((p,i)=>
    `<tr class="${i===0?'result-winner':''}"><td>${i+1}位 ${p.name}</td><td>${p.wind}</td><td>${p.score.toLocaleString()}点</td></tr>`
  ).join('');
  document.getElementById('resultOverlay').classList.add('show');
}
function setAbilityMode(on){
  G_ABILITY_MODE=on;
  document.getElementById('modeAbilityOn').classList.toggle('active',on);
  document.getElementById('modeAbilityOff').classList.toggle('active',!on);
}
function setTimeMode(v){
  G_TIME_MODE=v;
  document.getElementById('modeTimeOn').classList.toggle('active',v);
  document.getElementById('modeTimeOff').classList.toggle('active',!v);
  const desc=document.getElementById('timeModeDesc');
  if(desc) desc.style.display=v?'block':'none';
}
function confirmBackToTitle(){
  document.getElementById('titleConfirmOverlay').classList.add('show');
}
function backToLobby(){
  document.getElementById('resultOverlay').classList.remove('show');
  document.getElementById('winOverlay').classList.remove('show');
  document.getElementById('titleConfirmOverlay').classList.remove('show');
  document.getElementById('gameScreen').classList.remove('active');
  hideRoomLobby();
  document.getElementById('lobby').style.display='flex';
  bgmToTitle();
  // ホストが部屋を持っていた場合はサーバーから削除する
  if(NET.isHost && NET.roomCode) fetch('/room/'+NET.roomCode, {method:'DELETE'}).catch(()=>{});
  if(NET.peer){try{NET.peer.destroy();}catch(e){} NET.peer=null;NET.conn=null;NET.conns=[];NET.online=false;}
  NET.roomCode=null; NET.isHost=false; NET.isRankMatch=false;
  NET.guestNames=[]; NET.guestAbilities=[]; NET.guestIconIds=[]; NET.guestPeerIds=[]; NET._memberDataCache=[]; NET.peerRegistry=[]; NET._lastActionId=0; stopSyncBroadcast();
  RANK.matchId=null; RANK.connectedGuests=0;
  setOnlineStatus('');
  document.getElementById('roomCodeBox').style.display='none';
  document.getElementById('waitingDots').style.display='';
  showSolo();
  bgmToTitle();
}

// ============================================================
