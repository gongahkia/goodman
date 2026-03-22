# TickTick Clone — PRD (`todo.md`)

> **Architecture:** Local-first desktop productivity app with optional self-hosted sync.
>
> | Layer | Stack |
> |---|---|
> | **Desktop Client** | Tauri 2.x (Rust) + Svelte 5 + TypeScript + better-sqlite3 |
> | **Server (optional sync)** | Go 1.22+ (Echo) + PostgreSQL 16 + SMTP (magic link) |
> | **Sync protocol** | Timestamp-based last-write-wins with per-field vector clocks |
>
> **MVP scope:** Tasks · Subtasks · Lists · Priorities · Tags · Calendar view · Recurring tasks · Natural language date input
>
> **Database choice rationale:** PostgreSQL server-side (strong date/time, JSONB for recurrence rules, row-level security ready). SQLite client-side via Tauri Rust backend (offline-first, zero-config).

---

## Module 0: Project Scaffolding (+scaffold)

---

### Task 0 (A) +scaffold
blockedBy: [none]

**PURPOSE** — Establishes the monorepo structure, initializes all project tooling, and provides a local development environment so every subsequent task has a working foundation.

**WHAT TO DO**
1. Create the monorepo directory structure:
   ```
   /
   ├── apps/
   │   └── desktop/              # Tauri 2 + Svelte 5 app
   │       ├── src/              # Svelte frontend source
   │       │   ├── lib/
   │       │   │   ├── components/
   │       │   │   ├── stores/
   │       │   │   ├── services/
   │       │   │   └── types.ts
   │       │   └── App.svelte
   │       ├── src-tauri/        # Rust backend
   │       │   ├── src/
   │       │   │   ├── commands/
   │       │   │   ├── models/
   │       │   │   ├── services/
   │       │   │   └── sync/
   │       │   ├── Cargo.toml
   │       │   └── tauri.conf.json
   │       ├── package.json
   │       └── vite.config.ts
   ├── services/
   │   └── server/               # Go Echo server
   │       ├── cmd/server/
   │       │   └── main.go
   │       ├── internal/
   │       │   ├── app/
   │       │   ├── database/
   │       │   ├── handlers/
   │       │   ├── middleware/
   │       │   ├── models/
   │       │   ├── repository/
   │       │   └── services/
   │       ├── migrations/
   │       ├── Dockerfile
   │       └── go.mod
   ├── schema/
   │   ├── canonical.sql
   │   └── seed.sql
   ├── docker-compose.yml
   ├── .env.example
   └── .github/
       └── workflows/
   ```
2. Initialize the Tauri 2 project with Svelte 5 template:
   - `npm create tauri-app@latest apps/desktop -- --template svelte-ts`
   - Verify `apps/desktop/package.json` has `svelte@^5.0.0`, `@sveltejs/vite-plugin-svelte`, TypeScript, and Vite.
3. Initialize the Go module:
   - `cd services/server && go mod init github.com/<user>/tickclone-server`
   - Add Echo framework: `go get github.com/labstack/echo/v4`
4. Create `docker-compose.yml` for local PostgreSQL:
   ```yaml
   services:
     db:
       image: postgres:16-alpine
       ports:
         - "5432:5432"
       environment:
         POSTGRES_DB: tickclone
         POSTGRES_USER: tickclone
         POSTGRES_PASSWORD: ${DB_PASSWORD:-changeme}
       volumes:
         - pgdata:/var/lib/postgresql/data
       healthcheck:
         test: ["CMD-SHELL", "pg_isready -U tickclone"]
         interval: 5s   # WHY: pg typically starts within 5s; frequent checks speed up docker compose up
         timeout: 5s
         retries: 5
   volumes:
     pgdata:
   ```
5. Create `.env.example` documenting all environment variables with defaults and descriptions.

**DONE WHEN**
- [ ] `cd apps/desktop && npm run tauri dev` compiles and opens a native window.
- [ ] `cd services/server && go build ./cmd/server` compiles with zero errors.
- [ ] `docker compose up -d db` starts PostgreSQL and `pg_isready` reports healthy.
- [ ] The directory structure matches the tree above (all directories exist even if some are empty with `.gitkeep`).

---

## Module 1: Shared Schema & Data Model (+db)

---

### Task 1 (A) +db
blockedBy: [0]

**PURPOSE** — Defines the canonical data model that every client must implement locally in SQLite. Without this, no client can store or manipulate tasks.

**WHAT TO DO**
1. Create `schema/canonical.sql` containing the following tables:
   - `lists` — columns: `id TEXT PRIMARY KEY` (UUIDv7), `name TEXT NOT NULL`, `color TEXT` (hex, e.g. `#3B82F6`), `sort_order INTEGER NOT NULL DEFAULT 0`, `is_inbox INTEGER NOT NULL DEFAULT 0` (boolean, exactly one row may be 1), `created_at TEXT NOT NULL` (ISO8601), `updated_at TEXT NOT NULL` (ISO8601), `deleted_at TEXT` (soft delete).
   - `tasks` — columns: `id TEXT PRIMARY KEY` (UUIDv7), `list_id TEXT NOT NULL REFERENCES lists(id)`, `parent_task_id TEXT REFERENCES tasks(id)` (NULL for top-level, non-NULL for subtasks), `title TEXT NOT NULL`, `content TEXT` (markdown body), `priority INTEGER NOT NULL DEFAULT 0` (0=none, 1=low, 2=medium, 3=high — WHY: 4 levels matches TickTick's priority model and fits in 2 bits), `status INTEGER NOT NULL DEFAULT 0` (0=open, 1=completed), `due_date TEXT` (ISO8601 date or datetime), `due_timezone TEXT` (IANA tz string), `recurrence_rule TEXT` (RRULE string per RFC 5545), `sort_order INTEGER NOT NULL DEFAULT 0`, `completed_at TEXT`, `created_at TEXT NOT NULL`, `updated_at TEXT NOT NULL`, `deleted_at TEXT`.
   - `tags` — columns: `id TEXT PRIMARY KEY`, `name TEXT NOT NULL UNIQUE`, `color TEXT`, `created_at TEXT NOT NULL`.
   - `task_tags` — columns: `task_id TEXT NOT NULL REFERENCES tasks(id)`, `tag_id TEXT NOT NULL REFERENCES tags(id)`, `PRIMARY KEY (task_id, tag_id)`.
   - `sync_meta` — columns: `entity_type TEXT NOT NULL` (`list`, `task`, `tag`, `task_tag`), `entity_id TEXT NOT NULL`, `field_name TEXT NOT NULL`, `updated_at TEXT NOT NULL`, `device_id TEXT NOT NULL`, `PRIMARY KEY (entity_type, entity_id, field_name)`.
2. Add indexes: `idx_tasks_list_id` on `tasks(list_id)`, `idx_tasks_parent` on `tasks(parent_task_id)`, `idx_tasks_due` on `tasks(due_date)`, `idx_tasks_status` on `tasks(status)`, `idx_task_tags_tag` on `task_tags(tag_id)`.
3. Add a `CHECK` constraint on `tasks.priority` ensuring value is in `(0,1,2,3)` and on `tasks.status` ensuring value is in `(0,1)`.

**DONE WHEN**
- [ ] `schema/canonical.sql` executes without error on SQLite 3.40+ and creates all 5 tables with all specified columns, types, constraints, and indexes.
- [ ] Inserting a task with `parent_task_id` referencing a non-existent task fails with a foreign key error (PRAGMA foreign_keys=ON).
- [ ] Inserting a task with `priority=5` fails the CHECK constraint.

---

### Task 2 (A) +db
blockedBy: [0]

**PURPOSE** — Creates the PostgreSQL server-side schema that mirrors the canonical model with Postgres-specific types, enabling the sync server to store all user data.

**WHAT TO DO**
1. Create `services/server/migrations/001_init.up.sql` using PostgreSQL syntax:
   - `users` — columns: `id UUID PRIMARY KEY DEFAULT gen_random_uuid()`, `email TEXT UNIQUE`, `device_id TEXT`, `created_at TIMESTAMPTZ NOT NULL DEFAULT now()`.
   - `magic_links` — columns: `id UUID PRIMARY KEY DEFAULT gen_random_uuid()`, `user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE`, `token TEXT NOT NULL UNIQUE`, `expires_at TIMESTAMPTZ NOT NULL`, `used_at TIMESTAMPTZ`.
   - `lists` — same as canonical but with `user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE`, all `TEXT` timestamps become `TIMESTAMPTZ`, and add `UNIQUE(user_id, id)`.
   - `tasks` — same as canonical with `user_id` added, `TIMESTAMPTZ` for all time columns. Add composite foreign key `(user_id, list_id)` referencing `lists(user_id, id)`.
   - `tags` — same with `user_id`, uniqueness becomes `UNIQUE(user_id, name)`.
   - `task_tags` — same with `user_id`.
   - `sync_log` — columns: `id BIGSERIAL PRIMARY KEY`, `user_id UUID NOT NULL REFERENCES users(id)`, `entity_type TEXT NOT NULL`, `entity_id TEXT NOT NULL`, `field_name TEXT NOT NULL`, `new_value JSONB`, `device_id TEXT NOT NULL`, `timestamp TIMESTAMPTZ NOT NULL DEFAULT now()`. Index on `(user_id, timestamp)`.
2. Create `services/server/migrations/001_init.down.sql` that drops all tables in reverse dependency order.

**DONE WHEN**
- [ ] Running `001_init.up.sql` on a fresh PostgreSQL 16 database succeeds with zero errors.
- [ ] Running `001_init.down.sql` after the up migration leaves zero tables in the `public` schema.
- [ ] The `sync_log` table has an index on `(user_id, timestamp)`.

---

### Task 3 (B) +db
blockedBy: [1]

**PURPOSE** — Provides seed data for development and testing so that every platform client can boot with a realistic dataset.

**WHAT TO DO**
1. Create `schema/seed.sql` that inserts:
   - 1 list named "Inbox" with `is_inbox=1`, 2 additional lists ("Work", "Personal").
   - 10 tasks distributed across the 3 lists: at least 2 with subtasks (depth 1), at least 1 with `recurrence_rule='FREQ=DAILY;INTERVAL=1'`, at least 1 with each priority level (0-3), at least 2 with `status=1` (completed), at least 3 with `due_date` values (one past, one today, one future).
   - 4 tags ("urgent", "errand", "review", "idea") and at least 6 `task_tags` associations.
2. All `id` fields must be hardcoded UUIDv7 strings (use pre-generated values). All `created_at`/`updated_at` must be valid ISO8601.

**DONE WHEN**
- [ ] Executing `canonical.sql` followed by `seed.sql` on a fresh SQLite database succeeds with zero errors.
- [ ] `SELECT COUNT(*) FROM tasks` returns 10; `SELECT COUNT(*) FROM tasks WHERE parent_task_id IS NOT NULL` returns >= 2; `SELECT COUNT(*) FROM tags` returns 4.

---

## Module 2: Server — Go + Echo (+server)

---

### Task 4 (A) +server
blockedBy: [0]

**PURPOSE** — Bootstraps the Go server project with Echo, structured logging, config loading, and graceful shutdown — the foundation for every subsequent server task.

**WHAT TO DO**
1. Initialize `services/server/` as a Go module: `go mod init github.com/<user>/tickclone-server`.
2. Create `services/server/cmd/server/main.go`:
   - Load config from environment variables using `github.com/caarlos0/env/v11`: `PORT` (default `8080`), `DATABASE_URL` (required), `SMTP_HOST`, `SMTP_PORT`, `SMTP_FROM`, `MAGIC_LINK_SECRET` (required, 32+ char — WHY: 256-bit minimum for HS256 JWT signing per RFC 7518 sec 3.2), `CORS_ORIGINS` (comma-separated, default `*`).
   - Initialize `slog.Logger` with JSON handler to stdout.
   - Create Echo instance, attach `middleware.Recover()`, `middleware.CORS()` (using config origins), and a request-logging middleware that logs method, path, status, and latency via `slog`.
   - Register a `GET /health` route returning `{"status":"ok","time":"<RFC3339>"}`.
   - Start server with graceful shutdown on `SIGINT`/`SIGTERM` using `signal.NotifyContext` and `e.Shutdown(ctx)` with 10s timeout — WHY: 10s allows in-flight HTTP requests and DB transactions to complete without hanging indefinitely.
3. Create `services/server/Dockerfile`: multi-stage build, `golang:1.22-alpine` builder, `alpine:3.19` runner, expose `$PORT`, run as non-root user.

**DONE WHEN**
- [ ] `go build ./cmd/server` compiles with zero errors.
- [ ] Running the binary with `DATABASE_URL=postgres://...` set, then `curl localhost:8080/health` returns HTTP 200 with JSON containing `"status":"ok"`.
- [ ] Sending `SIGTERM` to the process causes it to shut down within 10s with a log line indicating graceful shutdown.
- [ ] `docker build -t tickclone-server ./services/server` succeeds.

---

### Task 5 (A) +server +db
blockedBy: [2, 4]

**PURPOSE** — Connects the server to PostgreSQL and runs migrations on startup so the database is always at the latest schema version.

**WHAT TO DO**
1. Add `github.com/jackc/pgx/v5/pgxpool` and `github.com/golang-migrate/migrate/v4` (with `pgx5` driver and `file` source) to `go.mod`.
2. Create `services/server/internal/database/pool.go`:
   - `func NewPool(ctx context.Context, databaseURL string) (*pgxpool.Pool, error)` — parses URL, sets `pool_max_conns=20` (WHY: 20 connections handles ~200 concurrent sync clients given avg query time of ~5ms; exceeding this saturates a single Postgres instance), connects, and pings.
3. Create `services/server/internal/database/migrate.go`:
   - `func RunMigrations(databaseURL string, migrationsPath string) error` — uses `golang-migrate` to run all up migrations from the `migrationsPath` directory. Logs each migration step via `slog`. Returns `nil` on `migrate.ErrNoChange`.
4. In `main.go`, call `RunMigrations` before starting Echo, then `NewPool` and store the pool in a custom Echo context or dependency struct `services/server/internal/app/app.go`: `type App struct { DB *pgxpool.Pool; Log *slog.Logger; Config *Config }`.

**DONE WHEN**
- [ ] Starting the server against an empty PostgreSQL database automatically creates all tables from `001_init.up.sql`.
- [ ] Starting the server again (no new migrations) logs "no change" and proceeds normally.
- [ ] The `/health` endpoint returns 200, confirming the app starts successfully after migration.

---

### Task 6 (A) +server
blockedBy: [5]

**PURPOSE** — Implements full CRUD for lists, the top-level organizational entity that tasks belong to.

**WHAT TO DO**
1. Create `services/server/internal/models/list.go`: struct `List` with fields matching the `lists` table (use `time.Time` for timestamps, `*time.Time` for nullable ones). Add JSON tags (camelCase).
2. Create `services/server/internal/repository/list_repo.go`:
   - `CreateList(ctx, userID uuid.UUID, list *List) error` — `INSERT INTO lists (...) VALUES (...) RETURNING id, created_at, updated_at`.
   - `GetListsByUser(ctx, userID uuid.UUID) ([]List, error)` — `SELECT ... WHERE user_id=$1 AND deleted_at IS NULL ORDER BY sort_order`.
   - `GetListByID(ctx, userID, listID uuid.UUID) (*List, error)`.
   - `UpdateList(ctx, userID, listID uuid.UUID, name *string, color *string, sortOrder *int) (*List, error)` — builds dynamic `SET` clause for non-nil fields, always sets `updated_at=now()`.
   - `DeleteList(ctx, userID, listID uuid.UUID) error` — soft-delete: `UPDATE lists SET deleted_at=now() WHERE ...`. Also soft-deletes all tasks in the list.
3. Create `services/server/internal/handlers/list_handler.go`:
   - `POST /api/lists` — validate `name` non-empty (max 255 chars — WHY: 255 is a safe upper bound for a display name; prevents abuse while accommodating all reasonable list names), create, return 201 + JSON.
   - `GET /api/lists` — return 200 + JSON array.
   - `GET /api/lists/:id` — return 200 or 404.
   - `PATCH /api/lists/:id` — partial update, return 200.
   - `DELETE /api/lists/:id` — soft delete, return 204. Reject if `is_inbox=true` (return 409).
4. Register routes in `main.go` under an `/api` group.

**DONE WHEN**
- [ ] `POST /api/lists` with `{"name":"Work"}` returns 201 with a JSON body containing `id`, `name`, `createdAt`.
- [ ] `GET /api/lists` returns all non-deleted lists for the user.
- [ ] `DELETE /api/lists/:id` on the inbox list returns 409; on a non-inbox list returns 204 and subsequent GET returns 404.
- [ ] `PATCH /api/lists/:id` with `{"color":"#FF0000"}` updates only the color and returns the full updated list.

---

### Task 7 (A) +server
blockedBy: [5]

**PURPOSE** — Implements full CRUD for tasks including subtask nesting, which is the core data entity of the entire application.

**WHAT TO DO**
1. Create `services/server/internal/models/task.go`: struct `Task` with all columns from the `tasks` table. Include a `Subtasks []Task` field (JSON tag `subtasks`, populated on read). Include a `Tags []Tag` field populated via join.
2. Create `services/server/internal/repository/task_repo.go`:
   - `CreateTask(ctx, userID uuid.UUID, task *Task) error` — INSERT, validate `list_id` exists and belongs to user. If `parent_task_id` is set, validate it exists, belongs to same list, and is not itself a subtask (max depth = 1 — WHY: single-level nesting keeps the UI simple and avoids recursive rendering complexity; TickTick uses the same limit).
   - `GetTasksByList(ctx, userID, listID uuid.UUID, includeCompleted bool) ([]Task, error)` — returns top-level tasks with subtasks nested. Joins `task_tags` + `tags` to populate `Tags` field. Filter by `deleted_at IS NULL`. Order by `sort_order`.
   - `GetTaskByID(ctx, userID, taskID uuid.UUID) (*Task, error)` — single task with subtasks and tags.
   - `UpdateTask(ctx, userID, taskID uuid.UUID, fields map[string]interface{}) (*Task, error)` — dynamic SET for provided fields. If `status` changes to 1, set `completed_at=now()`. If `status` changes to 0, set `completed_at=NULL`.
   - `DeleteTask(ctx, userID, taskID uuid.UUID) error` — soft-delete task and all its subtasks.
   - `MoveTask(ctx, userID, taskID, newListID uuid.UUID, newSortOrder int) error` — updates `list_id` and `sort_order`, also moves subtasks.
3. Create `services/server/internal/handlers/task_handler.go`:
   - `POST /api/lists/:listId/tasks` — create task (or subtask if `parentTaskId` in body). Return 201.
   - `GET /api/lists/:listId/tasks?includeCompleted=false` — return nested tasks. Return 200.
   - `GET /api/tasks/:id` — single task. Return 200 or 404.
   - `PATCH /api/tasks/:id` — partial update. Return 200.
   - `DELETE /api/tasks/:id` — soft delete. Return 204.
   - `POST /api/tasks/:id/move` — body `{"listId":"...","sortOrder":0}`. Return 200.

**DONE WHEN**
- [ ] Creating a task under a list returns 201 with all fields populated.
- [ ] Creating a subtask with `parentTaskId` pointing to an existing task returns 201; creating a subtask of a subtask returns 400.
- [ ] `GET /api/lists/:listId/tasks` returns tasks with nested `subtasks` arrays and populated `tags` arrays.
- [ ] Completing a task (`PATCH` with `status:1`) sets `completedAt` to a non-null timestamp.
- [ ] Deleting a parent task also soft-deletes its subtasks.

---

### Task 8 (A) +server
blockedBy: [5]

**PURPOSE** — Implements CRUD for tags and the task-tag association, enabling label-based filtering and organization.

**WHAT TO DO**
1. Create `services/server/internal/models/tag.go`: struct `Tag` with `ID`, `Name`, `Color`, `CreatedAt`.
2. Create `services/server/internal/repository/tag_repo.go`:
   - `CreateTag(ctx, userID uuid.UUID, tag *Tag) error`.
   - `GetTagsByUser(ctx, userID uuid.UUID) ([]Tag, error)`.
   - `UpdateTag(ctx, userID, tagID uuid.UUID, name *string, color *string) (*Tag, error)`.
   - `DeleteTag(ctx, userID, tagID uuid.UUID) error` — hard-delete tag and all `task_tags` rows referencing it.
   - `AddTagToTask(ctx, userID, taskID, tagID uuid.UUID) error` — INSERT into `task_tags`, return conflict-safe (ON CONFLICT DO NOTHING).
   - `RemoveTagFromTask(ctx, userID, taskID, tagID uuid.UUID) error` — DELETE from `task_tags`.
   - `GetTasksByTag(ctx, userID, tagID uuid.UUID) ([]Task, error)` — returns all non-deleted tasks with the given tag.
3. Create `services/server/internal/handlers/tag_handler.go`:
   - `POST /api/tags` — create. Return 201.
   - `GET /api/tags` — list all. Return 200.
   - `PATCH /api/tags/:id` — update. Return 200.
   - `DELETE /api/tags/:id` — delete. Return 204.
   - `POST /api/tasks/:taskId/tags/:tagId` — associate. Return 204.
   - `DELETE /api/tasks/:taskId/tags/:tagId` — disassociate. Return 204.
   - `GET /api/tags/:id/tasks` — list tasks by tag. Return 200.

**DONE WHEN**
- [ ] Creating a tag with `{"name":"urgent","color":"#EF4444"}` returns 201 with an `id`.
- [ ] Associating a tag with a task via `POST /api/tasks/:taskId/tags/:tagId` returns 204; re-posting the same association also returns 204 (idempotent).
- [ ] `GET /api/tags/:id/tasks` returns only tasks associated with that tag.
- [ ] Deleting a tag removes all `task_tags` rows for that tag (verified by querying `task_tags` directly).

---

### Task 9 (A) +server +auth
blockedBy: [5]

**PURPOSE** — Implements passwordless magic link authentication so users can optionally enable sync across devices.

**WHAT TO DO**
1. Create `services/server/internal/services/auth_service.go`:
   - `GenerateMagicLink(ctx, email string) (token string, err error)`:
     a. Find or create user by email in `users` table.
     b. Generate a 32-byte crypto-random token, base64url-encode it.
     c. Insert into `magic_links` with `expires_at = now() + 15 minutes` — WHY: 15min gives enough time to check email (even slow providers) but limits the attack window for token interception.
     d. Return the token (caller sends the email).
   - `ValidateMagicLink(ctx, token string) (userID uuid.UUID, err error)`:
     a. Look up token in `magic_links` where `used_at IS NULL AND expires_at > now()`.
     b. If not found, return `ErrInvalidToken`.
     c. Mark `used_at = now()`.
     d. Return `user_id`.
   - `GenerateSessionToken(userID uuid.UUID) (jwt string, err error)`:
     a. Create a JWT (HS256) signed with `MAGIC_LINK_SECRET`, claims: `sub=userID`, `iat=now`, `exp=now+30days` — WHY: 30-day sessions reduce re-authentication friction for a desktop app; users rarely sign out of productivity tools.
     b. Return the signed token string.
2. Create `services/server/internal/services/email_service.go`:
   - `SendMagicLink(ctx, toEmail, token string) error` — uses `net/smtp` to send an email via configured SMTP. Email body: plain text with a link `{BASE_URL}/auth/verify?token={token}`.
3. Create `services/server/internal/handlers/auth_handler.go`:
   - `POST /api/auth/magic-link` — body `{"email":"..."}`. Calls `GenerateMagicLink`, then `SendMagicLink`. Always returns 200 `{"message":"If that email is registered, a link has been sent."}` (no user enumeration).
   - `POST /api/auth/verify` — body `{"token":"..."}`. Calls `ValidateMagicLink`, then `GenerateSessionToken`. Returns 200 `{"token":"<jwt>","expiresAt":"..."}`.
4. Create `services/server/internal/middleware/auth_middleware.go`:
   - Echo middleware that reads `Authorization: Bearer <jwt>`, validates signature and expiry, extracts `sub` claim as `userID`, sets it in Echo context via `c.Set("userID", userID)`.
   - If no/invalid token: return 401 `{"error":"unauthorized"}`.
   - Apply this middleware to all `/api/*` routes except `/api/auth/*` and `/health`.

**DONE WHEN**
- [ ] `POST /api/auth/magic-link` with a valid email returns 200 and inserts a row into `magic_links`.
- [ ] `POST /api/auth/verify` with a valid, unexpired token returns 200 with a JWT; using the same token again returns 401.
- [ ] Requests to `POST /api/lists` without a Bearer token return 401.
- [ ] Requests to `POST /api/lists` with a valid JWT succeed (200/201) and the created list is associated with the correct `user_id`.

---

### Task 10 (A) +server
blockedBy: [9]

**PURPOSE** — Implements the local-first single-user mode where the server is used without auth, enabling the default no-account experience.

**WHAT TO DO**
1. Add a config flag `AUTH_REQUIRED` (default `false`) loaded in the config struct.
2. Modify `auth_middleware.go`:
   - If `AUTH_REQUIRED=false` and no Bearer token is provided, generate or retrieve a default user (email `local@localhost`) from the `users` table, and set its `userID` in context. Cache the default user ID in memory (sync.Once).
   - If `AUTH_REQUIRED=false` and a Bearer token IS provided, validate it normally (supports mixed mode).
3. Ensure the default local user is auto-created on first server boot (in `main.go` after migrations).

**DONE WHEN**
- [ ] With `AUTH_REQUIRED=false`, `POST /api/lists` without any auth header returns 201 and associates the list with the local default user.
- [ ] With `AUTH_REQUIRED=true`, `POST /api/lists` without auth returns 401.
- [ ] The default user is created exactly once (restarting the server does not create duplicates).

---

### Task 11 (B) +server
blockedBy: [7]

**PURPOSE** — Implements recurring task expansion so the server can generate future instances of recurring tasks based on RRULE.

**WHAT TO DO**
1. Add `github.com/teambition/rrule-go` to `go.mod`.
2. Create `services/server/internal/services/recurrence_service.go`:
   - `ExpandRecurrence(rule string, dtstart time.Time, after time.Time, limit int) ([]time.Time, error)` — parses the RRULE string, returns the next `limit` occurrences after `after`. Default `limit=10` — WHY: 10 previews covers 2+ weeks of daily tasks, which is the practical lookahead horizon for most users.
   - `CompleteRecurringTask(ctx, repo TaskRepo, userID, taskID uuid.UUID) (*Task, error)`:
     a. Fetch the task. If `recurrence_rule` is empty, return error.
     b. Mark current instance as completed (`status=1`, `completed_at=now()`).
     c. Compute next occurrence using `ExpandRecurrence` with `after=task.due_date`.
     d. If a next occurrence exists: create a new task (clone of current, with `status=0`, `due_date=nextOccurrence`, new `id`). Return the new task.
     e. If no more occurrences: just return the completed task.
3. In `task_handler.go`, add `POST /api/tasks/:id/complete`:
   - If task has `recurrence_rule`: call `CompleteRecurringTask`, return 200 with `{"completed": <old>, "next": <new>}`.
   - If no recurrence: just update status to 1, return 200 with `{"completed": <task>}`.

**DONE WHEN**
- [ ] `ExpandRecurrence("FREQ=DAILY;INTERVAL=1", <today>, <today>, 5)` returns exactly 5 dates, each 1 day apart starting tomorrow.
- [ ] `POST /api/tasks/:id/complete` on a recurring task marks the original completed and creates a new task with the next due date.
- [ ] `POST /api/tasks/:id/complete` on a non-recurring task just marks it completed with no new task created.
- [ ] `ExpandRecurrence("FREQ=WEEKLY;BYDAY=MO,WE,FR;COUNT=3", ...)` returns exactly 3 dates all falling on Mon/Wed/Fri.

---

## Module 3: Sync Protocol (+sync)

---

### Task 12 (A) +sync +server
blockedBy: [6, 7, 8]

**PURPOSE** — Implements the server-side sync endpoint that clients push local changes to and pull remote changes from, using timestamp-based conflict resolution.

**WHAT TO DO**
1. Create `services/server/internal/models/sync.go`:
   - `SyncPushPayload` struct: `DeviceID string`, `Changes []ChangeRecord`. Each `ChangeRecord`: `EntityType string`, `EntityID string`, `FieldName string`, `NewValue json.RawMessage`, `Timestamp time.Time`.
   - `SyncPullPayload` struct: `DeviceID string`, `LastSyncAt time.Time`.
   - `SyncPullResponse` struct: `Changes []ChangeRecord`, `ServerTime time.Time`.
2. Create `services/server/internal/services/sync_service.go`:
   - `PushChanges(ctx, userID uuid.UUID, payload SyncPushPayload) (accepted int, conflicts int, err error)`:
     a. For each `ChangeRecord`, check `sync_log` for the latest entry with same `(entity_type, entity_id, field_name)`.
     b. If no existing entry OR `payload.Timestamp > existing.Timestamp`: apply the change (UPDATE the corresponding table field), insert into `sync_log`. Increment `accepted`.
     c. If `payload.Timestamp <= existing.Timestamp`: skip (server wins). Increment `conflicts`.
   - `PullChanges(ctx, userID uuid.UUID, payload SyncPullPayload) (*SyncPullResponse, error)`:
     a. Query `sync_log WHERE user_id=$1 AND device_id != $2 AND timestamp > $3 ORDER BY timestamp ASC`.
     b. Return the change records and current server time.
3. Create `services/server/internal/handlers/sync_handler.go`:
   - `POST /api/sync/push` — accepts `SyncPushPayload`, returns 200 `{"accepted": N, "conflicts": M}`.
   - `POST /api/sync/pull` — accepts `SyncPullPayload`, returns 200 with `SyncPullResponse`.

**DONE WHEN**
- [ ] Pushing a change for field `title` on a task inserts a row into `sync_log` and updates the `tasks` table.
- [ ] Pushing an older timestamp for the same field is rejected (conflict count > 0, table value unchanged).
- [ ] Pulling changes with `lastSyncAt` before a known change returns that change; pulling with `lastSyncAt` after it returns empty.
- [ ] Changes from the same `device_id` are excluded from pull results.

---

### Task 13 (A) +sync +server
blockedBy: [12]

**PURPOSE** — Adds batch transaction support to sync push so that multiple related changes (e.g., creating a task and assigning tags) succeed or fail atomically.

**WHAT TO DO**
1. Modify `PushChanges` in `sync_service.go` to wrap the entire change set in a PostgreSQL transaction (`pool.Begin()`).
2. If any single change fails validation (e.g., references a non-existent list), rollback the entire batch and return a 409 response with details of the failing change.
3. Add a `batch_id` field (UUIDv7) to `SyncPushPayload`. All `sync_log` entries for the batch share this `batch_id`. Add `batch_id TEXT` column to `sync_log` table in a new migration `002_sync_batch.up.sql`.
4. Update the push response to include `batchId` for client-side tracking.

**DONE WHEN**
- [ ] Pushing 3 changes where the 2nd references a non-existent entity returns 409 and none of the 3 are applied (verified by checking `sync_log` is unchanged).
- [ ] Pushing 3 valid changes applies all 3 and all share the same `batch_id` in `sync_log`.
- [ ] The `002_sync_batch.up.sql` migration runs cleanly on top of `001_init`.

---

## Module 4: Tauri App Shell (+tauri)

---

### Task 14 (A) +tauri
blockedBy: [0]

**PURPOSE** — Scaffolds the Tauri 2.x project with Svelte 5 frontend, establishing the cross-platform application shell.

**WHAT TO DO**
1. In the monorepo, ensure `apps/desktop/` contains the Tauri 2 + Svelte 5 project (initialized in Task 0).
2. Ensure `apps/desktop/src-tauri/Cargo.toml` targets Tauri 2.x with features: `["shell-open"]`.
3. Configure `apps/desktop/src-tauri/tauri.conf.json`:
   - `productName`: `"TickClone"`, `identifier`: `"com.tickclone.app"`.
   - Window: `title: "TickClone"`, `width: 1200`, `height: 800` (WHY: 1200x800 is the most common default for productivity apps — large enough to show sidebar + list + detail without scrolling), `minWidth: 800`, `minHeight: 600`.
   - Allow list for IPC commands (to be populated in later tasks).
4. Verify `apps/desktop/package.json` has Svelte 5 (`svelte@^5.0.0`), `@sveltejs/vite-plugin-svelte`, TypeScript, and Vite.
5. Create `apps/desktop/src/App.svelte` with a placeholder layout: 250px left sidebar (WHY: 250px fits ~20 characters of list name which covers 95% of typical list names), remaining content area, top toolbar. Use CSS grid. Display "TickClone" in the toolbar.
6. Verify the dev loop: `cd apps/desktop && npm run tauri dev` launches a native window on the current platform.

**DONE WHEN**
- [ ] `npm run tauri dev` compiles and opens a native window titled "TickClone" with the sidebar + content layout visible.
- [ ] `npm run tauri build` produces a distributable binary for the current platform without errors.
- [ ] The Svelte version in `node_modules/svelte/package.json` is 5.x.

---

### Task 15 (A) +tauri
blockedBy: [1, 14]

**PURPOSE** — Implements the local SQLite database layer in the Tauri Rust backend, providing offline-first task storage.

**WHAT TO DO**
1. Add `rusqlite` (with `bundled` feature) and `serde`/`serde_json` to `src-tauri/Cargo.toml`.
2. Create `src-tauri/src/db.rs`:
   - `pub fn init_db(app_data_dir: &Path) -> Result<Connection>` — opens or creates `tickclone.db` in the app data directory. Runs `PRAGMA foreign_keys=ON`, `PRAGMA journal_mode=WAL` (WHY: WAL mode allows concurrent readers during writes, preventing UI freezes during sync operations). Executes the canonical schema SQL (embed it via `include_str!("../../schema/canonical.sql")` — copy the schema file into the Tauri project or use a shared path).
   - `pub fn get_connection(app_data_dir: &Path) -> Result<Connection>` — opens existing DB with same PRAGMAs.
3. Create `src-tauri/src/state.rs`:
   - `pub struct AppState { pub db_path: PathBuf }` — stored as Tauri managed state.
4. In `src-tauri/src/lib.rs` (Tauri 2):
   - On app setup, resolve `app.path().app_data_dir()`, call `init_db`, store `AppState` via `app.manage()`.

**DONE WHEN**
- [ ] Launching the app creates `tickclone.db` in the platform-appropriate app data directory (e.g., `~/.local/share/com.tickclone.app/` on Linux).
- [ ] The database contains all 5 tables from the canonical schema with correct columns.
- [ ] Relaunching the app does not error or recreate existing tables.

---

### Task 16 (A) +tauri
blockedBy: [15]

**PURPOSE** — Exposes Tauri IPC commands for list CRUD so the Svelte frontend can manage lists via the Rust backend.

**WHAT TO DO**
1. Create `src-tauri/src/commands/list_commands.rs`:
   - `#[tauri::command] pub fn create_list(state: State<AppState>, name: String, color: Option<String>) -> Result<List, String>` — generates UUIDv7 (use `uuid` crate with `v7` feature), inserts into `lists`, returns the created `List` struct.
   - `#[tauri::command] pub fn get_lists(state: State<AppState>) -> Result<Vec<List>, String>` — SELECT all non-deleted lists ordered by `sort_order`.
   - `#[tauri::command] pub fn update_list(state: State<AppState>, id: String, name: Option<String>, color: Option<String>, sort_order: Option<i32>) -> Result<List, String>`.
   - `#[tauri::command] pub fn delete_list(state: State<AppState>, id: String) -> Result<(), String>` — soft-delete. Reject if `is_inbox=1`.
2. Define `#[derive(Serialize, Deserialize)] pub struct List` in `src-tauri/src/models/list.rs` matching canonical schema columns.
3. Register all commands in the Tauri builder: `.invoke_handler(tauri::generate_handler![create_list, get_lists, update_list, delete_list])`.

**DONE WHEN**
- [ ] From Svelte, `invoke('create_list', { name: 'Work' })` returns a JSON object with `id`, `name`, `createdAt`.
- [ ] `invoke('get_lists')` returns an array including the created list.
- [ ] `invoke('delete_list', { id: inboxId })` returns an error string containing "inbox".
- [ ] `invoke('update_list', { id, color: '#FF0000' })` returns the list with updated color.

---

### Task 17 (A) +tauri
blockedBy: [15]

**PURPOSE** — Exposes Tauri IPC commands for task CRUD including subtask support, the primary data operations for the app.

**WHAT TO DO**
1. Create `src-tauri/src/commands/task_commands.rs`:
   - `create_task(state, list_id, title, content?, priority?, due_date?, due_timezone?, recurrence_rule?, parent_task_id?) -> Result<Task, String>` — validates `parent_task_id` depth <= 1 (WHY: single-level nesting keeps the UI simple; same limit as TickTick), generates UUIDv7, inserts.
   - `get_tasks_by_list(state, list_id, include_completed: bool) -> Result<Vec<Task>, String>` — returns top-level tasks with nested `subtasks` vec. Joins tags.
   - `get_task(state, id) -> Result<Task, String>`.
   - `update_task(state, id, fields: TaskUpdatePayload) -> Result<Task, String>` — `TaskUpdatePayload` has all optional fields. Auto-sets `completed_at` on status change.
   - `delete_task(state, id) -> Result<(), String>` — soft-deletes task + subtasks.
   - `move_task(state, id, new_list_id, new_sort_order) -> Result<Task, String>`.
   - `complete_recurring_task(state, id) -> Result<CompleteResult, String>` — uses same logic as server Task 11 but locally. `CompleteResult` has `completed: Task` and optional `next: Task`.
2. Define `Task`, `TaskUpdatePayload`, `CompleteResult` in `src-tauri/src/models/task.rs`.
3. Register all commands.

**DONE WHEN**
- [ ] `invoke('create_task', { listId, title: 'Buy milk', priority: 2 })` returns a task with all fields.
- [ ] `invoke('get_tasks_by_list', { listId, includeCompleted: false })` excludes completed tasks.
- [ ] Creating a subtask of a subtask returns an error.
- [ ] `invoke('complete_recurring_task', { id })` on a task with `recurrenceRule: 'FREQ=DAILY'` returns both `completed` and `next` tasks.

---

### Task 18 (A) +tauri
blockedBy: [15]

**PURPOSE** — Exposes Tauri IPC commands for tag CRUD and task-tag association management.

**WHAT TO DO**
1. Create `src-tauri/src/commands/tag_commands.rs`:
   - `create_tag(state, name, color?) -> Result<Tag, String>`.
   - `get_tags(state) -> Result<Vec<Tag>, String>`.
   - `update_tag(state, id, name?, color?) -> Result<Tag, String>`.
   - `delete_tag(state, id) -> Result<(), String>` — deletes tag + all `task_tags` rows.
   - `add_tag_to_task(state, task_id, tag_id) -> Result<(), String>` — INSERT OR IGNORE.
   - `remove_tag_from_task(state, task_id, tag_id) -> Result<(), String>`.
2. Define `Tag` in `src-tauri/src/models/tag.rs`.
3. Register all commands.

**DONE WHEN**
- [ ] `invoke('create_tag', { name: 'urgent', color: '#EF4444' })` returns a tag with `id`.
- [ ] `invoke('add_tag_to_task', { taskId, tagId })` succeeds; calling again does not error (idempotent).
- [ ] After deleting a tag, `invoke('get_tasks_by_list', ...)` no longer includes that tag in any task's `tags` array.

---

## Module 5: Svelte Frontend (+svelte)

---

### Task 19 (A) +svelte
blockedBy: [16, 17, 18]

**PURPOSE** — Implements the global Svelte store layer that bridges Tauri IPC with reactive UI state, enabling all components to read and mutate app data.

**WHAT TO DO**
1. Create `apps/desktop/src/lib/stores/lists.ts`:
   - Export a writable store `lists` of type `Writable<List[]>`.
   - Export async functions: `loadLists()`, `addList(name, color?)`, `editList(id, updates)`, `removeList(id)`. Each calls the corresponding Tauri `invoke` and updates the store.
2. Create `apps/desktop/src/lib/stores/tasks.ts`:
   - Export a writable store `tasks` of type `Writable<Task[]>` (the current list's tasks).
   - Export a writable store `selectedListId` of type `Writable<string | null>`.
   - Export async functions: `loadTasks(listId, includeCompleted?)`, `addTask(...)`, `editTask(id, fields)`, `removeTask(id)`, `moveTask(id, newListId, sortOrder)`, `completeTask(id)` (handles recurring logic).
   - When `selectedListId` changes, auto-call `loadTasks`.
3. Create `apps/desktop/src/lib/stores/tags.ts`:
   - Export store and CRUD functions for tags, plus `tagTask(taskId, tagId)` and `untagTask(taskId, tagId)`.
4. Create shared TypeScript types in `apps/desktop/src/lib/types.ts`: `List`, `Task`, `Tag`, `TaskUpdatePayload`, matching the Rust models.

**DONE WHEN**
- [ ] Calling `addList('Work')` in browser console (via dev tools) triggers IPC, and the `lists` store reactively updates.
- [ ] Changing `selectedListId` triggers `loadTasks` and the `tasks` store updates with that list's tasks.
- [ ] All TypeScript types compile with `tsc --noEmit` — no type errors.

---

### Task 20 (A) +svelte
blockedBy: [19]

**PURPOSE** — Builds the sidebar component displaying all lists, inbox, tag filters, and the "Add List" action — the primary navigation element.

**WHAT TO DO**
1. Create `apps/desktop/src/lib/components/Sidebar.svelte`:
   - Render the Inbox list at the top (distinguished with an inbox icon — use Lucide SVG inline or a simple SVG).
   - Below inbox, render user lists from `$lists` store sorted by `sort_order`. Each list item shows: colored circle (6px, `list.color`), name, task count badge (number of open tasks).
   - Clicking a list sets `$selectedListId` to that list's ID.
   - Highlight the currently selected list with a background color.
   - "Tags" collapsible section: list all tags with colored dots. Clicking a tag filters the task view (store a `selectedTagId` filter).
   - "+ New List" button at bottom of lists section: on click, show an inline `<input>` that on Enter calls `addList(name)`. Escape cancels.
2. Style: `width: 250px`, dark background (`#1E1E2E`), light text (`#CDD6F4`), hover effects. Use CSS variables for theming.
3. Attach to `App.svelte` in the sidebar grid area.

**DONE WHEN**
- [ ] The sidebar renders Inbox + all user lists with correct colors and task count badges.
- [ ] Clicking a list highlights it and updates the main content area (via store).
- [ ] Typing "Groceries" in the new-list input and pressing Enter creates a list that immediately appears in the sidebar.
- [ ] The Tags section is collapsible (clicking the header toggles visibility).

---

### Task 21 (A) +svelte
blockedBy: [19, 20]

**PURPOSE** — Builds the task list view showing all tasks for the selected list with inline add, complete, and priority indicators.

**WHAT TO DO**
1. Create `apps/desktop/src/lib/components/TaskList.svelte`:
   - If no list selected, show empty state: centered text "Select a list to view tasks".
   - Otherwise, show list name as header with task count.
   - Quick-add input at top: `<input placeholder="Add a task..." />`. On Enter, call `addTask` with the typed title and the current `selectedListId`. Clear input after.
   - Render each task as a row: checkbox (on click -> `completeTask(id)`), priority indicator (colored left border: none/gray/blue/orange/red for 0-3), title text, due date badge (if set, show relative: "Today", "Tomorrow", "Mar 15", styled red if overdue), tag pills (small colored badges).
   - Subtasks: indented below parent with a subtle left margin (24px — WHY: 24px is 1.5x the base font size, providing clear visual hierarchy without excessive indentation). Show collapse/expand chevron on parent if subtasks exist.
   - Completed tasks: if `includeCompleted` is toggled on, show below a "Completed" divider with strikethrough titles and muted colors.
   - Clicking a task title (not checkbox) opens the task detail panel (Task 22).
2. Support drag-and-drop reordering (use a simple mousedown/mousemove/mouseup handler or a lightweight `sortablejs` integration). On drop, call `editTask(id, { sortOrder: newIndex })` for affected tasks.

**DONE WHEN**
- [ ] Typing "Buy milk" and pressing Enter creates a task that appears in the list immediately.
- [ ] Clicking the checkbox on a non-recurring task strikes it through and moves it to the completed section.
- [ ] Tasks with `priority: 3` (high) display a red left border; `priority: 0` has no colored border.
- [ ] Subtasks appear indented under their parent and can be collapsed.
- [ ] Overdue tasks show a red due-date badge.

---

### Task 22 (A) +svelte
blockedBy: [19, 21]

**PURPOSE** — Builds the task detail panel for viewing and editing all task fields, providing the full editing experience.

**WHAT TO DO**
1. Create `apps/desktop/src/lib/components/TaskDetail.svelte`:
   - Slides in from the right (400px wide panel — WHY: 400px provides enough width for date pickers and tag management without overwhelming the task list) when a task is selected. Close button (X) in top-right.
   - Editable title: `<input>` bound to task title, debounced save (300ms — WHY: 300ms balances responsiveness with avoiding excessive IPC calls during rapid typing) via `editTask`.
   - Editable content/notes: `<textarea>` for markdown body, debounced save.
   - Priority selector: 4 clickable icons/buttons (none, low, med, high) with color coding. Clicking calls `editTask`.
   - Due date picker: `<input type="date">` + optional time `<input type="time">`. On change, calls `editTask` with ISO8601 string.
   - Recurrence rule: dropdown with presets ("None", "Daily", "Weekly", "Monthly", "Yearly", "Custom"). "Custom" shows a text input for raw RRULE. Calls `editTask`.
   - Tags section: display current tags as removable pills (click X -> `untagTask`). "+" button shows a dropdown of available tags to add (calls `tagTask`).
   - Subtasks section: inline list of subtasks with checkboxes + a "+ Add subtask" input. Max 50 subtasks per task — WHY: prevents UI performance degradation in tree rendering; no real-world task needs 50+ subtasks.
   - List assignment: dropdown showing all lists. Changing it calls `moveTask`.
   - Footer: "Created <date>" and "Delete task" button (red, with confirm dialog).
2. Create `apps/desktop/src/lib/stores/ui.ts`: `selectedTaskId` writable store. `TaskDetail` reacts to this.

**DONE WHEN**
- [ ] Clicking a task in `TaskList` opens `TaskDetail` with all fields populated.
- [ ] Editing the title, waiting 300ms, and refreshing the task list shows the updated title.
- [ ] Changing priority to "high" immediately updates the priority indicator in both the detail panel and the task list row.
- [ ] Adding a tag via the "+" dropdown adds a pill; removing it via "X" removes the pill and the association.
- [ ] Changing the list assignment moves the task out of the current list view.

---

### Task 23 (B) +svelte +tauri
blockedBy: [17, 21]

**PURPOSE** — Implements a "Today" smart view that aggregates tasks due today across all lists, a key productivity feature.

**WHAT TO DO**
1. Create a new Tauri command `get_tasks_due_today(state) -> Result<Vec<Task>, String>` in `task_commands.rs`:
   - Query: `SELECT ... FROM tasks WHERE deleted_at IS NULL AND status=0 AND date(due_date) = date('now') ORDER BY priority DESC, sort_order ASC`.
   - Include subtasks and tags via the same join logic.
2. Register the command.
3. Create `apps/desktop/src/lib/components/TodayView.svelte`:
   - Header: "Today" + date string (e.g., "Thursday, Mar 12").
   - Group tasks by list: show list name as sub-header with colored dot, then tasks beneath.
   - Reuse the same task row rendering from `TaskList` (extract a `TaskRow.svelte` component in this task if not already done).
   - Show overdue tasks in a separate "Overdue" section at the top with red accent.
4. Add "Today" as a navigation item in `Sidebar.svelte` above the Inbox, with a calendar-day icon. Clicking it sets a `$currentView` store to `'today'`. `App.svelte` conditionally renders `TodayView` vs `TaskList` based on `$currentView`.

**DONE WHEN**
- [ ] Clicking "Today" in sidebar shows only tasks with `due_date` = today, grouped by list.
- [ ] Overdue tasks (due before today, still open) appear in a red "Overdue" section.
- [ ] Completing a task from the Today view removes it from the view immediately.
- [ ] Tasks with no due date do not appear in the Today view.

---

### Task 24 (A) +svelte +tauri
blockedBy: [17, 21]

**PURPOSE** — Implements the calendar month view displaying tasks on their due dates, the second core MVP view.

**WHAT TO DO**
1. Create a Tauri command `get_tasks_in_range(state, start_date: String, end_date: String) -> Result<Vec<Task>, String>`:
   - Query: `SELECT ... FROM tasks WHERE deleted_at IS NULL AND due_date >= $1 AND due_date <= $2 ORDER BY due_date, priority DESC`.
   - `start_date` and `end_date` are ISO8601 date strings.
2. Create `apps/desktop/src/lib/components/CalendarView.svelte`:
   - Month grid: 7 columns (Mon-Sun), 5-6 rows. Header row with day names.
   - Navigation: "< Month Year >" header with left/right arrows to change month. "Today" button to jump to current month.
   - Each day cell: date number (dim for days outside current month), list of task titles (max 3 visible — WHY: 3 tasks fit in a standard day cell height at default font size; more causes layout overflow, "+N more" overflow badge). Tasks colored by priority.
   - Clicking a day cell opens a popover or panel listing all tasks for that day with full `TaskRow` rendering.
   - Clicking a task in the calendar opens `TaskDetail`.
   - Quick add: clicking an empty area of a day cell opens an inline input to create a task with that date pre-filled as `due_date`.
3. Store current month/year in `apps/desktop/src/lib/stores/calendar.ts`. On month change, call `get_tasks_in_range` with first/last day of the visible range (include overflow days from adjacent months).
4. Add "Calendar" navigation item in sidebar with a calendar icon.

**DONE WHEN**
- [ ] The calendar view renders a correct month grid for the current month (correct number of days, correct starting weekday).
- [ ] Tasks with due dates appear on the correct day cells with priority coloring.
- [ ] Navigating to the next month fetches and renders tasks for that month.
- [ ] Clicking a day shows all tasks for that day; clicking "+N more" expands the list.
- [ ] Quick-adding a task on a day cell creates a task with that day as `due_date`.

---

### Task 25 (B) +svelte
blockedBy: [21]

**PURPOSE** — Implements natural language date input so users can type things like "tomorrow 3pm" or "every weekday" and get structured date/recurrence data.

**WHAT TO DO**
1. Install `chrono-node` (npm package) in `apps/desktop`: `npm install chrono-node`.
2. Create `apps/desktop/src/lib/services/nlp-date.ts`:
   - `export function parseNaturalDate(input: string, referenceDate?: Date): ParsedDate | null`.
   - `ParsedDate` type: `{ date: string (ISO8601), hasTime: boolean, recurrenceRule: string | null }`.
   - Use `chrono.parseDate(input, referenceDate)` for single dates.
   - For recurrence patterns, detect keywords before passing to chrono:
     - "every day" / "daily" -> `FREQ=DAILY;INTERVAL=1`
     - "every week" / "weekly" -> `FREQ=WEEKLY;INTERVAL=1`
     - "every weekday" -> `FREQ=WEEKLY;BYDAY=MO,TU,WE,TH,FR`
     - "every month" / "monthly" -> `FREQ=MONTHLY;INTERVAL=1`
     - "every year" / "yearly" -> `FREQ=YEARLY;INTERVAL=1`
     - "every N days/weeks/months" -> parse N and set interval.
   - If recurrence detected, also parse the start date from remaining text (default: today).
3. Integrate into the quick-add input in `TaskList.svelte`:
   - After the user types and before creating the task, run `parseNaturalDate` on the input.
   - If a date is parsed, extract it and use the remaining text as the title. E.g., "Buy milk tomorrow 3pm" -> title: "Buy milk", due_date: tomorrow at 15:00.
   - Show a small preview badge below the input: "Tomorrow, 3:00 PM" so the user sees what was parsed. Pressing Enter confirms.
   - If no date detected, create the task with no due date.

**DONE WHEN**
- [ ] Typing "Buy milk tomorrow" in quick-add shows a "Tomorrow" badge and creates a task due tomorrow with title "Buy milk".
- [ ] Typing "Standup meeting every weekday 9am" creates a task with `recurrenceRule: 'FREQ=WEEKLY;BYDAY=MO,TU,WE,TH,FR'` and due time 09:00.
- [ ] Typing "something random" with no date keywords creates a task with no due date.
- [ ] Typing "Dec 25" correctly parses to the next December 25th.

---

### Task 26 (B) +svelte
blockedBy: [21, 22]

**PURPOSE** — Implements keyboard shortcuts for power-user productivity, matching TickTick's keyboard-driven workflow.

**WHAT TO DO**
1. Create `apps/desktop/src/lib/services/shortcuts.ts`:
   - Register global keyboard listeners on `window` in `App.svelte` `onMount`.
   - Shortcuts (all should be suppressed if user is in an input/textarea):
     - `n` — focus the quick-add input.
     - `Escape` — close task detail panel, or deselect task.
     - `Delete` / `Backspace` — if a task is selected (not editing), soft-delete it with confirmation.
     - `1`/`2`/`3`/`0` — set priority of selected task (0=none, 1=low, 2=med, 3=high).
     - `Cmd/Ctrl + Enter` — complete selected task.
     - `t` — switch to Today view.
     - `c` — switch to Calendar view.
     - `l` — focus sidebar list navigation.
   - Export a function `isInputFocused(): boolean` checking `document.activeElement`.
2. Add a "Keyboard Shortcuts" modal (`ShortcutsModal.svelte`) toggled by `?` key, displaying all shortcuts in a two-column grid.

**DONE WHEN**
- [ ] Pressing `n` when no input is focused moves focus to the quick-add input.
- [ ] Pressing `3` when a task is selected (not editing) sets its priority to high; the UI updates immediately.
- [ ] Pressing `Escape` closes an open task detail panel.
- [ ] Pressing `?` opens the shortcuts modal; pressing `?` or `Escape` again closes it.
- [ ] Shortcuts do NOT fire when the user is typing in an input or textarea.

---

## Module 6: Recurring Tasks Engine (+recurrence)

---

### Task 27 (A) +recurrence +tauri
blockedBy: [17]

**PURPOSE** — Implements the RRULE parsing and expansion engine in Rust for the Tauri app, matching the server's Go implementation.

**WHAT TO DO**
1. Add `rrule` crate to `src-tauri/Cargo.toml`: `rrule = "0.12"`.
2. Create `src-tauri/src/services/recurrence.rs`:
   - `pub fn expand_rrule(rule: &str, dtstart: &str, after: &str, limit: usize) -> Result<Vec<String>, String>` — parses RRULE string, returns next `limit` ISO8601 date strings after `after`. Default `limit=10` — WHY: same as server; covers 2+ weeks of daily recurrences which is the practical preview horizon.
   - `pub fn next_occurrence(rule: &str, dtstart: &str, after: &str) -> Result<Option<String>, String>` — convenience wrapper returning just the next occurrence.
3. Ensure `complete_recurring_task` (Task 17) calls `next_occurrence` to determine the next due date.
4. Create Tauri command `preview_recurrence(rule: String, start_date: String, count: u32) -> Result<Vec<String>, String>` — returns upcoming occurrence dates for UI preview.

**DONE WHEN**
- [ ] `expand_rrule("FREQ=WEEKLY;BYDAY=MO,WE,FR", "2026-03-12", "2026-03-12", 5)` returns 5 dates all on Mon/Wed/Fri.
- [ ] `next_occurrence("FREQ=MONTHLY;INTERVAL=1", "2026-03-01", "2026-03-15")` returns "2026-04-01".
- [ ] `invoke('preview_recurrence', { rule: 'FREQ=DAILY', startDate: '2026-03-12', count: 7 })` returns 7 consecutive dates.

---

## Module 7: Client-Side Sync (+sync)

---

### Task 28 (A) +sync +tauri
blockedBy: [12, 13, 16, 17, 18]

**PURPOSE** — Implements the sync client in the Tauri Rust backend that pushes local changes and pulls remote changes to/from the server.

**WHAT TO DO**
1. Create `src-tauri/src/sync/client.rs`:
   - `pub struct SyncClient { base_url: String, auth_token: Option<String>, device_id: String }`.
   - `pub async fn push_changes(&self, changes: Vec<ChangeRecord>) -> Result<PushResult, SyncError>` — POST to `/api/sync/push` with JSON body. Deserialize response.
   - `pub async fn pull_changes(&self, last_sync_at: &str) -> Result<PullResult, SyncError>` — POST to `/api/sync/pull`. Deserialize response.
   - Use `reqwest` crate for HTTP.
2. Create `src-tauri/src/sync/tracker.rs`:
   - `pub fn record_change(conn: &Connection, entity_type: &str, entity_id: &str, field_name: &str, new_value: &str)` — inserts into `sync_meta` table with current timestamp and device_id.
   - `pub fn get_pending_changes(conn: &Connection, since: &str) -> Vec<ChangeRecord>` — fetches all `sync_meta` entries after `since`.
   - `pub fn apply_remote_change(conn: &Connection, change: &ChangeRecord) -> Result<()>` — updates the corresponding table/field based on `entity_type` and `field_name`. Skips if local timestamp is newer.
3. Modify all CRUD commands (Tasks 16-18) to call `record_change` after every write operation.
4. Create Tauri command `sync_now(state) -> Result<SyncStatus, String>`:
   - Get pending changes -> push -> pull -> apply remote changes -> update `last_sync_at` in a `settings` table (create if not exists: `key TEXT PRIMARY KEY, value TEXT`).
   - Return `SyncStatus { pushed: u32, pulled: u32, conflicts: u32 }`.

**DONE WHEN**
- [ ] Creating a task locally inserts a row into `sync_meta` with the task's field changes.
- [ ] `invoke('sync_now')` with a running server pushes pending changes and pulls remote changes.
- [ ] Remote changes (from another device) are applied to the local database after pull.
- [ ] Conflicting changes (older local timestamp) are skipped during pull application.

---

### Task 29 (B) +sync +svelte
blockedBy: [28]

**PURPOSE** — Adds sync UI controls to the Tauri/Svelte app so users can configure and trigger sync.

**WHAT TO DO**
1. Create a Tauri command `get_sync_settings(state) -> Result<SyncSettings, String>` — reads `server_url`, `auth_token`, `last_sync_at`, `auto_sync_enabled` from the local `settings` table.
2. Create a Tauri command `save_sync_settings(state, server_url, auth_token?, auto_sync_enabled) -> Result<(), String>`.
3. Create `apps/desktop/src/lib/components/SyncSettings.svelte`:
   - "Server URL" text input.
   - "Auth Token" text input (or "Login with Magic Link" button that opens a flow: enter email -> call server `/api/auth/magic-link` -> prompt for token from email -> call `/api/auth/verify` -> store token).
   - "Auto Sync" toggle with interval of 60s — WHY: 60s polling balances battery life vs. data freshness for a desktop app; more aggressive polling provides negligible UX benefit for task management.
   - "Sync Now" button showing status (spinner, "Last synced: 2 min ago").
   - Sync result summary: "Pushed 3, Pulled 5, Conflicts 0".
4. Accessible from a gear icon in the sidebar footer.

**DONE WHEN**
- [ ] Entering a server URL and clicking "Sync Now" triggers sync and shows results.
- [ ] The magic link login flow works: enter email -> receive link -> enter token -> JWT stored.
- [ ] Auto-sync toggle persists across app restarts.
- [ ] "Last synced" timestamp updates after each sync.

---

## Module 8: Search & Filtering (+search)

---

### Task 30 (B) +search +tauri
blockedBy: [15, 17]

**PURPOSE** — Implements full-text task search in the Tauri app using SQLite FTS5.

**WHAT TO DO**
1. In `db.rs`, add an FTS5 virtual table to the schema initialization:
   ```sql
   CREATE VIRTUAL TABLE IF NOT EXISTS tasks_fts USING fts5(title, content, content=tasks, content_rowid=rowid);
   ```
2. Add triggers to keep FTS in sync:
   ```sql
   CREATE TRIGGER IF NOT EXISTS tasks_ai AFTER INSERT ON tasks BEGIN INSERT INTO tasks_fts(rowid, title, content) VALUES (new.rowid, new.title, new.content); END;
   CREATE TRIGGER IF NOT EXISTS tasks_au AFTER UPDATE ON tasks BEGIN INSERT INTO tasks_fts(tasks_fts, rowid, title, content) VALUES('delete', old.rowid, old.title, old.content); INSERT INTO tasks_fts(rowid, title, content) VALUES (new.rowid, new.title, new.content); END;
   CREATE TRIGGER IF NOT EXISTS tasks_ad AFTER DELETE ON tasks BEGIN INSERT INTO tasks_fts(tasks_fts, rowid, title, content) VALUES('delete', old.rowid, old.title, old.content); END;
   ```
3. Create Tauri command `search_tasks(state, query: String) -> Result<Vec<Task>, String>`:
   - Query: `SELECT tasks.* FROM tasks JOIN tasks_fts ON tasks.rowid = tasks_fts.rowid WHERE tasks_fts MATCH $1 AND tasks.deleted_at IS NULL ORDER BY rank LIMIT 50` — WHY: 50 result limit prevents UI lag when searching large databases; users rarely scroll past 50 search results.
   - Populate subtasks and tags via the standard join approach.
4. Create `apps/desktop/src/lib/components/SearchBar.svelte`: input with debounced (300ms — WHY: matches TaskDetail debounce; fast enough to feel instant, slow enough to avoid excessive SQLite queries) search, dropdown results list.

**DONE WHEN**
- [ ] Creating a task "Buy groceries for dinner" and searching "groceries" returns that task.
- [ ] Searching "nonexistent" returns an empty array.
- [ ] Updating a task title and searching for the new title returns the task.
- [ ] Search results appear within 300ms of typing in the search bar.

---

## Module 9: Data Import/Export (+data)

---

### Task 31 (C) +data +tauri
blockedBy: [16, 17, 18]

**PURPOSE** — Enables users to export all their data as JSON and import from a JSON backup, ensuring data portability.

**WHAT TO DO**
1. Create Tauri command `export_data(state) -> Result<String, String>`:
   - Queries all non-deleted lists, tasks (with subtasks), tags, and task_tags.
   - Serializes to JSON: `{ "version": 1, "exportedAt": "<ISO8601>", "lists": [...], "tasks": [...], "tags": [...], "taskTags": [...] }`.
   - Uses Tauri dialog API to let user choose save location. Writes the JSON string to the file.
   - Returns the file path.
2. Create Tauri command `import_data(state, path: String) -> Result<ImportResult, String>`:
   - Reads JSON from file, validates `version` field.
   - Within a transaction: clears all existing data (or merges by ID — use upsert: `INSERT OR REPLACE`).
   - Returns `ImportResult { lists: u32, tasks: u32, tags: u32 }` with counts.
3. Add "Export Data" and "Import Data" buttons to `SyncSettings.svelte`.

**DONE WHEN**
- [ ] "Export Data" creates a valid JSON file containing all user data.
- [ ] "Import Data" with that JSON file restores all data to a fresh app install.
- [ ] The import is atomic (if the file is malformed, no partial data is written).

---

## Module 10: Docker Deployment (+deploy)

---

### Task 32 (A) +deploy
blockedBy: [4, 5]

**PURPOSE** — Creates a complete Docker Compose setup for self-hosting the server with PostgreSQL, enabling one-command deployment.

**WHAT TO DO**
1. Create `docker-compose.yml` in project root:
   ```yaml
   services:
     db:
       image: postgres:16-alpine
       environment:
         POSTGRES_DB: tickclone
         POSTGRES_USER: tickclone
         POSTGRES_PASSWORD: ${DB_PASSWORD:-changeme}
       volumes:
         - pgdata:/var/lib/postgresql/data
       healthcheck:
         test: ["CMD-SHELL", "pg_isready -U tickclone"]
         interval: 5s
         timeout: 5s
         retries: 5
     server:
       build: ./services/server
       ports:
         - "${PORT:-8080}:8080"
       environment:
         DATABASE_URL: postgres://tickclone:${DB_PASSWORD:-changeme}@db:5432/tickclone?sslmode=disable
         AUTH_REQUIRED: ${AUTH_REQUIRED:-false}
         MAGIC_LINK_SECRET: ${MAGIC_LINK_SECRET:-change-this-to-a-32-char-secret!}
         SMTP_HOST: ${SMTP_HOST:-}
         SMTP_PORT: ${SMTP_PORT:-587}
         SMTP_FROM: ${SMTP_FROM:-}
         CORS_ORIGINS: ${CORS_ORIGINS:-*}
       depends_on:
         db:
           condition: service_healthy
   volumes:
     pgdata:
   ```
2. Create `.env.example` with all environment variables documented with comments.

**DONE WHEN**
- [ ] `docker compose up -d` starts both services; `curl localhost:8080/health` returns 200.
- [ ] The server auto-migrates the database on startup.
- [ ] `docker compose down && docker compose up -d` restarts cleanly without data loss (volume persists).
- [ ] `.env.example` documents every environment variable.

---

## Module 11: Theming & Accessibility (+ui)

---

### Task 33 (C) +ui +svelte
blockedBy: [20, 21, 22]

**PURPOSE** — Implements dark/light theme toggling and system-preference detection in the Tauri app.

**WHAT TO DO**
1. Create `apps/desktop/src/lib/stores/theme.ts`:
   - `theme` writable store: `'light' | 'dark' | 'system'`. Default: `'system'`.
   - On init, detect system preference via `window.matchMedia('(prefers-color-scheme: dark)')`.
   - On change, set `document.documentElement.dataset.theme` to `'light'` or `'dark'`.
   - Persist choice in local Tauri settings (via a `get_setting`/`set_setting` command pair using the `settings` table).
2. Define CSS custom properties in `apps/desktop/src/app.css`:
   - `[data-theme="dark"]`: background `#1E1E2E`, surface `#313244`, text `#CDD6F4`, primary `#89B4FA`, danger `#F38BA8`, etc. (Catppuccin Mocha palette).
   - `[data-theme="light"]`: background `#EFF1F5`, surface `#CCD0DA`, text `#4C4F69`, primary `#1E66F5`, danger `#D20F39`, etc. (Catppuccin Latte palette).
3. Update all components to use `var(--bg)`, `var(--surface)`, `var(--text)`, etc. instead of hardcoded colors.
4. Add theme toggle (sun/moon icon) in the sidebar footer.

**DONE WHEN**
- [ ] Clicking the theme toggle switches between dark and light themes instantly.
- [ ] Setting "system" and changing OS dark mode preference updates the app theme.
- [ ] Theme preference persists across app restarts.
- [ ] All text has sufficient contrast ratio (>= 4.5:1 — WHY: WCAG 2.1 AA compliance minimum for normal text) in both themes.

---

## Module 12: Performance (+perf)

---

### Task 34 (C) +perf +tauri
blockedBy: [17, 21]

**PURPOSE** — Ensures the Tauri app handles large datasets (10,000+ tasks) without UI lag.

**WHAT TO DO**
1. Create a Tauri command `seed_benchmark_data(state, task_count: u32) -> Result<(), String>`:
   - Creates 10 lists, `task_count` tasks distributed across lists, 20% with subtasks, 30% with tags, 10% with recurrence rules.
   - Uses a transaction with batched inserts (500 per batch — WHY: 500 rows per batch is the sweet spot for SQLite; larger batches hit the SQLITE_MAX_VARIABLE_NUMBER limit, smaller batches have excessive transaction overhead).
2. In `TaskList.svelte`, implement virtual scrolling: only render visible task rows + a buffer of 20 above/below (WHY: 20-row buffer prevents visible pop-in during fast scrolling while keeping DOM size manageable). Use a simple implementation: calculate total height, translate visible rows to correct positions.
3. In `CalendarView.svelte`, lazy-load tasks only for the visible month range (already done if Task 24 was implemented correctly — verify).
4. Add `EXPLAIN QUERY PLAN` checks in Rust tests for the 5 most common queries to verify they use indexes (no full table scans).

**DONE WHEN**
- [ ] After seeding 10,000 tasks, `invoke('get_tasks_by_list', ...)` for a list with 500 tasks returns in < 100ms.
- [ ] Scrolling through a list of 500 tasks maintains 60fps (no visible stutter in dev tools performance tab).
- [ ] All 5 critical queries use indexes (verified by `EXPLAIN QUERY PLAN` showing `USING INDEX`).

---

### Task 35 (C) +perf +server
blockedBy: [5, 12]

**PURPOSE** — Adds database query optimization and connection pool tuning to the Go server for production readiness.

**WHAT TO DO**
1. In `pool.go`, add pool configuration: `pool_min_conns=5` (WHY: 5 warm connections avoids cold-start latency for the first few requests after idle), `pool_max_conn_lifetime=1h`, `pool_max_conn_idle_time=30m` (WHY: 30min idle timeout recycles connections to prevent stale state from PG config changes).
2. Add prepared statement caching: create a `Queries` struct in `services/server/internal/database/queries.go` that holds prepared `pgx.PreparedStatement` references for the 10 most-used queries (list tasks, get lists, search sync log, etc.).
3. Add `EXPLAIN ANALYZE` logging in development mode: if `LOG_LEVEL=debug`, log query plans for any query taking > 50ms (WHY: 50ms is the threshold where users start to perceive latency; queries above this need optimization).
4. Create `services/server/migrations/003_indexes.up.sql`: add any missing indexes identified by slow query analysis. At minimum add `idx_sync_log_user_device` on `sync_log(user_id, device_id, timestamp)`.

**DONE WHEN**
- [ ] The connection pool is configured with min/max/idle settings (verified by log output on startup).
- [ ] In debug mode, queries > 50ms log their `EXPLAIN ANALYZE` output.
- [ ] The `003_indexes` migration runs cleanly.

---

## Module 13: Testing (+test)

---

### Task 36 (A) +test +server
blockedBy: [6, 7, 8, 9, 11, 12]

**PURPOSE** — Implements integration tests for the Go server API covering all critical paths.

**WHAT TO DO**
1. Create `services/server/internal/handlers/handlers_test.go`:
   - Use `httptest.NewServer` with the full Echo app.
   - Setup: spin up a test PostgreSQL database (use `testcontainers-go` with the `postgres` module or a dedicated test DB URL from env).
   - Run migrations before tests, truncate tables between tests.
2. Test cases:
   - `TestListCRUD`: create -> get all -> update -> delete -> verify 404.
   - `TestTaskCRUD`: create list -> create task -> create subtask -> get tasks (verify nesting) -> update task -> complete -> delete.
   - `TestSubtaskDepthLimit`: create task -> create subtask -> attempt subtask-of-subtask -> expect 400.
   - `TestTagOperations`: create tag -> add to task -> get tasks (verify tag present) -> remove from task -> delete tag.
   - `TestRecurringTaskCompletion`: create task with `FREQ=DAILY` -> complete -> verify new task created with next date.
   - `TestMagicLinkAuth`: request magic link -> verify token in DB -> validate token -> get JWT -> use JWT on protected route.
   - `TestSyncPushPull`: push changes from device A -> pull from device B -> verify received -> push conflicting change from B (older) -> verify rejected.
3. Each test function is self-contained with its own setup and teardown.

**DONE WHEN**
- [ ] `go test ./internal/handlers/ -v` passes all test cases.
- [ ] Test coverage for `handlers` package is >= 80% (measured by `go test -cover`) — WHY: 80% threshold catches most regressions while allowing pragmatic skipping of trivial error paths.
- [ ] Tests can run in CI with a PostgreSQL service container.

---

### Task 37 (A) +test +server
blockedBy: [6, 7, 8]

**PURPOSE** — Implements unit tests for Go server handlers using httptest, without requiring a real database.

**WHAT TO DO**
1. Create `services/server/internal/handlers/unit_test.go`.
2. Define mock repository interfaces and implement them with in-memory maps.
3. Test cases:
   - `TestListHandler_CreateValidation`: POST with empty name -> 400, POST with name > 255 chars -> 400, POST with valid name -> 201.
   - `TestListHandler_DeleteInbox`: DELETE on inbox list -> 409.
   - `TestTaskHandler_CreateSubtaskDepth`: create task, create subtask, create sub-subtask -> 400.
   - `TestTaskHandler_StatusChangeUpdatesCompletedAt`: PATCH status=1 -> verify completedAt set.
   - `TestAuthMiddleware_MissingToken`: request without Authorization header -> 401.
   - `TestAuthMiddleware_ExpiredToken`: request with expired JWT -> 401.
   - `TestAuthMiddleware_ValidToken`: request with valid JWT -> passes through.
4. Use Go standard `testing` package + `httptest.NewRecorder()`.

**DONE WHEN**
- [ ] `go test ./internal/handlers/ -run Unit -v` passes all unit tests.
- [ ] Tests run without any external dependencies (no database, no network).
- [ ] Each handler function has at least one positive and one negative test case.

---

### Task 38 (A) +test +tauri
blockedBy: [16, 17, 18, 28]

**PURPOSE** — Implements Rust unit tests for the Tauri backend database operations and sync logic.

**WHAT TO DO**
1. In `src-tauri/src/commands/list_commands.rs`, add `#[cfg(test)] mod tests`:
   - Use an in-memory SQLite database (`:memory:`) initialized with the canonical schema.
   - `test_create_and_get_lists`: create 3 lists -> get all -> verify count and order.
   - `test_delete_inbox_rejected`: create inbox -> attempt delete -> verify error.
   - `test_soft_delete_cascades`: create list with tasks -> delete list -> verify tasks also soft-deleted.
2. In `src-tauri/src/commands/task_commands.rs`, add tests:
   - `test_subtask_depth_limit`: create task -> create subtask -> create sub-subtask -> verify error.
   - `test_complete_recurring`: create daily task -> complete -> verify new task with next date.
   - `test_complete_sets_timestamp`: complete task -> verify `completed_at` is set.
3. In `src-tauri/src/sync/tracker.rs`, add tests:
   - `test_record_and_retrieve_changes`: record 5 changes -> get pending since past -> verify 5 returned.
   - `test_apply_remote_newer_wins`: apply remote change with newer timestamp -> verify field updated.
   - `test_apply_remote_older_skipped`: set local field -> apply remote change with older timestamp -> verify field unchanged.

**DONE WHEN**
- [ ] `cargo test` in `src-tauri/` passes all tests.
- [ ] All tests use in-memory databases (no filesystem side effects).
- [ ] Each test function tests exactly one behavior.

---

### Task 39 (B) +test +svelte
blockedBy: [19, 20, 21, 25]

**PURPOSE** — Implements Svelte component tests for critical UI interactions.

**WHAT TO DO**
1. Install testing dependencies: `@testing-library/svelte`, `vitest`, `jsdom`.
2. Configure `vitest.config.ts` with `environment: 'jsdom'` and Svelte preprocessing.
3. Mock Tauri `invoke` globally in `apps/desktop/src/test/setup.ts`: intercept all `invoke` calls and return pre-defined responses.
4. Test files:
   - `TaskList.test.ts`: render with mock tasks -> verify task titles visible -> click checkbox -> verify `invoke('update_task', ...)` called with `status: 1`.
   - `Sidebar.test.ts`: render with mock lists -> click a list -> verify `selectedListId` store updated -> click "+ New List" -> type name -> press Enter -> verify `invoke('create_list', ...)` called.
   - `NLPDate.test.ts` (unit test, no component): test `parseNaturalDate` with 10+ inputs covering: "tomorrow", "next monday", "every weekday", "Dec 25 3pm", "in 2 hours", plain text with no date.
5. Add `"test"` script to `package.json`: `"vitest run"`.

**DONE WHEN**
- [ ] `npm run test` in `apps/desktop/` passes all test files.
- [ ] The NLP date parser passes all 10+ test cases.
- [ ] Component tests verify that Tauri `invoke` is called with correct arguments.

---

### Task 40 (B) +test +sync
blockedBy: [12, 13, 28]

**PURPOSE** — Implements integration tests for the sync protocol, simulating two clients with conflicting changes to verify conflict resolution.

**WHAT TO DO**
1. Create `services/server/internal/services/sync_integration_test.go`:
   - Setup: start test server with PostgreSQL, create a user.
   - `TestTwoClientSync_NoConflict`:
     a. Client A pushes a new task (title="Task A").
     b. Client B pulls -> receives the task.
     c. Client B pushes a new task (title="Task B").
     d. Client A pulls -> receives Task B.
     e. Verify both clients have both tasks.
   - `TestTwoClientSync_ConflictResolution`:
     a. Both clients have Task X (synced).
     b. Client A updates title to "Updated by A" at T1.
     c. Client B updates title to "Updated by B" at T2 (T2 > T1).
     d. Client A pushes (accepted).
     e. Client B pushes (accepted, because T2 > T1).
     f. Client A pulls -> receives "Updated by B" (newer wins).
   - `TestTwoClientSync_OlderRejected`:
     a. Client A pushes title change at T2.
     b. Client B pushes title change at T1 (T1 < T2).
     c. Verify B's change is rejected (conflict count=1).
     d. Server still has A's value.
2. Use `net/http` client to simulate two different device IDs.

**DONE WHEN**
- [ ] All three sync integration tests pass.
- [ ] Conflict resolution correctly applies last-write-wins based on timestamps.
- [ ] Tests clean up after themselves (no leftover data).

---

### Task 41 (B) +test +tauri
blockedBy: [14]

**PURPOSE** — Implements E2E tests for the Tauri desktop app using Playwright or tauri-driver.

**WHAT TO DO**
1. Install `@playwright/test` and configure for WebDriver-based testing of the Tauri webview.
2. Create `apps/desktop/tests/e2e/` directory.
3. Test cases:
   - `app-launch.spec.ts`: verify the app window opens with the correct title "TickClone" and the sidebar is visible.
   - `list-management.spec.ts`: click "+ New List" -> type "Groceries" -> press Enter -> verify list appears in sidebar -> click delete -> verify list removed.
   - `task-workflow.spec.ts`: select Inbox -> type "Buy milk" in quick-add -> press Enter -> verify task appears -> click checkbox -> verify task moves to completed section.
   - `navigation.spec.ts`: click "Today" -> verify Today view renders -> click "Calendar" -> verify calendar grid renders.
4. Add `"test:e2e"` script to `package.json`.

**DONE WHEN**
- [ ] `npm run test:e2e` launches the Tauri app and runs all E2E tests.
- [ ] All 4 test cases pass on the current platform.
- [ ] Tests are stable (no flaky failures on re-run).

---

## Module 14: CI/CD (+ci)

---

### Task 42 (B) +ci
blockedBy: [36, 37, 38, 39]

**PURPOSE** — Sets up GitHub Actions CI to build and test all components on every push.

**WHAT TO DO**
1. Create `.github/workflows/ci.yml`:
   ```yaml
   name: CI
   on: [push, pull_request]
   jobs:
     server-test:
       runs-on: ubuntu-latest
       services:
         postgres:
           image: postgres:16-alpine
           env:
             POSTGRES_DB: tickclone_test
             POSTGRES_USER: test
             POSTGRES_PASSWORD: test
           ports: ["5432:5432"]
           options: >-
             --health-cmd pg_isready --health-interval 10s --health-timeout 5s --health-retries 5
       steps:
         - uses: actions/checkout@v4
         - uses: actions/setup-go@v5
           with: { go-version: '1.22' }
         - run: cd services/server && go test ./... -v -cover
           env:
             DATABASE_URL: postgres://test:test@localhost:5432/tickclone_test?sslmode=disable
             MAGIC_LINK_SECRET: test-secret-at-least-32-characters!
     tauri-test:
       runs-on: ubuntu-latest
       steps:
         - uses: actions/checkout@v4
         - uses: dtolnay/rust-toolchain@stable
         - run: sudo apt-get update && sudo apt-get install -y libwebkit2gtk-4.1-dev libappindicator3-dev librsvg2-dev
         - run: cd apps/desktop/src-tauri && cargo test
         - uses: actions/setup-node@v4
           with: { node-version: '20' }
         - run: cd apps/desktop && npm ci && npm run test
   ```
2. Ensure CI installs Tauri system dependencies for Linux (webkit2gtk, etc.).

**DONE WHEN**
- [ ] Pushing to `main` triggers both jobs (server-test, tauri-test).
- [ ] All jobs pass on a clean checkout.
- [ ] PR checks block merge if any job fails.

---

### Task 43 (B) +ci
blockedBy: [42]

**PURPOSE** — Implements Tauri app bundling for all desktop platforms in CI.

**WHAT TO DO**
1. Create `.github/workflows/release.yml`:
   ```yaml
   name: Release
   on:
     push:
       tags: ['v*']
   jobs:
     build-desktop:
       strategy:
         matrix:
           include:
             - os: macos-latest
               target: aarch64-apple-darwin
             - os: macos-latest
               target: x86_64-apple-darwin
             - os: ubuntu-latest
               target: x86_64-unknown-linux-gnu
             - os: windows-latest
               target: x86_64-pc-windows-msvc
       runs-on: ${{ matrix.os }}
       steps:
         - uses: actions/checkout@v4
         - uses: dtolnay/rust-toolchain@stable
           with: { targets: '${{ matrix.target }}' }
         - uses: actions/setup-node@v4
           with: { node-version: '20' }
         - name: Install Linux dependencies
           if: matrix.os == 'ubuntu-latest'
           run: sudo apt-get update && sudo apt-get install -y libwebkit2gtk-4.1-dev libappindicator3-dev librsvg2-dev
         - run: cd apps/desktop && npm ci && npm run tauri build
         - uses: actions/upload-artifact@v4
           with:
             name: desktop-${{ matrix.target }}
             path: |
               apps/desktop/src-tauri/target/release/bundle/dmg/*.dmg
               apps/desktop/src-tauri/target/release/bundle/appimage/*.AppImage
               apps/desktop/src-tauri/target/release/bundle/nsis/*.exe
   ```
2. Outputs: DMG for macOS, AppImage for Linux, NSIS installer for Windows.

**DONE WHEN**
- [ ] Pushing a `v*` tag triggers builds on all 3 platforms (macOS, Linux, Windows).
- [ ] Each platform produces its expected artifact (DMG, AppImage, NSIS .exe).
- [ ] Artifacts are uploaded and downloadable from the GitHub Actions run.

---

### Task 44 (B) +ci
blockedBy: [42]

**PURPOSE** — Implements Go server Docker image build and push in CI.

**WHAT TO DO**
1. Add a job to `.github/workflows/release.yml`:
   ```yaml
     build-server:
       runs-on: ubuntu-latest
       permissions:
         packages: write
       steps:
         - uses: actions/checkout@v4
         - uses: docker/login-action@v3
           with:
             registry: ghcr.io
             username: ${{ github.actor }}
             password: ${{ secrets.GITHUB_TOKEN }}
         - uses: docker/build-push-action@v5
           with:
             context: ./services/server
             push: true
             tags: |
               ghcr.io/${{ github.repository }}/server:${{ github.ref_name }}
               ghcr.io/${{ github.repository }}/server:latest
   ```
2. Ensure the `services/server/Dockerfile` (from Task 4) builds correctly in CI.
3. Tag images with both the version tag and `latest`.

**DONE WHEN**
- [ ] Pushing a `v*` tag builds and pushes the server Docker image to GitHub Container Registry.
- [ ] `docker pull ghcr.io/<repo>/server:latest` works.
- [ ] The pushed image runs correctly (`docker run -e DATABASE_URL=... <image>` starts the server).

---

## Module 15: Documentation (+docs)

---

### Task 45 (B) +docs
blockedBy: [0, 4, 14, 32]

**PURPOSE** — Creates project documentation including architecture diagram, quickstart guide, and sync protocol explanation.

**WHAT TO DO**
1. Create `README.md` in project root with:
   - Architecture overview diagram (ASCII art) showing: Tauri Desktop App -> SQLite (local) -> Sync Client -> Go Server -> PostgreSQL.
   - Tech stack table matching the PRD header.
   - Quick start for development:
     ```
     cp .env.example .env
     docker compose up -d db
     cd services/server && go run ./cmd/server
     cd apps/desktop && npm run tauri dev
     ```
   - Quick start for self-hosting:
     ```
     cp .env.example .env
     docker compose up -d
     ```
   - Sync protocol explanation: describe the per-field vector clock approach, last-write-wins resolution, push/pull cycle, and conflict handling.
   - SMTP configuration guide for magic link auth.
   - Contributing guide (code style, PR process, testing requirements).
2. Keep documentation concise. Each section should be under 50 lines.

**DONE WHEN**
- [ ] README.md exists with all sections listed above.
- [ ] A new developer can follow the quickstart and have a running app in under 10 minutes.
- [ ] The sync protocol section explains conflict resolution clearly enough that a developer can implement a new client.

---

### Task 46 (B) +docs
blockedBy: [6, 7, 8, 9, 12]

**PURPOSE** — Creates API documentation for the Go server endpoints using OpenAPI/Swagger.

**WHAT TO DO**
1. Install `github.com/swaggo/echo-swagger` and `github.com/swaggo/swag/cmd/swag` in the Go server.
2. Add Swagger annotations to all handler functions in `services/server/internal/handlers/`:
   - Document all request/response schemas, status codes, authentication requirements.
   - Group endpoints by tag: "Lists", "Tasks", "Tags", "Auth", "Sync".
3. Generate Swagger docs: `swag init -g cmd/server/main.go -o docs/`.
4. Mount Swagger UI at `/api/docs` using `echo-swagger` middleware.
5. Ensure the generated `swagger.json` is committed to `services/server/docs/`.

**DONE WHEN**
- [ ] Navigating to `http://localhost:8080/api/docs` shows the Swagger UI with all endpoints documented.
- [ ] Each endpoint has request/response examples.
- [ ] The "Try it out" feature works for unauthenticated endpoints (health, auth).
- [ ] `services/server/docs/swagger.json` is valid OpenAPI 3.0.

---

## Module 16: Server Rate Limiting & Hardening (+server)

---

### Task 47 (B) +server
blockedBy: [9, 10]

**PURPOSE** — Adds rate limiting to the server to prevent abuse of auth endpoints and sync operations.

**WHAT TO DO**
1. Add `golang.org/x/time/rate` to `go.mod`.
2. Create `services/server/internal/middleware/rate_limiter.go`:
   - Per-IP rate limiter using a sync.Map of `*rate.Limiter` instances.
   - Auth endpoints (`/api/auth/*`): 5 requests per minute — WHY: prevents brute-force token guessing; legitimate users need at most 1-2 magic link requests per session.
   - Sync endpoints (`/api/sync/*`): 60 requests per minute — WHY: supports 1 sync per second burst while preventing excessive polling.
   - General API endpoints: 120 requests per minute — WHY: covers rapid UI interactions (creating tasks, updating fields) without throttling normal use.
   - Cleanup stale limiter entries every 10 minutes — WHY: prevents unbounded memory growth from unique IPs.
3. Return 429 Too Many Requests with `Retry-After` header when rate exceeded.
4. Apply middleware in `main.go` with different configurations per route group.

**DONE WHEN**
- [ ] Sending 6 requests to `/api/auth/magic-link` within 1 minute returns 429 on the 6th.
- [ ] Sync endpoints allow 60 requests per minute before throttling.
- [ ] The `Retry-After` header is present on 429 responses.
- [ ] Stale rate limiter entries are cleaned up (verified via log output).

---

### Task 48 (B) +server
blockedBy: [5]

**PURPOSE** — Adds request validation and input sanitization middleware to prevent injection and malformed data.

**WHAT TO DO**
1. Create `services/server/internal/middleware/validator.go`:
   - Use `github.com/go-playground/validator/v10` for struct validation.
   - Add custom validation rules: `uuid` for UUID fields, `rrule` for RRULE strings, `hexcolor` for hex color codes.
2. Add validation tags to all model structs in `services/server/internal/models/`:
   - List: `name` required, max 255, `color` optional hexcolor.
   - Task: `title` required, max 1000 (WHY: 1000 chars covers verbose task descriptions without allowing abuse), `priority` gte=0 lte=3, `status` gte=0 lte=1.
   - Tag: `name` required, max 100.
3. Create a helper `func BindAndValidate(c echo.Context, v interface{}) error` that binds JSON and validates, returning 400 with field-level error details.
4. Apply to all handler functions.

**DONE WHEN**
- [ ] `POST /api/lists` with `{"name":""}` returns 400 with error details mentioning "name".
- [ ] `POST /api/lists` with `{"name":"x","color":"not-a-color"}` returns 400 mentioning "color".
- [ ] `POST /api/lists/:listId/tasks` with `{"title":"x","priority":5}` returns 400 mentioning "priority".
- [ ] Valid requests continue to work as before.

---

## Module 17: Advanced Svelte UI (+svelte)

---

### Task 49 (B) +svelte
blockedBy: [21, 24]

**PURPOSE** — Implements drag-and-drop for task reordering and cross-list task moving in the Svelte UI.

**WHAT TO DO**
1. Install `sortablejs` in `apps/desktop`: `npm install sortablejs @types/sortablejs`.
2. Create `apps/desktop/src/lib/services/drag-drop.ts`:
   - `initSortable(element, options)` wrapper that creates a SortableJS instance.
   - On reorder within same list: compute new `sort_order` values for affected tasks, call `editTask(id, { sortOrder })` for each.
   - On cross-list drop: call `moveTask(id, newListId, sortOrder)`.
3. Integrate into `TaskList.svelte`:
   - Wrap the task list container with SortableJS.
   - Visual feedback: dragged task has slight opacity, drop target shows insertion line.
   - Subtasks are dragged with their parent (group behavior).
4. Integrate into `CalendarView.svelte`:
   - Allow dragging tasks between day cells to reschedule.
   - On drop: call `editTask(id, { dueDate: targetDate })`.

**DONE WHEN**
- [ ] Dragging a task within a list reorders it persistently (survives app restart).
- [ ] Dragging a task from the task list to a different list in the sidebar moves it.
- [ ] Dragging a task between calendar days updates its due date.
- [ ] Parent tasks drag with their subtasks.

---

### Task 50 (B) +svelte
blockedBy: [22]

**PURPOSE** — Implements context menus for tasks and lists, providing quick access to common actions.

**WHAT TO DO**
1. Create `apps/desktop/src/lib/components/ContextMenu.svelte`:
   - Generic context menu component: positioned at cursor, closes on click outside or Escape.
   - Accepts `items: { label: string, icon?: string, action: () => void, danger?: boolean }[]`.
2. Add task context menu (right-click on task row):
   - "Set Priority" submenu: None / Low / Medium / High.
   - "Move to List" submenu: list of all lists.
   - "Add Tag" submenu: list of all tags.
   - "Duplicate Task" — creates a copy with "(copy)" appended to title.
   - "Delete Task" (red) — soft-delete with confirmation.
3. Add list context menu (right-click on sidebar list):
   - "Rename" — inline edit mode.
   - "Change Color" — color picker popover.
   - "Delete List" (red) — soft-delete with confirmation. Disabled for Inbox.

**DONE WHEN**
- [ ] Right-clicking a task shows the context menu at the cursor position.
- [ ] Setting priority via context menu updates the task immediately.
- [ ] "Duplicate Task" creates a new task with the same fields and "(copy)" title.
- [ ] Right-clicking the Inbox list shows "Delete List" as disabled/grayed out.

---

### Task 51 (C) +svelte
blockedBy: [21]

**PURPOSE** — Implements a "Week" view that shows the current 7 days with tasks, providing an intermediate between Today and Calendar views.

**WHAT TO DO**
1. Create a Tauri command `get_tasks_in_week(state, start_date: String) -> Result<Vec<Task>, String>`:
   - Fetches tasks for 7 days starting from `start_date`.
2. Create `apps/desktop/src/lib/components/WeekView.svelte`:
   - 7-column layout, one column per day.
   - Each column header: day name + date (e.g., "Mon 22").
   - Tasks listed vertically within each column, sorted by priority then sort_order.
   - Navigation: previous/next week arrows, "This Week" button.
   - Tasks are draggable between columns to reschedule.
3. Add "Week" navigation item in sidebar between "Today" and "Calendar".

**DONE WHEN**
- [ ] Week view shows 7 days starting from Monday of the current week.
- [ ] Tasks appear in the correct day column based on due_date.
- [ ] Dragging a task from one day column to another updates its due_date.
- [ ] Navigating to next/previous week loads the correct tasks.

---

### Task 52 (C) +svelte
blockedBy: [20]

**PURPOSE** — Implements list color picker and icon selection for visual customization.

**WHAT TO DO**
1. Create `apps/desktop/src/lib/components/ColorPicker.svelte`:
   - Grid of 12 predefined colors (WHY: 12 colors covers the common color wheel segments; too many creates decision fatigue): red, orange, amber, yellow, lime, green, teal, cyan, blue, indigo, violet, pink.
   - Each color shown as a 24px circle, selected state has a checkmark overlay.
   - Clicking calls the callback with hex value.
2. Integrate into list creation and editing flows:
   - When creating a new list, show the color picker.
   - In list context menu "Change Color", show the color picker.
3. Update sidebar list items to use the selected color for the circle indicator.

**DONE WHEN**
- [ ] Creating a new list shows a color picker with 12 options.
- [ ] Selected color persists and displays correctly in the sidebar.
- [ ] Changing a list's color via context menu updates the sidebar immediately.

---

## Module 18: Notification & Reminder System (+notify)

---

### Task 53 (B) +notify +tauri
blockedBy: [17]

**PURPOSE** — Implements desktop notifications for task reminders so users don't miss due tasks.

**WHAT TO DO**
1. Enable the `notification` plugin in Tauri 2: add `tauri-plugin-notification` to `src-tauri/Cargo.toml`.
2. Create `src-tauri/src/services/reminder.rs`:
   - `pub fn check_due_tasks(conn: &Connection) -> Vec<Task>` — queries tasks due within the next 15 minutes (WHY: 15min lookahead gives users time to prepare without being too far in advance) that haven't been notified (add `notified_at TEXT` column to `tasks` table or use a separate `notifications` table).
   - `pub fn mark_notified(conn: &Connection, task_id: &str)` — prevents duplicate notifications.
3. Create a Tauri background task that runs `check_due_tasks` every 60 seconds (WHY: 60s polling interval balances CPU usage with notification timeliness; a task due in 15min will be caught within at most 1 min of entering the window).
4. When due tasks are found, send desktop notifications with: task title, due time, and a "View" action that focuses the app and selects the task.
5. Create `apps/desktop/src/lib/stores/notifications.ts`: track notification preferences (enable/disable, lookahead time).

**DONE WHEN**
- [ ] A task due in 10 minutes triggers a desktop notification with the task title.
- [ ] The same task does not trigger duplicate notifications.
- [ ] Clicking the notification focuses the app window.
- [ ] Notifications can be disabled in settings.

---

### Task 54 (C) +notify +svelte
blockedBy: [53]

**PURPOSE** — Adds an in-app notification center showing upcoming and missed reminders.

**WHAT TO DO**
1. Create `apps/desktop/src/lib/components/NotificationCenter.svelte`:
   - Bell icon in the top toolbar with badge count of unread notifications.
   - Dropdown panel listing recent notifications: task title, due time, "Overdue" tag if past due.
   - Clicking a notification navigates to the task.
   - "Mark all read" button.
2. Store notifications in `apps/desktop/src/lib/stores/notifications.ts`:
   - In-memory list of notification events, persisted to the `settings` table.
   - Max 50 notifications retained — WHY: keeps memory and storage bounded; older notifications lose relevance quickly in a task manager.

**DONE WHEN**
- [ ] Bell icon shows a badge count when there are unread notifications.
- [ ] Clicking the bell shows the notification list.
- [ ] Clicking a notification item opens the corresponding task in TaskDetail.
- [ ] "Mark all read" clears the badge count.

---

## Module 19: Multi-window & System Tray (+system)

---

### Task 55 (C) +system +tauri
blockedBy: [14, 21]

**PURPOSE** — Implements system tray integration for quick task capture without opening the main window.

**WHAT TO DO**
1. Enable the `tray-icon` plugin in Tauri 2: add `tauri-plugin-tray-icon` to `src-tauri/Cargo.toml`.
2. Create a system tray icon with a context menu:
   - "Open TickClone" — shows/focuses the main window.
   - "Quick Add Task" — opens a small floating window (300x100px — WHY: minimal size for a single-line input; avoids disrupting the user's workflow) with just a task title input. On Enter, creates the task in the Inbox and closes the window.
   - "Today's Tasks" — submenu listing up to 5 tasks due today (WHY: 5 tasks is a quick glanceable summary; more would make the tray menu unwieldy) with checkboxes to complete them inline.
   - "Quit" — exits the app.
3. Configure Tauri to keep running in the background when the window is closed (system tray mode).

**DONE WHEN**
- [ ] A tray icon appears in the system tray on app launch.
- [ ] "Quick Add Task" opens a minimal floating window and creates a task on Enter.
- [ ] "Today's Tasks" shows up to 5 due tasks with working completion checkboxes.
- [ ] Closing the main window keeps the app running in the tray.

---

### Task 56 (C) +system +tauri
blockedBy: [55]

**PURPOSE** — Implements a global keyboard shortcut for quick task capture from anywhere on the desktop.

**WHAT TO DO**
1. Enable the `global-shortcut` plugin in Tauri 2: add `tauri-plugin-global-shortcut`.
2. Register a global shortcut (default: `Ctrl+Shift+A` on Linux/Windows, `Cmd+Shift+A` on macOS — WHY: Ctrl+Shift+A avoids conflicts with common app shortcuts; the "A" stands for "Add").
3. When triggered:
   - If the quick-add window exists, focus it.
   - If not, create it (same floating window as Task 55).
4. Allow customizing the shortcut in settings.

**DONE WHEN**
- [ ] Pressing the global shortcut from any application opens the quick-add window.
- [ ] The quick-add input is focused and ready for typing.
- [ ] The shortcut can be changed in settings.
- [ ] The shortcut works even when the main window is closed (tray mode).

---

## Module 20: Undo/Redo System (+undo)

---

### Task 57 (C) +undo +tauri +svelte
blockedBy: [17, 19]

**PURPOSE** — Implements undo/redo for task operations so users can recover from accidental changes.

**WHAT TO DO**
1. Create `src-tauri/src/services/undo.rs`:
   - `pub struct UndoStack` with a bounded `Vec<UndoAction>` (max 50 entries — WHY: 50 actions is approximately 10 minutes of active editing; more would consume excessive memory storing old states).
   - `UndoAction` enum: `CreateTask { task }`, `DeleteTask { task }`, `UpdateTask { id, old_fields, new_fields }`, `CreateList { list }`, `DeleteList { list, tasks }`, etc.
   - `pub fn push(action: UndoAction)`, `pub fn undo() -> Option<UndoAction>`, `pub fn redo() -> Option<UndoAction>`.
2. Modify CRUD commands to record undo actions before applying changes.
3. Create Tauri commands: `undo() -> Result<String, String>` (returns description), `redo() -> Result<String, String>`.
4. Create `apps/desktop/src/lib/stores/undo.ts`:
   - Track `canUndo` and `canRedo` state.
   - Show a toast notification on undo/redo: "Undone: Delete task 'Buy milk'".
5. Wire `Ctrl+Z` (undo) and `Ctrl+Shift+Z` (redo) keyboard shortcuts.

**DONE WHEN**
- [ ] Deleting a task and pressing Ctrl+Z restores it.
- [ ] Pressing Ctrl+Shift+Z after undo re-deletes it.
- [ ] A toast shows what was undone/redone.
- [ ] The undo stack is bounded at 50 actions.

---

## Module 21: Batch Operations (+batch)

---

### Task 58 (C) +batch +svelte
blockedBy: [21, 22]

**PURPOSE** — Implements multi-select and batch operations for tasks, enabling bulk edits.

**WHAT TO DO**
1. Add multi-select to `TaskList.svelte`:
   - `Ctrl+Click` toggles individual task selection.
   - `Shift+Click` selects a range.
   - Selected tasks have a highlighted background.
   - A floating action bar appears when 2+ tasks are selected: "N tasks selected" + action buttons.
2. Batch actions:
   - "Set Priority" — applies the same priority to all selected tasks.
   - "Move to List" — moves all selected tasks to the chosen list.
   - "Add Tag" — adds the chosen tag to all selected tasks.
   - "Delete" — soft-deletes all selected tasks with confirmation.
   - "Complete" — marks all selected tasks as completed.
3. Create `apps/desktop/src/lib/stores/selection.ts`: `selectedTaskIds` writable store of type `Writable<Set<string>>`.

**DONE WHEN**
- [ ] Ctrl+clicking two tasks shows the floating action bar with "2 tasks selected".
- [ ] "Set Priority -> High" on 3 selected tasks updates all 3 priorities.
- [ ] "Delete" on selected tasks soft-deletes all of them after confirmation.
- [ ] Shift+clicking selects a contiguous range of tasks.

---

## Module 22: Task Sorting & Filtering (+filter)

---

### Task 59 (B) +filter +svelte
blockedBy: [19, 21]

**PURPOSE** — Implements advanced sorting and filtering options for the task list view.

**WHAT TO DO**
1. Create `apps/desktop/src/lib/components/FilterBar.svelte`:
   - Sort options dropdown: "Manual" (sort_order), "Priority" (high first), "Due Date" (earliest first), "Title" (A-Z), "Created" (newest first).
   - Filter toggles:
     - "Show Completed" toggle.
     - Priority filter: chips for each level (click to toggle).
     - Tag filter: chips for each tag.
     - Due date filter: "Overdue", "Today", "This Week", "No Date".
   - Active filters shown as removable pills below the filter bar.
2. Create `apps/desktop/src/lib/stores/filters.ts`:
   - `currentSort`, `currentFilters` stores.
   - Filtering and sorting happen client-side on the loaded task data (no additional IPC calls — WHY: local filtering is instant and avoids round-trip overhead; the full task list is already in memory).
3. Integrate into `TaskList.svelte` header area.

**DONE WHEN**
- [ ] Changing sort to "Priority" reorders tasks with high priority first.
- [ ] Filtering by "Overdue" shows only tasks with due_date < today.
- [ ] Combining tag filter + priority filter shows only matching tasks.
- [ ] Active filter pills are visible and removable.

---

## Module 23: Auto-sync Background Worker (+sync)

---

### Task 60 (B) +sync +tauri
blockedBy: [28, 29]

**PURPOSE** — Implements a background auto-sync worker that periodically syncs with the server without user intervention.

**WHAT TO DO**
1. Create `src-tauri/src/sync/worker.rs`:
   - `pub struct SyncWorker` with configurable interval (default 60s — WHY: same as the sync settings TTL; balances battery life vs. data freshness).
   - Runs on a separate Tokio task.
   - `pub fn start(state: AppState, interval_secs: u64)` — spawns a loop that calls `sync_now` logic every `interval_secs`.
   - Emits Tauri events on sync completion: `sync:complete { pushed, pulled, conflicts }`.
   - Handles errors gracefully: on network failure, back off exponentially (2s, 4s, 8s, 16s, max 300s — WHY: 300s max backoff prevents the worker from effectively stopping while still reducing load on unreachable servers).
   - Stops when `auto_sync_enabled` setting is false.
2. Start the worker on app launch if auto-sync is enabled.
3. Listen for the `sync:complete` event in Svelte to update the UI (sync status indicator, refresh stores if changes were pulled).

**DONE WHEN**
- [ ] With auto-sync enabled, the app syncs every 60s without user action.
- [ ] Network failures trigger exponential backoff (verified by log output).
- [ ] Disabling auto-sync in settings stops the worker.
- [ ] The Svelte UI updates when remote changes are pulled.

---

## Module 24: Accessibility (+a11y)

---

### Task 61 (C) +a11y +svelte
blockedBy: [20, 21, 22]

**PURPOSE** — Ensures the Tauri/Svelte app meets WCAG 2.1 AA accessibility standards.

**WHAT TO DO**
1. Audit all components for accessibility:
   - Add `role`, `aria-label`, `aria-expanded`, `aria-selected` attributes to all interactive elements.
   - Sidebar: `role="navigation"`, list items have `role="option"`, `aria-selected` for active list.
   - Task list: `role="list"`, each task `role="listitem"`, checkbox `role="checkbox"` with `aria-checked`.
   - Task detail: form inputs have associated `<label>` elements.
   - Calendar: day cells have `aria-label="March 22, 2026, 3 tasks"`.
2. Ensure full keyboard navigation:
   - Tab order follows logical reading order.
   - Arrow keys navigate within lists.
   - Enter/Space activate buttons and checkboxes.
   - Focus ring is visible on all focusable elements (2px solid outline — WHY: 2px ensures visibility on both light and dark themes per WCAG 2.4.7).
3. Color contrast: verify all text meets 4.5:1 ratio (AA). Use tools to check both themes.
4. Screen reader testing: verify all content is announced correctly.

**DONE WHEN**
- [ ] All interactive elements have appropriate ARIA attributes.
- [ ] The entire app is navigable via keyboard only (no mouse required).
- [ ] Focus ring is visible on every focusable element in both themes.
- [ ] Running axe or Lighthouse accessibility audit shows no critical or serious issues.

---

## Module 25: Onboarding & Empty States (+ux)

---

### Task 62 (C) +ux +svelte
blockedBy: [20, 21]

**PURPOSE** — Implements first-run onboarding and meaningful empty states to guide new users.

**WHAT TO DO**
1. Create `apps/desktop/src/lib/components/Onboarding.svelte`:
   - First-run detection: check for a `onboarding_complete` key in the `settings` table.
   - 3-step walkthrough overlay (WHY: 3 steps is the sweet spot for onboarding; more causes drop-off):
     a. "Welcome to TickClone" — brief intro, show the sidebar and explain lists.
     b. "Quick Add" — highlight the quick-add input, explain NLP date parsing.
     c. "Stay Synced" — explain optional sync setup.
   - "Skip" button on each step, "Done" on last step. Sets `onboarding_complete=true`.
2. Empty states for each view:
   - Empty task list: illustration + "No tasks yet. Type above to create your first task."
   - Empty Today view: "Nothing due today. Enjoy your free time!"
   - Empty Calendar: "No tasks scheduled this month."
   - Empty search results: "No tasks match your search."
3. Use simple SVG illustrations (inline, no external dependencies).

**DONE WHEN**
- [ ] First app launch shows the onboarding walkthrough.
- [ ] Completing or skipping onboarding persists (does not show again).
- [ ] Each empty state shows a helpful message and illustration.
- [ ] Empty states disappear as soon as relevant data exists.

---

## Module 26: Startup Performance (+perf)

---

### Task 63 (C) +perf +tauri
blockedBy: [15, 19]

**PURPOSE** — Optimizes app startup time to under 2 seconds from launch to interactive.

**WHAT TO DO**
1. Profile startup with Tauri's built-in timing:
   - Measure: Rust init -> DB open -> schema check -> Svelte mount -> first data render.
   - Target: < 500ms for Rust init, < 200ms for DB, < 300ms for Svelte mount, < 500ms for first render. Total < 1500ms with 500ms buffer — WHY: 2s is the threshold where users perceive an app as "slow to start" per Nielsen Norman research.
2. Optimize DB initialization:
   - Skip schema creation if tables already exist (check once with a quick query).
   - Open DB connection with `PRAGMA synchronous=NORMAL` (WHY: NORMAL is safe with WAL mode and faster than FULL; data loss only on OS crash, not app crash).
3. Optimize Svelte first render:
   - Load sidebar lists immediately (small dataset, fast query).
   - Defer loading tasks until a list is selected.
   - Use skeleton placeholders during initial load.
4. Add a simple splash screen (app icon + "Loading...") for the first 500ms if data isn't ready.

**DONE WHEN**
- [ ] Cold start to interactive UI is under 2 seconds on a mid-range machine.
- [ ] No blank white screen during startup (splash or skeleton shown).
- [ ] Subsequent launches (warm start) are under 1 second.
- [ ] Startup timings are logged for performance monitoring.

---

### Task 64 (C) +perf +tauri
blockedBy: [15]

**PURPOSE** — Implements SQLite database maintenance to prevent performance degradation over time.

**WHAT TO DO**
1. Create `src-tauri/src/services/maintenance.rs`:
   - `pub fn vacuum_if_needed(conn: &Connection)` — runs `PRAGMA auto_vacuum=INCREMENTAL` and `PRAGMA incremental_vacuum(100)` on startup if the freelist page count exceeds 1000 pages — WHY: 1000 pages (~4MB) is the threshold where fragmentation starts to noticeably impact read performance.
   - `pub fn analyze_tables(conn: &Connection)` — runs `ANALYZE` to update query planner statistics. Run once per week (track last run in `settings` table) — WHY: weekly is sufficient because task management data changes gradually; more frequent runs waste startup time.
   - `pub fn purge_old_data(conn: &Connection, days: u32)` — permanently deletes soft-deleted records older than `days` (default 30 — WHY: 30 days gives users ample time to recover accidentally deleted tasks while preventing unbounded growth). Also deletes old sync_meta entries.
2. Run maintenance on app startup (non-blocking, background thread).

**DONE WHEN**
- [ ] Soft-deleted tasks older than 30 days are permanently removed.
- [ ] `ANALYZE` runs weekly and updates are tracked in settings.
- [ ] Incremental vacuum runs when fragmentation threshold is exceeded.
- [ ] Maintenance does not block the UI thread.

---

This PRD contains **65 tasks**: 24 priority (A), 23 priority (B), 18 priority (C).

**Dependency summary (critical path):**
1. Task 0 (scaffolding) — unblocks everything
2. Tasks 1-3 (schema) + Task 4 (server bootstrap) — in parallel after Task 0
3. Task 5 (server DB) -> Tasks 6-10 (server CRUD + auth) -> Task 11 (recurrence)
4. Task 14 (Tauri shell) -> Task 15 (local DB) -> Tasks 16-18 (Tauri IPC)
5. Tasks 19-26 (Svelte UI) — after Tauri IPC layer
6. Tasks 12-13 (sync server) -> Tasks 28-29 (sync client + UI) -> Task 60 (auto-sync)
7. Tasks 36-41 (testing) -> Tasks 42-44 (CI/CD)
8. Remaining modules (search, export, theming, performance, notifications, etc.) in priority order

**Recommended parallel tracks:**
- **Track A (Server):** 0 -> 2 -> 4 -> 5 -> 6,7,8,9 -> 10,11 -> 12,13
- **Track B (Client):** 0 -> 1 -> 14 -> 15 -> 16,17,18 -> 19 -> 20,21,22 -> 23,24,25,26
- **Track C (Infra):** 32 (deploy) + 45,46 (docs) once foundation is ready
- **Track D (Quality):** 36-41 (tests) -> 42-44 (CI/CD) once features stabilize
