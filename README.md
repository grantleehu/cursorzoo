# CloudNotes

A single-file Cloudflare Worker cloud note system backed by KV storage. Features a modern dark-themed web UI and a curl-friendly REST API for CLI access.

## Deploy

### 1. Install Wrangler

```bash
npm install -g wrangler
wrangler login
```

### 2. Create KV Namespace

```bash
npx wrangler kv namespace create NOTES
```

Copy the output `id` into `wrangler.toml`:

```toml
[[kv_namespaces]]
binding = "NOTES"
id = "paste-your-id-here"
```

### 3. (Optional) Set an API Token

Protect write operations with a secret token:

```bash
npx wrangler secret put API_TOKEN
```

Or set it in `wrangler.toml` under `[vars]` (less secure, visible in source).

### 4. Deploy

```bash
npx wrangler deploy
```

Your CloudNotes instance will be live at `https://cloudnotes.<your-subdomain>.workers.dev`.

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
