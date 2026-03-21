const express = require("express");
const session = require("express-session");
const passport = require("passport");
const { Strategy: GoogleStrategy } = require("passport-google-oauth20");
const { Pool } = require("pg");
const path = require("path");

const app = express();
const PORT = process.env.PORT || 3000;

const GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID;
const GOOGLE_CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET;
const SESSION_SECRET = process.env.SESSION_SECRET || "change-this-secret";
const DATABASE_URL = process.env.DATABASE_URL;

const BASE_URL = process.env.RENDER_EXTERNAL_URL || process.env.BASE_URL || `http://localhost:${PORT}`;
const CALLBACK_URL = `${BASE_URL}/auth/google/callback`;

console.log("=== 起動情報 ===");
console.log("BASE_URL:", BASE_URL);
console.log("CALLBACK_URL:", CALLBACK_URL);
console.log("GOOGLE_CLIENT_ID:", GOOGLE_CLIENT_ID ? "✓ 設定済み" : "✗ 未設定！");
console.log("GOOGLE_CLIENT_SECRET:", GOOGLE_CLIENT_SECRET ? "✓ 設定済み" : "✗ 未設定！");
console.log("DATABASE_URL:", DATABASE_URL ? "✓ 設定済み" : "✗ 未設定！");

// ── Neon PostgreSQL 接続 ─────────────────────────────────────────
const pool = new Pool({
  connectionString: DATABASE_URL,
  ssl: { rejectUnauthorized: false }, // Neon では必須
});

// 起動時にテーブルを作成（なければ）
async function initDB() {
  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS user_profiles (
        google_id    TEXT PRIMARY KEY,
        google_name  TEXT,
        name         TEXT,
        email        TEXT,
        coins        INTEGER NOT NULL DEFAULT 0,
        abilities    TEXT NOT NULL DEFAULT '["ペン"]',
        total_pulls  INTEGER NOT NULL DEFAULT 0,
        gacha_icons  TEXT NOT NULL DEFAULT '[]',
        icon_id      TEXT NOT NULL DEFAULT '',
        ability      TEXT NOT NULL DEFAULT '',
        updated_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);
    // 既存テーブルに google_name カラムがなければ追加
    await pool.query(`
      ALTER TABLE user_profiles ADD COLUMN IF NOT EXISTS google_name TEXT
    `);
    await pool.query(`
      CREATE TABLE IF NOT EXISTS rank_ratings (
        google_id   TEXT PRIMARY KEY,
        name        TEXT NOT NULL DEFAULT '',
        rating      INTEGER NOT NULL DEFAULT 1500,
        wins        INTEGER NOT NULL DEFAULT 0,
        games       INTEGER NOT NULL DEFAULT 0,
        updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);
    console.log("✓ DBテーブル準備完了");
  } catch (err) {
    console.error("✗ DBテーブル作成失敗:", err.message);
  }
}
initDB();

// ── Render.com のプロキシを信頼 ─────────────────────────────────
app.set("trust proxy", 1);

// ── Body parser ──────────────────────────────────────────────────
app.use(express.json());

// ── Passport setup ──────────────────────────────────────────────
passport.use(new GoogleStrategy({
  clientID: GOOGLE_CLIENT_ID || "missing",
  clientSecret: GOOGLE_CLIENT_SECRET || "missing",
  callbackURL: CALLBACK_URL,
}, (_accessToken, _refreshToken, profile, done) => {
  return done(null, {
    id: profile.id,
    name: profile.displayName,
    email: profile.emails?.[0]?.value ?? "",
    photo: profile.photos?.[0]?.value ?? "",
  });
}));

passport.serializeUser((user, done) => done(null, user));
passport.deserializeUser((user, done) => done(null, user));

// ── Session ──────────────────────────────────────────────────────
app.use(session({
  secret: SESSION_SECRET,
  resave: false,
  saveUninitialized: false,
  cookie: {
    secure: BASE_URL.startsWith("https"),
    httpOnly: true,
    maxAge: 7 * 24 * 60 * 60 * 1000,
  },
}));
app.use(passport.initialize());
app.use(passport.session());

// ── 認証ミドルウェア ─────────────────────────────────────────────
function requireAuth(req, res, next) {
  if (req.isAuthenticated()) return next();
  res.status(401).json({ error: "ログインが必要です" });
}

// ── Auth routes ──────────────────────────────────────────────────
app.get("/auth/google",
  passport.authenticate("google", { scope: ["profile", "email"] })
);

app.get("/auth/google/callback",
  passport.authenticate("google", { failureRedirect: "/?error=1" }),
  (_req, res) => res.redirect("/game")
);

app.get("/logout", (req, res) => {
  req.logout(() => res.redirect("/"));
});

// ── プロフィール API ─────────────────────────────────────────────

// 自分の情報取得（ログイン直後にゲームHTMLが呼ぶ）
app.get("/api/me", requireAuth, (req, res) => {
  res.json({
    id: req.user.id,
    name: req.user.name,
    email: req.user.email,
    photo: req.user.photo,
  });
});

// プロフィール取得（コイン・能力など）
app.get("/api/profile", requireAuth, async (req, res) => {
  const uid = req.user.id;
  try {
    const result = await pool.query(
      "SELECT * FROM user_profiles WHERE google_id = $1",
      [uid]
    );
    // google_name を常に最新のGoogle表示名で更新（レコードがある場合のみ）
    if (result.rows.length === 0) {
      return res.json({
        coins: 0, abilities: ["ペン"], totalPulls: 0,
        gachaIcons: [], iconId: "", ability: "",
        name: req.user.name, googleName: req.user.name,
      });
    }
    await pool.query(
      `UPDATE user_profiles SET google_name = $1, updated_at = NOW() WHERE google_id = $2`,
      [req.user.name, uid]
    );
    const row = result.rows[0];
    res.json({
      coins:      row.coins,
      abilities:  JSON.parse(row.abilities),
      totalPulls: row.total_pulls,
      gachaIcons: JSON.parse(row.gacha_icons),
      iconId:     row.icon_id,
      ability:    row.ability,
      name:       row.name || req.user.name,
      googleName: row.google_name || req.user.name,
    });
  } catch (err) {
    console.error("プロフィール取得エラー:", err.message);
    res.status(500).json({ error: "DB エラー" });
  }
});

// ── コイン付与ルール（サーバー側で検証） ─────────────────────────
// ガチャ消費: pull10=10枚, pull1=1枚, shop_ability=100枚
const GACHA_COST = { pull10: 10, pull1: 1, shop_ability: 100 };
const REWARD_TABLE = { 2: 10, 3: 30, 4: 40 };
const VALID_ABILITIES = ["mine","light","yami","haku","sanctuary","pinzu","steal","pen"];

// ── サーバー側ガチャロジック ──────────────────────────────────────
const GACHA_ABILITIES_SVR = [
  { key:"yami",      icon:"🌑", name:"闇",        tag:"撹乱系" },
  { key:"sanctuary", icon:"🏛️", name:"聖域",      tag:"防御系" },
  { key:"steal",     icon:"🃏", name:"スチール",  tag:"奪取系" },
  { key:"pinzu",     icon:"🔵", name:"ピンズー教", tag:"情報系" },
];
const GACHA_ICONS_SVR = [
  ...Array.from({length:9},  (_,i) => ({ id:`C${String(i+1).padStart(2,"0")}`, rarity:"normal" })),
  ...Array.from({length:15}, (_,i) => ({ id:`R${String(i+1).padStart(2,"0")}`, rarity:"rare"   })),
  ...Array.from({length:7},  (_,i) => ({ id:`E${String(i+1).padStart(2,"0")}`, rarity:"epic"   })),
  ...Array.from({length:3},  (_,i) => ({ id:`L${String(i+1).padStart(2,"0")}`, rarity:"legend" })),
];

function serverRollRarity() {
  const r = Math.random();
  if (r < 0.001) return "legend";
  if (r < 0.011) return "epic";
  if (r < 0.111) return "rare";
  return "normal";
}

function serverPullOnce(ownedAbilities, ownedIcons) {
  const rarity = serverRollRarity();
  const result = { rarity };
  if (rarity === "legend") {
    const ab = GACHA_ABILITIES_SVR[Math.floor(Math.random() * GACHA_ABILITIES_SVR.length)];
    result.abilityKey   = ab.key;
    result.abilityName  = ab.name;
    result.abilityIcon  = ab.icon;
    result.abilityTag   = ab.tag;
    result.isNewAbility = !ownedAbilities.includes(ab.key);
    if (result.isNewAbility) ownedAbilities.push(ab.key);
  }
  const available = GACHA_ICONS_SVR.filter(i => i.rarity === rarity);
  if (available.length > 0) {
    const icon = available[Math.floor(Math.random() * available.length)];
    result.iconId    = icon.id;
    result.iconIsNew = !ownedIcons.includes(icon.id);
    if (result.iconIsNew) ownedIcons.push(icon.id);
  }
  return result;
}

// POST /api/gacha — コイン消費・ロール・DB保存を全てサーバーで実施
app.post("/api/gacha", requireAuth, async (req, res) => {
  const { pullType } = req.body;
  const cost = GACHA_COST[pullType];
  if (!cost) return res.status(400).json({ error: "不正なガチャ種別です" });
  const uid = req.user.id;
  // shop_ability は1回分として扱う。abilityKey の検証
  const isShopAbility = pullType === "shop_ability";
  const { abilityKey } = req.body;
  if (isShopAbility && !VALID_ABILITIES.includes(abilityKey))
    return res.status(400).json({ error: "不正な能力キーです" });
  const pullCount = pullType === "pull10" ? 10 : 1;
  try {
    // コイン減算（残高チェック付き）＆現在の abilities/gacha_icons を取得
    const r = await pool.query(
      `UPDATE user_profiles
         SET coins = coins - $2,
             total_pulls = total_pulls + $3,
             updated_at = NOW()
       WHERE google_id = $1 AND coins >= $2
       RETURNING coins, total_pulls, abilities, gacha_icons`,
      [uid, cost, pullCount]
    );
    if (r.rowCount === 0)
      return res.status(402).json({ error: "コインが不足しています" });

    const row = r.rows[0];
    const ownedAbilities = JSON.parse(row.abilities || "[]");
    const ownedIcons     = JSON.parse(row.gacha_icons || "[]");

    let results;
    if (isShopAbility) {
      // ショップ直接購入: 指定能力を追加（ランダムロールなし）
      const isNew = !ownedAbilities.includes(abilityKey);
      if (isNew) ownedAbilities.push(abilityKey);
      results = [{ rarity: "legend", abilityKey, isNewAbility: isNew }];
    } else {
      // 通常ガチャ: サーバー側でロール
      results = [];
      for (let i = 0; i < pullCount; i++) {
        results.push(serverPullOnce(ownedAbilities, ownedIcons));
      }
    }

    // 取得した能力・アイコンをDBに保存
    await pool.query(
      `UPDATE user_profiles
         SET abilities   = $2,
             gacha_icons = $3,
             updated_at  = NOW()
       WHERE google_id = $1`,
      [uid, JSON.stringify(ownedAbilities), JSON.stringify(ownedIcons)]
    );

    res.json({
      ok: true,
      results,
      coins:      row.coins,
      totalPulls: row.total_pulls,
      abilities:  ownedAbilities,
      gachaIcons: ownedIcons,
    });
  } catch (err) {
    console.error("ガチャエラー:", err.message);
    res.status(500).json({ error: "DB エラー" });
  }
});


// POST /api/reward — 対局報酬（1位のみ・numPlayersをサーバーで検証）
// ルームマッチ報酬テーブル (numPlayers → rank → coins)
const ROOM_REWARD_TABLE = {
  2: { 1: 20, 2: 10 },              // 2人
  3: { 1: 30, 2: 15, 3:  5 },      // 3人
  4: { 1: 40, 2: 20, 3: 10, 4: 5 }, // 4人
};

app.post("/api/reward", requireAuth, async (req, res) => {
  const { rank, numPlayers } = req.body;
  if (!rank || !numPlayers) return res.status(400).json({ error: "rank と numPlayers が必要です" });
  const table = ROOM_REWARD_TABLE[numPlayers];
  const earned = table?.[rank] ?? 0;
  if (earned === 0) return res.json({ ok: true, earned: 0 });
  const uid = req.user.id;
  try {
    const r = await pool.query(
      `UPDATE user_profiles SET coins = coins + $2, updated_at = NOW()
       WHERE google_id = $1
       RETURNING coins`,
      [uid, earned]
    );
    res.json({ ok: true, earned, coins: r.rows[0]?.coins ?? 0 });
  } catch (err) {
    console.error("報酬付与エラー:", err.message);
    res.status(500).json({ error: "DB エラー" });
  }
});

// プロフィール保存（非コイン項目のみ受け付ける）
// ★ coins / totalPulls はクライアントからの書き換えを一切受け付けない
app.post("/api/profile", requireAuth, async (req, res) => {
  const uid = req.user.id;
  const { abilities, gachaIcons, iconId, ability, name } = req.body;

  // 能力ホワイトリスト検証
  const safeAbilities = Array.isArray(abilities)
    ? abilities.filter(a => VALID_ABILITIES.includes(a))
    : [];

  // gachaIcons: 既存IDパターン検証
  const VALID_ICON_RE = /^[CREL]\d{2}$/;
  const safeIcons = Array.isArray(gachaIcons)
    ? gachaIcons.filter(id => typeof id === "string" && VALID_ICON_RE.test(id))
    : [];

  const safeAbility = VALID_ABILITIES.includes(ability) ? ability : "";
  const safeName = typeof name === "string" ? name.slice(0, 12) : req.user.name;
  const safeIconId = typeof iconId === "string" && VALID_ICON_RE.test(iconId) ? iconId : "";

  try {
    // gachaIcons は既存レコードとマージ（クライアントが削除できないように）
    const cur = await pool.query(
      "SELECT gacha_icons FROM user_profiles WHERE google_id = $1", [uid]
    );
    const existingIcons = cur.rows[0] ? JSON.parse(cur.rows[0].gacha_icons) : [];
    const mergedIcons = Array.from(new Set([...existingIcons, ...safeIcons]));

    await pool.query(
      `INSERT INTO user_profiles
         (google_id, name, email, abilities, gacha_icons, icon_id, ability, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, NOW())
       ON CONFLICT (google_id) DO UPDATE SET
         name        = EXCLUDED.name,
         abilities   = EXCLUDED.abilities,
         gacha_icons = EXCLUDED.gacha_icons,
         icon_id     = EXCLUDED.icon_id,
         ability     = EXCLUDED.ability,
         updated_at  = NOW()`,
      [
        uid,
        safeName,
        req.user.email,
        JSON.stringify(safeAbilities),
        JSON.stringify(mergedIcons),
        safeIconId,
        safeAbility,
      ]
    );
    res.json({ ok: true });
  } catch (err) {
    console.error("プロフィール保存エラー:", err.message);
    res.status(500).json({ error: "DB エラー" });
  }
});

// ── ルームマッチング ─────────────────────────────────────────────
const rooms = new Map();
const ROOM_TTL_MS = 30 * 60 * 1000;

setInterval(() => {
  const now = Date.now();
  for (const [code, room] of rooms.entries()) {
    if (now - room.createdAt > ROOM_TTL_MS) {
      rooms.delete(code);
      console.log(`部屋 ${code} を期限切れで削除`);
    }
  }
}, 60 * 1000);

app.post("/room/create", requireAuth, (req, res) => {
  const { code, peerId, abilityMode } = req.body;
  if (!code || !peerId)
    return res.status(400).json({ error: "code と peerId は必須です" });
  if (!/^\d{6}$/.test(code))
    return res.status(400).json({ error: "部屋番号は6桁の数字にしてください" });
  if (rooms.has(code))
    return res.status(409).json({ error: "その部屋番号はすでに使われています" });
  rooms.set(code, {
    peerId,
    hostName: req.user.name || "ホスト",
    abilityMode: abilityMode !== false,
    createdAt: Date.now(),
  });
  console.log(`部屋作成: ${code} (host: ${req.user.name})`);
  res.json({ ok: true });
});

app.get("/room/:code", requireAuth, (req, res) => {
  const room = rooms.get(req.params.code);
  if (!room) return res.status(404).json({ error: "部屋が見つかりません" });
  res.json({ peerId: room.peerId, hostName: room.hostName, abilityMode: room.abilityMode });
});

app.delete("/room/:code", requireAuth, (req, res) => {
  rooms.delete(req.params.code);
  console.log(`部屋削除: ${req.params.code}`);
  res.json({ ok: true });
});

// ── ランクマッチ ─────────────────────────────────────────────────
// キュー: Map<googleId, {googleId, peerId, name, rating, joinedAt}>
const rankQueue = new Map();
// マッチ中: Map<matchId, {matchId, players:[{googleId,peerId,name,rating}], scores, changes, createdAt}>
const rankMatches = new Map();
// googleId → matchId の逆引き（マッチ中かどうか確認用）
const playerMatchId = new Map();

const RANK_MATCH_TTL = 60 * 60 * 1000; // 1時間でマッチデータ破棄

// 古いマッチデータを定期削除
setInterval(() => {
  const now = Date.now();
  for (const [mid, m] of rankMatches.entries()) {
    if (now - m.createdAt > RANK_MATCH_TTL) {
      m.players.forEach(p => playerMatchId.delete(p.googleId));
      rankMatches.delete(mid);
    }
  }
}, 5 * 60 * 1000);

// レーティング取得（なければ1500で初期化して返す）
async function getOrCreateRating(googleId, name) {
  const r = await pool.query(
    `INSERT INTO rank_ratings (google_id, name, rating)
     VALUES ($1, $2, 1500)
     ON CONFLICT (google_id) DO UPDATE SET
       name = EXCLUDED.name,
       updated_at = NOW()
     RETURNING rating, wins, games`,
    [googleId, name || ""]
  );
  return r.rows[0];
}

// レーティング変動計算
// players: [{googleId, name, rating}] (プレイヤーインデックス順)
// scores:  [score0, score1, score2]
function calcRatingChanges(players, scores) {
  // 順位付け（同点は先のインデックスが上位）
  const indexed = players.map((p, i) => ({ ...p, score: scores[i], origIdx: i }));
  indexed.sort((a, b) => b.score - a.score || a.origIdx - b.origIdx);

  // 基礎点: 1位+30, 2位 0, 3位-30
  const BASE = [30, 0, -30];

  return indexed.map((p, rank) => {
    // 相手2人の平均レート
    const opponentAvgRating =
      (indexed.reduce((s, op) => s + op.rating, 0) - p.rating) / 2;
    // レート差補正: ±400差で±10点。格上に勝つほど得、格下に負けるほど損
    const diff = Math.max(-400, Math.min(400, opponentAvgRating - p.rating));
    const adjustment = Math.round((diff / 400) * 10);
    const change = BASE[rank] + adjustment;
    const after = Math.max(0, p.rating + change);
    return {
      googleId: p.googleId,
      name: p.name,
      rank: rank + 1,
      score: p.score,
      before: p.rating,
      change,
      after,
    };
  });
}

// GET /rank/my-rating — 自分のレート取得
app.get("/rank/my-rating", requireAuth, async (req, res) => {
  try {
    const row = await getOrCreateRating(req.user.id, req.user.name);
    res.json({ rating: row.rating, wins: row.wins, games: row.games });
  } catch (err) {
    console.error("my-rating エラー:", err.message);
    res.status(500).json({ error: "DB エラー" });
  }
});

// POST /rank/join — キューに参加。3人揃ったらマッチング成立
app.post("/rank/join", requireAuth, async (req, res) => {
  const { peerId } = req.body;
  if (!peerId) return res.status(400).json({ error: "peerId が必要です" });

  const googleId = req.user.id;
  const name = req.user.name || "プレイヤー";

  // 既存マッチ中なら再通知
  const existingMatchId = playerMatchId.get(googleId);
  if (existingMatchId) {
    const m = rankMatches.get(existingMatchId);
    if (m) {
      const me = m.players.find(p => p.googleId === googleId);
      return res.json(_buildMatchResponse(m, googleId));
    }
    playerMatchId.delete(googleId);
  }

  // レート取得
  let rating = 1500;
  try {
    const row = await getOrCreateRating(googleId, name);
    rating = row.rating;
  } catch (e) { /* fallback to 1500 */ }

  // キューに追加（重複は上書き）
  rankQueue.set(googleId, { googleId, peerId, name, rating, joinedAt: Date.now() });
  console.log(`ランクキュー参加: ${name} (rating:${rating}) 現在${rankQueue.size}人`);

  // 3人揃ったらマッチング
  if (rankQueue.size >= 3) {
    const entries = Array.from(rankQueue.values()).slice(0, 3);
    entries.forEach(e => rankQueue.delete(e.googleId));

    const matchId = "rm-" + Date.now() + "-" + Math.floor(Math.random() * 9999);
    const match = {
      matchId,
      players: entries, // index 0 がホスト
      scores: null,
      changes: null,
      createdAt: Date.now(),
    };
    rankMatches.set(matchId, match);
    entries.forEach(e => playerMatchId.set(e.googleId, matchId));

    console.log(`マッチング成立: ${matchId} — ${entries.map(e => e.name).join(", ")}`);
    return res.json(_buildMatchResponse(match, googleId));
  }

  res.json({ matched: false, queueSize: rankQueue.size });
});

// GET /rank/status — マッチング状況ポーリング
app.get("/rank/status", requireAuth, async (req, res) => {
  const googleId = req.user.id;

  // マッチ成立済み？
  const matchId = playerMatchId.get(googleId);
  if (matchId) {
    const m = rankMatches.get(matchId);
    if (m) return res.json(_buildMatchResponse(m, googleId));
    playerMatchId.delete(googleId);
  }

  // まだキュー待ち
  const inQueue = rankQueue.has(googleId);
  res.json({ matched: false, queueSize: rankQueue.size, inQueue });
});

// DELETE /rank/cancel — キューから離脱
app.delete("/rank/cancel", requireAuth, (req, res) => {
  rankQueue.delete(req.user.id);
  res.json({ ok: true });
});

// DELETE /rank/done — マッチ情報をキューから削除（ゲーム開始後に呼ぶ）
app.delete("/rank/done", requireAuth, (req, res) => {
  // playerMatchId は結果提出まで残す
  rankQueue.delete(req.user.id);
  res.json({ ok: true });
});

// POST /rank/result — ホストがスコアを提出 → レーティング更新
app.post("/rank/result", requireAuth, async (req, res) => {
  const { matchId, scores } = req.body;
  if (!matchId || !Array.isArray(scores) || scores.length !== 3)
    return res.status(400).json({ error: "matchId と scores[3] が必要です" });

  const match = rankMatches.get(matchId);
  if (!match) return res.status(404).json({ error: "マッチが見つかりません" });
  if (match.changes) return res.json({ ok: true, changes: match.changes }); // 二重提出防止

  // ★ 不正防止: 提出者がマッチのホスト(index=0)であることを検証
  const googleId = req.user.id;
  const submitterIdx = match.players.findIndex(p => p.googleId === googleId);
  if (submitterIdx !== 0)
    return res.status(403).json({ error: "ホストのみスコアを提出できます" });

  // ★ スコア値の妥当性検証: 整数かつ合計が一定範囲内
  const validScores = scores.every(s => Number.isInteger(s) && s >= -9999 && s <= 99999);
  if (!validScores)
    return res.status(400).json({ error: "スコア値が不正です" });

  const changes = calcRatingChanges(match.players, scores);

  // DB更新
  try {
    for (const c of changes) {
      await pool.query(
        `INSERT INTO rank_ratings (google_id, name, rating, wins, games, updated_at)
         VALUES ($1, $2, $3, $4, 1, NOW())
         ON CONFLICT (google_id) DO UPDATE SET
           name       = EXCLUDED.name,
           rating     = EXCLUDED.rating,
           wins       = rank_ratings.wins + $4,
           games      = rank_ratings.games + 1,
           updated_at = NOW()`,
        [c.googleId, c.name, c.after, c.rank === 1 ? 1 : 0]
      );
    }
    match.scores = scores;
    match.changes = changes;
    console.log(`レート更新完了: ${matchId}`, changes.map(c => `${c.name} ${c.before}→${c.after}(${c.change>=0?'+':''}${c.change})`).join(", "));
    res.json({ ok: true, changes });
  } catch (err) {
    console.error("レート更新エラー:", err.message);
    res.status(500).json({ error: "DB エラー" });
  }
});

// GET /rank/result-view — ゲストがレート変動を取得
app.get("/rank/result-view", requireAuth, async (req, res) => {
  const { matchId } = req.query;
  if (!matchId) return res.status(400).json({ error: "matchId が必要です" });
  const match = rankMatches.get(matchId);
  if (!match) return res.status(404).json({ error: "マッチが見つかりません" });
  if (!match.changes) return res.json({ ready: false });
  res.json({ ready: true, changes: match.changes });
});

// マッチレスポンス生成ヘルパー
function _buildMatchResponse(match, myGoogleId) {
  const myIdx = match.players.findIndex(p => p.googleId === myGoogleId);
  const isHost = myIdx === 0;
  return {
    matched: true,
    matchId: match.matchId,
    isHost,
    myIdx,
    hostPeerId: match.players[0].peerId,
    myRating: match.players[myIdx]?.rating ?? 1500,
    opponents: match.players
      .filter((_, i) => i !== myIdx)
      .map(p => ({ name: p.name, rating: p.rating })),
  };
}


app.get("/", (req, res) => {
  if (req.isAuthenticated()) return res.redirect("/game");
  res.send(`<!DOCTYPE html>
<html lang="ja">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>手にビじゃん</title>
<link rel="icon" type="image/png" href="https://raw.githubusercontent.com/teddybeerbear/teddybeerbear/main/fabi.png">
<link href="https://fonts.googleapis.com/css2?family=Noto+Serif+JP:wght@400;700;900&display=swap" rel="stylesheet">
<style>
  *{box-sizing:border-box;margin:0;padding:0;}
  body{background:#0b1520;height:100vh;display:flex;flex-direction:column;align-items:center;justify-content:center;font-family:'Noto Serif JP',serif;}
  .emoji{font-size:3rem;margin-bottom:10px;}
  h1{font-size:2.4rem;font-weight:900;color:#c9a84c;letter-spacing:.4em;margin-bottom:6px;}
  p{font-size:.7rem;color:#5a7a6a;letter-spacing:.25em;margin-bottom:40px;}
  .card{background:linear-gradient(135deg,#091422,#060e18);border:1px solid #1a3a2a;border-radius:14px;padding:30px 36px;text-align:center;}
  .msg{color:#5a7a6a;font-size:.8rem;letter-spacing:.1em;margin-bottom:20px;}
  a.btn{display:inline-flex;align-items:center;gap:12px;background:#fff;color:#333;font-weight:700;font-size:.9rem;padding:12px 28px;border-radius:9px;text-decoration:none;box-shadow:0 2px 8px #00000066;transition:transform .15s;}
  a.btn:hover{transform:translateY(-2px);}
  svg{flex-shrink:0;}
</style>
</head>
<body>
  <div class="emoji">🀄</div>
  <h1>手にビじゃん</h1>
  <p>tenibijan</p>
  <div class="card">
    <div class="msg">プレイするにはログインが必要です</div>
    <a class="btn" href="/auth/google">
      <svg width="18" height="18" viewBox="0 0 18 18" xmlns="http://www.w3.org/2000/svg">
        <path d="M17.64 9.205c0-.639-.057-1.252-.164-1.841H9v3.481h4.844a4.14 4.14 0 0 1-1.796 2.716v2.259h2.908c1.702-1.567 2.684-3.875 2.684-6.615z" fill="#4285F4"/>
        <path d="M9 18c2.43 0 4.467-.806 5.956-2.18l-2.908-2.259c-.806.54-1.837.86-3.048.86-2.344 0-4.328-1.584-5.036-3.711H.957v2.332A8.997 8.997 0 0 0 9 18z" fill="#34A853"/>
        <path d="M3.964 10.71A5.41 5.41 0 0 1 3.682 9c0-.593.102-1.17.282-1.71V4.958H.957A8.996 8.996 0 0 0 0 9c0 1.452.348 2.827.957 4.042l3.007-2.332z" fill="#FBBC05"/>
        <path d="M9 3.58c1.321 0 2.508.454 3.44 1.345l2.582-2.58C13.463.891 11.426 0 9 0A8.997 8.997 0 0 0 .957 4.958L3.964 7.29C4.672 5.163 6.656 3.58 9 3.58z" fill="#EA4335"/>
      </svg>
      Googleでログイン
    </a>
  </div>
</body>
</html>`);
});

app.get("/game", (req, res) => {
  if (!req.isAuthenticated()) return res.redirect("/");
  res.sendFile(path.join(__dirname, "tenibijan.html"));
});

// ── Start ────────────────────────────────────────────────────────
app.listen(PORT, () => {
  console.log(`サーバー起動 ポート: ${PORT}`);
});
