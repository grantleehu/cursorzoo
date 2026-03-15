// CloudNotes — A single-file Cloudflare Worker cloud note system
// KV Namespace binding: NOTES
// Optional env: API_TOKEN (set to protect write operations)

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const path = url.pathname;

    if (!env.NOTES) {
      return json({ error: "KV namespace NOTES not bound" }, 500);
    }

    // CORS headers for CLI / external access
    if (request.method === "OPTIONS") {
      return new Response(null, { status: 204, headers: corsHeaders() });
    }

    // ---------- API routes ----------
    if (path.startsWith("/api/")) {
      return handleAPI(request, env, url, path);
    }

    // ---------- Web UI ----------
    if (path === "/" || path === "/index.html") {
      return new Response(HTML, {
        headers: { "Content-Type": "text/html; charset=utf-8" },
      });
    }

    return json({ error: "Not found" }, 404);
  },
};

// ======================== API ========================

async function handleAPI(request, env, url, path) {
  const method = request.method;

  // Auth check for mutation operations
  if (["POST", "PUT", "DELETE"].includes(method)) {
    const err = checkAuth(request, env);
    if (err) return err;
  }

  // GET /api/notes — list
  if (path === "/api/notes" && method === "GET") {
    return listNotes(env, url);
  }

  // POST /api/notes — create
  if (path === "/api/notes" && method === "POST") {
    return createNote(request, env);
  }

  // Single note routes: /api/notes/:id
  const m = path.match(/^\/api\/notes\/([^/]+)$/);
  if (m) {
    const id = decodeURIComponent(m[1]);
    if (method === "GET") return getNote(env, id);
    if (method === "PUT") return updateNote(request, env, id);
    if (method === "DELETE") return deleteNote(env, id);
  }

  return json({ error: "Not found" }, 404);
}

function checkAuth(request, env) {
  const token = env.API_TOKEN;
  if (!token) return null; // no token configured = open access
  const provided =
    request.headers.get("Authorization")?.replace("Bearer ", "") ||
    new URL(request.url).searchParams.get("token");
  if (provided !== token) {
    return json({ error: "Unauthorized" }, 401);
  }
  return null;
}

// ---- List ----
async function listNotes(env, url) {
  const prefix = "note:";
  const limit = parseInt(url.searchParams.get("limit")) || 100;
  const cursor = url.searchParams.get("cursor") || undefined;

  const list = await env.NOTES.list({ prefix, limit, cursor });
  const notes = await Promise.all(
    list.keys.map(async (k) => {
      const val = await env.NOTES.get(k.name, "json");
      return val;
    })
  );

  return json({
    notes,
    cursor: list.list_complete ? null : list.cursor,
    total: notes.length,
  });
}

// ---- Get ----
async function getNote(env, id) {
  const val = await env.NOTES.get(`note:${id}`, "json");
  if (!val) return json({ error: "Note not found" }, 404);
  return json(val);
}

// ---- Create ----
async function createNote(request, env) {
  const body = await parseBody(request);
  if (!body || (!body.title && !body.content)) {
    return json({ error: "title or content required" }, 400);
  }

  const id = body.id || slug(body.title) || nanoid();
  const now = new Date().toISOString();
  const note = {
    id,
    title: body.title || "",
    content: body.content || "",
    tags: body.tags || [],
    created_at: now,
    updated_at: now,
  };

  await env.NOTES.put(`note:${id}`, JSON.stringify(note));
  return json(note, 201);
}

// ---- Update ----
async function updateNote(request, env, id) {
  const existing = await env.NOTES.get(`note:${id}`, "json");
  const body = await parseBody(request);
  if (!body) return json({ error: "Request body required" }, 400);

  const now = new Date().toISOString();
  const note = {
    id,
    title: body.title ?? existing?.title ?? "",
    content: body.content ?? existing?.content ?? "",
    tags: body.tags ?? existing?.tags ?? [],
    created_at: existing?.created_at ?? now,
    updated_at: now,
  };

  await env.NOTES.put(`note:${id}`, JSON.stringify(note));
  return json(note);
}

// ---- Delete ----
async function deleteNote(env, id) {
  await env.NOTES.delete(`note:${id}`);
  return json({ ok: true, id });
}

// ======================== Helpers ========================

function json(data, status = 200) {
  return new Response(JSON.stringify(data, null, 2), {
    status,
    headers: {
      "Content-Type": "application/json",
      ...corsHeaders(),
    },
  });
}

function corsHeaders() {
  return {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET,POST,PUT,DELETE,OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization",
  };
}

async function parseBody(request) {
  const ct = request.headers.get("Content-Type") || "";
  try {
    if (ct.includes("application/json")) {
      return await request.json();
    }
    // Support form-urlencoded for easy curl usage
    if (ct.includes("form")) {
      const fd = await request.formData();
      const obj = {};
      for (const [k, v] of fd.entries()) obj[k] = v;
      if (obj.tags && typeof obj.tags === "string") {
        obj.tags = obj.tags.split(",").map((t) => t.trim());
      }
      return obj;
    }
    // Fallback: try JSON
    const text = await request.text();
    if (text) return JSON.parse(text);
  } catch {
    /* ignore */
  }
  return null;
}

function slug(str) {
  if (!str) return "";
  return str
    .toLowerCase()
    .replace(/[^a-z0-9\u4e00-\u9fff]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 64);
}

function nanoid(len = 12) {
  const chars = "abcdefghijklmnopqrstuvwxyz0123456789";
  let id = "";
  const arr = new Uint8Array(len);
  crypto.getRandomValues(arr);
  for (const b of arr) id += chars[b % chars.length];
  return id;
}

// ======================== Embedded Web UI ========================

const HTML = `<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>CloudNotes</title>
<style>
*{margin:0;padding:0;box-sizing:border-box}
:root{
  --bg:#0f0f13;--surface:#1a1a24;--surface2:#22223a;--border:#2e2e4a;
  --text:#e4e4ef;--text2:#9999b3;--accent:#6c63ff;--accent2:#8b83ff;
  --danger:#ff6b6b;--success:#51cf66;--radius:10px;
}
html{font-size:15px}
body{font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;
  background:var(--bg);color:var(--text);min-height:100vh;display:flex;flex-direction:column}

/* Header */
header{background:var(--surface);border-bottom:1px solid var(--border);
  padding:.8rem 1.5rem;display:flex;align-items:center;justify-content:space-between;
  position:sticky;top:0;z-index:100;backdrop-filter:blur(12px)}
header h1{font-size:1.25rem;font-weight:700;letter-spacing:-.02em}
header h1 span{color:var(--accent)}
.header-actions{display:flex;gap:.5rem;align-items:center}
.btn{padding:.45rem .9rem;border:none;border-radius:var(--radius);cursor:pointer;
  font-size:.85rem;font-weight:500;transition:all .15s}
.btn-primary{background:var(--accent);color:#fff}
.btn-primary:hover{background:var(--accent2)}
.btn-ghost{background:transparent;color:var(--text2);border:1px solid var(--border)}
.btn-ghost:hover{background:var(--surface2);color:var(--text)}
.btn-danger{background:transparent;color:var(--danger);border:1px solid var(--danger)}
.btn-danger:hover{background:var(--danger);color:#fff}
.btn-sm{padding:.3rem .6rem;font-size:.78rem}

/* Layout */
.app{display:flex;flex:1;overflow:hidden}
.sidebar{width:280px;min-width:280px;background:var(--surface);border-right:1px solid var(--border);
  display:flex;flex-direction:column;overflow:hidden}
.sidebar-header{padding:.75rem 1rem;border-bottom:1px solid var(--border)}
.sidebar-header input{width:100%;padding:.45rem .7rem;background:var(--surface2);
  border:1px solid var(--border);border-radius:var(--radius);color:var(--text);
  font-size:.85rem;outline:none}
.sidebar-header input:focus{border-color:var(--accent)}
.note-list{flex:1;overflow-y:auto;padding:.5rem}
.note-item{padding:.6rem .8rem;border-radius:var(--radius);cursor:pointer;
  margin-bottom:.25rem;transition:background .12s}
.note-item:hover{background:var(--surface2)}
.note-item.active{background:var(--accent);color:#fff}
.note-item .title{font-weight:600;font-size:.88rem;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.note-item .meta{font-size:.72rem;color:var(--text2);margin-top:.15rem}
.note-item.active .meta{color:rgba(255,255,255,.7)}

/* Editor */
.editor-area{flex:1;display:flex;flex-direction:column;overflow:hidden}
.editor-toolbar{padding:.6rem 1rem;border-bottom:1px solid var(--border);
  display:flex;gap:.5rem;align-items:center;flex-wrap:wrap}
.editor-toolbar input{flex:1;min-width:200px;padding:.4rem .7rem;background:var(--surface2);
  border:1px solid var(--border);border-radius:var(--radius);color:var(--text);
  font-size:.95rem;font-weight:600;outline:none}
.editor-toolbar input:focus{border-color:var(--accent)}
.editor-body{flex:1;display:flex;overflow:hidden}
.editor-body textarea{flex:1;resize:none;background:var(--bg);color:var(--text);
  border:none;padding:1rem 1.2rem;font-family:'JetBrains Mono','Fira Code',monospace;
  font-size:.88rem;line-height:1.65;outline:none;tab-size:2}
.editor-body textarea::placeholder{color:var(--text2)}

/* Tags */
.tag-input{display:flex;gap:.3rem;align-items:center;flex-wrap:wrap}
.tag{display:inline-block;padding:.15rem .5rem;background:var(--surface2);
  border-radius:20px;font-size:.72rem;color:var(--accent2)}

/* Empty state */
.empty-state{flex:1;display:flex;align-items:center;justify-content:center;
  flex-direction:column;color:var(--text2);gap:.5rem}
.empty-state svg{width:48px;height:48px;opacity:.3}

/* Toast */
.toast{position:fixed;bottom:1.5rem;right:1.5rem;padding:.6rem 1rem;
  border-radius:var(--radius);font-size:.82rem;font-weight:500;
  animation:slideIn .25s ease;z-index:999;color:#fff}
.toast.success{background:var(--success)}
.toast.error{background:var(--danger)}
@keyframes slideIn{from{transform:translateY(20px);opacity:0}to{transform:translateY(0);opacity:1}}

/* Responsive */
@media(max-width:700px){
  .sidebar{width:100%;min-width:0;position:absolute;left:0;top:52px;bottom:0;
    z-index:50;transform:translateX(-100%);transition:transform .2s}
  .sidebar.open{transform:translateX(0)}
  .menu-toggle{display:inline-flex!important}
}
.menu-toggle{display:none;background:none;border:none;color:var(--text);
  font-size:1.3rem;cursor:pointer;padding:.2rem}

/* Scrollbar */
::-webkit-scrollbar{width:6px}
::-webkit-scrollbar-track{background:transparent}
::-webkit-scrollbar-thumb{background:var(--border);border-radius:3px}
</style>
</head>
<body>

<header>
  <div style="display:flex;align-items:center;gap:.6rem">
    <button class="menu-toggle" onclick="toggleSidebar()">&#9776;</button>
    <h1>Cloud<span>Notes</span></h1>
  </div>
  <div class="header-actions">
    <button class="btn btn-primary" onclick="newNote()">+ New</button>
  </div>
</header>

<div class="app">
  <aside class="sidebar" id="sidebar">
    <div class="sidebar-header">
      <input type="text" id="search" placeholder="Search notes..." oninput="filterNotes()">
    </div>
    <div class="note-list" id="noteList"></div>
  </aside>

  <main class="editor-area" id="editorArea">
    <div class="empty-state" id="emptyState">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M12 20h9M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"/></svg>
      <span>Select or create a note</span>
    </div>
    <div id="editorContainer" style="display:none;flex:1;display:flex;flex-direction:column">
      <div class="editor-toolbar">
        <input type="text" id="titleInput" placeholder="Note title...">
        <input type="text" id="tagsInput" placeholder="Tags (comma separated)" style="flex:.5;min-width:120px;font-size:.8rem">
        <button class="btn btn-primary btn-sm" onclick="saveNote()">Save</button>
        <button class="btn btn-danger btn-sm" onclick="deleteCurrentNote()">Delete</button>
      </div>
      <div class="editor-body">
        <textarea id="contentArea" placeholder="Write your note here..."></textarea>
      </div>
    </div>
  </main>
</div>

<script>
const BASE = location.origin;
let notes = [];
let currentId = null;
let token = localStorage.getItem("cn_token") || "";

async function api(path, opts = {}) {
  const headers = { "Content-Type": "application/json", ...(opts.headers || {}) };
  if (token) headers["Authorization"] = "Bearer " + token;
  const res = await fetch(BASE + path, { ...opts, headers });
  return res.json();
}

async function loadNotes() {
  const data = await api("/api/notes");
  notes = (data.notes || []).sort((a, b) => b.updated_at.localeCompare(a.updated_at));
  renderList();
}

function renderList() {
  const q = document.getElementById("search").value.toLowerCase();
  const filtered = notes.filter(n =>
    n.title.toLowerCase().includes(q) ||
    n.content.toLowerCase().includes(q) ||
    (n.tags || []).some(t => t.toLowerCase().includes(q))
  );
  const list = document.getElementById("noteList");
  list.innerHTML = filtered.map(n => \`
    <div class="note-item \${n.id === currentId ? 'active' : ''}" onclick="selectNote('\${esc(n.id)}')">
      <div class="title">\${esc(n.title || n.id)}</div>
      <div class="meta">\${timeAgo(n.updated_at)}\${n.tags?.length ? ' · ' + n.tags.join(', ') : ''}</div>
    </div>
  \`).join("");
}

function selectNote(id) {
  currentId = id;
  const note = notes.find(n => n.id === id);
  if (!note) return;
  document.getElementById("emptyState").style.display = "none";
  const ec = document.getElementById("editorContainer");
  ec.style.display = "flex";
  document.getElementById("titleInput").value = note.title || "";
  document.getElementById("contentArea").value = note.content || "";
  document.getElementById("tagsInput").value = (note.tags || []).join(", ");
  renderList();
  closeSidebar();
}

function newNote() {
  currentId = null;
  document.getElementById("emptyState").style.display = "none";
  document.getElementById("editorContainer").style.display = "flex";
  document.getElementById("titleInput").value = "";
  document.getElementById("contentArea").value = "";
  document.getElementById("tagsInput").value = "";
  document.getElementById("titleInput").focus();
  closeSidebar();
}

async function saveNote() {
  const title = document.getElementById("titleInput").value.trim();
  const content = document.getElementById("contentArea").value;
  const tags = document.getElementById("tagsInput").value.split(",").map(t => t.trim()).filter(Boolean);
  if (!title && !content) { toast("Title or content required", "error"); return; }

  let data;
  if (currentId) {
    data = await api("/api/notes/" + encodeURIComponent(currentId), {
      method: "PUT", body: JSON.stringify({ title, content, tags })
    });
  } else {
    data = await api("/api/notes", {
      method: "POST", body: JSON.stringify({ title, content, tags })
    });
  }

  if (data.error) { toast(data.error, "error"); return; }
  currentId = data.id;
  toast("Saved!", "success");
  await loadNotes();
  selectNote(currentId);
}

async function deleteCurrentNote() {
  if (!currentId) return;
  if (!confirm("Delete this note?")) return;
  await api("/api/notes/" + encodeURIComponent(currentId), { method: "DELETE" });
  currentId = null;
  document.getElementById("editorContainer").style.display = "none";
  document.getElementById("emptyState").style.display = "flex";
  toast("Deleted", "success");
  await loadNotes();
}

function filterNotes() { renderList(); }

// Ctrl+S / Cmd+S to save
document.addEventListener("keydown", e => {
  if ((e.ctrlKey || e.metaKey) && e.key === "s") {
    e.preventDefault();
    if (document.getElementById("editorContainer").style.display !== "none") saveNote();
  }
});

function toggleSidebar() { document.getElementById("sidebar").classList.toggle("open"); }
function closeSidebar() { document.getElementById("sidebar").classList.remove("open"); }

function toast(msg, type = "success") {
  const el = document.createElement("div");
  el.className = "toast " + type;
  el.textContent = msg;
  document.body.appendChild(el);
  setTimeout(() => el.remove(), 2500);
}

function esc(s) {
  if (!s) return "";
  return s.replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;");
}

function timeAgo(iso) {
  const d = new Date(iso), now = new Date();
  const diff = (now - d) / 1000;
  if (diff < 60) return "just now";
  if (diff < 3600) return Math.floor(diff / 60) + "m ago";
  if (diff < 86400) return Math.floor(diff / 3600) + "h ago";
  if (diff < 2592000) return Math.floor(diff / 86400) + "d ago";
  return d.toLocaleDateString();
}

// Token prompt (one-time)
function setToken() {
  const t = prompt("Enter API token (leave empty for open access):", token);
  if (t !== null) { token = t; localStorage.setItem("cn_token", t); loadNotes(); }
}

loadNotes();
</script>
</body>
</html>`;
