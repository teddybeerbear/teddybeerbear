// TILE SYSTEM
// ============================================================
const SUITS={man:[1,9],pin:[1,2,3,4,5,6,7,8,9],sou:[1,2,3,4,5,6,7,8,9]};
const HONORS=['東','南','西','北','白','発','中'];
const WINDS=['東','南','西','北'];
const EMJ={
  man:{1:'🀇',9:'🀏'},
  pin:{1:'🀙',2:'🀚',3:'🀛',4:'🀜',5:'🀝',6:'🀞',7:'🀟',8:'🀠',9:'🀡'},
  sou:{1:'🀐',2:'🀑',3:'🀒',4:'🀓',5:'🀔',6:'🀕',7:'🀖',8:'🀗',9:'🀘'},
  honor:{'東':'🀀','南':'🀁','西':'🀂','北':'🀃','白':'🀆','発':'🀅','中':'🀄'},
};
const TILE_IMG={
    man:{1:'https://raw.githubusercontent.com/teddybeerbear/teddybeerbear/main/hai/manzu1.png',9:'https://raw.githubusercontent.com/teddybeerbear/teddybeerbear/main/hai/manzu9.png'},
    pin:{1:'https://raw.githubusercontent.com/teddybeerbear/teddybeerbear/main/hai/pinzu1.png',2:'https://raw.githubusercontent.com/teddybeerbear/teddybeerbear/main/hai/pinzu2.png',3:'https://raw.githubusercontent.com/teddybeerbear/teddybeerbear/main/hai/pinzu3.png',4:'https://raw.githubusercontent.com/teddybeerbear/teddybeerbear/main/hai/pinzu4.png',5:'https://raw.githubusercontent.com/teddybeerbear/teddybeerbear/main/hai/pinzu5.png',6:'https://raw.githubusercontent.com/teddybeerbear/teddybeerbear/main/hai/pinzu6.png',7:'https://raw.githubusercontent.com/teddybeerbear/teddybeerbear/main/hai/pinzu7.png',8:'https://raw.githubusercontent.com/teddybeerbear/teddybeerbear/main/hai/pinzu8.png',9:'https://raw.githubusercontent.com/teddybeerbear/teddybeerbear/main/hai/pinzu9.png'},
    sou:{1:'https://raw.githubusercontent.com/teddybeerbear/teddybeerbear/main/hai/souzu1.png',2:'https://raw.githubusercontent.com/teddybeerbear/teddybeerbear/main/hai/souzu2.png',3:'https://raw.githubusercontent.com/teddybeerbear/teddybeerbear/main/hai/souzu3.png',4:'https://raw.githubusercontent.com/teddybeerbear/teddybeerbear/main/hai/souzu4.png',5:'https://raw.githubusercontent.com/teddybeerbear/teddybeerbear/main/hai/souzu5.png',6:'https://raw.githubusercontent.com/teddybeerbear/teddybeerbear/main/hai/souzu6.png',7:'https://raw.githubusercontent.com/teddybeerbear/teddybeerbear/main/hai/souzu7.png',8:'https://raw.githubusercontent.com/teddybeerbear/teddybeerbear/main/hai/souzu8.png',9:'https://raw.githubusercontent.com/teddybeerbear/teddybeerbear/main/hai/souzu9.png'},
    honor:{'東':'https://raw.githubusercontent.com/teddybeerbear/teddybeerbear/main/hai/zihai1.png','南':'https://raw.githubusercontent.com/teddybeerbear/teddybeerbear/main/hai/zihai2.png','西':'https://raw.githubusercontent.com/teddybeerbear/teddybeerbear/main/hai/zihai3.png','北':'https://raw.githubusercontent.com/teddybeerbear/teddybeerbear/main/hai/zihai4.png','発':'https://raw.githubusercontent.com/teddybeerbear/teddybeerbear/main/hai/zihai5.png','中':'https://raw.githubusercontent.com/teddybeerbear/teddybeerbear/main/hai/zihai6.png'},
  };
  
  // 牌画像プリロード
  const _imageCache = new Map();
  function preloadTileImages() {
    const allUrls = new Set();
    
    // man, pin, sou, honor から全URL収集
    Object.values(TILE_IMG).forEach(suit => {
      if (typeof suit === 'object') {
        Object.values(suit).forEach(url => allUrls.add(url));
      }
    });
    
    // 全画像を非同期でプリロード
    allUrls.forEach(url => {
      if (!_imageCache.has(url)) {
        const img = new Image();
        img.src = url;
        _imageCache.set(url, img);
      }
    });
  }
  
  // ページ読み込み完了後にプリロード開始
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', preloadTileImages);
  } else {
    preloadTileImages();
  }
  function emj(t){
    if(!t)return'?';
    
    if(t.suit==='honor'){
      if(t.num==='白')return '';
      const url=TILE_IMG.honor[t.num];
      if(url)return `<img src="${url}" class="tile-img" alt="${t.num}">`;
      return EMJ.honor[t.num]||t.num;
    }
    const url=TILE_IMG[t.suit]&&TILE_IMG[t.suit][t.num];
    if(url)return `<img src="${url}" class="tile-img" alt="${t.suit}${t.num}">`;
    return EMJ[t.suit]&&EMJ[t.suit][t.num]||`${t.num}`;
  }
function tc(t){if(!t)return'';return t.suit==='honor'?'honor':t.suit;}
function tk(t){return`${t.suit}_${t.num}`;}
function teq(a,b){return a.suit===b.suit&&a.num===b.num;}
let _tileIdSeq=0;
function mt(suit,num){return{suit,num,_id:_tileIdSeq++};}
function sortTiles(tiles){
  const so={man:0,pin:1,sou:2,honor:3};
  const ho={'東':0,'南':1,'西':2,'��':3,'白':4,'発':5,'中':6};
  return[...tiles].sort((a,b)=>{
    if(so[a.suit]!==so[b.suit])return so[a.suit]-so[b.suit];
    const an=typeof a.num==='number'?a.num:ho[a.num];
    const bn=typeof b.num==='number'?b.num:ho[b.num];
    return an-bn;
  });
}
function buildDeck(){
  const tiles=[];
  for(const[suit,nums]of Object.entries(SUITS))
    for(const num of nums)for(let c=0;c<4;c++){const t=mt(suit,num);t._pkey=suit+'_'+num+'_'+c;tiles.push(t);}
  for(const h of HONORS)for(let c=0;c<4;c++){const t=mt('honor',h);t._pkey='honor_'+h+'_'+c;tiles.push(t);}
  for(let i=tiles.length-1;i>0;i--){const j=Math.floor(Math.random()*(i+1));[tiles[i],tiles[j]]=[tiles[j],tiles[i]];}
  return tiles;
}

// ============================================================
// WIN DETECTION
// ============================================================
function cntMap(tiles){const m={};for(const t of tiles){const k=tk(t);m[k]=(m[k]||0)+1;}return m;}

function canDecompose(tiles){
  if(tiles.length===0)return true;
  if(tiles.length%3!==0)return false;
  const sorted=sortTiles(tiles);
  const first=sorted[0];
  const rest=sorted.slice(1);
  // triplet
  const i2=rest.findIndex(t=>teq(t,first));
  if(i2>=0){
    const r2=[...rest];r2.splice(i2,1);
    const i3=r2.findIndex(t=>teq(t,first));
    if(i3>=0){const r3=[...r2];r3.splice(i3,1);if(canDecompose(r3))return true;}
  }
  // sequence
  if(first.suit!=='honor'&&typeof first.num==='number'){
    const n2=first.num+1,n3=first.num+2,s=first.suit;
    const j2=rest.findIndex(t=>t.suit===s&&t.num===n2);
    if(j2>=0){
      const r2=[...rest];r2.splice(j2,1);
      const j3=r2.findIndex(t=>t.suit===s&&t.num===n3);
      if(j3>=0){const r3=[...r2];r3.splice(j3,1);if(canDecompose(r3))return true;}
    }
  }
  return false;
}

// isStdWin: 手牌が「対子1+面子n」の形か判定
// ポンなどで手牌が減った場合も対応: 2枚(対子のみ), 5枚(対子+刻子/順子), 等
function isStdWin(hand){
  const len=hand.length;
  // 有効な手牌長: 2, 5 (面子0個or1個が手牌内にある場合)
  // ポン×1で手牌2枚(対子), ポン×0で手牌5枚(対子+面子)
  if(len!==2&&len!==5)return false;
  for(let i=0;i<hand.length;i++)for(let j=i+1;j<hand.length;j++){
    if(teq(hand[i],hand[j])){
      const rest=hand.filter((_,idx)=>idx!==i&&idx!==j);
      if(canDecompose(rest))return true;
    }
  }
  return false;
}
function isZiiso(hand){return hand.every(t=>t.suit==='honor')&&isStdWin(hand);}
function isChinroutou(hand){
  const T=new Set(['man_1','man_9','pin_1','pin_9','sou_1','sou_9']);
  return hand.every(t=>T.has(tk(t)))&&isStdWin(hand);
}
function isRyuuiisou(hand){
  const G2=new Set(['sou_2','sou_3','sou_4','sou_6','sou_8','honor_発']);
  return hand.every(t=>G2.has(tk(t)))&&isStdWin(hand);
}
function isKokushi(hand){
  const req=['honor_東','honor_南','honor_西','honor_北','honor_中'];
  if(hand.length!==5)return false;
  return JSON.stringify(hand.map(tk).sort())===JSON.stringify([...req].sort());
}
function hasAnkou(hand){return Object.values(cntMap(hand)).some(v=>v>=3);}
function isToitoiHand(hand){
  // 5枚の手牌が 対子1+刻子1 の形か判定（トイトイ形）
  const cnt=cntMap(hand);
  const vals=Object.values(cnt);
  if(hand.length===5){
    // 対子(2)+刻子(3) の形
    const pairs=vals.filter(v=>v===2).length;
    const trips=vals.filter(v=>v===3).length;
    return pairs===1&&trips===1;
  }
  if(hand.length===2){
    // ポン後2枚 = 対子のみ → toitoi形とみなす
    return vals.length===1&&vals[0]===2;
  }
  return false;
}
function canWin(hand){
  // 有効な手牌長: 2(ポン2回後), 5(鳴きなし)
  if(hand.length!==2&&hand.length!==5)return false;
  return isStdWin(hand)||isZiiso(hand)||isChinroutou(hand)||isRyuuiisou(hand)||isKokushi(hand);
}

// ============================================================
// TENPAI
// ============================================================
const ALL_TYPES=(()=>{
  const t=[];
  for(const[s,ns]of Object.entries(SUITS))for(const n of ns)t.push(mt(s,n));
  for(const h of HONORS)t.push(mt('honor',h));
  return t;
})();

// getWaits: 手牌n枚(ツモ前)からテンパイ待ち牌を列挙
// 通常: 4枚 → 1枚引いて5枚で上がり
// ポン1回後: 1枚 → 1枚引いて2枚で上がり
function getWaits(handN){
  // 有効なテンパイ手牌長: 4(鳴きなし) or 1(ポン×2後)
  if(handN.length!==4&&handN.length!==1)return[];
  const w=[];
  for(const t of ALL_TYPES){
    const test=[...handN,t];
    if(canWin(test)&&!w.some(x=>teq(x,t)))w.push(t);
  }
  return w;
}

function updateTenpai(p){
  const wasTenpai=p.tenpai;
  const len=p.hand.length;
  if(len===4||len===1){
    p.waits=getWaits(p.hand);p.tenpai=p.waits.length>0;
  }else if(len===5){
    let w=[];
    for(let i=0;i<p.hand.length;i++){
      const test=p.hand.filter((_,j)=>j!==i);
      const ww=getWaits(test);
      if(ww.length>0){w=ww;break;}
    }
    p.tenpai=w.length>0;p.waits=w;
  }else if(len===2){
    p.tenpai=canWin(p.hand);
    p.waits=p.tenpai?[]:[];
  }else{p.tenpai=false;p.waits=[];}
  // SFX.tenpai(); (要件外)
}

function getRiichiDiscards(hand5){
  const v=[];
  for(let i=0;i<hand5.length;i++){
    const after=hand5.filter((_,j)=>j!==i);
    if(getWaits(after).length>0)v.push(i);
  }
  return v;
}

// 両面待ち判定: winTile が両面形（kk+1 または kk-1）での上がりか
function isTwoSidedWait(hand5,winTile){
  if(winTile.suit==='honor')return false; // 字牌は両面不可
  // hand5からwinTileを1枚取り除いた4枚で、winTileを含む順子を試す
  const h4=[];let removed=false;
  for(const t of hand5){if(!removed&&teq(t,winTile)){removed=true;}else h4.push(t);}
  // 残り4枚の中に winTile±1 の連続2枚があり、その片方が winTile でできる順子を確認
  for(let i=0;i<h4.length-1;i++){
    for(let j=i+1;j<h4.length;j++){
      const a=h4[i],b=h4[j];
      if(a.suit!==b.suit||a.suit==='honor')continue;
      const lo=Math.min(a.num,b.num),hi=Math.max(a.num,b.num);
      if(hi-lo!==1)continue; // 連続2枚のみ
      // winTile + この2枚で順子になるか
      const nums=[lo,hi,winTile.num].sort((x,y)=>x-y);
      if(nums[0]+1===nums[1]&&nums[1]+1===nums[2]&&winTile.suit===a.suit){
        // 両面か確認: winTile が端でないこと（辺張・嵌張でない）
        const seqLo=nums[0],seqHi=nums[2];
        const isEdge=(seqLo===1&&winTile.num===3)||(seqHi===9&&winTile.num===7);
        const isKanchan=(winTile.num===nums[1]); // 嵌張
        if(!isEdge&&!isKanchan)return true;
      }
    }
  }
  return false;
}

// ============================================================
// YAKU EVALUATION
// ============================================================
function isTankiWait(hand5,winTile){
  // 単騎待ち: 対子+刻子の形で、対子部分がwinTileと一致
  const cnt=cntMap(hand5);
  for(const[k,v]of Object.entries(cnt)){
    if(v===2){
      const[s,n]=k.split('_');
      const pair=mt(s,isNaN(n)?n:+n);
      if(teq(pair,winTile))return true;
    }
  }
  return false;
}

function evalYaku(hand5,winTile,isTsumo,player,roundWind){
  const yakus=[];
  const melds=player.melds||[];
  const isMenzen=melds.length===0;

  // 全牌を集める（手牌5枚 + 鳴いた牌）
  const allTiles=[...hand5,...melds.flatMap(m=>m.tiles||[])];

  // Yakuman (複合役満を累積する)
  const ymList=[];
  if(player.isTenhou)ymList.push({name:'天和',han:26});
  if(player.isChiihou)ymList.push({name:'地和',han:13});
  if(player.isRenhou)ymList.push({name:'人和',han:13});
  if(isZiiso(allTiles))ymList.push({name:'字一色',han:13});
  if(isChinroutou(allTiles))ymList.push({name:'チンロウトウ',han:13});
  if(isRyuuiisou(allTiles))ymList.push({name:'緑一色',han:13});
  if(isKokushi(hand5))ymList.push({name:'国士無双（東南西北中）',han:13});
  const meldTypes=melds.map(m=>m.type);
  const kanCount=meldTypes.filter(t=>['ankan','minkan','kakan'].includes(t)).length;
  if(kanCount>=1)ymList.push({name:'一槓子',han:13});
  // 一暗刻: 門前トイトイ形。ツモなら一暗刻/一暗刻単騎。ロンは単騎のみ
  if(isToitoiHand(hand5)&&isMenzen){
    const isTanki=isTankiWait(hand5,winTile);
    if(isTsumo){
      ymList.push({name:isTanki?'一暗刻単騎':'一暗刻',han:isTanki?26:13});
    } else if(isTanki){
      ymList.push({name:'一暗刻単騎',han:26});
    }
  }
  if(ymList.length>0){
    // 重複排除（天和+地和など同時には入らないが念のため）
    const totalHan=ymList.reduce((s,y)=>s+y.han,0);
    // 複合なら合計表示、単独ならそのまま
    if(ymList.length>1){
      ymList.forEach(y=>yakus.push(y));
      // hanを合算した上で返す（calcScoreはyakusのhanを合算する）
    } else {
      yakus.push(ymList[0]);
    }
    return yakus;
  }

  // Normal
  if(player.riichi){
    if(player.doubleRiichi&&player.openRiichi)yakus.push({name:'ダブルオープンリーチ',han:3});
    else if(player.doubleRiichi)yakus.push({name:'ダブルリーチ',han:2});
    else if(player.openRiichi){
      if(player._openRiichiRon){
        yakus.push({name:'オープンリーチ振り込み',han:13});return yakus;
      }
      yakus.push({name:'オープンリーチ',han:2});
    }
    else yakus.push({name:'リーチ',han:1});
  }
  if(player.ippatsu)yakus.push({name:'一発',han:1});
  if(isTsumo&&isMenzen)yakus.push({name:'ツモ',han:1});

  const cnt=cntMap(hand5);
  const allCnt=cntMap(allTiles);
  const isTanyao=allTiles.every(t=>t.suit!=='honor'&&t.suit!=='man'&&t.num>=2&&t.num<=8);
  if(isTanyao)yakus.push({name:'タンヤオ',han:1});

  const yakuhais=[...new Set(['白','発','中',player.wind,roundWind])];
  for(const yh of yakuhais){
    const k=`honor_${yh}`;
    if((cnt[k]||0)>=3)yakus.push({name:`役牌（${yh}）`,han:1});
    // 鳴いた役牌と手牌の役牌を合わせてカウント
    const allCntYh=(allCnt[k]||0);
    const inMelds=melds.filter(m=>m.tiles.some(t=>t.suit==='honor'&&t.num===yh)).length;
    if(inMelds>0&&allCntYh>=3)yakus.push({name:`役牌（${yh}）鳴き`,han:1});
  }

  // 平和: 門前・雀頭が数字牌・残り3枚が順子のみ・両面待ち（ツモも可）
  if(isMenzen&&hand5.length===5){
    let pair=null;
    for(const[k,v]of Object.entries(cnt))if(v===2){const[s,n]=k.split('_');pair=mt(s,isNaN(n)?n:+n);}
    if(pair&&pair.suit!=='honor'){
      const rest=hand5.filter(t=>!teq(t,pair));
      const rc=cntMap(rest);
      // 残り3枚が全て順子（刻子なし）+ canDecompose
      const noTriplet=!Object.values(rc).some(v=>v>=3);
      if(noTriplet&&rest.length===3&&canDecompose(rest)){
        const isTwoSided=isTwoSidedWait(hand5,winTile);
        if(isTwoSided)yakus.push({name:'平和',han:1});
      }
    }
  }

  // Chanta / Junchan: 各面子ブロックに端牌/字牌が含まれるかを面子分解してチェック
  {
    const hasTO=t=>t.suit==='honor'||t.num===1||t.num===9;
    // 手牌5枚から全面子分解を試みる
    function decomposeMentsu(tiles){
      const results=[];
      function _try(rest,blocks){
        if(rest.length===0){results.push(blocks);return;}
        const sorted=sortTiles(rest);
        const first=sorted[0];
        const rem=sorted.slice(1);
        // 刻子
        const i2=rem.findIndex(t=>teq(t,first));
        if(i2>=0){const r2=[...rem];r2.splice(i2,1);const i3=r2.findIndex(t=>teq(t,first));if(i3>=0){const r3=[...r2];r3.splice(i3,1);_try(r3,[...blocks,[first,first,first]]);}}
        // 順子
        if(first.suit!=='honor'&&typeof first.num==='number'){
          const n2=first.num+1,n3=first.num+2,s=first.suit;
          const j2=rem.findIndex(t=>t.suit===s&&t.num===n2);
          if(j2>=0){const r2=[...rem];r2.splice(j2,1);const j3=r2.findIndex(t=>t.suit===s&&t.num===n3);if(j3>=0){const r3=[...r2];r3.splice(j3,1);_try(r3,[...blocks,[first,{suit:s,num:n2},{suit:s,num:n3}]]);}}
        }
      }
      // hand5は対子+面子: 対子を先に抜く
      for(let i=0;i<tiles.length;i++)for(let j=i+1;j<tiles.length;j++){
        if(teq(tiles[i],tiles[j])){
          const pair=[tiles[i],tiles[j]];
          const rest3=tiles.filter((_,k)=>k!==i&&k!==j);
          _try(rest3,[pair]);
        }
      }
      return results;
    }
    const decomps=decomposeMentsu(hand5);
    if(decomps.length>0){
      // meld面子ブロック（tiles配列）
      const meldBlocks=melds.map(m=>m.tiles||[]);
      for(const blocks of decomps){
        const allBlocks=[...blocks,...meldBlocks];
        const allHaveTO=allBlocks.every(b=>b.some(hasTO));
        if(allHaveTO&&!isZiiso(allTiles)){
          const hasH=allTiles.some(t=>t.suit==='honor');
          if(!hasH){if(isMenzen)yakus.push({name:'純チャン',han:3});else yakus.push({name:'鳴き純チャン',han:2});}
          else{if(isMenzen)yakus.push({name:'チャンタ',han:2});else yakus.push({name:'鳴きチャンタ',han:1});}
          break;
        }
      }
    }
  }

  // Toitoi - 全牌（手牌+鳴いた牌）で判定
  const allTP=Object.values(allCnt).every(v=>v===2||v===3)&&
    Object.values(allCnt).filter(v=>v===2).length===1&&Object.values(allCnt).filter(v=>v>=3).length===1;
  const mAllT=melds.every(m=>['pon','ankan','minkan','kakan'].includes(m.type));
  if(allTP&&mAllT)yakus.push({name:'トイトイ',han:2});

  // Shousangen
  const dcnt=(['白','発','中'].map(d=>cnt[`honor_${d}`]||0)).reduce((a,b)=>a+b,0);
  if(dcnt>=4)yakus.push({name:'小三元',han:2});

  // Honitsu / Chinitsu
  const numSuits=new Set(allTiles.filter(t=>t.suit!=='honor').map(t=>t.suit));
  const hasHon=allTiles.some(t=>t.suit==='honor');
  if(numSuits.size===1&&!hasHon){if(isMenzen)yakus.push({name:'清一色',han:6});else yakus.push({name:'鳴き清一色',han:5});}
  else if(numSuits.size===1&&hasHon){if(isMenzen)yakus.push({name:'ホンイツ',han:3});else yakus.push({name:'鳴きホンイツ',han:2});}

  if(player.isHaite){if(isTsumo)yakus.push({name:'ハイテイ',han:1});else yakus.push({name:'ホウテイ',han:1});}
  if(player.isRinshanKaihou)yakus.push({name:'嶺上開花',han:1});
  if(player.isChankan)yakus.push({name:'槍槓',han:1});

  const seen=new Set();
  return yakus.filter(y=>{if(seen.has(y.name))return false;seen.add(y.name);return true;});
}

function calcScore(yakus,isDealer,isTsumo){
  const han=yakus.reduce((s,y)=>s+y.han,0);
  // 役満かどうかはyakusの中に役満(han>=13)があるかで判定
  const isYakuman=yakus.some(y=>y.han>=13);
  let score;
  if(isYakuman){
    // 役満倍数: 役満役のhanを合算して判定
    const ymHan=yakus.filter(y=>y.han>=13).reduce((s,y)=>s+y.han,0);
    if(ymHan>=52)score=520;
    else if(ymHan>=39)score=390;
    else if(ymHan>=26)score=260;
    else score=130; // 役満
  } else {
    score=Math.min(han*10, 130); // 1翻=10点、上限130点（役満相当）
  }
  // 親子同点
  return{score,han};
}

function doraFromIndicator(ind){
  if(ind.suit==='honor'){
    const ws=['東','南','西','北'];const ds=['白','発','中'];
    const wi=ws.indexOf(ind.num);if(wi>=0)return mt('honor',ws[(wi+1)%4]);
    const di=ds.indexOf(ind.num);if(di>=0)return mt('honor',ds[(di+1)%3]);
  }
  const nums=SUITS[ind.suit];
  return mt(ind.suit,nums[(nums.indexOf(ind.num)+1)%nums.length]);
}

// ============================================================
