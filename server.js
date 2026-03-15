const express = require("express");
const session = require("express-session");
const passport = require("passport");
const { Strategy: GoogleStrategy } = require("passport-google-oauth20");
const path = require("path");

const app = express();
const PORT = process.env.PORT || 3000;

const GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID;
const GOOGLE_CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET;
const SESSION_SECRET = process.env.SESSION_SECRET || "change-this-secret";

// Render.com が自動で設定するURL、なければ手動でセット
const BASE_URL = process.env.RENDER_EXTERNAL_URL || process.env.BASE_URL || `http://localhost:${PORT}`;
const CALLBACK_URL = `${BASE_URL}/auth/google/callback`;

console.log("=== 起動情報 ===");
console.log("BASE_URL:", BASE_URL);
console.log("CALLBACK_URL:", CALLBACK_URL);
console.log("GOOGLE_CLIENT_ID:", GOOGLE_CLIENT_ID ? "✓ 設定済み" : "✗ 未設定！");
console.log("GOOGLE_CLIENT_SECRET:", GOOGLE_CLIENT_SECRET ? "✓ 設定済み" : "✗ 未設定！");

if (!GOOGLE_CLIENT_ID || !GOOGLE_CLIENT_SECRET) {
  console.error("ERROR: GOOGLE_CLIENT_ID または GOOGLE_CLIENT_SECRET が設定されていません");
}

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

// ── Middleware ───────────────────────────────────────────────────
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

// ── ルームマッチ（サーバー側マッチング） ────────────────────────
// rooms: { code -> { peerId, hostName, abilityMode, createdAt } }
const rooms = new Map();
const ROOM_TTL_MS = 30 * 60 * 1000; // 30分で自動削除

// 古い部屋を定期的に掃除
setInterval(() => {
  const now = Date.now();
  for (const [code, room] of rooms.entries()) {
    if (now - room.createdAt > ROOM_TTL_MS) {
      rooms.delete(code);
      console.log(`部屋 ${code} を期限切れで削除`);
    }
  }
}, 60 * 1000);

// 認証ミドルウェア（APIにもログイン必須）
function requireAuth(req, res, next) {
  if (req.isAuthenticated()) return next();
  res.status(401).json({ error: "ログインが必要です" });
}

// 部屋を作成（ホスト）
app.post("/room/create", requireAuth, (req, res) => {
  const { code, peerId, abilityMode } = req.body;
  if (!code || !peerId) {
    return res.status(400).json({ error: "code と peerId は必須です" });
  }
  if (!/^\d{6}$/.test(code)) {
    return res.status(400).json({ error: "部屋番号は6桁の数字にしてください" });
  }
  if (rooms.has(code)) {
    return res.status(409).json({ error: "その部屋番号はすでに使われています" });
  }
  rooms.set(code, {
    peerId,
    hostName: req.user.name || "ホスト",
    abilityMode: abilityMode !== false,
    createdAt: Date.now(),
  });
  console.log(`部屋作成: ${code} (host: ${req.user.name}, peer: ${peerId})`);
  res.json({ ok: true });
});

// 部屋情報を取得（ゲスト）
app.get("/room/:code", requireAuth, (req, res) => {
  const code = req.params.code;
  const room = rooms.get(code);
  if (!room) {
    return res.status(404).json({ error: "部屋が見つかりません" });
  }
  res.json({
    peerId: room.peerId,
    hostName: room.hostName,
    abilityMode: room.abilityMode,
  });
});

// 部屋を削除（ホストがゲーム開始または退室時）
app.delete("/room/:code", requireAuth, (req, res) => {
  const code = req.params.code;
  rooms.delete(code);
  console.log(`部屋削除: ${code}`);
  res.json({ ok: true });
});

// ── ランクマッチ（3人固定マッチング） ────────────────────────────
// rankQueue: userId -> { peerId, userName, joinedAt, matchId }
const rankQueue = new Map();
// rankMatches: matchId -> { players:[{userId,peerId,userName,myIdx}], settled:false }
const rankMatches = new Map();
// ratings: userId -> { rating, name }
const ratings = new Map();
const RANK_TTL_MS = 5 * 60 * 1000;

// レーティング取得（初回は1000で初期化）
function getRating(userId, name) {
  if (!ratings.has(userId)) ratings.set(userId, { rating: 1000, name: name || "?" });
  else if (name) ratings.get(userId).name = name;
  return ratings.get(userId).rating;
}

// レーティング変動計算
// score: プレイヤーの最終持ち点（0基準）
// myRating: 自分のレーティング
// oppRatings: 対戦相手2人のレーティング配列
function calcRatingChange(score, myRating, oppRatings) {
  // 持ち点2000で最大値±50（線形）
  const scoreRatio = Math.max(-1, Math.min(1, score / 2000));
  let baseChange = scoreRatio * 50;

  // レート差補正: 相手が強いほど獲得レートが増え、弱いほど減る
  const avgOpp = oppRatings.reduce((s, r) => s + r, 0) / oppRatings.length;
  const diff = avgOpp - myRating;
  // diff: 正 → 強い相手、負 → 弱い相手。±400差で ±20%補正
  const modifier = 1 + diff / 2000;
  const clamped = Math.max(0.5, Math.min(1.5, modifier));
  return Math.round(Math.max(-50, Math.min(50, baseChange * clamped)));
}

// 古いエントリを定期削除
setInterval(() => {
  const now = Date.now();
  for (const [uid, entry] of rankQueue.entries()) {
    if (now - entry.joinedAt > RANK_TTL_MS) {
      rankQueue.delete(uid);
      console.log(`ランクキュー: ${uid} タイムアウト削除`);
    }
  }
}, 30 * 1000);

// 現在のレートを取得
app.get("/rank/my-rating", requireAuth, (req, res) => {
  const userId = req.user.id;
  const rating = getRating(userId, req.user.name);
  res.json({ rating });
});

// キューに参加（3人揃ったらマッチ成立）
app.post("/rank/join", requireAuth, (req, res) => {
  const { peerId } = req.body;
  if (!peerId) return res.status(400).json({ error: "peerId は必須です" });

  const userId = req.user.id;
  const userName = req.user.name || "プレイヤー";

  // すでにマッチ済みか確認
  const existing = rankQueue.get(userId);
  if (existing && existing.matchId) {
    const match = rankMatches.get(existing.matchId);
    if (match) {
      const me = match.players.find(p => p.userId === userId);
      const others = match.players.filter(p => p.userId !== userId);
      return res.json({
        matched: true, matchId: existing.matchId,
        isHost: me.myIdx === 0, myIdx: me.myIdx,
        hostPeerId: match.players[0].peerId,
        opponents: others.map(p => ({ name: p.userName, rating: getRating(p.userId) })),
        myRating: getRating(userId),
      });
    }
  }

  // レート登録/更新
  getRating(userId, userName);

  // 自分のエントリを登録
  rankQueue.set(userId, { peerId, userName, joinedAt: Date.now(), matchId: null });

  // 待機中（未マッチ）のプレイヤーを集める（自分を含む、FIFO順）
  const waiting = [];
  for (const [uid, entry] of rankQueue.entries()) {
    if (!entry.matchId) waiting.push({ uid, ...entry });
    if (waiting.length >= 3) break;
  }

  if (waiting.length >= 3) {
    // 3人揃った: マッチ成立
    const matchId = "rm-" + Date.now();
    const players = waiting.slice(0, 3).map((w, i) => ({
      userId: w.uid, peerId: w.peerId, userName: w.userName, myIdx: i,
    }));

    rankMatches.set(matchId, { players, settled: false });
    players.forEach(p => {
      const entry = rankQueue.get(p.userId);
      if (entry) entry.matchId = matchId;
    });

    console.log(`ランクマッチ成立: ${players.map(p => p.userName).join(" vs ")}`);

    // 自分の情報を返す
    const me = players.find(p => p.userId === userId);
    const others = players.filter(p => p.userId !== userId);
    return res.json({
      matched: true, matchId,
      isHost: me.myIdx === 0, myIdx: me.myIdx,
      hostPeerId: players[0].peerId,
      opponents: others.map(p => ({ name: p.userName, rating: getRating(p.userId) })),
      myRating: getRating(userId),
    });
  }

  console.log(`ランクキュー: ${userName} 待機中 (${rankQueue.size}人目)`);
  res.json({ matched: false, queueSize: rankQueue.size });
});

// マッチ状態をポーリング
app.get("/rank/status", requireAuth, (req, res) => {
  const userId = req.user.id;
  const entry = rankQueue.get(userId);
  if (!entry) return res.json({ inQueue: false, matched: false });
  if (!entry.matchId) return res.json({ inQueue: true, matched: false, queueSize: rankQueue.size });

  const match = rankMatches.get(entry.matchId);
  if (!match) return res.json({ inQueue: false, matched: false });

  const me = match.players.find(p => p.userId === userId);
  const others = match.players.filter(p => p.userId !== userId);
  res.json({
    matched: true, matchId: entry.matchId,
    isHost: me.myIdx === 0, myIdx: me.myIdx,
    hostPeerId: match.players[0].peerId,
    opponents: others.map(p => ({ name: p.userName, rating: getRating(p.userId) })),
    myRating: getRating(userId),
  });
});

// キューから離脱
app.delete("/rank/cancel", requireAuth, (req, res) => {
  const userId = req.user.id;
  rankQueue.delete(userId);
  console.log(`ランクキュー: ${req.user.name} キャンセル`);
  res.json({ ok: true });
});

// ランクマッチ完了後にクリーンアップ
app.delete("/rank/done", requireAuth, (req, res) => {
  rankQueue.delete(req.user.id);
  res.json({ ok: true });
});

// ゲーム結果を提出してレート更新（ホストのみ）
// scores: [{userId, score}] — playerIdx 0,1,2 の順
app.post("/rank/result", requireAuth, (req, res) => {
  const { matchId, scores } = req.body;
  // scores: [ {userId, score}, ... ] or just [score0, score1, score2]
  if (!matchId || !Array.isArray(scores)) return res.status(400).json({ error: "matchId と scores は必須" });

  const match = rankMatches.get(matchId);
  if (!match) return res.status(404).json({ error: "マッチが見つかりません" });
  if (match.settled) {
    // 既に確定済み: 保存済みの変動を返す
    return res.json({ ok: true, changes: match.ratingChanges });
  }

  // レーティング更新
  const players = match.players;
  const ratingBefore = players.map(p => getRating(p.userId));
  const changes = players.map((p, i) => {
    const myScore = typeof scores[i] === "object" ? scores[i].score : scores[i];
    const oppRatings = ratingBefore.filter((_, j) => j !== i);
    return calcRatingChange(myScore ?? 0, ratingBefore[i], oppRatings);
  });

  players.forEach((p, i) => {
    const r = ratings.get(p.userId);
    if (r) {
      r.rating = Math.max(1, r.rating + changes[i]);
    }
  });

  match.settled = true;
  match.ratingChanges = players.map((p, i) => ({
    userId: p.userId, name: p.userName,
    before: ratingBefore[i],
    change: changes[i],
    after: ratings.get(p.userId)?.rating ?? ratingBefore[i],
  }));

  console.log(`ランク結果確定: ${match.ratingChanges.map(r => `${r.name} ${r.before}→${r.after}`).join(", ")}`);
  res.json({ ok: true, changes: match.ratingChanges });
});

// ゲスト用: 確定済みマッチ結果を取得
app.get("/rank/result-view", requireAuth, (req, res) => {
  const { matchId } = req.query;
  if (!matchId) return res.status(400).json({ error: "matchId は必須" });
  const match = rankMatches.get(matchId);
  if (!match) return res.status(404).json({ error: "マッチが見つかりません" });
  if (!match.settled) return res.json({ ok: false, pending: true });
  res.json({ ok: true, changes: match.ratingChanges });
});

// ── Login page ───────────────────────────────────────────────────
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
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body {
    background: #0b1520;
    height: 100vh;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    font-family: 'Noto Serif JP', serif;
  }
  .emoji { font-size: 3rem; margin-bottom: 10px; }
  h1 { font-size: 2.4rem; font-weight: 900; color: #c9a84c; letter-spacing: .4em; margin-bottom: 6px; }
  p { font-size: .7rem; color: #5a7a6a; letter-spacing: .25em; margin-bottom: 40px; }
  .card {
    background: linear-gradient(135deg, #091422, #060e18);
    border: 1px solid #1a3a2a;
    border-radius: 14px;
    padding: 30px 36px;
    text-align: center;
  }
  .msg { color: #5a7a6a; font-size: .8rem; letter-spacing: .1em; margin-bottom: 20px; }
  a.btn {
    display: inline-flex;
    align-items: center;
    gap: 12px;
    background: #fff;
    color: #333;
    font-weight: 700;
    font-size: .9rem;
    padding: 12px 28px;
    border-radius: 9px;
    text-decoration: none;
    box-shadow: 0 2px 8px #00000066;
    transition: transform .15s;
  }
  a.btn:hover { transform: translateY(-2px); }
  svg { flex-shrink: 0; }
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

// ── Game page (protected) ────────────────────────────────────────
app.get("/game", (req, res) => {
  if (!req.isAuthenticated()) return res.redirect("/");
  res.sendFile(path.join(__dirname, "tenibijan.html"));
});

// ── Start ────────────────────────────────────────────────────────
app.listen(PORT, () => {
  console.log(`サーバー起動 ポート: ${PORT}`);
});
