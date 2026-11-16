const express = require("express");
const path = require("path");
const fs = require("fs");
const crypto = require("crypto");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const multer = require("multer");
const Database = require("better-sqlite3");
const rateLimit = require("express-rate-limit");

const app = express();
const PORT = process.env.PORT || 3000;
const JWT_SECRET = process.env.JWT_SECRET || "DEV-ONLY-change-this-secret-before-deploying";
const ROOT = __dirname;
const DATA_DIR = path.join(ROOT, "data");
const UPLOAD_DIR = path.join(ROOT, "uploads");
fs.mkdirSync(DATA_DIR, { recursive: true });
fs.mkdirSync(UPLOAD_DIR, { recursive: true });

const db = new Database(path.join(DATA_DIR, "community.sqlite"));
db.pragma("journal_mode = WAL");
db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT NOT NULL UNIQUE COLLATE NOCASE,
    password_hash TEXT NOT NULL,
    description TEXT NOT NULL DEFAULT '',
    avatar TEXT,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  );
  CREATE TABLE IF NOT EXISTS posts (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    content TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  );
`);

app.use(express.json({ limit: "30kb" }));
app.use(express.static(path.join(ROOT, "public")));
app.use("/uploads", express.static(UPLOAD_DIR));

const authLimiter = rateLimit({ windowMs: 15 * 60 * 1000, limit: 30, standardHeaders: true, legacyHeaders: false });
const upload = multer({
  storage: multer.diskStorage({
    destination: (_, __, cb) => cb(null, UPLOAD_DIR),
    filename: (_, file, cb) => {
      const ext = path.extname(file.originalname).toLowerCase();
      cb(null, crypto.randomBytes(16).toString("hex") + ext);
    }
  }),
  limits: { fileSize: 3 * 1024 * 1024 },
  fileFilter: (_, file, cb) => {
    if (!["image/jpeg", "image/png", "image/webp", "image/gif"].includes(file.mimetype)) {
      return cb(new Error("Format foto harus JPG, PNG, WEBP, atau GIF."));
    }
    cb(null, true);
  }
});

function publicUser(row) {
  return { id: row.id, username: row.username, description: row.description || "", avatar: row.avatar || null };
}
function makeToken(user) {
  return jwt.sign({ id: user.id }, JWT_SECRET, { expiresIn: "7d" });
}
function requireAuth(req, res, next) {
  const header = req.headers.authorization || "";
  const token = header.startsWith("Bearer ") ? header.slice(7) : "";
  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    const user = db.prepare("SELECT * FROM users WHERE id = ?").get(decoded.id);
    if (!user) return res.status(401).json({ error: "Akun tidak ditemukan." });
    req.user = user;
    next();
  } catch {
    return res.status(401).json({ error: "Silakan login terlebih dahulu." });
  }
}

app.post("/api/register", authLimiter, async (req, res) => {
  const username = String(req.body.username || "").trim();
  const password = String(req.body.password || "");
  if (!/^[a-zA-Z0-9_]{3,20}$/.test(username))
    return res.status(400).json({ error: "Nama pengguna harus 3–20 karakter (huruf, angka, atau _)." });
  if (password.length < 8)
    return res.status(400).json({ error: "Password minimal 8 karakter." });
  const hash = await bcrypt.hash(password, 12);
  try {
    const result = db.prepare("INSERT INTO users (username, password_hash) VALUES (?, ?)").run(username, hash);
    const user = db.prepare("SELECT * FROM users WHERE id = ?").get(result.lastInsertRowid);
    res.status(201).json({ token: makeToken(user), user: publicUser(user) });
  } catch (e) {
    if (String(e).includes("UNIQUE")) return res.status(409).json({ error: "Nama pengguna sudah dipakai." });
    res.status(500).json({ error: "Gagal membuat akun." });
  }
});

app.post("/api/login", authLimiter, async (req, res) => {
  const username = String(req.body.username || "").trim();
  const password = String(req.body.password || "");
  const user = db.prepare("SELECT * FROM users WHERE username = ? COLLATE NOCASE").get(username);
  if (!user || !(await bcrypt.compare(password, user.password_hash)))
    return res.status(401).json({ error: "Nama pengguna atau password salah." });
  res.json({ token: makeToken(user), user: publicUser(user) });
});

app.get("/api/me", requireAuth, (req, res) => res.json({ user: publicUser(req.user) }));

app.patch("/api/profile", requireAuth, (req, res) => {
  const description = String(req.body.description || "").trim();
  if (description.length > 300) return res.status(400).json({ error: "Deskripsi maksimal 300 karakter." });
  db.prepare("UPDATE users SET description = ? WHERE id = ?").run(description, req.user.id);
  const updated = db.prepare("SELECT * FROM users WHERE id = ?").get(req.user.id);
  res.json({ user: publicUser(updated) });
});

app.post("/api/profile/avatar", requireAuth, upload.single("avatar"), (req, res) => {
  if (!req.file) return res.status(400).json({ error: "Pilih foto terlebih dahulu." });
  const oldAvatar = req.user.avatar;
  const avatar = "/uploads/" + req.file.filename;
  db.prepare("UPDATE users SET avatar = ? WHERE id = ?").run(avatar, req.user.id);
  if (oldAvatar && oldAvatar.startsWith("/uploads/")) {
    const oldPath = path.join(UPLOAD_DIR, path.basename(oldAvatar));
    if (fs.existsSync(oldPath)) fs.unlink(oldPath, () => {});
  }
  const updated = db.prepare("SELECT * FROM users WHERE id = ?").get(req.user.id);
  res.json({ user: publicUser(updated) });
});

app.get("/api/posts", (req, res) => {
  const posts = db.prepare(`
    SELECT p.id, p.content, p.created_at, u.id AS user_id, u.username, u.avatar, u.description
    FROM posts p JOIN users u ON u.id = p.user_id
    ORDER BY p.id DESC LIMIT 100
  `).all();
  res.json({ posts: posts.map(p => ({
    id: p.id, content: p.content, createdAt: p.created_at,
    user: { id: p.user_id, username: p.username, avatar: p.avatar, description: p.description }
  })) });
});

app.post("/api/posts", requireAuth, (req, res) => {
  const content = String(req.body.content || "").trim();
  if (!content) return res.status(400).json({ error: "Postingan tidak boleh kosong." });
  if (content.length > 2000) return res.status(400).json({ error: "Postingan maksimal 2.000 karakter." });
  const result = db.prepare("INSERT INTO posts (user_id, content) VALUES (?, ?)").run(req.user.id, content);
  const post = db.prepare(`
    SELECT p.id, p.content, p.created_at, u.id AS user_id, u.username, u.avatar, u.description
    FROM posts p JOIN users u ON u.id = p.user_id WHERE p.id = ?
  `).get(result.lastInsertRowid);
  res.status(201).json({ post: {
    id: post.id, content: post.content, createdAt: post.created_at,
    user: { id: post.user_id, username: post.username, avatar: post.avatar, description: post.description }
  }});
});

app.delete("/api/posts/:id", requireAuth, (req, res) => {
  const result = db.prepare("DELETE FROM posts WHERE id = ? AND user_id = ?").run(Number(req.params.id), req.user.id);
  if (!result.changes) return res.status(404).json({ error: "Postingan tidak ditemukan atau bukan milikmu." });
  res.json({ ok: true });
});

app.use((err, req, res, next) => {
  if (err instanceof multer.MulterError && err.code === "LIMIT_FILE_SIZE")
    return res.status(400).json({ error: "Ukuran foto maksimal 3 MB." });
  if (err) return res.status(400).json({ error: err.message || "Terjadi kesalahan." });
  next();
});

app.listen(PORT, () => console.log(`Ruang Komunitas berjalan di http://localhost:${PORT}`));
