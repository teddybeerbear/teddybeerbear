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
