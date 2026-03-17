// PROFILE  (localStorage)
// ============================================================
let PROFILE = {name:'プレイヤー', ability:'', abilities:[], totalPulls:0, coins:0};
let G_ABILITY_MODE = true; // 能力あり/なし
let G_TIME_MODE    = false; // 制限時間モード

function _applyProfile(){
  // ペン能力は最初から所持
  // デバッグ: 全能力を初期付与
  const _allAbs=['pen','mine','light','yami','haku','sanctuary','pinzu','steal'];
  _allAbs.forEach(a=>{if(!PROFILE.abilities.includes(a))PROFILE.abilities.push(a);});
  const ni=document.getElementById('profileName');
  if(ni) ni.value=PROFILE.name||'';
  const _id=document.getElementById('iconDisplay');
  if(_id) updateIconDisplay(_id);
  if(PROFILE.ability) pickAbility(PROFILE.ability);
  document.querySelectorAll('#abilityList .ability-card').forEach(el=>{
    el.classList.toggle('selected', el.dataset.ability===(PROFILE.ability||''));
  });
  updateProfileBadge();
}

function loadProfile(){
  // まずlocalStorageから読み込んで即時反映
  try{
    const s=localStorage.getItem('mjProfile');
    if(s){
      const p=JSON.parse(s);
      PROFILE=Object.assign({abilities:[],totalPulls:0,coins:0},p);
    }
  }catch(e){}
  _applyProfile();

  // サーバーから最新データを取得して上書き（Neon PostgreSQL連携）
  fetch('/api/profile')
    .then(r=>{ if(!r.ok) throw new Error('not ok'); return r.json(); })
    .then(data=>{
      PROFILE=Object.assign(PROFILE, {
        coins:      data.coins      ?? PROFILE.coins,
        abilities:  data.abilities  ?? PROFILE.abilities,
        totalPulls: data.totalPulls ?? PROFILE.totalPulls,
        gachaIcons: data.gachaIcons ?? PROFILE.gachaIcons,
        iconId:     data.iconId     ?? PROFILE.iconId,
        ability:    data.ability    ?? PROFILE.ability,
        name:       data.name       || PROFILE.name,
      });
      try{ localStorage.setItem('mjProfile',JSON.stringify(PROFILE)); }catch(e){}
      _applyProfile();
    })
    .catch(()=>{ /* サーバー未接続時はlocalStorageのデータをそのまま使う */ });
}

function selectIcon(el,icon){ } // legacy (emoji icons removed)

function updateIconDisplay(el){
  if(!el) return;
  if(PROFILE.iconId){
    el.innerHTML='';
    el.style.fontSize='';
    el.style.color='';
    const img=document.createElement('img');
    img.src=gachaIconUrl(PROFILE.iconId);
    img.style.cssText='width:64px;height:90px;object-fit:contain;border-radius:8px;';
    el.appendChild(img);
  } else {
    el.innerHTML='';
    el.style.fontSize='.55rem';
    el.style.color='#3a5a4a';
    el.textContent='未設定';
  }
}

function toggleIconPopup(){
  openIconCollection();
}

// ============================================================
// ICON COLLECTION SCREEN
// ============================================================
function openIconCollection(){
  document.getElementById('profileScreen').classList.remove('active');
  document.getElementById('iconCollectionScreen').classList.add('active');
  renderIconCollection();
}

function closeIconCollection(){
  document.getElementById('iconCollectionScreen').classList.remove('active');
  document.getElementById('profileScreen').classList.add('active');
  // refresh icon display after returning
  const _id=document.getElementById('iconDisplay');
  if(_id) updateIconDisplay(_id);
}

function renderIconCollection(){
  const content=document.getElementById('iconCollectionContent');
  if(!content) return;
  const owned=new Set(PROFILE.gachaIcons||[]);
  const equippedId=PROFILE.iconId||'';

  const rarityOrder=['legend','epic','rare','normal'];
  const rarityMeta={
    legend:{label:'LEGEND', color:'#ffd700', bg:'#1a0e00', border:'#ffd700', labelBg:'#2a1800'},
    epic:  {label:'EPIC',   color:'#cc66ff', bg:'#18081a', border:'#8833aa', labelBg:'#1a0820'},
    rare:  {label:'RARE',   color:'#8888ff', bg:'#0a0a24', border:'#3333aa', labelBg:'#0a0a1a'},
    normal:{label:'NORMAL', color:'#5a8a7a', bg:'#0a1a14', border:'#2a4a3a', labelBg:'#081410'},
  };

  let html='';
  for(const rarity of rarityOrder){
    const icons=GACHA_ICONS.filter(i=>i.rarity===rarity);
    const m=rarityMeta[rarity];
    const ownedCount=icons.filter(i=>owned.has(i.id)).length;
    html+=`<div class="icon-col-rarity-section">
      <div class="icon-col-rarity-label" style="color:${m.color};background:${m.labelBg};border:1px solid ${m.border};">${m.label}</div>
      <div class="icon-col-owned-count">${ownedCount} / ${icons.length} 所持</div>
      <div class="icon-col-grid">`;
    for(const icon of icons){
      const isOwned=owned.has(icon.id);
      const isEq=equippedId===icon.id;
      html+=`<div class="icon-col-card ${isOwned?'owned':'unowned'} ${isEq?'equipped-card':''}" style="background:${m.bg};border-color:${isEq?'#ffd700':m.border};" ${isOwned?`onclick="pickGachaIconFromCollection('${icon.id}')"`:''}>
        ${isOwned
          ?`<img src="${gachaIconUrl(icon.id)}" alt="${icon.id}">`
          :`<div class="ic-question">？</div>`}
        <div class="ic-label" style="color:${m.color};">${isOwned?icon.label:'???'}</div>
        ${isEq?'<div class="ic-equip-badge">装備中</div>':''}
      </div>`;
    }
    html+=`</div></div>`;
  }
  content.innerHTML=html;
}

function pickGachaIconFromCollection(id){
  if(!PROFILE.gachaIcons||!PROFILE.gachaIcons.includes(id)) return;
  PROFILE.iconId=id;
  try{ localStorage.setItem('mjProfile',JSON.stringify(PROFILE)); }catch(e){}
  updateProfileBadge();
  closeIconCollection();
}

function renderProfileGachaIcons(){
  const grid=document.getElementById('profileGachaIconGrid');
  const noIcon=document.getElementById('profileGachaNoIcon');
  if(!grid) return;
  const owned=PROFILE.gachaIcons||[];
  if(owned.length===0){
    grid.innerHTML='';
    if(noIcon) noIcon.style.display='';
    return;
  }
  if(noIcon) noIcon.style.display='none';
  const equippedId=PROFILE.iconId||'';
  let html='';
  for(const id of owned){
    const info=GACHA_ICONS.find(i=>i.id===id);
    const rdKey=id.startsWith('L')?'legend':id.startsWith('E')?'epic':id.startsWith('R')?'rare':'normal';
    const rd=RARITY_TABLE.find(r=>r.rarity===rdKey)||RARITY_TABLE[3];
    const isEq=equippedId===id;
    html+=`<div onclick="pickGachaIcon('${id}');renderProfileGachaIcons();" style="cursor:pointer;text-align:center;border:2px solid ${isEq?'#ffd700':rd.border};border-radius:8px;padding:3px;background:${rd.bg};position:relative;">
      <img src="${gachaIconUrl(id)}" style="width:80px;height:112px;object-fit:contain;border-radius:6px;display:block;margin:0 auto;" alt="${id}">
      <div style="font-size:.42rem;color:${rd.color};margin-top:1px;">${info?info.label:id}</div>
      ${isEq?'<div style="position:absolute;top:2px;right:3px;font-size:.4rem;background:#2a1a00;color:#ffd700;border-radius:3px;padding:1px 3px;">装備</div>':''}
    </div>`;
  }
  grid.innerHTML=html;
}
function pickIcon(icon){ } // legacy (emoji icons removed)
function toggleAbilityPopup(){
  const p=document.getElementById('abilityPopup');
  p.style.display=p.style.display==='none'?'block':'none';
}
function pickAbility(ability){
  const ABILITY_DATA={
    '':['🚫','能力なし','特殊能力なし'],
    'mine':['💣','地雷','山牌に地雷を仕掛ける'],
    'light':['☀️','光','牌を1枚覗き見する'],
    'yami':['🌑','闇','オープンリーチ時に牌を裏向きに'],
    'haku':['🀆','白','手牌1枚を白に変換'],
    'sanctuary':['🏛️','聖域','親番中、失点を受けない'],
    'steal':['🃏','スチール','捨て牌���ら1枚盗む'],
    'pen':['🖊️','ペン','山牌に絵を描く'],
    'pinzu':['🔵','ピンズー教','筒子の位置が見える'],
  };
  PROFILE.ability=ability;
  const d=ABILITY_DATA[ability]||['🚫','能力なし',''];
  const ic=document.getElementById('abilityDisplayIcon');
  const nm=document.getElementById('abilityDisplayName');
  const ds=document.getElementById('abilityDisplayDesc');
  if(ic) ic.textContent=d[0];
  if(nm) nm.textContent=d[1];
  if(ds) ds.textContent=d[2];
  document.querySelectorAll('.popup-ability-opt').forEach(e=>e.classList.toggle('selected',e.dataset.ability===ability));
  document.getElementById('abilityPopup').style.display='none';
}
function saveProfile(){
  const ni=document.getElementById('profileName');
  PROFILE.name=(ni&&ni.value.trim())||'プレイヤー';
  try{ localStorage.setItem('mjProfile',JSON.stringify(PROFILE)); }catch(e){}
  updateProfileBadge();
  closeProfile();
}

// ============================================================
// GACHA SYSTEM
// ============================================================
const GACHA_ABILITIES = [
  {key:'yami',   icon:'🌑', name:'闇',        tag:'撹乱系'},
  {key:'sanctuary',icon:'🏛️',name:'聖域',    tag:'防御系'},
  {key:'steal',  icon:'🃏', name:'スチール',  tag:'奪取系'},
  {key:'pen',    icon:'🖊️', name:'ペン',       tag:'落書き系'},
  {key:'pinzu',  icon:'🔵', name:'ピンズー教', tag:'情報系'},
];
const RARITY_TABLE = [
  {rarity:'legend', label:'LEGEND', prob:0.001, color:'#ffd700', bg:'#1a0e00', border:'#ffd700'},
  {rarity:'epic',   label:'EPIC',   prob:0.01,  color:'#cc66ff', bg:'#18081a', border:'#8833aa'},
  {rarity:'rare',   label:'RARE',   prob:0.10,  color:'#8888ff', bg:'#0a0a24', border:'#3333aa'},
  {rarity:'normal', label:'NORMAL', prob:1.00,  color:'#5a8a7a', bg:'#0a1a14', border:'#2a4a3a'},
];
const NORMAL_LABELS = ['はずれ','はずれ','はずれ','マナ×1','マナ×2','星かけら','石ころ','なにもない'];

const GACHA_ICON_BASE = 'https://raw.githubusercontent.com/teddybeerbear/teddybeerbear/main/gacha/';
const GACHA_ICONS = [
  ...Array.from({length:9},(_,i)=>{const n=String(i+1).padStart(2,'0');return{id:`C${n}`,rarity:'normal',label:`コモン${n}`};}),
  ...Array.from({length:15},(_,i)=>{const n=String(i+1).padStart(2,'0');return{id:`R${n}`,rarity:'rare',label:`レア${n}`};}),
  ...Array.from({length:7},(_,i)=>{const n=String(i+1).padStart(2,'0');return{id:`E${n}`,rarity:'epic',label:`エピック${n}`};}),
  ...Array.from({length:3},(_,i)=>{const n=String(i+1).padStart(2,'0');return{id:`L${n}`,rarity:'legend',label:`レジェンド${n}`};}),
];
function gachaIconUrl(id){ return GACHA_ICON_BASE+id+'.png'; }

function rollRarity(){
  const r = Math.random();
  if(r < 0.001) return 'legend';
  if(r < 0.011) return 'epic';
  if(r < 0.111) return 'rare';
  return 'normal';
}

function pullOnce(){
  const rarity = rollRarity();
  const rd = RARITY_TABLE.find(r=>r.rarity===rarity);
  let result = {rarity, rd};
  if(rarity === 'legend'){
    const ab = GACHA_ABILITIES[Math.floor(Math.random()*GACHA_ABILITIES.length)];
    const alreadyHas = PROFILE.abilities.includes(ab.key);
    result.ability = ab;
    result.isNew = !alreadyHas;
    if(!alreadyHas) PROFILE.abilities.push(ab.key);
  } else {
    result.label = NORMAL_LABELS[Math.floor(Math.random()*NORMAL_LABELS.length)];
    result.isNew = false;
  }
  // アイコン排出（全レアリティ対象：NORMAL→C、RARE→R、EPIC→E、LEGEND→L）
  const availIcons = GACHA_ICONS.filter(i=>i.rarity===rarity);
  if(availIcons.length > 0){
    const icon = availIcons[Math.floor(Math.random()*availIcons.length)];
    result.icon = icon;
    if(!PROFILE.gachaIcons) PROFILE.gachaIcons=[];
    result.iconIsNew = !PROFILE.gachaIcons.includes(icon.id);
    if(result.iconIsNew) PROFILE.gachaIcons.push(icon.id);
  }
  PROFILE.totalPulls = (PROFILE.totalPulls||0)+1;
  return result;
}

function doPull10(){
  if((PROFILE.coins||0)<10){
    // コイン不足アラート
    const el=document.getElementById('gachaCoinDisplay');
    if(el){el.style.color='#ff4444';setTimeout(()=>{el.style.color='var(--gold)';},600);}
    const btn=document.querySelector('.gacha-pull-10');
    if(btn){btn.style.boxShadow='0 0 12px #ff444488';setTimeout(()=>{btn.style.boxShadow='';},600);}
    return;
  }
  PROFILE.coins-=10;
  const results = Array.from({length:10}, ()=>pullOnce());
  saveProfileSilent();
  showGachaAnim10(results);
  renderGachaCollection();
  updateGachaStat();
  updateGachaCoinDisplay();
}

function doPull1(){
  const res = pullOnce();
  saveProfileSilent();
  showGachaAnim1(res);
  renderGachaCollection();
  updateGachaStat();
  updateGachaCoinDisplay();
}

function showGachaAnim1(res){
  const anim = document.getElementById('gachaAnim');
  const flash = document.getElementById('gachaFlash');
  const inner = document.getElementById('gachaResultInner');
  flash.style.background = res.rd.color;
  flash.style.opacity='1';
  void flash.offsetWidth; // reflow
  flash.style.animation='none';
  void flash.offsetWidth;
  flash.style.animation='gFlash .5s ease-out forwards';

  let cardHtml = '';
  if(res.rarity==='legend'){
    cardHtml = `
      <div class="rarity-${res.rarity}" style="text-align:center;">
        <div class="gacha-result-card">
          <div class="gacha-rarity-label" style="color:${res.rd.color};">${res.rd.label}</div>
          <div class="gacha-card-icon">${res.ability.icon}</div>
          <div class="gacha-card-name">${res.ability.name}</div>
          <div class="gacha-card-desc">${res.ability.tag}</div>
          ${res.isNew?'<div class="gacha-card-new">NEW!</div>':'<div style="font-size:.55rem;color:#888;">ダブり</div>'}
        </div>
        ${res.icon?`<div style="margin-top:8px;display:inline-block;">
          <img src="${gachaIconUrl(res.icon.id)}" style="width:80px;height:112px;object-fit:contain;border-radius:8px;border:2px solid ${res.rd.color};" alt="${res.icon.id}">
          <div style="font-size:.55rem;color:${res.rd.color};margin-top:2px;">${res.icon.label} ${res.iconIsNew?'<span style="background:#2a1a00;color:#ffd700;padding:1px 4px;border-radius:3px;font-size:.5rem;">NEW</span>':''}</div>
        </div>`:''}
      </div>`;
  } else {
    cardHtml = `
      <div class="rarity-${res.rarity}" style="text-align:center;">
        <div class="gacha-result-card">
          <div class="gacha-rarity-label" style="color:${res.rd.color};">${res.rd.label}</div>
          ${res.icon?`<img src="${gachaIconUrl(res.icon.id)}" style="width:80px;height:112px;object-fit:contain;border-radius:6px;border:2px solid ${res.rd.border};margin:4px 0;" alt="${res.icon.id}">`:'<div class="gacha-card-icon" style="font-size:1.6rem;opacity:.5;">💨</div>'}
          <div class="gacha-card-name" style="font-size:.85rem;">${res.icon?res.icon.label:(res.label||'')}</div>
          ${res.iconIsNew?'<div class="gacha-card-new">NEW!</div>':''}
        </div>
      </div>`;
  }
  inner.innerHTML = cardHtml;
  anim.classList.add('show');
  anim.style.pointerEvents='all';
  anim.style.background = 'rgba(0,0,0,.82)';
  if(res.rarity==='legend') SFX.yakuman?.();
  else if(res.rarity==='epic') SFX.riichi?.();
  else if(res.rarity==='rare') SFX.draw?.();
}

function showGachaAnim10(results){
  const anim = document.getElementById('gachaAnim');
  const flash = document.getElementById('gachaFlash');
  const inner = document.getElementById('gachaResultInner');

  // 最高レアリティのフラッシュ色
  const best = results.find(r=>r.rarity==='legend') || results.find(r=>r.rarity==='epic')
    || results.find(r=>r.rarity==='rare') || results[0];
  flash.style.background = best.rd.color;
  flash.style.animation='none'; void flash.offsetWidth;
  flash.style.animation='gFlash .5s ease-out forwards';

  const cards = results.map(res=>{
    if(res.rarity==='legend'){
      return `<div class="gacha-mini-card rarity-legend">
        <div class="g-icon">${res.ability.icon}</div>
        <div class="g-name">${res.ability.name}</div>
        ${res.isNew?'<div class="g-new">NEW</div>':''}
        ${res.icon?`<img src="${gachaIconUrl(res.icon.id)}" style="width:40px;height:56px;object-fit:contain;border-radius:4px;margin-top:4px;" alt="${res.icon.id}">`:''}
        ${res.iconIsNew?'<div class="g-new" style="font-size:.42rem;">🖼NEW</div>':''}
      </div>`;
    }
    return `<div class="gacha-mini-card rarity-${res.rarity}">
      ${res.icon?`<img src="${gachaIconUrl(res.icon.id)}" style="width:40px;height:56px;object-fit:contain;border-radius:4px;" alt="${res.icon.id}">`:'<div class="g-icon" style="font-size:1rem;opacity:.5;">·</div>'}
      <div class="g-name">${res.icon?res.icon.label:(res.label||res.rd.label)}</div>
      ${res.iconIsNew?'<div class="g-new">NEW</div>':''}
    </div>`;
  }).join('');

  inner.innerHTML = `<div class="gacha-multi-grid">${cards}</div>`;
  anim.classList.add('show');
  anim.style.pointerEvents='all';
  anim.style.background='rgba(0,0,0,.88)';
  if(best.rarity==='legend') SFX.yakuman?.();
  else if(best.rarity==='rare'||best.rarity==='epic') SFX.draw?.();
}

function closeGachaAnim(){
  const anim = document.getElementById('gachaAnim');
  anim.classList.remove('show');
  anim.style.pointerEvents='none';
}

function renderGachaCollection(){
  const el = document.getElementById('abilityCollection');
  if(!el) return;
  // abilities: 持っているものをユニークにカウント
  const counts = {};
  (PROFILE.abilities||[]).forEach(a=>{ counts[a]=(counts[a]||0)+1; });
  const equipped = PROFILE.ability||'';
  let html = '';
  for(const ab of GACHA_ABILITIES){
    const cnt = counts[ab.key]||0;
    const isEquipped = equipped===ab.key;
    const locked = cnt===0;
    const clickAttr = locked ? '' : `onclick="equipAbility('${ab.key}')"`;
    html += `<div class="gacha-col-item${isEquipped?' equipped':''}${locked?' locked':''}" ${clickAttr}>
      <div class="ci-icon">${ab.icon}</div>
      <div class="ci-name">${ab.name}</div>
      ${cnt>0?`<div class="ci-count">\xd7${cnt}</div>`:''}
      ${isEquipped?'<div class="gacha-equip-label">装備中</div>':''}
    </div>`;
  }
  el.innerHTML = html;
}

function equipAbility(key){
  const counts = {};
  (PROFILE.abilities||[]).forEach(a=>{ counts[a]=(counts[a]||0)+1; });
  if(!(counts[key]>0)) return;
  PROFILE.ability = PROFILE.ability===key ? '' : key; // トグル
  saveProfileSilent();
  renderGachaCollection();
  updateProfileBadge();
}


function updateGachaStat(){
  const el=document.getElementById('gachaStat');
  if(!el)return;
  const total=PROFILE.totalPulls||0;
  const uniq=(new Set(PROFILE.abilities||[])).size;
  el.textContent=`累計 ${total} 回 / 能力 ${uniq}/7 種類解放`;
}
function updateGachaCoinDisplay(){
  const el=document.getElementById('gachaCoinDisplay');
  if(el) el.textContent=(PROFILE.coins||0).toLocaleString();
}

function openGacha(){
  document.getElementById('lobby').style.display='none';
  document.getElementById('gachaScreen').classList.add('active');
  renderGachaCollection();
  updateGachaStat();
  updateGachaCoinDisplay();
}
function closeGacha(){
  document.getElementById('gachaScreen').classList.remove('active');
  document.getElementById('lobby').style.display='';
}

function saveProfileSilent(){
  try{ localStorage.setItem('mjProfile',JSON.stringify(PROFILE)); }catch(e){}
  updateProfileBadge();
  // サーバー（Neon PostgreSQL）にも保存
  fetch('/api/profile',{
    method:'POST',
    headers:{'Content-Type':'application/json'},
    body:JSON.stringify({
      coins:      PROFILE.coins,
      abilities:  PROFILE.abilities,
      totalPulls: PROFILE.totalPulls,
      gachaIcons: PROFILE.gachaIcons||[],
      iconId:     PROFILE.iconId||'',
      ability:    PROFILE.ability||'',
      name:       PROFILE.name||'',
    }),
  }).catch(()=>{});
}

function updateProfileBadge(){
  const bn=document.getElementById('badgeName');
  const ba=document.getElementById('badgeAbility');
  if(bn) bn.textContent=PROFILE.name||'プレイヤー';
  if(ba){
    const abilityLabels={'':'能力なし','mine':'💣 地雷','light':'☀️ 光','yami':'🌑 闇','haku':'🀆 白','sanctuary':'🏛️ 聖域','pinzu':'🔵 ピンズー教','steal':'🃏 スチール','pen':'🖊️ ペン'};
    ba.textContent=abilityLabels[PROFILE.ability||'']||'能力なし';
  }
}

function selectAbility(el,ability){
  document.querySelectorAll('#abilityList .ability-card').forEach(c=>c.classList.remove('selected'));
  el.classList.add('selected');
  PROFILE.ability=ability;
}

function startTitleBgmOnce(){
  if(!BGM.isPlaying) BGM.fadeIn(_titleBgmKey);
}

function openProfile(){
  document.getElementById('lobby').style.display='none';
  const ps=document.getElementById('profileScreen');
  ps.classList.add('active');
  const ni=document.getElementById('profileName');
  if(ni) ni.value=PROFILE.name||'';
  // アイコン表示更新
  const _id=document.getElementById('iconDisplay');
  if(_id) updateIconDisplay(_id);
  // 能力表示更新
  if(PROFILE.ability) pickAbility(PROFILE.ability);
  renderProfileAbilityList();
}
function renderProfileAbilityList(){
  const counts={};
  (PROFILE.abilities||[]).forEach(a=>{counts[a]=(counts[a]||0)+1;});
  document.querySelectorAll('#abilityList .ability-card').forEach(el=>{
    const ab=el.dataset.ability||'';
    const has=ab===''||counts[ab]>0;
    el.style.display=has?'':'none';
    el.classList.toggle('selected', ab===(PROFILE.ability||''));
    // カウントバッジ
    let badge=el.querySelector('.ab-count');
    if(!badge&&ab&&counts[ab]>1){
      badge=document.createElement('span');
      badge.className='ab-count';
      badge.style.cssText='position:absolute;top:4px;right:6px;font-size:.48rem;background:#1a3a2a;color:#5a9a7a;border-radius:3px;padding:1px 4px;font-weight:700;';
      el.style.position='relative';
      el.appendChild(badge);
    }
    if(badge) badge.textContent=counts[ab]>1?`×${counts[ab]}`:'';
  });
}

function closeProfile(){
  document.getElementById('profileScreen').classList.remove('active');
  document.getElementById('lobby').style.display='';
}

// ============================================================
// SHOP
// ============================================================
const SHOP_ABILITIES=[
  {key:'mine',  icon:'💣', name:'地雷'},
  {key:'light', icon:'☀️', name:'光'},
  {key:'haku',  icon:'🀆', name:'白'},
];
const SHOP_AB_COST=100;

function openShop(){
  document.getElementById('lobby').style.display='none';
  document.getElementById('shopScreen').classList.add('active');
  renderShop();
}
function closeShop(){
  document.getElementById('shopScreen').classList.remove('active');
  document.getElementById('lobby').style.display='';
}
function updateShopCoinDisplay(){
  const el=document.getElementById('shopCoinDisplay');
  if(el) el.textContent=(PROFILE.coins||0).toLocaleString();
}
function renderShop(){
  updateShopCoinDisplay();
  // デイリーボタン状態
  const btn=document.getElementById('dailyBtn');
  if(btn){
    const now=Date.now();
    const last=PROFILE.lastDaily||0;
    const canClaim=now-last>=86400000;
    btn.disabled=!canClaim;
    if(!canClaim){
      const hrs=Math.ceil((86400000-(now-last))/3600000);
      btn.textContent=`あと${hrs}時間`;
    } else {
      btn.textContent='無料 🪙+5';
    }
  }
  // 能力グリッド
  const grid=document.getElementById('shopAbilityGrid');
  if(!grid) return;
  const owned=new Set(PROFILE.abilities||[]);
  grid.innerHTML='';
  SHOP_ABILITIES.forEach(ab=>{
    const has=owned.has(ab.key);
    const card=document.createElement('div');
    card.className='shop-ab-card'+(has?' owned':'');
    card.innerHTML=`
      <div class="shop-ab-icon">${ab.icon}</div>
      <div class="shop-ab-name">${ab.name}</div>
      <div class="shop-ab-cost">🪙 ${SHOP_AB_COST}枚</div>
      <button class="shop-buy-btn premium" style="font-size:.6rem;padding:5px 10px;"
        ${has?'disabled':''}
        onclick="buyAbility('${ab.key}')">${has?'所持済み':'購入'}</button>`;
    grid.appendChild(card);
  });
}
function claimDaily(){
  const now=Date.now();
  const last=PROFILE.lastDaily||0;
  if(now-last<86400000){ renderShop(); return; }
  PROFILE.lastDaily=now;
  PROFILE.coins=(PROFILE.coins||0)+5;
  saveProfileSilent();
  renderShop();
  updateGachaCoinDisplay();
  _shopToast('🎁 デイリーギフト受け取り！🪙+5');
}
function shopPull1(){
  if((PROFILE.coins||0)<1){
    _shopToast('🪙 コインが足りません！対局で獲得できます。'); return;
  }
  PROFILE.coins-=1;
  saveProfileSilent();
  updateShopCoinDisplay();
  updateGachaCoinDisplay();
  // ガチャを1回実行してgachaAnimで表示
  closeShop();
  document.getElementById('gachaScreen').classList.add('active');
  updateGachaCoinDisplay();
  setTimeout(()=>doPull1(),120);
}
function buyAbility(key){
  if((PROFILE.coins||0)<SHOP_AB_COST){
    _shopToast(`🪙 コインが足りません（必要：${SHOP_AB_COST}枚）`); return;
  }
  const owned=PROFILE.abilities||[];
  if(owned.includes(key)){ _shopToast('すでに所持しています'); return; }
  PROFILE.coins-=SHOP_AB_COST;
  if(!PROFILE.abilities) PROFILE.abilities=[];
  PROFILE.abilities.push(key);
  saveProfileSilent();
  renderShop();
  updateGachaCoinDisplay();
  const ab=SHOP_ABILITIES.find(a=>a.key===key);
  _shopToast(`${ab?ab.icon:'⚡'} ${ab?ab.name:key} を解放しました！`);
}
function _shopToast(msg){
  let t=document.getElementById('shopToast');
  if(!t){
    t=document.createElement('div');
    t.id='shopToast';
    t.style.cssText='position:fixed;bottom:32px;left:50%;transform:translateX(-50%);background:#081a10;border:1px solid #2a6a4a;color:#3ada8a;border-radius:8px;padding:10px 20px;font-size:.72rem;font-weight:700;z-index:300;pointer-events:none;transition:opacity .4s;';
    document.body.appendChild(t);
  }
  t.textContent=msg;
  t.style.opacity='1';
  clearTimeout(t._tid);
  t._tid=setTimeout(()=>{t.style.opacity='0';},2400);
}

// Show profile on first load if no name saved
(function(){
  loadProfile();
  if(!localStorage.getItem('mjProfile')){
    // First visit: open profile screen right away
    setTimeout(()=>{
      document.getElementById('lobby').style.display='none';
      document.getElementById('profileScreen').classList.add('active');
    },0);
  }
})();

// ============================================================
// LIGHT ABILITY (光)
// ============================================================
function lightRevealWall(slotIdx){
  if(G.lightMode!=='pick') return;
  if(!G.deckSlots||G.deckSlots[slotIdx]===null) return;
  if(NET.online&&!amIHost()){
    netSend({type:'lightRevealWall',slotIdx,userIdx:NET.myIdx});
    G.lightMode=false;
    renderAll();
    return;
  }
  if(!G.lightRevealedSlots) G.lightRevealedSlots={};
  G.lightRevealedSlots[slotIdx]=true;
  const tile=G.deckSlots[slotIdx];
  if(!G.lightExtraDora) G.lightExtraDora=[];
  G.lightExtraDora.push({suit:tile.suit,num:tile.num});
  if(G.lightUserIdx!=null&&G.players[G.lightUserIdx])G.players[G.lightUserIdx].abilityUsed=true;
  G.lightMode=false;
  addLog(`☀️ 光！山牌を表にした: ${emj(tile)}（ドラ追加）`,'log-dora');
  flashLightEffect();
  SFX.light();
  broadcastState();
  renderAll();
}

function lightRevealHand(pidx, handIdx){
  if(G.lightMode!=='pick') return;
  if(pidx===NET.myIdx) return;
  const p=G.players[pidx];
  if(!p||handIdx<0||handIdx>=p.hand.length) return;
  if(NET.online&&!amIHost()){
    netSend({type:'lightRevealHand',pidx,handIdx,userIdx:NET.myIdx});
    G.lightMode=false;
    renderAll();
    return;
  }
  if(!G.lightRevealedHand) G.lightRevealedHand={};
  const tile=p.hand[handIdx];
  G.lightRevealedHand[tile._id]=tile;
  if(G.lightUserIdx!=null&&G.players[G.lightUserIdx])G.players[G.lightUserIdx].abilityUsed=true;
  G.lightMode=false;
  if(!G.lightExtraDora) G.lightExtraDora=[];
  G.lightExtraDora.push({suit:tile.suit,num:tile.num});
  addLog(`☀️ 光！${p.name}の手牌を表にした: ${emj(tile)}（ドラ追加）`,'log-dora');
  flashLightEffect();
  SFX.light();
  broadcastState();
  renderAll();
}


function lightDispelDiscardYami(pidx, discardIdx){
  if(G.lightMode!=='yami') return;
  const p=G.players[pidx];
  if(!p) return;
  const t=p.discards[discardIdx];
  if(!t||!t._yami) return;
  if(NET.online&&!amIHost()){
    netSend({type:'lightDispelDiscardYami',pidx,discardIdx,userIdx:NET.myIdx});
    G.lightMode=false;
    renderAll();
    return;
  }
  delete t._yami;
  if(G.lightUserIdx!=null&&G.players[G.lightUserIdx])G.players[G.lightUserIdx].abilityUsed=true;
  G.lightMode=false;
  addLog(`☀️ 光！${p.name}の捨て牌の闇を解いた`,'log-dora');
  SFX.light();
  broadcastState();
  renderAll();
}

function lightDispelHandYami(pidx){
  if(G.lightMode!=='yami') return;
  const p=G.players[pidx];
  if(!p||p.yamiTileIdx<0) return;
  if(NET.online&&!amIHost()){
    netSend({type:'lightDispelHandYami',pidx,userIdx:NET.myIdx});
    G.lightMode=false;
    renderAll();
    return;
  }
  p.yamiTileIdx=-1;
  if(G.lightUserIdx!=null&&G.players[G.lightUserIdx])G.players[G.lightUserIdx].abilityUsed=true;
  G.lightMode=false;
  addLog(`☀️ 光！${p.name}の手牌の闇を解いた`,'log-dora');
  SFX.light();
  broadcastState();
  renderAll();
}

function lightRevealDoraCanvas(di){
  if(G.lightMode!=='pick') return;
  if(NET.online&&!amIHost()){
    netSend({type:'lightRevealDoraCanvas',di,userIdx:NET.myIdx});
    G.lightMode=false;
    renderAll();
    return;
  }
  let tile=null, label='';
  if(di<7){
    const usedR=G.rinshanIdx;
    if(di<usedR) return;
    tile=G.doraPile[8+di];
    label='嶺上牌';
  } else if(di>=7&&di<=10){
    tile=G.doraPile[di-7];
    label='ドラ表示牌';
  }
  if(!tile||!tile.suit) return;
  if(!G.lightRevealedSlots) G.lightRevealedSlots={};
  G.lightRevealedSlots['dc_'+di]=true;
  if(!G.lightExtraDora) G.lightExtraDora=[];
  G.lightExtraDora.push({suit:tile.suit,num:tile.num});
  if(G.lightUserIdx!=null&&G.players[G.lightUserIdx])G.players[G.lightUserIdx].abilityUsed=true;
  G.lightMode=false;
  addLog(`☀️ 光！${label}を表にした: ${emj(tile)}（ドラ追加）`,'log-dora');
  flashLightEffect();
  SFX.light();
  broadcastState();
  renderAll();
}

function flashLightEffect(){
  const table=document.querySelector('.mahjong-table');
  if(!table) return;
  const flash=document.createElement('div');
  flash.style.cssText='position:absolute;inset:0;background:radial-gradient(circle,#ffee2244 0%,transparent 70%);pointer-events:none;z-index:200;animation:lightFlashOv .7s ease-out forwards;border-radius:12px;';
  table.appendChild(flash);
  setTimeout(()=>flash.remove(), 800);
}
function lightRevealMine(){
  // 最初の未発見地雷を表示
  const _lmP=G.players[NET.myIdx];
  if(!G_ABILITY_MODE||PROFILE.ability!=='light'||(_lmP&&_lmP.abilityUsed)) return;
  if(!G.mineSlots||G.mineSlots.length===0) return;
  const tile=G.deckSlots[G.mineSlots[0]]; // 最初の地雷を見る
  // ローカルにポップアップ表示（使用者のみ）
  showLightPeek(tile, '地雷（山牌位置）', true);
  SFX.light();
  if(NET.online&&!amIHost()){
    netSend({type:'lightRevealMine',userIdx:NET.myIdx});
    G.lightMode=false;
    renderAll();
    return;
  }
  if(_lmP)_lmP.abilityUsed=true;
  G.lightUserIdx=NET.myIdx;
  G.lightMode=false;
  addLog(`☀️ 光！地雷の位置を確認した`,'log-dora');
  broadcastState();
  renderAll();
}

function showLightPeek(tile, label, isMine=false){
  // Create overlay
  const ov=document.createElement('div');
  ov.className='light-peek-overlay';
  ov.innerHTML=`
    <div class="light-peek-box">
      <div class="light-peek-title">☀️ 光</div>
      <div class="light-peek-tile">${isMine?'💣 ':''}${emj(tile)}</div>
      <div class="light-peek-sub">${label}${isMine?' (地雷)':''}</div>
      <button class="btn btn-primary" style="font-size:.7rem;padding:6px 18px;" onclick="this.closest('.light-peek-overlay').remove()">確認</button>
    </div>`;
  document.body.appendChild(ov);
}

// ============================================================
// MINE ABILITY (地雷)
// ============================================================
// G.mineSlots = array of slotIdx where mines are placed (max 3)
// G.minePlantMode = true while player is choosing where to plant
// G.mineUsed  = true once plant has been done this round

// CPU地雷能力: startRound直後に1巡目3カ所ランダム設置
function cpuPlantMines(){
  G.players.forEach((p,idx)=>{
    if(p.ability!=='mine'||idx===NET.myIdx) return;
    // deckSlots(山牌)と嶺上牌を合わせた候補リストからランダムに3カ所
    const wallAvail = G.deckSlots.map((s,i)=>s?{type:'wall',idx:i}:null).filter(Boolean);
    const rinshanAvail = G.rinshan.map((_,i)=>({type:'rinshan',idx:i}));
    const allAvail = [...wallAvail, ...rinshanAvail];
    // シャッフルして3カ所選ぶ
    for(let i=allAvail.length-1;i>0;i--){
      const j=Math.floor(Math.random()*(i+1));[allAvail[i],allAvail[j]]=[allAvail[j],allAvail[i]];
    }
    const picks=allAvail.slice(0,3);
    picks.forEach(pick=>{
      if(pick.type==='wall'){
        G.mineSlots.push(pick.idx);
        if(!G.mineOwners) G.mineOwners={};
        G.mineOwners[pick.idx]=idx;
      } else {
        G.mineRinshanIdxs.push(pick.idx);
        if(!G.mineRinshanOwners) G.mineRinshanOwners={};
        G.mineRinshanOwners[pick.idx]=idx;
      }
      G.mineCount++;
    });
    p.abilityUsed=true;
    addLog(`💣 ${p.name}が地雷を3カ所仕掛けた！`,'log-dora');
  });
}


function plantMine(slotIdx){
  if(!G.minePlantMode) return;
  if(!G.deckSlots||G.deckSlots[slotIdx]===null) return;
  if(G.mineSlots.includes(slotIdx)) return;
  if(NET.online&&!amIHost()){
    netSend({type:'plantMine',slotIdx});
    G.minePlantMode=false;
    renderAll();
    return;
  }
  G.mineSlots.push(slotIdx);
  if(!G.mineOwners) G.mineOwners={};
  G.mineOwners[slotIdx]=NET.myIdx;
  G.mineCount++;
  if(G.mineCount>=3) G.minePlantMode=false;
  SFX.minePlant();
  addLog(`💣 地雷を仕掛けた！（${G.mineCount}/3カ所）`,'log-dora');
  broadcastState();
  renderAll();
}
function plantMineRinshan(ri){
  if(!G.minePlantMode) return;
  if(ri<0||ri>=G.rinshan.length) return;
  if(G.mineRinshanIdxs.includes(ri)) return;
  if(NET.online&&!amIHost()){
    netSend({type:'plantMineRinshan',ri});
    G.minePlantMode=false;
    renderAll();
    return;
  }
  G.mineRinshanIdxs.push(ri);
  if(!G.mineRinshanOwners) G.mineRinshanOwners={};
  G.mineRinshanOwners[ri]=NET.myIdx;
  G.mineCount++;
  if(G.mineCount>=3) G.minePlantMode=false;
  SFX.minePlant();
  addLog(`💣 嶺上牌に地雷を仕掛けた！（${G.mineCount}/3カ所）`,'log-dora');
  broadcastState();
  renderAll();
}
