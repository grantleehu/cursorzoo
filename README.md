# CloudNotes

A single-file Cloudflare Worker cloud note system backed by KV storage. Features a modern dark-themed web UI and a curl-friendly REST API for CLI access.

## Deploy (Cloudflare Dashboard, no CLI needed)

All operations through the web interface at [dash.cloudflare.com](https://dash.cloudflare.com).

### Step 1 — Create KV Namespace

1. Login to Cloudflare Dashboard
2. Left sidebar: **Workers & Pages** → **KV**
3. Click **Create a namespace**
4. Name it `NOTES`, click **Add**

![KV](https://developers.cloudflare.com/assets/kv-create-namespace.png)

### Step 2 — Create Worker

1. Left sidebar: **Workers & Pages** → **Overview**
2. Click **Create** → **Create Worker**
3. Give it a name, e.g. `cloudnotes`
4. Click **Deploy** (this deploys the default "Hello World" — we'll replace it next)

### Step 3 — Paste Code

1. After deploy, click **Edit code** (opens the online editor)
2. **Select all** the default code in `worker.js` and **delete** it
3. Open the `worker.js` file from this repo, **copy the entire content**
4. **Paste** it into the editor
5. Click **Deploy** (top right)

### Step 4 — Bind KV Namespace

1. Go back to the Worker overview page (click the Worker name in breadcrumb)
2. Click **Settings** tab
3. Scroll to **Bindings** section, click **Add**
4. Choose **KV Namespace**
5. **Variable name** must be exactly: `NOTES`
6. **KV namespace** select the `NOTES` namespace you created in Step 1
7. Click **Save**

> After changing bindings you may need to re-deploy: go to **Edit code** and click **Deploy** again.

### Step 5 — (Optional) Set API Token

To protect write operations (POST/PUT/DELETE) with a token:

1. Go to Worker **Settings** tab
2. Scroll to **Variables and Secrets** section, click **Add**
3. Choose **Add variable**
4. **Variable name**: `API_TOKEN`
5. **Value**: your secret token string (e.g. `my-s3cret-t0ken`)
6. Click **Encrypt** to make it a secret (recommended), then **Save**

After this, all write API calls require `Authorization: Bearer my-s3cret-t0ken` header.

### Done!

Your CloudNotes is now live at:

```
https://cloudnotes.<your-subdomain>.workers.dev
```

Find the exact URL on the Worker overview page under **Preview URL** / **Routes**.

---

## Deploy (Alternative: Wrangler CLI)

If you prefer using the CLI:

```bash
npm install -g wrangler
wrangler login
npx wrangler kv namespace create NOTES
# Copy the id into wrangler.toml
npx wrangler deploy
# Optionally: npx wrangler secret put API_TOKEN
```

---

## Web UI

Open the Worker URL in a browser. The web UI supports:

- Creating, editing, and deleting notes
- Full-text search in the sidebar
- Tag management
- Keyboard shortcut: **Ctrl+S / Cmd+S** to save
- If an API token is configured, click the browser console and run `setToken()` or set it from the prompt on first load

---

## CLI Usage (curl)

All examples assume `URL=https://cloudnotes.your-subdomain.workers.dev`. Add `-H "Authorization: Bearer YOUR_TOKEN"` if you set an API token.

### List all notes

```bash
curl $URL/api/notes
```

### Create a note

```bash
curl -X POST $URL/api/notes \
  -H "Content-Type: application/json" \
  -d '{"title":"Meeting Notes","content":"Discuss Q2 roadmap","tags":["work","meeting"]}'
```

You can also specify a custom `id`:

```bash
curl -X POST $URL/api/notes \
  -H "Content-Type: application/json" \
  -d '{"id":"my-note","title":"My Note","content":"Hello world"}'
```

### Get a note

```bash
curl $URL/api/notes/meeting-notes
```

### Update a note

```bash
curl -X PUT $URL/api/notes/meeting-notes \
  -H "Content-Type: application/json" \
  -d '{"content":"Updated content here"}'
```

### Delete a note

```bash
curl -X DELETE $URL/api/notes/meeting-notes
```

### Quick one-liner to pipe stdin into a note

```bash
echo "remember to buy milk" | curl -X PUT $URL/api/notes/todo \
  -H "Content-Type: application/json" \
  -d "$(jq -Rsc '{content: .}')"
```

### Shell helper function

Add this to your `.bashrc` / `.zshrc` for a quick `note` command:

```bash
# CloudNotes CLI helper
NOTE_URL="https://cloudnotes.your-subdomain.workers.dev"
NOTE_TOKEN=""  # fill in if you set API_TOKEN

note() {
  local auth=""
  [ -n "$NOTE_TOKEN" ] && auth="-H \"Authorization: Bearer $NOTE_TOKEN\""

  case "${1:-ls}" in
    ls)
      eval curl -s $auth "$NOTE_URL/api/notes" | jq -r '.notes[] | "\(.id)\t\(.title)\t\(.updated_at)"'
      ;;
    get)
      eval curl -s $auth "$NOTE_URL/api/notes/$2" | jq .
      ;;
    new)
      eval curl -s -X POST $auth "$NOTE_URL/api/notes" \
        -H "Content-Type: application/json" \
        -d "'$(jq -nc --arg t "$2" --arg c "$3" '{title:$t,content:$c}')'"  | jq .
      ;;
    edit)
      eval curl -s -X PUT $auth "$NOTE_URL/api/notes/$2" \
        -H "Content-Type: application/json" \
        -d "'$(jq -nc --arg c "$3" '{content:$c}')'" | jq .
      ;;
    rm)
      eval curl -s -X DELETE $auth "$NOTE_URL/api/notes/$2" | jq .
      ;;
    *)
      echo "Usage: note [ls|get|new|edit|rm] [id] [content]"
      ;;
  esac
}
```

Usage:

```bash
note ls                          # list notes
note new "Title" "Content"       # create
note get my-note                 # read
note edit my-note "new content"  # update
note rm my-note                  # delete
```

---

## API Reference

| Method   | Path              | Description     | Body                                      |
|----------|-------------------|-----------------|--------------------------------------------|
| `GET`    | `/api/notes`      | List all notes  | —                                          |
| `POST`   | `/api/notes`      | Create a note   | `{id?, title?, content?, tags?}`           |
| `GET`    | `/api/notes/:id`  | Get a note      | —                                          |
| `PUT`    | `/api/notes/:id`  | Update a note   | `{title?, content?, tags?}`                |
| `DELETE` | `/api/notes/:id`  | Delete a note   | —                                          |

Query parameters on `GET /api/notes`:
- `limit` — max notes to return (default 100)
- `cursor` — pagination cursor from previous response

Auth: include `Authorization: Bearer <token>` header or `?token=<token>` query parameter for write operations (POST/PUT/DELETE) when `API_TOKEN` is configured.

---

## Architecture

```
┌─────────────────────────────────────────┐
│            Cloudflare Worker            │
│                worker.js                │
│  ┌─────────┐  ┌──────────┐  ┌───────┐  │
│  │ Web UI  │  │ REST API │  │  Auth  │  │
│  │  (HTML) │  │ /api/*   │  │ Check  │  │
│  └────┬────┘  └────┬─────┘  └───┬───┘  │
│       │            │             │       │
│       └────────────┴─────────────┘       │
│                    │                     │
│            ┌───────┴───────┐             │
│            │  Cloudflare   │             │
│            │   KV Store    │             │
│            └───────────────┘             │
└─────────────────────────────────────────┘
```

Single file. No dependencies. No build step.
