const enc = new TextEncoder();
const hex = (b) => [...new Uint8Array(b)].map((x) => x.toString(16).padStart(2, "0")).join("");
const rnd = (n) => crypto.getRandomValues(new Uint8Array(n));
const json = (d, s = 200, h = {}) => new Response(JSON.stringify(d), { status: s, headers: { "Content-Type": "application/json", "Cache-Control": "no-store", ...h } });
const RANKS = ["Паучонок", "Брудильщик", "Душитель линий", "Старший брудер", "Мать Выводка"];
const MAX_AGE = 60 * 60 * 24 * 30;

async function hashPw(pw, saltHex) {
  const salt = new Uint8Array(saltHex.match(/../g).map((x) => parseInt(x, 16)));
  const key = await crypto.subtle.importKey("raw", enc.encode(pw), "PBKDF2", false, ["deriveBits"]);
  return hex(await crypto.subtle.deriveBits({ name: "PBKDF2", hash: "SHA-256", salt, iterations: 100000 }, key, 256));
}
async function sha(s) { return hex(await crypto.subtle.digest("SHA-256", enc.encode(s))); }
function same(a, b) { if (a.length !== b.length) return false; let r = 0; for (let i = 0; i < a.length; i++) r |= a.charCodeAt(i) ^ b.charCodeAt(i); return r === 0; }
function cookie(request, name) { const m = (request.headers.get("Cookie") || "").match(new RegExp("(?:^|; )" + name + "=([^;]*)")); return m ? m[1] : null; }
const pub = (u) => ({ nick: u.nick, rank: u.rank, joined: u.created, num: u.num });

async function startSession(env, userId) {
  const token = hex(rnd(32));
  await env.DB.prepare("INSERT INTO sessions (token_hash, user_id, expires) VALUES (?, ?, ?)").bind(await sha(token), userId, Date.now() + MAX_AGE * 1000).run();
  return `sid=${token}; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=${MAX_AGE}`;
}
async function currentUser(env, request) {
  const t = cookie(request, "sid"); if (!t) return null;
  return await env.DB.prepare("SELECT u.* FROM sessions s JOIN users u ON u.id = s.user_id WHERE s.token_hash = ? AND s.expires > ?").bind(await sha(t), Date.now()).first();
}

export async function onRequest({ request, env, params }) {
  const route = [].concat(params.route || []).join("/");
  const method = request.method;
  if (route === "me" && method === "GET") {
    const u = await currentUser(env, request);
    return json({ user: u ? pub(u) : null });
  }
  if (method !== "POST") return json({ error: "Не найдено" }, 404);
  if (!(request.headers.get("Content-Type") || "").includes("application/json")) return json({ error: "Неверный запрос" }, 400);
  let body; try { body = await request.json(); } catch { return json({ error: "Неверный запрос" }, 400); }

  if (route === "logout") {
    const t = cookie(request, "sid");
    if (t) await env.DB.prepare("DELETE FROM sessions WHERE token_hash = ?").bind(await sha(t)).run();
    return json({ ok: true }, 200, { "Set-Cookie": "sid=; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=0" });
  }

  const nick = String(body.nick || "").trim(), password = String(body.password || "");
  if (!/^[\p{L}\p{N}_\- ]{2,18}$/u.test(nick)) return json({ error: "Ник: 2–18 символов, буквы, цифры, пробел, _ и -" }, 400);
  if (password.length < 6 || password.length > 100) return json({ error: "Пароль от 6 до 100 символов" }, 400);
  const lc = nick.toLowerCase();

  if (route === "register") {
    if (await env.DB.prepare("SELECT 1 FROM users WHERE nick_lc = ?").bind(lc).first()) return json({ error: "Такой ник уже занят" }, 409);
    const salt = hex(rnd(16)), hash = await hashPw(password, salt);
    const rank = RANKS[rnd(1)[0] % RANKS.length], num = String(10000000 + (new DataView(rnd(4).buffer).getUint32(0) % 90000000)), created = Date.now();
    let r;
    try { r = await env.DB.prepare("INSERT INTO users (nick, nick_lc, salt, hash, rank, num, created) VALUES (?, ?, ?, ?, ?, ?, ?)").bind(nick, lc, salt, hash, rank, num, created).run(); }
    catch { return json({ error: "Такой ник уже занят" }, 409); }
    const cookieStr = await startSession(env, r.meta.last_row_id);
    return json({ ok: true, user: pub({ nick, rank, num, created }) }, 200, { "Set-Cookie": cookieStr });
  }

  if (route === "login") {
    const u = await env.DB.prepare("SELECT * FROM users WHERE nick_lc = ?").bind(lc).first();
    const hash = await hashPw(password, u ? u.salt : "00".repeat(16));
    if (!u || !same(hash, u.hash)) return json({ error: "Неверный ник или пароль" }, 401);
    return json({ ok: true, user: pub(u) }, 200, { "Set-Cookie": await startSession(env, u.id) });
  }
  return json({ error: "Не найдено" }, 404);
}
