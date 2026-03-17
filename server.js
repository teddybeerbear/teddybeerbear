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
        name         TEXT,
        email        TEXT,
        coins        INTEGER NOT NULL DEFAULT 10000,
        abilities    TEXT NOT NULL DEFAULT '[]',
        total_pulls  INTEGER NOT NULL DEFAULT 0,
        gacha_icons  TEXT NOT NULL DEFAULT '[]',
        icon_id      TEXT NOT NULL DEFAULT '',
        ability      TEXT NOT NULL DEFAULT '',
        updated_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);
    console.log("✓ DBテーブル（user_profiles）準備完了");
    
    // ランク用レーティングテーブル
    await pool.query(`
      CREATE TABLE IF NOT EXISTS user_ratings (
        google_id    TEXT PRIMARY KEY,
        rating       INTEGER NOT NULL DEFAULT 1500,
        updated_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);
    console.log("✓ DBテーブル（user_ratings）準備完了");
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
    if (result.rows.length === 0) {
      // 初回: デフォルト値でレコード作成
      await pool.query(
        `INSERT INTO user_profiles (google_id, name, email)
         VALUES ($1, $2, $3)
         ON CONFLICT (google_id) DO NOTHING`,
        [uid, req.user.name, req.user.email]
      );
      return res.json({
        coins: 10000,
        abilities: [],
        totalPulls: 0,
        gachaIcons: [],
        iconId: "",
        ability: "",
        name: req.user.name,
      });
    }
    const row = result.rows[0];
    res.json({
      coins:      row.coins,
      abilities:  JSON.parse(row.abilities),
      totalPulls: row.total_pulls,
      gachaIcons: JSON.parse(row.gacha_icons),
      iconId:     row.icon_id,
      ability:    row.ability,
      name:       row.name || req.user.name,
    });
  } catch (err) {
    console.error("プロフィール取得エラー:", err.message);
    res.status(500).json({ error: "DB エラー" });
  }
});

// プロフィール保存（ゲーム終了時などに呼ぶ）
app.post("/api/profile", requireAuth, async (req, res) => {
  const uid = req.user.id;
  const { coins, abilities, totalPulls, gachaIcons, iconId, ability, name } = req.body;
  try {
    await pool.query(
      `INSERT INTO user_profiles
         (google_id, name, email, coins, abilities, total_pulls, gacha_icons, icon_id, ability, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, NOW())
       ON CONFLICT (google_id) DO UPDATE SET
         name        = EXCLUDED.name,
         coins       = EXCLUDED.coins,
         abilities   = EXCLUDED.abilities,
         total_pulls = EXCLUDED.total_pulls,
         gacha_icons = EXCLUDED.gacha_icons,
         icon_id     = EXCLUDED.icon_id,
         ability     = EXCLUDED.ability,
         updated_at  = NOW()`,
      [
        uid,
        name || req.user.name,
        req.user.email,
        coins ?? 10000,
        JSON.stringify(abilities ?? []),
        totalPulls ?? 0,
        JSON.stringify(gachaIcons ?? []),
        iconId ?? "",
        ability ?? "",
      ]
    );
    res.json({ ok: true });
  } catch (err) {
    console.error("プロフィール保存エラー:", err.message);
    res.status(500).json({ error: "DB エラー" });
  }
});

// ── ランクマッチング（3人制） ──────────────────────────────────────
const rankQueue = []; // { peerId, name, rating, joinedAt }
const rankMatches = new Map(); // matchId -> { hostPeerId, hostIdx, guests: [], createdAt }
const RANK_MATCH_TTL_MS = 5 * 60 * 1000; // 5分

setInterval(() => {
  const now = Date.now();
  for (const [matchId, match] of rankMatches.entries()) {
    if (now - match.createdAt > RANK_MATCH_TTL_MS) {
      rankMatches.delete(matchId);
      console.log(`ランクマッチ ${matchId} を期限切れで削除`);
    }
  }
}, 60 * 1000);

// レート取得
app.get("/rank/my-rating", requireAuth, async (req, res) => {
  const uid = req.user.id;
  try {
    const result = await pool.query(
      "SELECT rating FROM user_ratings WHERE google_id = $1",
      [uid]
    );
    if (result.rows.length === 0) {
      // 初回: デフォルトレート 1500
      await pool.query(
        `INSERT INTO user_ratings (google_id, rating)
         VALUES ($1, 1500)
         ON CONFLICT (google_id) DO NOTHING`,
        [uid]
      );
      return res.json({ rating: 1500 });
    }
    res.json({ rating: result.rows[0].rating });
  } catch (err) {
    console.error("レート取得エラー:", err.message);
    res.json({ rating: 1500 }); // エラー時はデフォルト
  }
});

// ランクマッチキューに参加
app.post("/rank/join", requireAuth, (req, res) => {
  try {
    const { peerId } = req.body;
    if (!peerId) {
      return res.status(400).json({ error: "peerId は必須です" });
    }

    // キューに追加
    rankQueue.push({
      peerId,
      googleId: req.user.id,
      name: req.user.name || "プレイヤー",
      rating: 1500, // 仮のレート値
      joinedAt: Date.now(),
    });

    console.log(`ランクキュー参加: ${req.user.name} (${peerId}), キュー人数: ${rankQueue.length}`);

    // 3人揃ったかチェック
    if (rankQueue.length >= 3) {
      const matched = rankQueue.splice(0, 3); // 3人取り出す
      const matchId = `match-${Date.now()}-${Math.floor(Math.random() * 10000)}`;
      
      // マッチ情報を保存
      rankMatches.set(matchId, {
        hostPeerId: matched[0].peerId,
        hostIdx: 0,
        members: matched.map(m => ({
          peerId: m.peerId,
          googleId: m.googleId,
          name: m.name,
          rating: m.rating,
        })),
        createdAt: Date.now(),
      });

      console.log(`ランクマッチ成立: ${matchId}`, matched.map(m => m.name));

      // マッチ成立を返す
      return res.json({
        matched: true,
        matchId,
        isHost: true,
        myIdx: 0,
        hostPeerId: matched[0].peerId,
        myRating: matched[0].rating,
        opponents: [
          { name: matched[1].name, rating: matched[1].rating },
          { name: matched[2].name, rating: matched[2].rating },
        ],
      });
    }

    // 3人未満: マッチ待機
    res.json({
      matched: false,
      queueSize: rankQueue.length,
    });
  } catch (err) {
    console.error("/rank/join エラー:", err.message);
    res.status(500).json({ error: "サーバーエラー: " + err.message });
  }
});

// ランクマッチ状態をポーリング
app.get("/rank/status", requireAuth, (req, res) => {
  res.json({
    matched: false,
    queueSize: rankQueue.length,
  });
});

// ランクマッチキューから削除
app.delete("/rank/cancel", requireAuth, (req, res) => {
  const idx = rankQueue.findIndex(q => q.googleId === req.user.id);
  if (idx >= 0) {
    rankQueue.splice(idx, 1);
    console.log(`ランクキューキャンセル: ${req.user.name}, 残り: ${rankQueue.length}`);
  }
  res.json({ ok: true });
});

// ランクマッチ完了（ゲーム終了時）
app.delete("/rank/done", requireAuth, (req, res) => {
  res.json({ ok: true });
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

// ── ページ ───────────────────────────────────────────────────────
app.get("/", (req, res) => {
  if (req.isAuthenticated()) return res.redirect("/game");
  res.send(`<!DOCTYPE html>
<html lang="ja">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>手にビまーじゃん</title>
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
  <h1>手にビまーじゃん</h1>
  <p>ONLINE MAHJONG</p>
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
