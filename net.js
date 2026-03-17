// GAME STATE + ONLINE
// ============================================================
let G={};
let selIdx=-1;
let autoDrawEnabled=false;
let autoDiscardEnabled=false;
let autoKitaEnabled=false;
let autoWinEnabled=false;
let playerAFK=false;
let noMeldEnabled=false;
let numPlayers=3;
let pendingAction=null;

// ══════════════════════════════════════════════════════════════
// 座席／プレイヤー分離レイヤー
// G.seats[seatIdx] = { playerId: PeerID }   ← 座席（席順・ターン）
// G.players[seatIdx] = playerData           ← 後方互換で配列のまま保持
//   playerData.peerId で人物を同定
//   playerData.seatIdx で席を逆引き
//
// ヘルパー:
//   getMyPlayer()           自分の playerData
//   getMyPlayerSeatIdx()    自分の席インデックス
//   getSeatPlayer(si)       席インデックス → playerData
//   getPlayerBySeatId(pid)  PeerID → playerData（人格検索）
// ══════════════════════════════════════════════════════════════
function getMyPlayer(){
  if(!G.players) return null;
  const myId = NET.peer?.id;
  // peerId で検索（ホスト交代後も人格が変わらない）
  return G.players.find(p => p && p.peerId === myId) || G.players[NET.myIdx] || null;
}
function getMyPlayerSeatIdx(){
  if(!G.seats || !NET.peer?.id) return NET.myIdx;
  const idx = G.seats.findIndex(s => s.playerId === NET.peer.id);
  return idx >= 0 ? idx : NET.myIdx;
}
function getSeatPlayer(seatIdx){
  if(!G.seats || !G.players) return G.players?.[seatIdx] || null;
  const seat = G.seats[seatIdx];
  if(!seat) return null;
  // playerId（PeerID）で探す
  if(seat.playerId){
    const p = G.players.find(p => p && p.peerId === seat.playerId);
    if(p) return p;
  }
  return G.players[seatIdx] || null;
}
function getPlayerByPeerId(peerId){
  if(!G.players || !peerId) return null;
  return G.players.find(p => p && p.peerId === peerId) || null;
}
// 座席テーブルを G.players から再構築（startRound / ホスト昇格後に呼ぶ）
function rebuildSeats(){
  if(!G.players) return;
  G.seats = G.players.map(p => ({ playerId: p ? p.peerId || '' : '' }));
}
// G.players の seatIdx フィールドを同期
function syncSeatIndices(){
  if(!G.players) return;
  G.players.forEach((p, i) => { if(p) p.seatIdx = i; });
}

// Online state
let NET={
  peer:null,        // PeerJS instance
  conn:null,        // 後方互換（ゲスト→ホスト接続）
  conns:[],         // ホスト→全ゲスト接続リスト
  isHost:false,     // true if this player created the room
  myIdx:0,          // which player index am I (0=host,1=guest+)
  roomAbilityMode:true, // ルームマッチ能力あり/なし
  online:false,     // playing online?
  roomCode:null,
  isRankMatch:false, // ランクマッチ中か
  guestNames:[],    // ゲストのプロフィール名 [idx1の名前, idx2の名前, idx3の名前]
  guestAbilities:[], // ゲストの能力 [idx1の能力, idx2の能力, idx3の能力]
  guestIconIds:[],  // ゲストのアイコンID [idx1, idx2, idx3]
  guestPeerIds:[],  // ゲストのPeerID [idx1のPeerID, idx2のPeerID, idx3のPeerID]
  _memberDataCache:[], // ゲスト側: ホストから受け取ったメンバーデータのキャッシュ
  // ── P2P分散アーキテクチャ ──
  peerRegistry:[],  // [{peerId, playerIdx, conn}] 全接続ピアの一覧（全員が持つ）
  _syncTimer:null,  // 定期sync用タイマー
  _lastActionId:0,  // 最後に処理したactionId
};

// ── ピアレジストリ操作 ──────────────────────────────────────
function peerRegistryAdd(peerId, playerIdx, conn){
  if(NET.peerRegistry.some(p=>p.peerId===peerId)) return;
  NET.peerRegistry.push({peerId, playerIdx, conn});
}
function peerRegistryRemove(peerId){
  NET.peerRegistry = NET.peerRegistry.filter(p=>p.peerId!==peerId);
}

// ホストPeerID: 全ピア中で辞書順最小 = ホスト
function getHostPeerId(){
  const myId = NET.peer?.id;
  if(!myId) return null;
  const all = [myId, ...NET.peerRegistry.map(p=>p.peerId)].filter(Boolean);
  return all.sort()[0];
}

// 自分がホストかどうかを peerRegistry ベースで判定
function amIHost(){
  const myId = NET.peer?.id;
  if(!myId) return NET.isHost; // fallback
  return getHostPeerId() === myId;
}

// ── アクションID採番 ──────────────────────────────────────
function _nextActionId(){
  return ++NET._lastActionId;
}

// アクションメッセージに actionId を付けてブロードキャスト
function sendAction(action){
  action.actionId = _nextActionId();
  netBroadcastAll(action);
}

// 全接続ピアにブロードキャスト（ホスト/ゲスト問わず全員へ）
function netBroadcastAll(msg){
  // ホストとして接続しているゲストへ
  NET.conns.forEach(c=>{ if(c&&c.open) c.send(msg); });
  // ゲストとしてホストへ（ホストでない場合）
  if(!NET.isHost && NET.conn&&NET.conn.open) NET.conn.send(msg);
  // peerRegistry の接続へ（重複しないよう open 確認済みのみ）
  NET.peerRegistry.forEach(p=>{
    if(p.conn && p.conn.open &&
       !NET.conns.includes(p.conn) && p.conn !== NET.conn){
      p.conn.send(msg);
    }
  });
}

// ── 定期Sync（ホストのみ） ────────────────────────────────
let _pingTimers = {}; // {peerId: timeoutId}

function startSyncBroadcast(){
  if(NET._syncTimer) clearInterval(NET._syncTimer);
  NET._syncTimer = setInterval(()=>{
    if(!NET.online || !amIHost()) return;
    if(!G || !G.players) return;
    const s = _buildStateSnapshot();
    s._lastActionId = NET._lastActionId;
    netBroadcastAll({type:'sync', state:s});

    // ping keepalive: pongが5秒以内に返らなければ切断扱い
    NET.conns.forEach(c=>{
      if(!c||!c.open) return;
      const pid = c.peer;
      if(!pid) return;
      // 前のタイマーがまだ残っていればスキップ
      if(_pingTimers[pid]) return;
      try{ c.send({type:'ping'}); }catch(e){}
      _pingTimers[pid] = setTimeout(()=>{
        delete _pingTimers[pid];
        // pongが来なかった → 切断と判断
        if(c.open){
          try{ c.close(); }catch(e){}
        }
      }, 5000);
    });
  }, 2000);
}
function stopSyncBroadcast(){
  if(NET._syncTimer){ clearInterval(NET._syncTimer); NET._syncTimer=null; }
  Object.keys(_pingTimers).forEach(k=>{ clearTimeout(_pingTimers[k]); delete _pingTimers[k]; });
}

// ── ピア切断時のホスト再選出 ─────────────────────────────
function onPeerDisconnected(peerId){
  peerRegistryRemove(peerId);
  // ★ G.players の peerId で切断者を特定（guestPeerIds 配列ズレに依存しない）
  let disconnectedPlayerIdx = 0; // default: 元ホスト
  if(G && G.players){
    const byPeer = G.players.findIndex(p => p.peerId === peerId);
    if(byPeer >= 0){
      disconnectedPlayerIdx = byPeer;
    } else {
      // fallback: guestPeerIds から
      const guestSlot = NET.guestPeerIds.indexOf(peerId);
      if(guestSlot >= 0) disconnectedPlayerIdx = guestSlot + 1;
    }
  }

  const newHostId = getHostPeerId();
  const myId = NET.peer?.id;

  if(myId && newHostId === myId && !NET.isHost){
    _doPromoteToHost(disconnectedPlayerIdx);
  } else if(NET.isHost){
    if(G && G.players && G.players[disconnectedPlayerIdx]){
      G.players[disconnectedPlayerIdx].isDisconnected = true;
    }
  }
}

// ヘルパー: 指定インデックスがオンラインゲストかどうか（ホスト視点で使用）
function isOnlineGuestIdx(pidx){
  if(!NET.online || !amIHost()) return false;
  if(!G || !G.players || !G.players[pidx]) return false;
  // 切断済みはCPU扱い
  if(G.players[pidx].isDisconnected) return false;
  // ★ PeerIDベースで判定（インデックスズレに依存しない）
  const playerPeerId = G.players[pidx].peerId;
  if(playerPeerId){
    return NET.conns.some(c => c && c.open && c.peer === playerPeerId);
  }
  // fallback: 自分自身でなく conns に存在するか
  return NET.conns.some(c => c && c.open && c._playerIdx === pidx);
}

// ── Lobby mode toggles ───────────────────────────────────────
function showSolo(){
  document.getElementById('lobbySolo').style.display='';
  document.getElementById('lobbyOnline').style.display='none';
  document.getElementById('lobbyRank').style.display='none';
  cancelRankQueue();
  document.querySelectorAll('#lobbyMode .pcnt-btn').forEach((b,i)=>b.classList.toggle('active',i===0));
}
function showOnline(){
  document.getElementById('lobbySolo').style.display='none';
  document.getElementById('lobbyOnline').style.display='';
  document.getElementById('lobbyRank').style.display='none';
  cancelRankQueue();
  document.querySelectorAll('#lobbyMode .pcnt-btn').forEach((b,i)=>b.classList.toggle('active',i===1));
}
function showRank(){
  document.getElementById('lobbySolo').style.display='none';
  document.getElementById('lobbyOnline').style.display='none';
  document.getElementById('lobbyRank').style.display='';
  document.querySelectorAll('#lobbyMode .pcnt-btn').forEach((b,i)=>b.classList.toggle('active',i===2));
  _rankReset();
  _loadMyRating();
}

// ── ランクマッチ（3人固定・時間制限あり） ──────────────────────
const RANK = {
  polling: null,
  searchStartAt: null,
  peerId: null,
  matchId: null,
  myRating: null,
  opponents: [],        // [{name, rating}]
  connectedGuests: 0,   // ホスト側: 接続済みゲスト数
  _gameStartFired: false, // ゲームスタート二重発火防止
  buttonCooldown: false, // ボタンクールタイム
  buttonClickCount: 0,   // 3人カウント用
};

function _rankReset(){
  if(RANK.polling){clearInterval(RANK.polling);RANK.polling=null;}
  RANK.searchStartAt=null;
  RANK.peerId=null;
  RANK.matchId=null;
  RANK.myRating=null;
  RANK.opponents=[];
  RANK.connectedGuests=0;
  RANK._gameStartFired=false;
  RANK.buttonCooldown=false;
  RANK.buttonClickCount=0;
  const wp=document.getElementById('rankWaitPanel');
  const sp=document.getElementById('rankSearchPanel');
  const mp=document.getElementById('rankMatchedPanel');
  if(wp) wp.style.display='';
  if(sp) sp.style.display='none';
  if(mp) mp.style.display='none';
  const rs=document.getElementById('rankStatus');
  if(rs) rs.textContent='';
}

function cancelRankQueue(){
  if(RANK.polling){clearInterval(RANK.polling);RANK.polling=null;}
  if(RANK.searchStartAt){
    fetch('/rank/cancel',{method:'DELETE'}).catch(()=>{});
  }
  if(NET.peer&&RANK.peerId){
    NET.peer.destroy(); NET.peer=null;
  }
  RANK.searchStartAt=null;
  RANK.peerId=null;
  RANK.matchId=null;
  const sp=document.getElementById('rankSearchPanel');
  const wp=document.getElementById('rankWaitPanel');
  if(sp) sp.style.display='none';
  if(wp) wp.style.display='';
}

function setRankStatus(msg){ document.getElementById('rankStatus').textContent=msg; }

async function _loadMyRating(){
  try{
    const r=await fetch('/rank/my-rating');
    if(r.ok){
      const d=await r.json();
      RANK.myRating=d.rating;
      const el=document.getElementById('myRatingDisplay');
      if(el) el.textContent=d.rating;
    }
  }catch(e){}
}

async function joinRankQueue(){
  // ボタンがクールタイム中か確認
  if(RANK.buttonCooldown) return;
  
  // ボタンをクールタイム状態にする
  RANK.buttonCooldown = true;
  const btn = document.querySelector('#lobbyRank .start-btn');
  if(btn){
    btn.disabled = true;
    btn.style.opacity = '0.5';
    btn.style.cursor = 'not-allowed';
  }
  
  // 5秒後にボタンを再度有効化
  setTimeout(()=>{
    RANK.buttonCooldown = false;
    if(btn){
      btn.disabled = false;
      btn.style.opacity = '1';
      btn.style.cursor = 'pointer';
    }
  }, 5000);
  
  setRankStatus('接続中…');
  const peerId = 'mj-rank-'+Date.now()+'-'+Math.floor(Math.random()*9999);
  RANK.peerId = peerId;
  NET.peer = new Peer(peerId, {debug:0});

  NET.peer.on('open', async ()=>{
    try {
      const res = await fetch('/rank/join', {
        method:'POST',
        headers:{'Content-Type':'application/json'},
        body: JSON.stringify({peerId}),
      });
      
      console.log('ランク参加レスポンス:', res.status);
      
      if(!res.ok){
        const errData = await res.json().catch(()=>({}));
        setRankStatus('エラー: '+(errData.error || res.status));
        NET.peer.destroy(); 
        NET.peer = null;
        return;
      }

      const data = await res.json();
      console.log('ランク参加データ:', data);

      if(data.matched){
        console.log('マッチ成立');
        _onRankMatched(data);
      } else {
        console.log('マッチ待機中:', data.queueSize);
        RANK.searchStartAt = Date.now();
        document.getElementById('rankWaitPanel').style.display='none';
        document.getElementById('rankSearchPanel').style.display='';
        setRankStatus('');
        RANK.polling = setInterval(_pollRankStatus, 1000);
        _updateSearchTimer();
      }
    } catch(e){
      console.error('ランク参加エラー:', e);
      setRankStatus('サーバーへの接続に失敗しました: ' + e.message);
      NET.peer.destroy(); 
      NET.peer = null;
    }
  });

  NET.peer.on('error', e=>{
    console.error('PeerJSエラー:', e);
    setRankStatus('接続エラー: '+e.message);
    _rankReset();
  });
}

function _updateSearchTimer(){
  if(!RANK.searchStartAt) return;
  const sec = Math.floor((Date.now()-RANK.searchStartAt)/1000);
  const el = document.getElementById('rankSearchTime');
  if(el) el.textContent = `待機時間: ${sec}秒`;
}

async function _pollRankStatus(){
  _updateSearchTimer();
  let res;
  try { res = await fetch('/rank/status'); } catch(e){ 
    console.error('ポーリングエラー:', e);
    return; 
  }
  if(!res.ok) {
    console.error('ポーリングステータスエラー:', res.status);
    return;
  }
  const data = await res.json().catch(()=>({}));
  console.log('ランクステータス:', data);
  
  // キュー人数を表示
  if(!data.matched && data.queueSize!=null){
    const qel=document.getElementById('rankQueueCount');
    if(qel) qel.textContent=`現在 ${data.queueSize}/3 人待機中`;
  }
  if(data.matched){
    console.log('ゲスト側もマッチ検知');
    if(RANK.polling){clearInterval(RANK.polling);RANK.polling=null;}
    _onRankMatched(data);
  }
}

function _onRankMatched(data){
  const wp=document.getElementById('rankWaitPanel');
  const sp=document.getElementById('rankSearchPanel');
  const mp=document.getElementById('rankMatchedPanel');
  if(wp) wp.style.display='none';
  if(sp) sp.style.display='none';
  if(mp) mp.style.display='';
  // 対戦相手名は非表示（名前を非表示にする要件）
  const oppEl=document.getElementById('rankOpponentNames');
  if(oppEl){
    oppEl.innerHTML=''; // 名前を表示しない
  }
  setRankStatus('');

  RANK.matchId = data.matchId;
  RANK.myRating = data.myRating;
  RANK.opponents = data.opponents || [];
  RANK.connectedGuests = 0;
  RANK._gameStartFired = false;

  NET.isHost = !!data.isHost;
  NET.myIdx = data.myIdx ?? (NET.isHost ? 0 : 1);
  NET.conns = [];
  NET.isRankMatch = true;
  G_ABILITY_MODE = true;

  fetch('/rank/done', {method:'DELETE'}).catch(()=>{});

  if(NET.isHost){
    // ホスト: 2人のゲストからの接続を待つ（先にリスナーを登録してからキューを削除）
    NET.peer.off('connection');
    NET.peer.on('connection', conn=>{
      if(NET.conns.length >= 2){ conn.close(); return; }
      const guestIdx = NET.conns.length + 1;
      conn._playerIdx = guestIdx;
      NET.conns.push(conn);
      if(guestIdx===1) NET.conn = conn;
      conn.on('data', msg=>onNetData(msg, guestIdx));
      conn.on('close', ()=>{
        if(conn.peer && NET.online) onPeerDisconnected(conn.peer);
        _handleGuestDisconnect(conn, guestIdx);
      });
      conn.on('error', e=>{ setOnlineStatus('通信エラー: '+e.message); });
      const onOpen = ()=>{
        if(conn.peer) peerRegistryAdd(conn.peer, guestIdx, conn);
        conn.send({type:'joined', myIdx:guestIdx, abilityMode:true, members:3});
        RANK.connectedGuests++;
        setRankStatus(`対戦相手を待っています… (${RANK.connectedGuests}/2)`);
        if(RANK.connectedGuests >= 2 && !RANK._gameStartFired){
          RANK._gameStartFired = true;
          // 2人揃ったらゲームスタート（名前受信のため少し待つ）
          setTimeout(()=>{
            // メンバー情報を集める（ホストはNET.guestIconIdsを使う）
            const membersInfo = [
              {name: PROFILE.name||'あなた', iconId: PROFILE.iconId||'', ability: PROFILE.ability||''},
              {name: NET.guestNames[0]||'ゲスト1', iconId: NET.guestIconIds[0]||'', ability: NET.guestAbilities[0]||''},
              {name: NET.guestNames[1]||'ゲスト2', iconId: NET.guestIconIds[1]||'', ability: NET.guestAbilities[1]||''},
            ];
            console.log('ホストからgameStart送信:', membersInfo);
            NET.conns.forEach((c)=>{
              if(c&&c.open) c.send({type:'gameStart', totalPlayers:3, abilityMode:true, timeMode:true, membersInfo});
            });
            setTimeout(()=>{
              G_TIME_MODE = true;
              startOnlineGame();
            }, 300);
          }, 1200);
        }
      };
      if(conn.open){ onOpen(); } else { conn.on('open', onOpen); }
    });
  } else {
    // ゲスト: ホストのPeerIDに接続（ホストがリスナー登録するまで時間がかかる場合があるのでリトライ）
    const hostPeerId = data.hostPeerId;
    setRankStatus('ホストに接続中…');
    _rankGuestConnect(hostPeerId, 0);
  }
}

function _rankGuestConnect(hostPeerId, attempt){
  if(attempt > 8){ setRankStatus('接続に失敗しました。再試行してください。'); return; }
  // 既に接続済みか gameStart 受信済みなら中止
  if(NET.online) return;

  const delay = attempt === 0 ? 2500 : Math.min(3000, 1000 * attempt);
  setTimeout(()=>{
    // 接続が既に成立していれば中止
    if(NET.online || (NET.conn && NET.conn.open)) return;
    // 前の接続試行をクリーンアップ
    if(NET.conn){ try{ NET.conn.close(); }catch(e){} NET.conn=null; }

    const conn = NET.peer.connect(hostPeerId, {reliable:true});
    NET.conn = conn;
    NET.conns = [];

    let opened = false;
    conn.on('open', ()=>{
      opened = true;
      setRankStatus('ホストに接続しました！ゲーム開始を待っています…');
    });
    conn.on('data', msg=>onNetData(msg, null));
    conn.on('close', ()=>{ 
      if(NET.online){ 
        // ホスト切断時は自動的にホストに昇格
        promoteGuestToHost();
      } 
    });
    conn.on('error', ()=>{
      if(!opened && !NET.online) _rankGuestConnect(hostPeerId, attempt+1);
    });

    // 接続タイムアウト: openされない場合はリトライ
    setTimeout(()=>{
      if(!opened && !NET.online) _rankGuestConnect(hostPeerId, attempt+1);
    }, 4000);
  }, delay);
}

// ゲストがホストに昇格する関数
function promoteGuestToHost(){
  if(NET.isHost) return;
  // 競合防止: 複数ゲストが同時に呼んでも1回だけ実行
  if(NET._promotingToHost) return;
  NET._promotingToHost = true;

  if(NET.myIdx > 1){
    const newHostPeerId = NET.guestPeerIds[0];
    if(newHostPeerId){
      addLog('🔄 新しいホストに再接続中…','log-new');
      if(NET.conn){ try{ NET.conn.close(); }catch(e){} NET.conn=null; }
      NET.online = false; // 再接続中は一時的にfalseにする
      setTimeout(()=>_reconnectToNewHost(newHostPeerId), 800);
    } else {
      addLog('⚠️ 新ホストPeerID不明のため自分がホスト昇格します','log-new');
      _doPromoteToHost(0);
    }
    return;
  }

  // myIdx=1のゲストがホスト昇格
  _doPromoteToHost(0);
}

// 新ホスト(元guest1)への再接続
function _reconnectToNewHost(newHostPeerId){
  // Bug修正: NET.onlineのガードを除去（ゲーム中の再接続を許可）
  if(NET.isHost) return;
  if(NET.conn){ try{ NET.conn.close(); }catch(e){} NET.conn=null; }
  const myOriginalIdx = NET.myIdx;
  const conn = NET.peer.connect(newHostPeerId, {reliable:true});
  NET.conn = conn;
  conn.on('open', ()=>{
    NET.online = true;
    NET._promotingToHost = false;
    conn.send({type:'reconnect', originalIdx: myOriginalIdx, peerId: NET.peer?.id||''});
    conn.send({type:'myName',name:PROFILE.name||'プレイヤー',ability:PROFILE.ability||'',iconId:PROFILE.iconId||'',peerId:NET.peer?.id||''});
    addLog('✅ 新ホストに再接続しました','log-new');
  });
  conn.on('data', msg=>onNetData(msg, null));
  conn.on('close', ()=>{ if(!NET.isHost){ NET._promotingToHost=false; promoteGuestToHost(); } });
  conn.on('error', ()=>{
    addLog('⚠️ 再接続失敗。自分がホスト昇格します','log-new');
    NET._promotingToHost = false;
    _doPromoteToHost(0);
  });
  setTimeout(()=>{
    if(!NET.online && !NET.isHost){ NET._promotingToHost=false; _doPromoteToHost(0); }
  }, 5000);
}

// 実際のホスト昇格処理（disconnectedPidx: 切断した元ホストのプレイヤーインデックス）
function _doPromoteToHost(disconnectedPidx){
  if(NET.isHost) return;

  NET.isHost = true;
  NET.online = true;
  NET._promotingToHost = false;

  // ★ 古い接続をクリア（ゲスト時代の接続が残ると isOnlineGuestIdx が誤判定する）
  NET.conn = null;
  NET.conns = NET.conns.filter(c => c && c.open);

  if(G && G.players && G.players[disconnectedPidx]){
    G.players[disconnectedPidx].isDisconnected = true;
    addLog(`🔄 ${G.players[disconnectedPidx].name}が切断しました。ホスト昇格しました。`,'log-new');
  }
  // 座席テーブルを再整備
  if(G && G.players){ rebuildSeats(); syncSeatIndices(); }

  if(NET.peer){
    NET.peer.off('connection');
    NET.peer.on('connection', conn=>{
      if(NET.conns.length >= 2){ conn.close(); return; }
      NET.conns.push(conn);
      const assignedIdx = NET.conns.length;
      conn._playerIdx = assignedIdx;
      if(conn.peer) peerRegistryAdd(conn.peer, assignedIdx, conn);
      conn.on('open', ()=>{ if(conn.peer) peerRegistryAdd(conn.peer, conn._playerIdx, conn); });
      conn.on('data', msg=>{
        if(msg.type==='reconnect' && msg.originalIdx !== undefined){
          conn._playerIdx = msg.originalIdx;
          const pr = NET.peerRegistry.find(p=>p.conn===conn);
          if(pr) pr.playerIdx = msg.originalIdx;
        }
        onNetData(msg, conn._playerIdx);
      });
      conn.on('close', ()=>{
        if(conn.peer && NET.online) onPeerDisconnected(conn.peer);
        _handleGuestDisconnect(conn, conn._playerIdx);
      });
      conn.on('error', e=>{ setOnlineStatus('通信エラー: '+e.message); });
      const onOpen = ()=>{
        conn.send({type:'joined', myIdx:conn._playerIdx, abilityMode:true, members:numPlayers});
        if(NET.online) broadcastState();
      };
      if(conn.open){ onOpen(); } else { conn.on('open', onOpen); }
    });
  }

  startSyncBroadcast();

  // ★ nextTurn で再起動（resumeGameAfterHostLost より確実）
  setTimeout(()=>{
    renderAll();
    nextTurn(G.current);
  }, 100);

  addLog('✅ ホスト昇格完了。ゲーム続行します。','log-new');
}


// ── Room creation (Host) ─────────────────────────────────────
function setRoomAbilityMode(on){
  NET.roomAbilityMode=on;
  document.getElementById('roomModeAbilityOn').classList.toggle('active',on);
  document.getElementById('roomModeAbilityOff').classList.toggle('active',!on);
}
async function createRoom(){
  setOnlineStatus('接続中…');
  const code = String(Math.floor(100000+Math.random()*900000));
  NET.roomCode = code;
  NET.isHost = true;
  NET.myIdx = 0;
  NET.conns = [];

  const peerId = 'mj-'+code;
  NET.peer = new Peer(peerId, {debug:0});
  NET.peer.on('open', async ()=>{
    // サーバーに部屋を登録する
    try {
      const res = await fetch('/room/create', {
        method: 'POST',
        headers: {'Content-Type':'application/json'},
        body: JSON.stringify({code, peerId, abilityMode: NET.roomAbilityMode}),
      });
      if(!res.ok){
        const err = await res.json().catch(()=>({}));
        setOnlineStatus('部屋の作成に失敗しました: '+(err.error||res.status));
        NET.peer.destroy(); NET.peer=null;
        return;
      }
    } catch(e){
      setOnlineStatus('サーバーへの接続に失敗しました');
      NET.peer.destroy(); NET.peer=null;
      return;
    }
    document.getElementById('roomCodeBox').style.display='';
    document.getElementById('roomCodeDisplay').textContent=code;
    setOnlineStatus('');
    updateRoomMemberList();
    showRoomLobby();
  });
  NET.peer.on('connection', conn=>{
    if(NET.conns.length>=3){conn.close();return;} // 最大4人(ホスト+3)
    const guestIdx = NET.conns.length+1;
    conn.metadata = {idx:guestIdx};
    conn._playerIdx = guestIdx;
    NET.conns.push(conn);
    NET.conn = conn;
    setupConn(conn, guestIdx);
    // peerRegistry に登録（open後にpeerIdが確定する）
    conn.on('open',()=>{
      if(conn.peer) peerRegistryAdd(conn.peer, guestIdx, conn);
      const md = _buildMemberData();
      conn.send({type:'joined',myIdx:guestIdx,abilityMode:NET.roomAbilityMode,
        members:NET.conns.length+1, memberData:md});
      _broadcastMemberUpdate();
    });
  });
  NET.peer.on('error', e=>{setOnlineStatus('エラー: '+e.message);});
}
function updateRoomMemberList(){
  const count = NET.conns.length+1;
  const el = document.getElementById('roomMemberList');
  if(el){
    const names=[PROFILE.name||'あなた（ホスト）'];
    for(let i=0;i<NET.conns.length;i++) names.push(NET.guestNames[i]||`ゲスト${i+1}`);
    el.textContent=`現在${count}人 / 最大4人　[${names.join(', ')}]`;
  }
  const sb = document.getElementById('roomStartBtn');
  if(sb) sb.style.display = count>=2?'':'none';
  updateRoomLobbyUI();
}

// ── Room Lobby Screen ─────────────────────────────────────────
function showRoomLobby(){
  document.getElementById('lobby').style.display='none';
  document.getElementById('roomLobbyScreen').classList.add('active');
  updateRoomLobbyUI();
}
function hideRoomLobby(){
  document.getElementById('roomLobbyScreen').classList.remove('active');
}

function _buildMemberData(){
  return [
    {name:PROFILE.name||'あなた', iconId:PROFILE.iconId||'', role:'ホスト'},
    ...NET.conns.map((c,i)=>({
      name:NET.guestNames[i]||`ゲスト${i+1}`,
      iconId:NET.guestIconIds[i]||'',
      role:`ゲスト${i+1}`
    }))
  ];
}
function _broadcastMemberUpdate(){
  if(!NET.isHost) return;
  const memberData = _buildMemberData();
  NET.conns.forEach(c=>{
    if(c&&c.open) c.send({type:'memberUpdate', members:memberData.length, memberData});
  });
}

function updateRoomLobbyUI(){
  const sc = document.getElementById('roomLobbyScreen');
  if(!sc||!sc.classList.contains('active')) return;
  const rlsSt = document.getElementById('rlsStatus');
  if(rlsSt) rlsSt.textContent='';
  if(NET.isHost){
    const cs = document.getElementById('rlsCodeSection');
    if(cs) cs.style.display='';
    const cd = document.getElementById('rlsCodeDisplay');
    if(cd) cd.textContent=NET.roomCode||'';
    const ms = document.getElementById('rlsModeSection');
    if(ms) ms.style.display='';
    const hc = document.getElementById('rlsHostControls');
    if(hc) hc.style.display='';
    const gw = document.getElementById('rlsGuestWait');
    if(gw) gw.style.display='none';
    document.getElementById('rlsModeAbilityOn')?.classList.toggle('active', NET.roomAbilityMode);
    document.getElementById('rlsModeAbilityOff')?.classList.toggle('active', !NET.roomAbilityMode);
    const startBtn = document.getElementById('rlsStartBtn');
    if(startBtn) startBtn.style.display = NET.conns.length>=1?'':'none';
    // Build member cards
    const members = _buildMemberData().map((m,i)=>({...m, isMe:i===0, connIdx:i-1}));
    _renderRlsMembers(members);
    // Update member count
    const mc = document.getElementById('rlsMemberCount');
    if(mc) mc.textContent = members.length;
  } else {
    document.getElementById('rlsCodeSection').style.display='none';
    document.getElementById('rlsModeSection').style.display='none';
    document.getElementById('rlsHostControls').style.display='none';
    document.getElementById('rlsGuestWait').style.display='';
    const members = NET._memberDataCache.map((m,i)=>({...m, isMe:i===NET.myIdx, connIdx:-1}));
    _renderRlsMembers(members);
    // Update member count
    const mc = document.getElementById('rlsMemberCount');
    if(mc) mc.textContent = members.length;
  }
}

function _renderRlsMembers(members){
  const listEl = document.getElementById('rlsMemberList');
  if(!listEl) return;
  const iconFn = (iconId) => iconId
    ? `<img src="${gachaIconUrl(iconId)}" alt="">`
    : '👤';
  listEl.innerHTML = members.map(m=>`
    <div class="rls-member-card${m.isMe?' is-me-card':''}${m.role==='ホスト'?' is-host-card':''}">
      <div class="rls-avatar">${iconFn(m.iconId)}</div>
      <div class="rls-member-info">
        <div class="rls-member-name">${m.name}${m.isMe?' ★':m.role==='ホスト'?' 👑':''}</div>
        <div class="rls-member-role">${m.role}</div>
      </div>
      ${NET.isHost && m.connIdx>=0 ? `<button class="rls-kick-btn" title="このプレイヤーをキック" onclick="kickPlayer(${m.connIdx})">キック</button>` : ''}
    </div>
  `).join('');
}

function kickPlayer(connIdx){
  if(!NET.isHost) return;
  const conn = NET.conns[connIdx];
  if(!conn) return;
  if(conn.open) conn.send({type:'kicked'});
  setTimeout(()=>{ try{conn.close();}catch(e){} }, 120);
  NET.conns.splice(connIdx, 1);
  NET.guestNames.splice(connIdx, 1);
  NET.guestAbilities.splice(connIdx, 1);
  NET.guestIconIds.splice(connIdx, 1);
  _broadcastMemberUpdate();
  updateRoomLobbyUI();
}

function leaveRoomLobby(){
  if(NET.isHost){
    NET.conns.forEach(c=>{ if(c&&c.open){ try{c.send({type:'kicked'});}catch(e){} setTimeout(()=>c.close(),80); } });
    if(NET.roomCode) fetch('/room/'+NET.roomCode, {method:'DELETE'}).catch(()=>{});
  } else {
    if(NET.conn&&NET.conn.open){ try{NET.conn.close();}catch(e){} }
  }
  if(NET.peer){ try{NET.peer.destroy();}catch(e){} NET.peer=null; }
  hideRoomLobby();
  NET.conns=[]; NET.conn=null; NET.roomCode=null; NET.isHost=false;
  NET.guestNames=[]; NET.guestAbilities=[]; NET.guestIconIds=[]; NET.guestPeerIds=[]; NET._memberDataCache=[]; NET.peerRegistry=[]; NET._lastActionId=0; stopSyncBroadcast();
  setOnlineStatus('');
  document.getElementById('lobby').style.display='flex';
  document.getElementById('roomCodeBox').style.display='none';
  document.getElementById('waitingDots').style.display='';
}

function copyRlsCode(){
  const code = document.getElementById('rlsCodeDisplay')?.textContent||'';
  navigator.clipboard?.writeText(code).then(()=>{
    const el=document.getElementById('rlsStatus');
    if(el){ el.textContent='コピーしました！'; setTimeout(()=>{ if(el) el.textContent=''; },2000); }
  });
}
function hostStartGame(){
  if(NET.conns.length===0)return;
  const membersInfo = [
    {name: PROFILE.name||'あなた', iconId: PROFILE.iconId||'', ability: PROFILE.ability||''},
    ...NET.conns.map((c,i)=>({
      name: NET.guestNames[i]||`ゲスト${i+1}`,
      iconId: NET.guestIconIds[i]||'',
      ability: NET.guestAbilities[i]||''
    }))
  ];
  NET.conns.forEach((c,i)=>{if(c.open)c.send({type:'gameStart',totalPlayers:NET.conns.length+1,abilityMode:NET.roomAbilityMode,membersInfo});});
  // ゲーム開始後はサーバーから部屋を削除する（新規参加を防ぐ）
  if(NET.roomCode) fetch('/room/'+NET.roomCode, {method:'DELETE'}).catch(()=>{});
  hideRoomLobby();
  setTimeout(()=>startOnlineGame(),300);
}

function copyRoomCode(){
  const code=document.getElementById('roomCodeDisplay').textContent;
  navigator.clipboard?.writeText(code).then(()=>setOnlineStatus('コピーしました！'));
}

// ── Room join (Guest) ─────────────────────────────────────────
async function joinRoom(){
  const code = document.getElementById('roomInput').value.trim();
  if(code.length!==6){setOnlineStatus('6桁の部屋番号を入力してください');return;}
  setOnlineStatus('サーバーで部屋を検索中…');
  NET.isHost = false;
  NET.myIdx = 1; // ホストから上書きされる
  NET.roomCode = code;
  NET.conns = [];

  // サーバーからホストのPeerIDを取得する
  let hostPeerId;
  try {
    const res = await fetch('/room/'+code);
    if(!res.ok){
      setOnlineStatus('部屋が見つかりません。番号を確認してください。');
      return;
    }
    const data = await res.json();
    hostPeerId = data.peerId;
  } catch(e){
    setOnlineStatus('サーバーへの接続に失敗しました');
    return;
  }

  setOnlineStatus('接続中…');
  NET.peer = new Peer('mj-guest-'+Date.now(), {debug:0});
  NET.peer.on('open', ()=>{
    const conn = NET.peer.connect(hostPeerId, {reliable:true});
    NET.conn = conn;
    setupConn(conn, null);
  });
  NET.peer.on('error', e=>{setOnlineStatus('エラー: 接続に失敗しました。');});
}

// ── Shared connection setup ───────────────────────────────────
function setupConn(conn, guestIdx){
  conn.on('open', ()=>{
    if(!NET.isHost) setOnlineStatus('接続しました！ホストを待っています…');
    // peerRegistry に登録（peerId が取れるタイミングで）
    if(conn.peer) peerRegistryAdd(conn.peer, guestIdx, conn);
  });
  conn.on('data', msg=>onNetData(msg, guestIdx));
  conn.on('close', ()=>{
    // peerRegistry から除外 → ホスト再選出
    if(conn.peer && NET.online) onPeerDisconnected(conn.peer);

    if(NET.online){
      if(amIHost()){
        _handleGuestDisconnect(conn, guestIdx);
      } else {
        promoteGuestToHost();
      }
    } else {
      NET.online=false;
    }
  });
  conn.on('error', e=>{ setOnlineStatus('通信エラー: '+e.message); });
}

// ホスト側でゲストが切断したときの共通処理
function _handleGuestDisconnect(conn, guestIdx){
  const idx = NET.conns.indexOf(conn);
  if(idx !== -1) NET.conns.splice(idx, 1);
  // ★ PeerIDでプレイヤーを特定（インデックスズレ対策）
  let pidx = (conn._playerIdx !== undefined) ? conn._playerIdx : guestIdx;
  if(conn.peer && G && G.players){
    const byPeer = G.players.findIndex(p => p.peerId === conn.peer);
    if(byPeer >= 0) pidx = byPeer;
  }
  if(G && G.players && G.players[pidx]){
    addLog(`🔄 ${G.players[pidx].name}が切断しました。離席状態にします。`,'log-new');
    resumeGameAfterHostLost(pidx);
  }
}

function resumeGameAfterHostLost(disconnectedPidx){
  if(!G || !G.players) return;
  if(['end','win','idle'].includes(G.phase)) return;

  // 切断者を離席状態に設定
  if(G.players[disconnectedPidx]){
    G.players[disconnectedPidx].isDisconnected = true;
  }

  const cur = G.current;

  // draw_wait は cpuAction が処理できないので draw に戻す
  if(G.phase === 'draw_wait') G.phase = 'draw';

  // pending_ron/pon: 切断者が待機中のみスキップ、それ以外はそのまま継続
  if(G.phase === 'pending_ron' || G.phase === 'pending_pon'){
    if(pendingAction && pendingAction.target === disconnectedPidx){
      const pa = pendingAction;
      pendingAction = null;
      nextTurn((pa.from + 1) % numPlayers);
      broadcastState();
    } else {
      // 自分または他ゲストが待機中 → renderAll/broadcastState で UI を出す
      renderAll();
      broadcastState();
    }
    return;
  }

  // 自分のターン
  if(cur === NET.myIdx){
    if(G.phase === 'draw'){
      if(G.deck.length === 0){ handleExhausted(); return; }
      G.phase = 'draw_wait';
      timerOnMyTurn();
      if(autoDrawEnabled){ renderAll(); broadcastState(); setTimeout(autoPickWall, 200); return; }
      addLog('山牌を選んでクリックしてください', 'log-new');
    }
    renderAll();
    broadcastState();
    return;
  }

  // 他のオンラインゲストのターン
  if(isOnlineGuestIdx(cur) && !amIHost()){
    broadcastState();
    return;
  }

  // CPU（切断者含む）のターン
  setTimeout(cpuAction, 500);
}

// ── Send/receive ──────────────────────────────────────────────
function netSend(msg){
  if(amIHost()){
    // ホスト: 全ゲストに送信
    NET.conns.forEach(c=>{if(c&&c.open)c.send(msg);});
  } else {
    // ゲスト: ホストに送信
    if(NET.conn&&NET.conn.open) NET.conn.send(msg);
  }
}

function onNetData(msg, senderIdx){
  if(amIHost()){
    handleGuestAction(msg, senderIdx);
  } else {
    if(msg.type==='joined'){
      // ゲーム中の再接続（新ホストへの再接続）の場合は myIdx を上書きしない
      const isReconnecting = NET.online && G && G.players && G.players.length > 0;
      if(!isReconnecting){
        NET.myIdx=msg.myIdx;
        G_ABILITY_MODE=msg.abilityMode;
      }
      // 自分のプロフィール名・アイコン・PeerIDをホストに送信
      if(NET.conn&&NET.conn.open) NET.conn.send({type:'myName',name:PROFILE.name||'プレイヤー',ability:PROFILE.ability||'',iconId:PROFILE.iconId||'',peerId:NET.peer?.id||''});
      if(isReconnecting){
        // 再接続完了：ゲーム状態は次の stateUpdate で同期される
        addLog('🔄 新ホストと同期中…','log-new');
      } else if(NET.isRankMatch){
        // ランクマッチ: ルームロビーは表示しない
        setRankStatus('ゲーム開始を待っています…');
      } else {
        setOnlineStatus('接続しました！ホストの開始を待っています…');
        const gwm = document.getElementById('guestWaitMsg');
        if(gwm) gwm.style.display='';
        updateGuestMemberList(msg.members);
        if(msg.memberData){
          NET._memberDataCache=msg.memberData;
        }
        showRoomLobby();
      }
    } else if(msg.type==='memberUpdate'){
      updateGuestMemberList(msg.members);
      if(msg.memberData){
        NET._memberDataCache=msg.memberData;
        updateRoomLobbyUI();
      }
    } else if(msg.type==='hostDisconnect'){
      // ホストが明示的に切断を通知 → 即座にホスト昇格処理
      promoteGuestToHost();
    } else if(msg.type==='ping'){
      // keepalive pong を返す
      if(NET.conn&&NET.conn.open) NET.conn.send({type:'pong'});
    } else if(msg.type==='kicked'){
      hideRoomLobby();
      if(NET.peer){ try{NET.peer.destroy();}catch(e){} NET.peer=null; }
      NET.conn=null; NET.conns=[]; NET._memberDataCache=[];
      document.getElementById('lobby').style.display='flex';
      setOnlineStatus('ホストにキックされました');
    } else if(msg.type==='gameStart'){
      numPlayers=msg.totalPlayers;
      G_ABILITY_MODE=msg.abilityMode;
      if(msg.timeMode) G_TIME_MODE=true;
      
      console.log('gameStart受信:', {myIdx: NET.myIdx, isHost: NET.isHost, membersInfo: msg.membersInfo});
      
      // ゲスト側: メンバー情報からアイコンIDを取得
      if(msg.membersInfo && Array.isArray(msg.membersInfo)){
        // membersInfo: [player0, player1, player2]
        // ゲスト側がこれを受け取ったら、自分のインデックス以外をNET.guestIconIdsに設定
        if(!NET.isHost){
          // ゲスト側: 全メンバーの情報を保持
          // NET.guestIconIds/Names/Abilities は「自分以外」を順番に格納
          // 例: myIdx=1 なら [id=0のデータ, id=2のデータ]
          let guestSlot = 0;
          for(let i = 0; i < msg.membersInfo.length; i++){
            if(i === NET.myIdx) continue; // 自分は skip
            NET.guestIconIds[guestSlot] = msg.membersInfo[i]?.iconId || '';
            NET.guestNames[guestSlot] = msg.membersInfo[i]?.name || '';
            NET.guestAbilities[guestSlot] = msg.membersInfo[i]?.ability || '';
            guestSlot++;
          }
          console.log('ゲスト側メンバー情報を設定:', {myIdx: NET.myIdx, guestIconIds: NET.guestIconIds, guestNames: NET.guestNames});
        }
      }
      
      NET.online=true;
      bgmToGame();
      hideRoomLobby();
      document.getElementById('lobby').style.display='none';
      document.getElementById('gameScreen').classList.add('active');
      scaleTable();
      // ゲスト: ホストに自分のアイコン情報とPeerIDを送信（makePlayer後に反映させるため）
      setTimeout(()=>{
        if(NET.conn&&NET.conn.open) NET.conn.send({type:'myName',name:PROFILE.name||'プレイヤー',ability:PROFILE.ability||'',iconId:PROFILE.iconId||'',peerId:NET.peer?.id||''});
      }, 400);
    } else {
      applyHostState(msg);
    }
  }
}
function updateGuestMemberList(count){
  const el=document.getElementById('guestMemberList');
  if(el) el.textContent=`現在${count}人参加中`;
}

// Host: receive action from guest, execute, broadcast state
function handleGuestAction(msg, senderIdx){
  if(G.phase==='win'||G.phase==='end')return;
  switch(msg.type){
    case 'pong':
      // ping に対する pong → タイムアウトキャンセル
      if(senderIdx !== undefined){
        const conn = NET.conns.find(c=>c&&c._playerIdx===senderIdx);
        if(conn&&conn.peer&&_pingTimers[conn.peer]){
          clearTimeout(_pingTimers[conn.peer]);
          delete _pingTimers[conn.peer];
        }
      }
      break;
    case 'reconnect':
      if(msg.originalIdx !== undefined){
        // ★ conn を特定して _playerIdx を確定（PeerIDも合わせて検証）
        const rc = NET.conns.find(c => c && (c._playerIdx === senderIdx || c.peer === msg.peerId));
        if(rc){
          rc._playerIdx = msg.originalIdx;
          // G.players の peerId も更新（再接続で PeerID が変わる場合に対応）
          if(msg.peerId && G && G.players && G.players[msg.originalIdx]){
            G.players[msg.originalIdx].peerId = msg.peerId;
          }
          const pr = NET.peerRegistry.find(p=>p.conn===rc);
          if(pr) pr.playerIdx = msg.originalIdx;
        }
        if(G && G.players && G.players[msg.originalIdx]){
          G.players[msg.originalIdx].isDisconnected = false;
          addLog(`✅ ${G.players[msg.originalIdx].name}が再接続しました。`,'log-new');
          broadcastState();
          renderAll();
        }
      }
      break;
    case 'wallPick':  remoteWallPick(msg.pidx, msg.slotIdx); break;
    case 'discard':   remoteDiscard(msg.pidx, msg.tidx, msg.isYami??false); break;
    case 'tsumo':     remoteWin(msg.pidx, true, -1); break;
    case 'ron':       remoteRon(msg.pidx, msg.tile, msg.from); break;
    case 'skipRon':   remoteSkipRon(msg.from); break;
    case 'pon':       handlePon(msg.pidx, msg.tile, msg.from); broadcastState(); break;
    case 'skipPon':   remoteSkipPon(msg.from); break;
    case 'kakan':     if(amIHost()){handleKakan(msg.pidx,msg.handIdx);broadcastState();} break;
    case 'ankan':     if(amIHost()){handleAnkan(msg.pidx,msg.tileKey);broadcastState();} break;
    case 'steal':     if(amIHost()){_doSteal(msg.myIdx,msg.fromPidx,msg.discardIdx);} break;
    case 'haku':      if(amIHost()){remoteHaku(msg.pidx,msg.tidx);} break;
    case 'lightRevealWall':
      if(amIHost()){
        const si=msg.slotIdx;
        if(G.deckSlots&&G.deckSlots[si]!==null){
          if(!G.lightRevealedSlots) G.lightRevealedSlots={};
          G.lightRevealedSlots[si]=true;
          const tile=G.deckSlots[si];
          if(!G.lightExtraDora) G.lightExtraDora=[];
          G.lightExtraDora.push({suit:tile.suit,num:tile.num});
          const ui=msg.userIdx??senderIdx;
          if(ui!=null&&G.players[ui]) G.players[ui].abilityUsed=true;
          G.lightMode=false;
          addLog(`☀️ 光！山牌を表にした: ${emj(tile)}（ドラ追加）`,'log-dora');
          SFX.light();
          broadcastState();
        }
      }
      break;
    case 'lightRevealHand':
      if(amIHost()){
        const p=G.players[msg.pidx];
        if(p&&msg.handIdx>=0&&msg.handIdx<p.hand.length){
          if(!G.lightRevealedHand) G.lightRevealedHand={};
          const tile=p.hand[msg.handIdx];
          G.lightRevealedHand[tile._id]=tile;
          if(!G.lightExtraDora) G.lightExtraDora=[];
          G.lightExtraDora.push({suit:tile.suit,num:tile.num});
          const ui=msg.userIdx??senderIdx;
          if(ui!=null&&G.players[ui]) G.players[ui].abilityUsed=true;
          G.lightMode=false;
          addLog(`☀️ 光！${p.name}の手牌を表にした: ${emj(tile)}（ドラ追加）`,'log-dora');
          SFX.light();
          broadcastState();
        }
      }
      break;
    case 'lightRevealDoraCanvas':
      if(amIHost()){
        const di=msg.di;
        let tile=null,label='';
        if(di<7){const usedR=G.rinshanIdx;if(di>=usedR){tile=G.doraPile[8+di];label='嶺上牌';}}
        else if(di>=7&&di<=10){tile=G.doraPile[di-7];label='ドラ表示牌';}
        if(tile&&tile.suit){
          if(!G.lightRevealedSlots) G.lightRevealedSlots={};
          G.lightRevealedSlots['dc_'+di]=true;
          if(!G.lightExtraDora) G.lightExtraDora=[];
          G.lightExtraDora.push({suit:tile.suit,num:tile.num});
          const ui=msg.userIdx??senderIdx;
          if(ui!=null&&G.players[ui]) G.players[ui].abilityUsed=true;
          G.lightMode=false;
          addLog(`☀️ 光！${label}を表にした: ${emj(tile)}（ドラ追加）`,'log-dora');
          SFX.light();
          broadcastState();
        }
      }
      break;
    case 'lightDispelDiscardYami':
      if(amIHost()){
        const p=G.players[msg.pidx];
        const t=p&&p.discards[msg.discardIdx];
        if(t&&t._yami){
          delete t._yami;
          const ui=msg.userIdx??senderIdx;
          if(ui!=null&&G.players[ui]) G.players[ui].abilityUsed=true;
          G.lightMode=false;
          addLog(`☀️ 光！${p.name}の捨て牌の闇を解いた`,'log-dora');
          SFX.light();
          broadcastState();
        }
      }
      break;
    case 'lightDispelHandYami':
      if(amIHost()){
        const p=G.players[msg.pidx];
        if(p&&p.yamiTileIdx>=0){
          p.yamiTileIdx=-1;
          const ui=msg.userIdx??senderIdx;
          if(ui!=null&&G.players[ui]) G.players[ui].abilityUsed=true;
          G.lightMode=false;
          addLog(`☀️ 光！${p.name}の手牌の闇を解いた`,'log-dora');
          SFX.light();
          broadcastState();
        }
      }
      break;
    case 'lightRevealMine':
      if(amIHost()){
        const ui=msg.userIdx??senderIdx;
        if(ui!=null&&G.players[ui]) G.players[ui].abilityUsed=true;
        G.lightMode=false;
        addLog(`☀️ 光！地雷の位置を確認した`,'log-dora');
        broadcastState();
      }
      break;
    case 'plantMine':
      if(amIHost()){
        const si=msg.slotIdx;
        if(G.deckSlots&&G.deckSlots[si]!==null&&!G.mineSlots.includes(si)){
          G.mineSlots.push(si);
          if(!G.mineOwners) G.mineOwners={};
          G.mineOwners[si]=senderIdx;
          G.mineCount++;
          if(G.mineCount>=3) G.minePlantMode=false;
          SFX.minePlant();
          addLog(`💣 地雷を仕掛けた！（${G.mineCount}/3カ所）`,'log-dora');
          broadcastState();
        }
      }
      break;
    case 'plantMineRinshan':
      if(amIHost()){
        const ri=msg.ri;
        if(ri>=0&&ri<G.rinshan.length&&!G.mineRinshanIdxs.includes(ri)){
          G.mineRinshanIdxs.push(ri);
          if(!G.mineRinshanOwners) G.mineRinshanOwners={};
          G.mineRinshanOwners[ri]=senderIdx;
          G.mineCount++;
          if(G.mineCount>=3) G.minePlantMode=false;
          SFX.minePlant();
          addLog(`💣 嶺上牌に地雷を仕掛けた！（${G.mineCount}/3カ所）`,'log-dora');
          broadcastState();
        }
      }
      break;
    case 'kita':      remoteKita(msg.pidx); break;
    case 'riichi':    remoteRiichi(msg.pidx, msg.mode, msg.tidx); break;
    case 'nextRound': nextRound(); break;
    case 'winReady':
      WIN_READY.readySet.add(senderIdx);
      _checkAllWinReady();
      break;
    case 'myName':
      NET.guestNames[senderIdx-1]=msg.name||'プレイヤー';
      NET.guestAbilities[senderIdx-1]=msg.ability??'';
      NET.guestIconIds[senderIdx-1]=msg.iconId||'';
      if(msg.peerId) NET.guestPeerIds[senderIdx-1]=msg.peerId;
      // ゲーム中ならG.playersにも即反映
      if(NET.online && G && G.players && G.players[senderIdx]){
        G.players[senderIdx].iconId = msg.iconId||'';
        G.players[senderIdx].name   = msg.name||'プレイヤー';
        // ★ peerId を player に紐付け（人格固定の核心）
        if(msg.peerId) G.players[senderIdx].peerId = msg.peerId;
        rebuildSeats();
        broadcastState();
        renderAll();
      }
      updateRoomMemberList();
      _broadcastMemberUpdate();
      break;
    case 'penSync':
      if(amIHost() && msg.changedKeys){
        if(!G.penDrawings) G.penDrawings={};
        for(const k of Object.keys(msg.changedKeys)){
          G.penDrawings[k]=msg.changedKeys[k];
        }
        Object.keys(_penImgCache).forEach(k=>delete _penImgCache[k]);
        renderWall(); renderDoraCanvas();
        broadcastState();
      }
      break;
    case 'penClear':
      if(amIHost()){
        G.penDrawings={};
        Object.keys(_penImgCache).forEach(k=>delete _penImgCache[k]);
        renderWall(); renderDoraCanvas();
        broadcastState();
      }
      break;
  }
}

// Guest: full state pushed by host → apply and render
function applyHostState(msg){
  // sync メッセージ: actionId が自分より新しい場合のみ適用
  if(msg.type==='sync'){
    if(msg.state && msg.state._lastActionId > NET._lastActionId){
      NET._lastActionId = msg.state._lastActionId;
      applyHostState({type:'state', state:msg.state});
    }
    return;
  }
  if(msg.type==='state'){
    // Rebuild G from serialized state (host sends full G)
    const s=msg.state;
    G.deck=s.deck;G.deckSlots=s.deckSlots;G.doraInds=s.doraInds;G.uraInds=s.uraInds;
    G.doraPile=s.doraPile;G.rinshan=s.rinshan;G.rinshanIdx=s.rinshanIdx;G.kanDoraCount=s.kanDoraCount;
    G.dealer=s.dealer;G.current=s.current;G.roundNum=s.roundNum;
    G.roundWind=s.roundWind;G.honba=s.honba;G.riichiPot=s.riichiPot;
    G.phase=s.phase;G.firstRound=s.firstRound;G.log=s.log;
    G.savedScores=s.savedScores;G._dealerWon=s._dealerWon;
    G.pendingRiichi=s.pendingRiichi;G.riichiValidIdx=s.riichiValidIdx;
    G.mineSlots=s.mineSlots??[];G.mineRinshanIdxs=s.mineRinshanIdxs??[];G.mineOwners=s.mineOwners??{};G.mineRinshanOwners=s.mineRinshanOwners??{};G.mineCount=s.mineCount??0;G.yamiSelectMode=s.yamiSelectMode??false;G.hakuSelectMode=s.hakuSelectMode??false;G.stealMode=s.stealMode??false;G.lightMode=s.lightMode??false;G.lightUserIdx=s.lightUserIdx??null;G.lightRevealedSlots=s.lightRevealedSlots??{};G.lightRevealedHand=s.lightRevealedHand??{};G.lightExtraDora=s.lightExtraDora??[];G.penDrawings=s.penDrawings??{};
    G.players=s.players;
    G.seats=s.seats || G.players.map(p=>({playerId: p?.peerId||''}));
    syncSeatIndices();
    numPlayers=s.numPlayers;
    pendingAction=s.pendingAction;
    selIdx=-1;
    // Bug4修正: ゲストのPeerIDリストをホストから受け取って保持（ホスト昇格時に使用）
    if(s.guestPeerIds) NET.guestPeerIds = s.guestPeerIds;
    // ゲスト: 自分の iconId は PROFILE.iconId で確実に上書き
    if(G.players[NET.myIdx]){
      G.players[NET.myIdx].iconId = PROFILE.iconId||'';
      // ★ 自分の peerId を確実に保持（ホストが送ってきた state で上書きされないよう）
      if(NET.peer?.id) G.players[NET.myIdx].peerId = NET.peer.id;
    }
    // ゲスト: 自分のターンでdrawフェーズなら、draw_waitに遷移してツモ選択可能にする
    if(G.phase==='draw' && G.current===NET.myIdx){
      if(G.deck.length===0){handleExhausted();return;}
      G.phase='draw_wait';
      timerOnMyTurn();
      if(autoDrawEnabled){
        renderAll();
        setTimeout(autoPickWall,200);
        return;
      }
      addLog('山牌を選んでクリックしてください','log-new');
    }
    renderAll();
    if(s.winModal){
      showWinModalData(s.winModal);
    } else {
      // 勝利モーダルが表示中なら閉じる（ホストが次局へ進めた）
      const wo = document.getElementById('winOverlay');
      if(wo && wo.classList.contains('show')){
        wo.classList.remove('show');
        if(WIN_READY.timer){ clearInterval(WIN_READY.timer); WIN_READY.timer=null; }
        WIN_READY.proceeded = true;
      }
    }
    if(s.finalResult)showFinalResultData(s.finalResult);
  }
}

function _buildStateSnapshot(extra={}){
  return {
    deck:G.deck,deckSlots:G.deckSlots,doraInds:G.doraInds,uraInds:G.uraInds,
    doraPile:G.doraPile,rinshan:G.rinshan,rinshanIdx:G.rinshanIdx,kanDoraCount:G.kanDoraCount,
    dealer:G.dealer,current:G.current,roundNum:G.roundNum,
    roundWind:G.roundWind,honba:G.honba,riichiPot:G.riichiPot,
    phase:G.phase,firstRound:G.firstRound,log:G.log,
    savedScores:G.savedScores,_dealerWon:G._dealerWon,
    pendingRiichi:G.pendingRiichi,riichiValidIdx:G.riichiValidIdx,
    mineSlots:G.mineSlots,mineRinshanIdxs:G.mineRinshanIdxs,mineOwners:G.mineOwners??{},mineRinshanOwners:G.mineRinshanOwners??{},mineCount:G.mineCount,yamiSelectMode:G.yamiSelectMode,hakuSelectMode:G.hakuSelectMode,stealMode:G.stealMode,lightMode:G.lightMode,lightUserIdx:G.lightUserIdx??null,lightRevealedSlots:G.lightRevealedSlots,lightRevealedHand:G.lightRevealedHand,lightExtraDora:G.lightExtraDora??[],penDrawings:G.penDrawings??{},
    players:G.players,numPlayers,pendingAction,
    seats:G.seats||[],
    guestPeerIds:NET.guestPeerIds,
    _lastActionId:NET._lastActionId,
    ...extra
  };
}

function broadcastState(extra={}){
  if(!NET.online||!amIHost()||NET.conns.length===0)return;
  netSend({type:'state',state:_buildStateSnapshot(extra)});
}

// Remote action handlers (host only)
function remoteDiscard(pidx,tidx,isYami=false){
  if(G.current!==pidx)return;
  if(G.pendingRiichi) commitRiichi(G.players[pidx]);
  discardAction(pidx,tidx,isYami);
}
function remoteWin(pidx,isTsumo,losidx){ handleWin(pidx,G.players[pidx].drawnTile,isTsumo,losidx); broadcastState(); }
function remoteRon(pidx,tile,from){ handleRon(pidx,tile,from); broadcastState(); }
function remoteSkipRon(from){ pendingAction=null; nextTurn((from+1)%numPlayers); }
function remoteSkipPon(from){ pendingAction=null; nextTurn((from+1)%numPlayers); }
function remoteWallPick(pidx,slotIdx){
  // ホスト側ではゲストのターンで G.phase='draw' のまま待機しているので、draw も許可
  if((G.phase!=='draw_wait'&&G.phase!=='draw')||G.current!==pidx)return;
  const tile=G.deckSlots[slotIdx];
  if(!tile)return;
  G.deckSlots[slotIdx]=null;
  const di=G.deck.findIndex(d=>d.suit===tile.suit&&d.num===tile.num);
  if(di>=0)G.deck.splice(di,1);
  const p=G.players[pidx];
  p.hand.push(tile);p.drawnTile=tile;

  // 💣 Mine check (ゲストが地雷スロットを引いた場合)
  if(G.mineSlots&&G.mineSlots.includes(slotIdx)){
    G.mineSlots=G.mineSlots.filter(s=>s!==slotIdx);
    if(G.mineOwners) delete G.mineOwners[slotIdx];
    const mineTile=p.hand.splice(p.hand.length-1,1)[0];
    p.discards.push(mineTile);p.drawnTile=null;
    updateTenpai(p);
    SFX.mineExplode();
    addLog(`💥 ${p.name} が地雷を踏んだ！[${emj(mineTile)}] を強制捨て`,'log-win');
    G._mineHit={pidx,tile:mineTile};
    renderAll();broadcastState();
    setTimeout(()=>{
      if(!checkPon(pidx,mineTile)) nextTurn((pidx+1)%numPlayers);
      broadcastState();
    },900);
    return;
  }

  G.phase='discard';
  updateTenpai(p);
  if(canWin(p.hand)){addLog(`${emj(tile)} ツモ！上がれます`,'log-tsumo');renderAll();broadcastState();return;}
  const drawnIsKita=tile.suit==='honor'&&tile.num==='北';
  if(p.riichi&&!drawnIsKita){
    addLog(`${emj(tile)} ツモ切り（リーチ中）`,'log-riichi');
    setTimeout(()=>{discardAction(pidx,p.hand.length-1);broadcastState();},550);
  }else{
    addLog(`${emj(tile)} ツモ`,'log-new');
  }
  renderAll();broadcastState();
}
function remoteKita(pidx){
  const p=G.players[pidx];
  const ki=p.hand.findIndex(t=>t.suit==='honor'&&t.num==='北');
  if(ki<0)return;
  const kt=p.hand.splice(ki,1)[0];p.kitaTiles.push(kt);p.kitaCount++;
  addLog(`${p.name} が北を抜いた！（ドラ+1）`,'log-dora');
  // 北抜き槍槓チェック
  for(let ci=0;ci<numPlayers;ci++){
    if(ci===pidx)continue;
    const cop=G.players[ci];
    if((cop.hand.length===4||cop.hand.length===1)&&cop.tenpai&&cop.waits.some(w=>teq(w,kt))){
      cop.isChankan=true;
      // オンライン: 自分自身か、ホストが管理しているゲストか判定
      const isMe = (ci===NET.myIdx);
      if(isMe || isOnlineGuestIdx(ci)){
        pendingAction={type:'ron',tile:kt,from:pidx,target:ci};
        G.phase='pending_ron';renderAll();broadcastState();
        if(isMe){ setTimeout(()=>{ if(G.phase==='pending_ron'&&autoWinEnabled) humanRon(); },250); }
        return;
      } else if(cpuDecideRon(ci,kt)){handleRon(ci,kt,pidx);return;}
    }
  }
  const rep=drawRinshanTile(pidx);
  revealKanDora();
  if(!rep){handleExhausted();broadcastState();return;}
  updateTenpai(p);
  if(canWin(p.hand)){handleWin(pidx,rep,true,-1);broadcastState();return;}
  if(p.riichi){
    const repIsKita=rep.suit==='honor'&&rep.num==='北';
    if(!repIsKita){
      setTimeout(()=>{discardAction(pidx,p.hand.length-1);broadcastState();},600);
    }
  }
  broadcastState();renderAll();
}
function remoteHaku(pidx,tidx){
  const p=G.players[pidx];
  if(!p||p.abilityUsed)return;
  const t=p.hand[tidx];
  if(!t||t._isHaku)return;
  t._hakuOriginal={suit:t.suit,num:t.num};
  t.suit='honor';t.num='白';t._isHaku=true;
  p.hakuTileId=t._id;
  p.abilityUsed=true;
  G.hakuSelectMode=false;
  addLog(`🀆 白！${p.name}が手牌の1枚を白に変換した`,'log-dora');
  updateTenpai(p);
  broadcastState();
  renderAll();
}
function remoteRiichi(pidx,mode,tidx){
  G.pendingRiichi=mode;
  G.riichiValidIdx=getRiichiDiscards(G.players[pidx].hand);
  commitRiichi(G.players[pidx]);
  discardAction(pidx,tidx);
  broadcastState();
}

function setOnlineStatus(msg){ const el=document.getElementById('onlineStatus'); if(el)el.textContent=msg; }

// ── Start online game (host calls this) ───────────────────────
function startOnlineGame(){
  bgmToGame();
  numPlayers=NET.conns.length+1;
  NET.online=true;
  NET._lastActionId=0;
  if(!NET.isRankMatch){
    G_ABILITY_MODE=NET.roomAbilityMode;
  }
  hideRoomLobby();
  document.getElementById('lobby').style.display='none';
  document.getElementById('gameScreen').classList.add('active');
  scaleTable();
  G={players:[],deck:[],deckSlots:[],doraInds:[],uraInds:[],doraPile:[],rinshan:[],rinshanIdx:6,kanDoraCount:0,lightMode:false,lightUserIdx:null,lightRevealedSlots:{},lightRevealedHand:{},stealMode:false,mineSlots:[],mineRinshanIdxs:[],mineOwners:{},mineRinshanOwners:{},mineCount:0,penDrawings:{},
     dealer:Math.floor(Math.random()*numPlayers),current:0,roundNum:1,roundWind:'東',honba:0,riichiPot:0,
     pendingRiichi:null,riichiValidIdx:null,
     phase:'idle',firstRound:true,log:[],savedScores:null,_dealerWon:false};
  startRound();
  // 自分（ホスト = playerIdx 0）の peerId をセット
  if(G.players[NET.myIdx]) G.players[NET.myIdx].peerId = NET.peer?.id || '';
  rebuildSeats();
  syncSeatIndices();
  broadcastState();
  if(amIHost()) startSyncBroadcast();
}

// ── Solo mode ─────────────────────────────────────────────────
function selectCount(n){
  numPlayers=n;
  document.querySelectorAll('#lobbySolo .pcnt-btn').forEach((b,i)=>b.classList.toggle('active',i===n-2));
}

function initGame(){
  bgmToGame(); NET.online=false;
  document.getElementById('lobby').style.display='none';
  document.getElementById('gameScreen').classList.add('active');
  scaleTable();
  G={players:[],deck:[],deckSlots:[],doraInds:[],uraInds:[],doraPile:[],rinshan:[],rinshanIdx:6,kanDoraCount:0,lightMode:false,lightUserIdx:null,lightRevealedSlots:{},lightRevealedHand:{},stealMode:false,mineSlots:[],mineRinshanIdxs:[],mineOwners:{},mineRinshanOwners:{},mineCount:0,penDrawings:{},
     dealer:Math.floor(Math.random()*numPlayers),current:0,roundNum:1,roundWind:'東',honba:0,riichiPot:0,
     pendingRiichi:null,riichiValidIdx:null,
     phase:'idle',firstRound:true,log:[],savedScores:null,_dealerWon:false};
  startRound();
}

function makePlayer(id,dealer){
  const onlineNames=[PROFILE.name||'あなた', NET.guestNames[0]||'フレンド', NET.guestNames[1]||'CPU西', NET.guestNames[2]||'CPU北'];
  const soloNames=[PROFILE.name||'あなた','CPU南','CPU西','CPU北'];
  const pname=NET.online?onlineNames[id]:soloNames[id];
  const cpuAbilities=['mine','light','yami','haku','sanctuary','pinzu','steal'];
  const pAbility = !G_ABILITY_MODE ? '' : (id===NET.myIdx) ? (PROFILE.ability||'') : (NET.isHost && NET.guestAbilities[id-1]!==undefined) ? NET.guestAbilities[id-1] : cpuAbilities[Math.floor(Math.random()*cpuAbilities.length)];
  
  // アイコンIDはゲーム開始後に myName 受信時に上書きされるため、ここでは暫定値のみ
  const pIconId = (id === NET.myIdx) ? (PROFILE.iconId || '') : '';

  return{id,name:pname,iconId:pIconId,
    peerId:'', // 接続PeerID（オンライン時に設定）
    wind:WINDS[id],hand:[],melds:[],discards:[],kitaTiles:[],kitaCount:0,
    score:0,isDealer:dealer,riichi:false,doubleRiichi:false,openRiichi:false,
    ippatsu:false,isTenhou:false,isChiihou:false,isRenhou:false,
    isHaite:false,isRinshanKaihou:false,isChankan:false,
    drawnTile:null,tenpai:false,waits:[],riichiDiscardIdx:-1,kanCount:0,yamiTileIdx:-1,hakuTileId:null,
    ability:pAbility, abilityUsed:false,
};
}

function startRound(){ _wallCanvasInited=false; _doraCanvasInited=false; timerStop(); _timerAutoActFired=false; _timerDebt=0;
  // 前局の白変換を元に戻す（players再生成前に処理）
  if(G.players){
    G.players.forEach(p=>{
      if(p.hakuTileId!=null){
        const hi=p.hand.findIndex(t=>t._id===p.hakuTileId);
        if(hi>=0&&p.hand[hi]&&p.hand[hi]._hakuOriginal){
          const orig=p.hand[hi]._hakuOriginal;
          p.hand[hi].suit=orig.suit;p.hand[hi].num=orig.num;
          delete p.hand[hi]._hakuOriginal;delete p.hand[hi]._isHaku;
        }
        p.hakuTileId=null;
      }
    });
  }

  // ── ペン描画: 旧局のデータを引き継ぐ（_pkeyベースなのでそのまま有効）
  const _prevPenDrawings = G.penDrawings ? Object.assign({}, G.penDrawings) : {};

  const fullDeck=buildDeck();
  G.phase='dealing';
  selIdx=-1;
  G.pendingRiichi=null;
  G.riichiValidIdx=null;

  // Carve dora pile: 15 tiles from the END of the deck
  // Layout: [0]=表ドラ表示牌 [1-3]=カンドラ表示牌×3 [4-7]=裏ドラ表示牌×4 [8-14]=嶺上牌×7
  G.doraPile = fullDeck.splice(fullDeck.length - 15, 15);
  G.doraInds = [G.doraPile[0]];
  G.uraInds  = [G.doraPile[4]];
  G.kanDoraCount = 0;
  G.rinshan = G.doraPile.slice(8);
  G.rinshanIdx = 0;
  G.deckSlots = fullDeck.slice();
  G.deck = fullDeck;

  // ── ペン描画: 引き継ぎ（_pkeyそのままなのでコピーのみ）
  G.penDrawings = _prevPenDrawings;
  Object.keys(_penImgCache).forEach(k=>delete _penImgCache[k]);

  G.players=Array.from({length:numPlayers},(_,i)=>{
    const p=makePlayer(i,i===G.dealer);
    p.wind=WINDS[(i-G.dealer+numPlayers)%numPlayers];
    if(G.savedScores)p.score=G.savedScores[i]||0;
    return p;
  });
  rebuildSeats();   // G.seats を G.players から構築
  syncSeatIndices(); // G.players[i].seatIdx = i

  for(const p of G.players){
    for(let i=0;i<(p.isDealer?5:4);i++)p.hand.push(G.deck.pop());
    p.hand=sortTiles(p.hand);
    updateTenpai(p);
  }

  // deckSlots を配牌後の deck と同期（配牌分を除去）
  G.deckSlots = G.deck.slice();

  G.mineSlots=[];
  G.mineRinshanIdxs=[];
  G.mineOwners={};
  G.mineRinshanOwners={};
  G.mineCount=0;
  G.minePlantMode=false;
  G._mineHit=null;
  G.yamiSelectMode=false;
  G.stealMode=false;
  G.hakuSelectMode=false;
  // プレイヤーごとの能力使用フラグをリセット
  if(G.players)G.players.forEach(p=>{p.abilityUsed=false;p._cpuNextYami=false;});
  // 白変換リセットはstartRound冒頭で実施済み
  G.lightMode=false;   // 'wall'|'hand'|false
  G.lightUserIdx=null;
  G.lightRevealedSlots={};  // slotIdx->true for revealed wall tiles
  G.lightRevealedHand={};   // 'pidx_handIdx'->true

  const dealer=G.players[G.dealer];
  if(canWin(dealer.hand))dealer.isTenhou=true;

  G.current=G.dealer;
  G.phase='discard';
  G.firstRound=true;

  // SFX.gameStart();
  addLog(`=== ${G.roundWind}${G.roundNum}局${G.honba>0?` ${G.honba}本場`:''} 開始 ===`,'log-win');
  addLog(`${dealer.name}（親）の番です。`,'log-new');
  cpuPlantMines(); // CPU地雷能力: 1巡目に即設置
  renderAll();
  broadcastState();
  // 親が自分ならタイマー起動（nextTurnを経由しないため）
  if(G.current===NET.myIdx) timerOnMyTurn();
  if(!NET.online&&G.current!==0)setTimeout(cpuAction,900);
  // オンラインホスト: ゲストの番ならCPUを呼ばない
  if(NET.online&&amIHost()&&G.current!==NET.myIdx&&!isOnlineGuestIdx(G.current))setTimeout(cpuAction,900);
}

// ============================================================
