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

  // GET /api/export — download all notes as text file
  if (path === "/api/export" && method === "GET") {
    return exportNotes(env);
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

// ---- Export all notes as plain text ----
async function exportNotes(env) {
  const all = [];
  let cursor = undefined;
  do {
    const list = await env.NOTES.list({ prefix: "note:", limit: 100, cursor });
    const batch = await Promise.all(
      list.keys.map((k) => env.NOTES.get(k.name, "json"))
    );
    all.push(...batch.filter(Boolean));
    cursor = list.list_complete ? null : list.cursor;
  } while (cursor);

  all.sort((a, b) => b.updated_at.localeCompare(a.updated_at));

  const divider = "=".repeat(60);
  const text = all
    .map((n) => {
      const parts = [divider, `Title:   ${n.title || "(untitled)"}`];
      if (n.tags?.length) parts.push(`Tags:    ${n.tags.join(", ")}`);
      parts.push(`Date:    ${n.updated_at}`);
      parts.push(`ID:      ${n.id}`);
      parts.push(divider, "", n.content || "", "");
      return parts.join("\n");
    })
    .join("\n");

  const header = `CloudNotes Export  |  ${all.length} notes  |  ${new Date().toISOString()}\n\n`;
  const filename = `cloudnotes-${new Date().toISOString().slice(0, 10)}.txt`;

  return new Response(header + text, {
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "Content-Disposition": `attachment; filename="${filename}"`,
      ...corsHeaders(),
    },
  });
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
<meta name="viewport" content="width=device-width,initial-scale=1.0,maximum-scale=1.0,user-scalable=no,viewport-fit=cover">
<meta name="apple-mobile-web-app-capable" content="yes">
<meta name="apple-mobile-web-app-status-bar-style" content="black-translucent">
<meta name="theme-color" content="#16161e">
<title>CloudNotes</title>
<style>
*{margin:0;padding:0;box-sizing:border-box;-webkit-tap-highlight-color:transparent}
:root{
  --bg:#111118;--surface:#1c1c28;--surface2:#252536;--border:#2a2a40;
  --text:#d8d8e8;--text2:#7a7a96;--text3:#50506a;
  --accent:#7c6fff;--accent-soft:rgba(124,111,255,.12);
  --danger:#ef5f5f;--success:#3fc56b;
  --radius:8px;--safe-b:env(safe-area-inset-bottom,0px);
}
html,body{height:100%;overflow:hidden}
body{font-family:-apple-system,BlinkMacSystemFont,"SF Pro Text","Segoe UI",Roboto,Helvetica,sans-serif;
  background:var(--bg);color:var(--text)}

/* ---- View system: list vs editor ---- */
.view{position:absolute;inset:0;display:flex;flex-direction:column;
  transition:transform .25s cubic-bezier(.4,0,.2,1),opacity .25s;will-change:transform,opacity}
.view.hidden-left{transform:translateX(-30%);opacity:0;pointer-events:none}
.view.hidden-right{transform:translateX(30%);opacity:0;pointer-events:none}

/* ---- Top bar ---- */
.topbar{display:flex;align-items:center;gap:.5rem;padding:.6rem .8rem;
  background:var(--surface);border-bottom:1px solid var(--border);
  min-height:52px;flex-shrink:0}
.topbar h1{font-size:1.1rem;font-weight:700;letter-spacing:-.01em;flex:1}
.topbar h1 b{color:var(--accent);font-weight:700}
.topbar-title{font-size:.95rem;font-weight:600;flex:1;white-space:nowrap;
  overflow:hidden;text-overflow:ellipsis}

/* ---- Buttons ---- */
.btn{display:inline-flex;align-items:center;justify-content:center;gap:.35rem;
  border:none;border-radius:var(--radius);cursor:pointer;font-size:.85rem;
  font-weight:500;transition:all .12s;min-height:40px;padding:0 .9rem;
  -webkit-user-select:none;user-select:none}
.btn-primary{background:var(--accent);color:#fff}
.btn-primary:active{filter:brightness(.85)}
.btn-ghost{background:transparent;color:var(--text2)}
.btn-ghost:active{background:var(--surface2)}
.btn-danger{background:transparent;color:var(--danger)}
.btn-danger:active{background:rgba(239,95,95,.12)}
.btn-icon{width:40px;padding:0;background:transparent;color:var(--text2);font-size:1.2rem}
.btn-icon:active{background:var(--surface2);border-radius:50%}

/* ---- Search ---- */
.search-bar{padding:.5rem .8rem;flex-shrink:0}
.search-bar input{width:100%;padding:.55rem .8rem;background:var(--surface2);
  border:1.5px solid var(--border);border-radius:var(--radius);color:var(--text);
  font-size:.9rem;outline:none;transition:border-color .15s}
.search-bar input:focus{border-color:var(--accent)}
.search-bar input::placeholder{color:var(--text3)}

/* ---- Note list ---- */
.note-list{flex:1;overflow-y:auto;-webkit-overflow-scrolling:touch;padding:.3rem .5rem}
.note-item{display:flex;flex-direction:column;padding:.75rem .8rem;
  border-radius:var(--radius);cursor:pointer;margin-bottom:.2rem;
  transition:background .1s;border:1.5px solid transparent}
.note-item:active{background:var(--surface2)}
.note-item.active{background:var(--accent-soft);border-color:var(--accent)}
.note-item .n-title{font-weight:600;font-size:.9rem;line-height:1.35;
  overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.note-item .n-preview{font-size:.78rem;color:var(--text2);margin-top:.2rem;
  line-height:1.3;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.note-item .n-meta{font-size:.7rem;color:var(--text3);margin-top:.3rem;
  display:flex;align-items:center;gap:.5rem}
.note-item .n-tag{color:var(--accent);font-weight:500}

/* ---- Editor ---- */
.editor{display:flex;flex-direction:column;flex:1;overflow:hidden}
.editor-fields{padding:.6rem .8rem;display:flex;flex-direction:column;gap:.5rem;
  flex-shrink:0;border-bottom:1px solid var(--border)}
.field-input{width:100%;padding:.55rem .8rem;background:var(--surface2);
  border:1.5px solid var(--border);border-radius:var(--radius);color:var(--text);
  font-size:.9rem;outline:none;transition:border-color .15s}
.field-input:focus{border-color:var(--accent)}
.field-input::placeholder{color:var(--text3)}
.field-title{font-size:1.05rem;font-weight:600}
.field-tags{font-size:.82rem}
.editor-content{flex:1;overflow:hidden}
.editor-content textarea{width:100%;height:100%;resize:none;background:var(--bg);
  color:var(--text);border:none;padding:.8rem;font-family:"SF Mono","JetBrains Mono",
  "Fira Code","Cascadia Code",Menlo,monospace;font-size:.88rem;line-height:1.7;
  outline:none;-webkit-overflow-scrolling:touch}
.editor-content textarea::placeholder{color:var(--text3)}

/* ---- Bottom bar (editor actions) ---- */
.bottom-bar{display:flex;align-items:center;gap:.5rem;padding:.5rem .8rem;
  padding-bottom:calc(.5rem + var(--safe-b));
  background:var(--surface);border-top:1px solid var(--border);flex-shrink:0}
.bottom-bar .spacer{flex:1}
.char-count{font-size:.72rem;color:var(--text3)}

/* ---- Empty state ---- */
.empty{flex:1;display:flex;align-items:center;justify-content:center;
  flex-direction:column;gap:.6rem;color:var(--text3);padding:2rem}
.empty svg{width:40px;height:40px;stroke-width:1.2}
.empty span{font-size:.9rem}

/* ---- Toast ---- */
.toast{position:fixed;bottom:calc(1rem + var(--safe-b));left:50%;
  transform:translateX(-50%) translateY(0);padding:.55rem 1.1rem;
  border-radius:20px;font-size:.82rem;font-weight:500;color:#fff;
  z-index:999;animation:toastIn .3s ease}
.toast.success{background:var(--success)}
.toast.error{background:var(--danger)}
@keyframes toastIn{from{opacity:0;transform:translateX(-50%) translateY(12px)}
  to{opacity:1;transform:translateX(-50%) translateY(0)}}

/* ---- Desktop: side-by-side layout ---- */
@media(min-width:768px){
  .view{position:static;display:flex;flex-direction:column}
  .view.hidden-left,.view.hidden-right{transform:none;opacity:1;pointer-events:auto}
  .desktop-split{display:flex;flex:1;overflow:hidden}
  .desktop-split .panel-list{width:300px;min-width:260px;max-width:360px;
    border-right:1px solid var(--border);display:flex;flex-direction:column;
    background:var(--surface)}
  .desktop-split .panel-editor{flex:1;display:flex;flex-direction:column}
  #listView{display:none!important}
  #editorView{display:none!important}
  #desktopView{display:flex!important;flex-direction:column;position:static;flex:1}
  #desktopView .topbar-editor{display:none}
  body{display:flex;flex-direction:column}
  .bottom-bar{padding-bottom:.5rem}
}
@media(max-width:767px){
  #desktopView{display:none!important}
}

/* ---- Scrollbar (desktop) ---- */
@media(min-width:768px){
  ::-webkit-scrollbar{width:5px}
  ::-webkit-scrollbar-track{background:transparent}
  ::-webkit-scrollbar-thumb{background:var(--border);border-radius:3px}
}
</style>
</head>
<body>

<!-- ===== Mobile: List View ===== -->
<div class="view" id="listView">
  <div class="topbar">
    <h1>Cloud<b>Notes</b></h1>
    <button class="btn btn-icon" onclick="exportAll()" title="Export all">
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
    </button>
    <button class="btn btn-icon" onclick="setToken()" title="Set token">
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>
    </button>
    <button class="btn btn-primary" onclick="newNote()">+ New</button>
  </div>
  <div class="search-bar">
    <input type="text" id="searchMobile" placeholder="Search..." oninput="filterNotes()">
  </div>
  <div class="note-list" id="noteListMobile"></div>
  <div class="empty" id="emptyList" style="display:none">
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>
    <span>No notes yet. Tap <b>+ New</b> to start.</span>
  </div>
</div>

<!-- ===== Mobile: Editor View ===== -->
<div class="view hidden-right" id="editorView">
  <div class="topbar">
    <button class="btn btn-icon" onclick="showList()">
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="15 18 9 12 15 6"/></svg>
    </button>
    <span class="topbar-title" id="editorTitle">New note</span>
    <button class="btn btn-danger" onclick="deleteCurrentNote()">Delete</button>
  </div>
  <div class="editor">
    <div class="editor-fields">
      <input class="field-input field-title" type="text" id="titleMobile" placeholder="Title">
      <input class="field-input field-tags" type="text" id="tagsMobile" placeholder="Tags (comma separated)">
    </div>
    <div class="editor-content">
      <textarea id="contentMobile" placeholder="Write here..."></textarea>
    </div>
  </div>
  <div class="bottom-bar">
    <span class="char-count" id="charCount">0 chars</span>
    <span class="spacer"></span>
    <button class="btn btn-primary" onclick="saveNote()">Save</button>
  </div>
</div>

<!-- ===== Desktop: Split View ===== -->
<div id="desktopView" style="display:none">
  <div class="topbar">
    <h1>Cloud<b>Notes</b></h1>
    <button class="btn btn-icon" onclick="exportAll()" title="Export all">
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
    </button>
    <button class="btn btn-icon" onclick="setToken()" title="Set token">
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>
    </button>
    <button class="btn btn-primary" onclick="newNote()">+ New</button>
  </div>
  <div class="desktop-split">
    <div class="panel-list">
      <div class="search-bar">
        <input type="text" id="searchDesktop" placeholder="Search..." oninput="filterNotes()">
      </div>
      <div class="note-list" id="noteListDesktop"></div>
      <div class="empty" id="emptyListDesktop" style="display:none">
        <span>No notes yet</span>
      </div>
    </div>
    <div class="panel-editor">
      <div class="empty" id="emptyEditor">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.2" width="40" height="40"><path d="M12 20h9M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"/></svg>
        <span>Select or create a note</span>
      </div>
      <div id="desktopEditor" style="display:none;flex:1;flex-direction:column" class="editor">
        <div class="editor-fields">
          <input class="field-input field-title" type="text" id="titleDesktop" placeholder="Title">
          <input class="field-input field-tags" type="text" id="tagsDesktop" placeholder="Tags (comma separated)">
        </div>
        <div class="editor-content">
          <textarea id="contentDesktop" placeholder="Write here..."></textarea>
        </div>
        <div class="bottom-bar">
          <span class="char-count" id="charCountDesktop">0 chars</span>
          <span class="spacer"></span>
          <button class="btn btn-danger" onclick="deleteCurrentNote()" style="margin-right:.4rem">Delete</button>
          <button class="btn btn-primary" onclick="saveNote()">Save</button>
        </div>
      </div>
    </div>
  </div>
</div>

<script>
const BASE = location.origin;
let notes = [];
let currentId = null;
let token = localStorage.getItem("cn_token") || "";

function isMobile() { return window.innerWidth < 768; }

function $(id) { return document.getElementById(id); }

// Unified getters for current mode
function getTitle() { return isMobile() ? $("titleMobile") : $("titleDesktop"); }
function getTags()  { return isMobile() ? $("tagsMobile")  : $("tagsDesktop"); }
function getContent(){ return isMobile() ? $("contentMobile") : $("contentDesktop"); }
function getSearch() { return isMobile() ? $("searchMobile") : $("searchDesktop"); }

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
  const q = (getSearch().value || "").toLowerCase();
  const filtered = notes.filter(n =>
    n.title.toLowerCase().includes(q) ||
    n.content.toLowerCase().includes(q) ||
    (n.tags || []).some(t => t.toLowerCase().includes(q))
  );

  const html = filtered.map(n => {
    const preview = n.content.replace(/\\n/g, " ").slice(0, 80);
    return \`<div class="note-item \${n.id === currentId ? 'active' : ''}" onclick="selectNote('\${esc(n.id)}')">
      <div class="n-title">\${esc(n.title || n.id)}</div>
      \${preview ? '<div class="n-preview">' + esc(preview) + '</div>' : ''}
      <div class="n-meta">
        <span>\${timeAgo(n.updated_at)}</span>
        \${(n.tags||[]).map(t => '<span class="n-tag">#' + esc(t) + '</span>').join("")}
      </div>
    </div>\`;
  }).join("");

  $("noteListMobile").innerHTML = html;
  $("noteListDesktop").innerHTML = html;

  const empty = filtered.length === 0 && notes.length === 0;
  $("emptyList").style.display = (isMobile() && empty) ? "flex" : "none";
  $("emptyListDesktop").style.display = (!isMobile() && empty) ? "flex" : "none";
}

function selectNote(id) {
  currentId = id;
  const note = notes.find(n => n.id === id);
  if (!note) return;

  getTitle().value = note.title || "";
  getContent().value = note.content || "";
  getTags().value = (note.tags || []).join(", ");
  updateCharCount();
  renderList();

  if (isMobile()) {
    $("editorTitle").textContent = note.title || note.id;
    $("listView").classList.add("hidden-left");
    $("editorView").classList.remove("hidden-right");
  } else {
    $("emptyEditor").style.display = "none";
    $("desktopEditor").style.display = "flex";
  }
}

function showList() {
  $("listView").classList.remove("hidden-left");
  $("editorView").classList.add("hidden-right");
}

function newNote() {
  currentId = null;
  getTitle().value = "";
  getContent().value = "";
  getTags().value = "";
  updateCharCount();

  if (isMobile()) {
    $("editorTitle").textContent = "New note";
    $("listView").classList.add("hidden-left");
    $("editorView").classList.remove("hidden-right");
    setTimeout(() => getTitle().focus(), 300);
  } else {
    $("emptyEditor").style.display = "none";
    $("desktopEditor").style.display = "flex";
    getTitle().focus();
  }
}

async function saveNote() {
  const title = getTitle().value.trim();
  const content = getContent().value;
  const tags = getTags().value.split(",").map(t => t.trim()).filter(Boolean);
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
  if (isMobile()) $("editorTitle").textContent = data.title || data.id;
  toast("Saved", "success");
  await loadNotes();
}

async function deleteCurrentNote() {
  if (!currentId) return;
  if (!confirm("Delete this note?")) return;
  await api("/api/notes/" + encodeURIComponent(currentId), { method: "DELETE" });
  currentId = null;
  toast("Deleted", "success");

  if (isMobile()) {
    showList();
  } else {
    $("emptyEditor").style.display = "flex";
    $("desktopEditor").style.display = "none";
  }
  await loadNotes();
}

function filterNotes() {
  if (isMobile()) $("searchDesktop").value = $("searchMobile").value;
  else $("searchMobile").value = $("searchDesktop").value;
  renderList();
}

function updateCharCount() {
  const len = getContent().value.length;
  const txt = len + " chars";
  $("charCount").textContent = txt;
  $("charCountDesktop").textContent = txt;
}

// Char count on typing
["contentMobile","contentDesktop"].forEach(id => {
  $(id).addEventListener("input", updateCharCount);
});

// Ctrl+S / Cmd+S
document.addEventListener("keydown", e => {
  if ((e.ctrlKey || e.metaKey) && e.key === "s") {
    e.preventDefault();
    saveNote();
  }
});

function toast(msg, type) {
  const el = document.createElement("div");
  el.className = "toast " + type;
  el.textContent = msg;
  document.body.appendChild(el);
  setTimeout(() => el.remove(), 2000);
}

function esc(s) {
  if (!s) return "";
  return s.replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;").replace(/'/g,"&#39;");
}

function timeAgo(iso) {
  const d = new Date(iso), diff = (Date.now() - d) / 1000;
  if (diff < 60) return "just now";
  if (diff < 3600) return Math.floor(diff / 60) + "m ago";
  if (diff < 86400) return Math.floor(diff / 3600) + "h ago";
  if (diff < 2592000) return Math.floor(diff / 86400) + "d ago";
  return d.toLocaleDateString();
}

function exportAll() {
  const url = BASE + "/api/export" + (token ? "?token=" + encodeURIComponent(token) : "");
  const a = document.createElement("a");
  a.href = url;
  a.download = "";
  document.body.appendChild(a);
  a.click();
  a.remove();
  toast("Exporting...", "success");
}

function setToken() {
  const t = prompt("Enter API token (empty = open access):", token);
  if (t !== null) { token = t; localStorage.setItem("cn_token", t); loadNotes(); }
}

loadNotes();
</script>
</body>
</html>`;
