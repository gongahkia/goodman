# TickTick Clone — PRD (`todo.md`)

> **Architecture:** Local-first multi-platform productivity app with optional self-hosted sync.
>
> | Layer | Stack |
> |---|---|
> | **Apple (macOS + iOS)** | SwiftUI + GRDB (SQLite) |
> | **Cross-platform (Linux/Win/WSL)** | Tauri 2.x (Rust) + Svelte 5 + TypeScript + better-sqlite3 |
> | **Server (optional sync)** | Go 1.22+ (Echo) + PostgreSQL 16 + SMTP (magic link) |
> | **Sync protocol** | Timestamp-based last-write-wins with per-field vector clocks |
>
> **MVP scope:** Tasks · Subtasks · Lists · Priorities · Tags · Calendar view · Recurring tasks · Natural language date input
>
> **Database choice rationale:** PostgreSQL server-side (strong date/time, JSONB for recurrence rules, row-level security ready). SQLite client-side on all platforms (offline-first, zero-config).

---

## Module 1: Shared Schema & Data Model (+db)

---

### Task 1 (A) +db
**PURPOSE** — Defines the canonical data model that every platform must implement locally in SQLite. Without this, no client can store or manipulate tasks.

**WHAT TO DO**
1. Create `schema/canonical.sql` containing the following tables:
   - `lists` — columns: `id TEXT PRIMARY KEY` (UUIDv7), `name TEXT NOT NULL`, `color TEXT` (hex, e.g. `#3B82F6`), `sort_order INTEGER NOT NULL DEFAULT 0`, `is_inbox INTEGER NOT NULL DEFAULT 0` (boolean, exactly one row may be 1), `created_at TEXT NOT NULL` (ISO8601), `updated_at TEXT NOT NULL` (ISO8601), `deleted_at TEXT` (soft delete).
   - `tasks` — columns: `id TEXT PRIMARY KEY` (UUIDv7), `list_id TEXT NOT NULL REFERENCES lists(id)`, `parent_task_id TEXT REFERENCES tasks(id)` (NULL for top-level, non-NULL for subtasks), `title TEXT NOT NULL`, `content TEXT` (markdown body), `priority INTEGER NOT NULL DEFAULT 0` (0=none, 1=low, 2=medium, 3=high), `status INTEGER NOT NULL DEFAULT 0` (0=open, 1=completed), `due_date TEXT` (ISO8601 date or datetime), `due_timezone TEXT` (IANA tz string), `recurrence_rule TEXT` (RRULE string per RFC 5545), `sort_order INTEGER NOT NULL DEFAULT 0`, `completed_at TEXT`, `created_at TEXT NOT NULL`, `updated_at TEXT NOT NULL`, `deleted_at TEXT`.
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
**PURPOSE** — Creates the PostgreSQL server-side schema that mirrors the canonical model with Postgres-specific types, enabling the sync server to store all user data.

**WHAT TO DO**
1. Create `server/migrations/001_init.up.sql` using PostgreSQL syntax:
   - `users` — columns: `id UUID PRIMARY KEY DEFAULT gen_random_uuid()`, `email TEXT UNIQUE`, `device_id TEXT`, `created_at TIMESTAMPTZ NOT NULL DEFAULT now()`.
   - `magic_links` — columns: `id UUID PRIMARY KEY DEFAULT gen_random_uuid()`, `user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE`, `token TEXT NOT NULL UNIQUE`, `expires_at TIMESTAMPTZ NOT NULL`, `used_at TIMESTAMPTZ`.
   - `lists` — same as canonical but with `user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE`, all `TEXT` timestamps become `TIMESTAMPTZ`, and add `UNIQUE(user_id, id)`.
   - `tasks` — same as canonical with `user_id` added, `TIMESTAMPTZ` for all time columns. Add composite foreign key `(user_id, list_id)` referencing `lists(user_id, id)`.
   - `tags` — same with `user_id`, uniqueness becomes `UNIQUE(user_id, name)`.
   - `task_tags` — same with `user_id`.
   - `sync_log` — columns: `id BIGSERIAL PRIMARY KEY`, `user_id UUID NOT NULL REFERENCES users(id)`, `entity_type TEXT NOT NULL`, `entity_id TEXT NOT NULL`, `field_name TEXT NOT NULL`, `new_value JSONB`, `device_id TEXT NOT NULL`, `timestamp TIMESTAMPTZ NOT NULL DEFAULT now()`. Index on `(user_id, timestamp)`.
2. Create `server/migrations/001_init.down.sql` that drops all tables in reverse dependency order.

**DONE WHEN**
- [ ] Running `001_init.up.sql` on a fresh PostgreSQL 16 database succeeds with zero errors.
- [ ] Running `001_init.down.sql` after the up migration leaves zero tables in the `public` schema.
- [ ] The `sync_log` table has an index on `(user_id, timestamp)`.

---

### Task 3 (B) +db
**PURPOSE** — Provides seed data for development and testing so that every platform client can boot with a realistic dataset.

**WHAT TO DO**
1. Create `schema/seed.sql` that inserts:
   - 1 list named "Inbox" with `is_inbox=1`, 2 additional lists ("Work", "Personal").
   - 10 tasks distributed across the 3 lists: at least 2 with subtasks (depth 1), at least 1 with `recurrence_rule='FREQ=DAILY;INTERVAL=1'`, at least 1 with each priority level (0–3), at least 2 with `status=1` (completed), at least 3 with `due_date` values (one past, one today, one future).
   - 4 tags ("urgent", "errand", "review", "idea") and at least 6 `task_tags` associations.
2. All `id` fields must be hardcoded UUIDv7 strings (use pre-generated values). All `created_at`/`updated_at` must be valid ISO8601.

**DONE WHEN**
- [ ] Executing `canonical.sql` followed by `seed.sql` on a fresh SQLite database succeeds with zero errors.
- [ ] `SELECT COUNT(*) FROM tasks` returns 10; `SELECT COUNT(*) FROM tasks WHERE parent_task_id IS NOT NULL` returns ≥ 2; `SELECT COUNT(*) FROM tags` returns 4.

---

## Module 2: Server — Go + Echo (+server)

---

### Task 4 (A) +server
**PURPOSE** — Bootstraps the Go server project with Echo, structured logging, config loading, and graceful shutdown — the foundation for every subsequent server task.

**WHAT TO DO**
1. Initialize `server/` as a Go module: `go mod init github.com/<user>/tickclone-server`.
2. Create `server/cmd/server/main.go`:
   - Load config from environment variables using `github.com/caarlos0/env/v11`: `PORT` (default `8080`), `DATABASE_URL` (required), `SMTP_HOST`, `SMTP_PORT`, `SMTP_FROM`, `MAGIC_LINK_SECRET` (required, 32+ char), `CORS_ORIGINS` (comma-separated, default `*`).
   - Initialize `slog.Logger` with JSON handler to stdout.
   - Create Echo instance, attach `middleware.Recover()`, `middleware.CORS()` (using config origins), and a request-logging middleware that logs method, path, status, and latency via `slog`.
   - Register a `GET /health` route returning `{"status":"ok","time":"<RFC3339>"}`.
   - Start server with graceful shutdown on `SIGINT`/`SIGTERM` using `signal.NotifyContext` and `e.Shutdown(ctx)` with 10s timeout.
3. Create `server/Dockerfile`: multi-stage build, `golang:1.22-alpine` builder, `alpine:3.19` runner, expose `$PORT`, run as non-root user.

**DONE WHEN**
- [ ] `go build ./cmd/server` compiles with zero errors.
- [ ] Running the binary with `DATABASE_URL=postgres://...` set, then `curl localhost:8080/health` returns HTTP 200 with JSON containing `"status":"ok"`.
- [ ] Sending `SIGTERM` to the process causes it to shut down within 10s with a log line indicating graceful shutdown.
- [ ] `docker build -t tickclone-server ./server` succeeds.

---

### Task 5 (A) +server +db
**PURPOSE** — Connects the server to PostgreSQL and runs migrations on startup so the database is always at the latest schema version.

**WHAT TO DO**
1. Add `github.com/jackc/pgx/v5/pgxpool` and `github.com/golang-migrate/migrate/v4` (with `pgx5` driver and `file` source) to `go.mod`.
2. Create `server/internal/database/pool.go`:
   - `func NewPool(ctx context.Context, databaseURL string) (*pgxpool.Pool, error)` — parses URL, sets `pool_max_conns=20`, connects, and pings.
3. Create `server/internal/database/migrate.go`:
   - `func RunMigrations(databaseURL string, migrationsPath string) error` — uses `golang-migrate` to run all up migrations from the `migrationsPath` directory. Logs each migration step via `slog`. Returns `nil` on `migrate.ErrNoChange`.
4. In `main.go`, call `RunMigrations` before starting Echo, then `NewPool` and store the pool in a custom Echo context or dependency struct `server/internal/app/app.go`: `type App struct { DB *pgxpool.Pool; Log *slog.Logger; Config *Config }`.

**DONE WHEN**
- [ ] Starting the server against an empty PostgreSQL database automatically creates all tables from `001_init.up.sql`.
- [ ] Starting the server again (no new migrations) logs "no change" and proceeds normally.
- [ ] The `/health` endpoint returns 200, confirming the app starts successfully after migration.

---

### Task 6 (A) +server
**PURPOSE** — Implements full CRUD for lists, the top-level organizational entity that tasks belong to.

**WHAT TO DO**
1. Create `server/internal/models/list.go`: struct `List` with fields matching the `lists` table (use `time.Time` for timestamps, `*time.Time` for nullable ones). Add JSON tags (camelCase).
2. Create `server/internal/repository/list_repo.go`:
   - `CreateList(ctx, userID uuid.UUID, list *List) error` — `INSERT INTO lists (...) VALUES (...) RETURNING id, created_at, updated_at`.
   - `GetListsByUser(ctx, userID uuid.UUID) ([]List, error)` — `SELECT ... WHERE user_id=$1 AND deleted_at IS NULL ORDER BY sort_order`.
   - `GetListByID(ctx, userID, listID uuid.UUID) (*List, error)`.
   - `UpdateList(ctx, userID, listID uuid.UUID, name *string, color *string, sortOrder *int) (*List, error)` — builds dynamic `SET` clause for non-nil fields, always sets `updated_at=now()`.
   - `DeleteList(ctx, userID, listID uuid.UUID) error` — soft-delete: `UPDATE lists SET deleted_at=now() WHERE ...`. Also soft-deletes all tasks in the list.
3. Create `server/internal/handlers/list_handler.go`:
   - `POST /api/lists` — validate `name` non-empty (max 255 chars), create, return 201 + JSON.
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
**PURPOSE** — Implements full CRUD for tasks including subtask nesting, which is the core data entity of the entire application.

**WHAT TO DO**
1. Create `server/internal/models/task.go`: struct `Task` with all columns from the `tasks` table. Include a `Subtasks []Task` field (JSON tag `subtasks`, populated on read). Include a `Tags []Tag` field populated via join.
2. Create `server/internal/repository/task_repo.go`:
   - `CreateTask(ctx, userID uuid.UUID, task *Task) error` — INSERT, validate `list_id` exists and belongs to user. If `parent_task_id` is set, validate it exists, belongs to same list, and is not itself a subtask (max depth = 1).
   - `GetTasksByList(ctx, userID, listID uuid.UUID, includeCompleted bool) ([]Task, error)` — returns top-level tasks with subtasks nested. Joins `task_tags` + `tags` to populate `Tags` field. Filter by `deleted_at IS NULL`. Order by `sort_order`.
   - `GetTaskByID(ctx, userID, taskID uuid.UUID) (*Task, error)` — single task with subtasks and tags.
   - `UpdateTask(ctx, userID, taskID uuid.UUID, fields map[string]interface{}) (*Task, error)` — dynamic SET for provided fields. If `status` changes to 1, set `completed_at=now()`. If `status` changes to 0, set `completed_at=NULL`.
   - `DeleteTask(ctx, userID, taskID uuid.UUID) error` — soft-delete task and all its subtasks.
   - `MoveTask(ctx, userID, taskID, newListID uuid.UUID, newSortOrder int) error` — updates `list_id` and `sort_order`, also moves subtasks.
3. Create `server/internal/handlers/task_handler.go`:
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
**PURPOSE** — Implements CRUD for tags and the task-tag association, enabling label-based filtering and organization.

**WHAT TO DO**
1. Create `server/internal/models/tag.go`: struct `Tag` with `ID`, `Name`, `Color`, `CreatedAt`.
2. Create `server/internal/repository/tag_repo.go`:
   - `CreateTag(ctx, userID uuid.UUID, tag *Tag) error`.
   - `GetTagsByUser(ctx, userID uuid.UUID) ([]Tag, error)`.
   - `UpdateTag(ctx, userID, tagID uuid.UUID, name *string, color *string) (*Tag, error)`.
   - `DeleteTag(ctx, userID, tagID uuid.UUID) error` — hard-delete tag and all `task_tags` rows referencing it.
   - `AddTagToTask(ctx, userID, taskID, tagID uuid.UUID) error` — INSERT into `task_tags`, return conflict-safe (ON CONFLICT DO NOTHING).
   - `RemoveTagFromTask(ctx, userID, taskID, tagID uuid.UUID) error` — DELETE from `task_tags`.
   - `GetTasksByTag(ctx, userID, tagID uuid.UUID) ([]Task, error)` — returns all non-deleted tasks with the given tag.
3. Create `server/internal/handlers/tag_handler.go`:
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
**PURPOSE** — Implements passwordless magic link authentication so users can optionally enable sync across devices.

**WHAT TO DO**
1. Create `server/internal/services/auth_service.go`:
   - `GenerateMagicLink(ctx, email string) (token string, err error)`:
     a. Find or create user by email in `users` table.
     b. Generate a 32-byte crypto-random token, base64url-encode it.
     c. Insert into `magic_links` with `expires_at = now() + 15 minutes`.
     d. Return the token (caller sends the email).
   - `ValidateMagicLink(ctx, token string) (userID uuid.UUID, err error)`:
     a. Look up token in `magic_links` where `used_at IS NULL AND expires_at > now()`.
     b. If not found, return `ErrInvalidToken`.
     c. Mark `used_at = now()`.
     d. Return `user_id`.
   - `GenerateSessionToken(userID uuid.UUID) (jwt string, err error)`:
     a. Create a JWT (HS256) signed with `MAGIC_LINK_SECRET`, claims: `sub=userID`, `iat=now`, `exp=now+30days`.
     b. Return the signed token string.
2. Create `server/internal/services/email_service.go`:
   - `SendMagicLink(ctx, toEmail, token string) error` — uses `net/smtp` to send an email via configured SMTP. Email body: plain text with a link `{BASE_URL}/auth/verify?token={token}`.
3. Create `server/internal/handlers/auth_handler.go`:
   - `POST /api/auth/magic-link` — body `{"email":"..."}`. Calls `GenerateMagicLink`, then `SendMagicLink`. Always returns 200 `{"message":"If that email is registered, a link has been sent."}` (no user enumeration).
   - `POST /api/auth/verify` — body `{"token":"..."}`. Calls `ValidateMagicLink`, then `GenerateSessionToken`. Returns 200 `{"token":"<jwt>","expiresAt":"..."}`.
4. Create `server/internal/middleware/auth_middleware.go`:
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
**PURPOSE** — Implements recurring task expansion so the server can generate future instances of recurring tasks based on RRULE.

**WHAT TO DO**
1. Add `github.com/teambition/rrule-go` to `go.mod`.
2. Create `server/internal/services/recurrence_service.go`:
   - `ExpandRecurrence(rule string, dtstart time.Time, after time.Time, limit int) ([]time.Time, error)` — parses the RRULE string, returns the next `limit` occurrences after `after`. Default `limit=10`.
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
**PURPOSE** — Implements the server-side sync endpoint that clients push local changes to and pull remote changes from, using timestamp-based conflict resolution.

**WHAT TO DO**
1. Create `server/internal/models/sync.go`:
   - `SyncPushPayload` struct: `DeviceID string`, `Changes []ChangeRecord`. Each `ChangeRecord`: `EntityType string`, `EntityID string`, `FieldName string`, `NewValue json.RawMessage`, `Timestamp time.Time`.
   - `SyncPullPayload` struct: `DeviceID string`, `LastSyncAt time.Time`.
   - `SyncPullResponse` struct: `Changes []ChangeRecord`, `ServerTime time.Time`.
2. Create `server/internal/services/sync_service.go`:
   - `PushChanges(ctx, userID uuid.UUID, payload SyncPushPayload) (accepted int, conflicts int, err error)`:
     a. For each `ChangeRecord`, check `sync_log` for the latest entry with same `(entity_type, entity_id, field_name)`.
     b. If no existing entry OR `payload.Timestamp > existing.Timestamp`: apply the change (UPDATE the corresponding table field), insert into `sync_log`. Increment `accepted`.
     c. If `payload.Timestamp <= existing.Timestamp`: skip (server wins). Increment `conflicts`.
   - `PullChanges(ctx, userID uuid.UUID, payload SyncPullPayload) (*SyncPullResponse, error)`:
     a. Query `sync_log WHERE user_id=$1 AND device_id != $2 AND timestamp > $3 ORDER BY timestamp ASC`.
     b. Return the change records and current server time.
3. Create `server/internal/handlers/sync_handler.go`:
   - `POST /api/sync/push` — accepts `SyncPushPayload`, returns 200 `{"accepted": N, "conflicts": M}`.
   - `POST /api/sync/pull` — accepts `SyncPullPayload`, returns 200 with `SyncPullResponse`.

**DONE WHEN**
- [ ] Pushing a change for field `title` on a task inserts a row into `sync_log` and updates the `tasks` table.
- [ ] Pushing an older timestamp for the same field is rejected (conflict count > 0, table value unchanged).
- [ ] Pulling changes with `lastSyncAt` before a known change returns that change; pulling with `lastSyncAt` after it returns empty.
- [ ] Changes from the same `device_id` are excluded from pull results.

---

### Task 13 (A) +sync +server
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
**PURPOSE** — Scaffolds the Tauri 2.x project with Svelte 5 frontend, establishing the cross-platform application shell.

**WHAT TO DO**
1. In project root, run `npm create tauri-app@latest tauri-app -- --template svelte-ts` (or equivalent manual setup).
2. Ensure `tauri-app/src-tauri/Cargo.toml` targets Tauri 2.x with features: `["shell-open"]`.
3. Configure `tauri-app/src-tauri/tauri.conf.json`:
   - `productName`: `"TickClone"`, `identifier`: `"com.tickclone.app"`.
   - Window: `title: "TickClone"`, `width: 1200`, `height: 800`, `minWidth: 800`, `minHeight: 600`.
   - Allow list for IPC commands (to be populated in later tasks).
4. Verify `tauri-app/package.json` has Svelte 5 (`svelte@^5.0.0`), `@sveltejs/vite-plugin-svelte`, TypeScript, and Vite.
5. Create `tauri-app/src/App.svelte` with a placeholder layout: 250px left sidebar, remaining content area, top toolbar. Use CSS grid. Display "TickClone" in the toolbar.
6. Verify the dev loop: `cd tauri-app && npm run tauri dev` launches a native window on the current platform.

**DONE WHEN**
- [ ] `npm run tauri dev` compiles and opens a native window titled "TickClone" with the sidebar + content layout visible.
- [ ] `npm run tauri build` produces a distributable binary for the current platform without errors.
- [ ] The Svelte version in `node_modules/svelte/package.json` is 5.x.

---

### Task 15 (A) +tauri
**PURPOSE** — Implements the local SQLite database layer in the Tauri Rust backend, providing offline-first task storage.

**WHAT TO DO**
1. Add `rusqlite` (with `bundled` feature) and `serde`/`serde_json` to `src-tauri/Cargo.toml`.
2. Create `src-tauri/src/db.rs`:
   - `pub fn init_db(app_data_dir: &Path) -> Result<Connection>` — opens or creates `tickclone.db` in the app data directory. Runs `PRAGMA foreign_keys=ON`, `PRAGMA journal_mode=WAL`. Executes the canonical schema SQL (embed it via `include_str!("../../schema/canonical.sql")` — copy the schema file into the Tauri project or use a shared path).
   - `pub fn get_connection(app_data_dir: &Path) -> Result<Connection>` — opens existing DB with same PRAGMAs.
3. Create `src-tauri/src/state.rs`:
   - `pub struct AppState { pub db_path: PathBuf }` — stored as Tauri managed state.
4. In `src-tauri/src/main.rs` (or `lib.rs` for Tauri 2):
   - On app setup, resolve `app.path().app_data_dir()`, call `init_db`, store `AppState` via `app.manage()`.

**DONE WHEN**
- [ ] Launching the app creates `tickclone.db` in the platform-appropriate app data directory (e.g., `~/.local/share/com.tickclone.app/` on Linux).
- [ ] The database contains all 5 tables from the canonical schema with correct columns.
- [ ] Relaunching the app does not error or recreate existing tables.

---

### Task 16 (A) +tauri
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
**PURPOSE** — Exposes Tauri IPC commands for task CRUD including subtask support, the primary data operations for the app.

**WHAT TO DO**
1. Create `src-tauri/src/commands/task_commands.rs`:
   - `create_task(state, list_id, title, content?, priority?, due_date?, due_timezone?, recurrence_rule?, parent_task_id?) -> Result<Task, String>` — validates `parent_task_id` depth ≤ 1, generates UUIDv7, inserts.
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
**PURPOSE** — Implements the global Svelte store layer that bridges Tauri IPC with reactive UI state, enabling all components to read and mutate app data.

**WHAT TO DO**
1. Create `tauri-app/src/lib/stores/lists.ts`:
   - Export a writable store `lists` of type `Writable<List[]>`.
   - Export async functions: `loadLists()`, `addList(name, color?)`, `editList(id, updates)`, `removeList(id)`. Each calls the corresponding Tauri `invoke` and updates the store.
2. Create `tauri-app/src/lib/stores/tasks.ts`:
   - Export a writable store `tasks` of type `Writable<Task[]>` (the current list's tasks).
   - Export a writable store `selectedListId` of type `Writable<string | null>`.
   - Export async functions: `loadTasks(listId, includeCompleted?)`, `addTask(...)`, `editTask(id, fields)`, `removeTask(id)`, `moveTask(id, newListId, sortOrder)`, `completeTask(id)` (handles recurring logic).
   - When `selectedListId` changes, auto-call `loadTasks`.
3. Create `tauri-app/src/lib/stores/tags.ts`:
   - Export store and CRUD functions for tags, plus `tagTask(taskId, tagId)` and `untagTask(taskId, tagId)`.
4. Create shared TypeScript types in `tauri-app/src/lib/types.ts`: `List`, `Task`, `Tag`, `TaskUpdatePayload`, matching the Rust models.

**DONE WHEN**
- [ ] Calling `addList('Work')` in browser console (via dev tools) triggers IPC, and the `lists` store reactively updates.
- [ ] Changing `selectedListId` triggers `loadTasks` and the `tasks` store updates with that list's tasks.
- [ ] All TypeScript types compile with `tsc --noEmit` — no type errors.

---

### Task 20 (A) +svelte
**PURPOSE** — Builds the sidebar component displaying all lists, inbox, tag filters, and the "Add List" action — the primary navigation element.

**WHAT TO DO**
1. Create `tauri-app/src/lib/components/Sidebar.svelte`:
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
**PURPOSE** — Builds the task list view showing all tasks for the selected list with inline add, complete, and priority indicators.

**WHAT TO DO**
1. Create `tauri-app/src/lib/components/TaskList.svelte`:
   - If no list selected, show empty state: centered text "Select a list to view tasks".
   - Otherwise, show list name as header with task count.
   - Quick-add input at top: `<input placeholder="Add a task..." />`. On Enter, call `addTask` with the typed title and the current `selectedListId`. Clear input after.
   - Render each task as a row: checkbox (on click → `completeTask(id)`), priority indicator (colored left border: none/gray/blue/orange/red for 0–3), title text, due date badge (if set, show relative: "Today", "Tomorrow", "Mar 15", styled red if overdue), tag pills (small colored badges).
   - Subtasks: indented below parent with a subtle left margin (24px). Show collapse/expand chevron on parent if subtasks exist.
   - Completed tasks: if `includeCompleted` is toggled on, show below a "Completed" divider with strikethrough titles and muted colors.
   - Clicking a task title (not checkbox) opens the task detail panel (Task 23).
2. Support drag-and-drop reordering (use a simple mousedown/mousemove/mouseup handler or `@dnd-kit` equivalent for Svelte — or a lightweight `sortablejs` integration). On drop, call `editTask(id, { sortOrder: newIndex })` for affected tasks.

**DONE WHEN**
- [ ] Typing "Buy milk" and pressing Enter creates a task that appears in the list immediately.
- [ ] Clicking the checkbox on a non-recurring task strikes it through and moves it to the completed section.
- [ ] Tasks with `priority: 3` (high) display a red left border; `priority: 0` has no colored border.
- [ ] Subtasks appear indented under their parent and can be collapsed.
- [ ] Overdue tasks show a red due-date badge.

---

### Task 22 (A) +svelte
**PURPOSE** — Builds the task detail panel for viewing and editing all task fields, providing the full editing experience.

**WHAT TO DO**
1. Create `tauri-app/src/lib/components/TaskDetail.svelte`:
   - Slides in from the right (400px wide panel) when a task is selected. Close button (X) in top-right.
   - Editable title: `<input>` bound to task title, debounced save (300ms) via `editTask`.
   - Editable content/notes: `<textarea>` for markdown body, debounced save.
   - Priority selector: 4 clickable icons/buttons (none, low, med, high) with color coding. Clicking calls `editTask`.
   - Due date picker: `<input type="date">` + optional time `<input type="time">`. On change, calls `editTask` with ISO8601 string.
   - Recurrence rule: dropdown with presets ("None", "Daily", "Weekly", "Monthly", "Yearly", "Custom"). "Custom" shows a text input for raw RRULE. Calls `editTask`.
   - Tags section: display current tags as removable pills (click X → `untagTask`). "+" button shows a dropdown of available tags to add (calls `tagTask`).
   - Subtasks section: inline list of subtasks with checkboxes + a "+ Add subtask" input.
   - List assignment: dropdown showing all lists. Changing it calls `moveTask`.
   - Footer: "Created <date>" and "Delete task" button (red, with confirm dialog).
2. Create `tauri-app/src/lib/stores/ui.ts`: `selectedTaskId` writable store. `TaskDetail` reacts to this.

**DONE WHEN**
- [ ] Clicking a task in `TaskList` opens `TaskDetail` with all fields populated.
- [ ] Editing the title, waiting 300ms, and refreshing the task list shows the updated title.
- [ ] Changing priority to "high" immediately updates the priority indicator in both the detail panel and the task list row.
- [ ] Adding a tag via the "+" dropdown adds a pill; removing it via "X" removes the pill and the association.
- [ ] Changing the list assignment moves the task out of the current list view.

---

### Task 23 (B) +svelte
**PURPOSE** — Implements a "Today" smart view that aggregates tasks due today across all lists, a key productivity feature.

**WHAT TO DO**
1. Create a new Tauri command `get_tasks_due_today(state) -> Result<Vec<Task>, String>` in `task_commands.rs`:
   - Query: `SELECT ... FROM tasks WHERE deleted_at IS NULL AND status=0 AND date(due_date) = date('now') ORDER BY priority DESC, sort_order ASC`.
   - Include subtasks and tags via the same join logic.
2. Register the command.
3. Create `tauri-app/src/lib/components/TodayView.svelte`:
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

### Task 24 (A) +svelte
**PURPOSE** — Implements the calendar month view displaying tasks on their due dates, the second core MVP view.

**WHAT TO DO**
1. Create a Tauri command `get_tasks_in_range(state, start_date: String, end_date: String) -> Result<Vec<Task>, String>`:
   - Query: `SELECT ... FROM tasks WHERE deleted_at IS NULL AND due_date >= $1 AND due_date <= $2 ORDER BY due_date, priority DESC`.
   - `start_date` and `end_date` are ISO8601 date strings.
2. Create `tauri-app/src/lib/components/CalendarView.svelte`:
   - Month grid: 7 columns (Mon–Sun), 5–6 rows. Header row with day names.
   - Navigation: "< Month Year >" header with left/right arrows to change month. "Today" button to jump to current month.
   - Each day cell: date number (dim for days outside current month), list of task titles (max 3 visible, "+N more" overflow badge). Tasks colored by priority.
   - Clicking a day cell opens a popover or panel listing all tasks for that day with full `TaskRow` rendering.
   - Clicking a task in the calendar opens `TaskDetail`.
   - Quick add: clicking an empty area of a day cell opens an inline input to create a task with that date pre-filled as `due_date`.
3. Store current month/year in `tauri-app/src/lib/stores/calendar.ts`. On month change, call `get_tasks_in_range` with first/last day of the visible range (include overflow days from adjacent months).
4. Add "Calendar" navigation item in sidebar with a calendar icon.

**DONE WHEN**
- [ ] The calendar view renders a correct month grid for the current month (correct number of days, correct starting weekday).
- [ ] Tasks with due dates appear on the correct day cells with priority coloring.
- [ ] Navigating to the next month fetches and renders tasks for that month.
- [ ] Clicking a day shows all tasks for that day; clicking "+N more" expands the list.
- [ ] Quick-adding a task on a day cell creates a task with that day as `due_date`.

---

### Task 25 (B) +svelte
**PURPOSE** — Implements natural language date input so users can type things like "tomorrow 3pm" or "every weekday" and get structured date/recurrence data.

**WHAT TO DO**
1. Install `chrono-node` (npm package) in `tauri-app`: `npm install chrono-node`.
2. Create `tauri-app/src/lib/services/nlp-date.ts`:
   - `export function parseNaturalDate(input: string, referenceDate?: Date): ParsedDate | null`.
   - `ParsedDate` type: `{ date: string (ISO8601), hasTime: boolean, recurrenceRule: string | null }`.
   - Use `chrono.parseDate(input, referenceDate)` for single dates.
   - For recurrence patterns, detect keywords before passing to chrono:
     - "every day" / "daily" → `FREQ=DAILY;INTERVAL=1`
     - "every week" / "weekly" → `FREQ=WEEKLY;INTERVAL=1`
     - "every weekday" → `FREQ=WEEKLY;BYDAY=MO,TU,WE,TH,FR`
     - "every month" / "monthly" → `FREQ=MONTHLY;INTERVAL=1`
     - "every year" / "yearly" → `FREQ=YEARLY;INTERVAL=1`
     - "every N days/weeks/months" → parse N and set interval.
   - If recurrence detected, also parse the start date from remaining text (default: today).
3. Integrate into the quick-add input in `TaskList.svelte`:
   - After the user types and before creating the task, run `parseNaturalDate` on the input.
   - If a date is parsed, extract it and use the remaining text as the title. E.g., "Buy milk tomorrow 3pm" → title: "Buy milk", due_date: tomorrow at 15:00.
   - Show a small preview badge below the input: "📅 Tomorrow, 3:00 PM" so the user sees what was parsed. Pressing Enter confirms.
   - If no date detected, create the task with no due date.

**DONE WHEN**
- [ ] Typing "Buy milk tomorrow" in quick-add shows a "📅 Tomorrow" badge and creates a task due tomorrow with title "Buy milk".
- [ ] Typing "Standup meeting every weekday 9am" creates a task with `recurrenceRule: 'FREQ=WEEKLY;BYDAY=MO,TU,WE,TH,FR'` and due time 09:00.
- [ ] Typing "something random" with no date keywords creates a task with no due date.
- [ ] Typing "Dec 25" correctly parses to the next December 25th.

---

### Task 26 (B) +svelte
**PURPOSE** — Implements keyboard shortcuts for power-user productivity, matching TickTick's keyboard-driven workflow.

**WHAT TO DO**
1. Create `tauri-app/src/lib/services/shortcuts.ts`:
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

## Module 6: Apple — SwiftUI Shared (+apple)

---

### Task 27 (A) +apple
**PURPOSE** — Creates the Xcode project structure with shared SwiftUI code for both macOS and iOS targets.

**WHAT TO DO**
1. Create `apple/TickClone.xcodeproj` (or `.xcworkspace` with SPM) with three targets:
   - `TickCloneShared` — a Swift Package (local) containing all shared models, database layer, stores, and reusable views. Path: `apple/Packages/TickCloneShared`.
   - `TickClone-macOS` — macOS app target (deployment: macOS 14+). Depends on `TickCloneShared`.
   - `TickClone-iOS` — iOS app target (deployment: iOS 17+). Depends on `TickCloneShared`.
2. In `TickCloneShared/Package.swift`, add dependencies:
   - `GRDB.swift` (latest 6.x) via SPM: `https://github.com/groue/GRDB.swift.git`.
   - `UUIDv7` implementation: use `https://github.com/alexanderants/uuidv7-swift.git` or hand-roll a simple UUIDv7 generator in `Sources/TickCloneShared/Utilities/UUIDv7.swift`.
3. Create `Sources/TickCloneShared/Models/` directory with placeholder files: `ListModel.swift`, `TaskModel.swift`, `TagModel.swift`.

**DONE WHEN**
- [ ] The Xcode project builds both macOS and iOS targets without errors.
- [ ] `TickCloneShared` is importable from both targets (`import TickCloneShared` compiles).
- [ ] GRDB resolves and links correctly for both platforms.

---

### Task 28 (A) +apple
**PURPOSE** — Implements the GRDB database layer in the shared package, providing the same local SQLite storage as the Tauri app.

**WHAT TO DO**
1. Create `Sources/TickCloneShared/Database/AppDatabase.swift`:
   - `final class AppDatabase` with a `dbWriter: DatabaseWriter` property (GRDB `DatabasePool`).
   - `static func create(atPath: String) throws -> AppDatabase` — opens a `DatabasePool` at the given path, runs migrations.
   - Migration using GRDB's `DatabaseMigrator`:
     - `v1`: Create `lists`, `tasks`, `tags`, `task_tags`, `sync_meta` tables matching canonical schema exactly. Enable foreign keys.
     - Register the migrator and run `migrator.migrate(dbWriter)`.
2. Create `Sources/TickCloneShared/Database/AppDatabase+Seed.swift`:
   - `func seedIfEmpty() throws` — checks if `lists` table is empty; if so, inserts the Inbox list.
3. In both app targets, initialize `AppDatabase` in the `@main` App struct using the platform-appropriate directory:
   - macOS: `FileManager.default.urls(for: .applicationSupportDirectory, ...)`.
   - iOS: `FileManager.default.urls(for: .documentDirectory, ...)`.

**DONE WHEN**
- [ ] Launching the macOS app creates `tickclone.db` in `~/Library/Application Support/TickClone/`.
- [ ] Launching the iOS app (simulator) creates the DB in the Documents directory.
- [ ] The database contains all 5 tables. An Inbox list exists after first launch.
- [ ] Restarting does not re-seed or error.

---

### Task 29 (A) +apple
**PURPOSE** — Defines the Swift model structs with GRDB record conformance for type-safe database operations.

**WHAT TO DO**
1. `Sources/TickCloneShared/Models/ListModel.swift`:
   - `struct ListModel: Codable, FetchableRecord, PersistableRecord, Identifiable` with properties matching canonical `lists` columns. `static let databaseTableName = "lists"`.
2. `Sources/TickCloneShared/Models/TaskModel.swift`:
   - `struct TaskModel: Codable, FetchableRecord, PersistableRecord, Identifiable` matching `tasks`. Add a `subtasks: [TaskModel]` transient property (not persisted, populated via association).
   - Define GRDB associations: `static let list = belongsTo(ListModel.self)`, `static let parentTask = belongsTo(TaskModel.self, key: "parentTask")`, `static let subtasks = hasMany(TaskModel.self, key: "subtasks", using: ...)`, `static let taskTags = hasMany(TaskTagModel.self)`, `static let tags = hasMany(TagModel.self, through: taskTags, using: TaskTagModel.tag)`.
3. `Sources/TickCloneShared/Models/TagModel.swift`:
   - `struct TagModel: Codable, FetchableRecord, PersistableRecord, Identifiable`.
4. `Sources/TickCloneShared/Models/TaskTagModel.swift`:
   - `struct TaskTagModel: Codable, FetchableRecord, PersistableRecord` with `taskId`, `tagId`. Associations to both `TaskModel` and `TagModel`.

**DONE WHEN**
- [ ] `try dbWriter.write { db in try ListModel(...).insert(db) }` inserts a list and `try ListModel.fetchAll(db)` retrieves it.
- [ ] `TaskModel` can be fetched with `including(all: TaskModel.subtasks)` and the `subtasks` property is populated.
- [ ] `TaskModel` can be fetched with `including(all: TaskModel.tags)` and tags are populated.

---

### Task 30 (A) +apple
**PURPOSE** — Implements the repository layer for list, task, and tag CRUD operations using GRDB, consumed by SwiftUI stores.

**WHAT TO DO**
1. Create `Sources/TickCloneShared/Repositories/ListRepository.swift`:
   - `func createList(_ list: ListModel) throws`
   - `func getAllLists() throws -> [ListModel]` — non-deleted, ordered by `sortOrder`.
   - `func updateList(_ list: ListModel) throws`
   - `func deleteList(id: String) throws` — soft-delete; also soft-deletes all tasks in the list. Throws if `isInbox == true`.
2. Create `Sources/TickCloneShared/Repositories/TaskRepository.swift`:
   - `func createTask(_ task: TaskModel) throws` — validates parent depth ≤ 1.
   - `func getTasksByList(listId: String, includeCompleted: Bool) throws -> [TaskModel]` — returns top-level tasks with nested subtasks and tags.
   - `func getTask(id: String) throws -> TaskModel?`.
   - `func updateTask(id: String, fields: TaskUpdateFields) throws` — `TaskUpdateFields` struct with all optional properties. Auto-manages `completedAt`.
   - `func deleteTask(id: String) throws` — soft-delete + subtasks.
   - `func getTasksDueToday() throws -> [TaskModel]`.
   - `func getTasksInRange(start: String, end: String) throws -> [TaskModel]`.
   - `func completeRecurringTask(id: String) throws -> (completed: TaskModel, next: TaskModel?)` — same logic as server/Tauri.
3. Create `Sources/TickCloneShared/Repositories/TagRepository.swift`:
   - Full CRUD + `addTagToTask`, `removeTagFromTask`, `getTasksByTag`.
4. All repositories take `AppDatabase` in their init and use `dbWriter.write`/`dbWriter.read`.

**DONE WHEN**
- [ ] `ListRepository.createList(...)` followed by `getAllLists()` returns the created list.
- [ ] `TaskRepository.createTask(...)` with a `parentTaskId` pointing to a subtask throws an error.
- [ ] `TaskRepository.completeRecurringTask(...)` on a daily-recurring task returns a `next` task with tomorrow's date.
- [ ] `TagRepository.addTagToTask(...)` is idempotent (calling twice doesn't error).

---

### Task 31 (A) +apple
**PURPOSE** — Implements observable SwiftUI stores (`@Observable`) wrapping the repositories, driving reactive UI updates.

**WHAT TO DO**
1. Create `Sources/TickCloneShared/Stores/ListStore.swift`:
   - `@Observable final class ListStore` with `var lists: [ListModel] = []`, `var selectedListId: String?`.
   - Methods: `func load()`, `func add(name:color:)`, `func update(id:name:color:sortOrder:)`, `func delete(id:)`. All call corresponding repository methods and refresh `lists`.
2. Create `Sources/TickCloneShared/Stores/TaskStore.swift`:
   - `@Observable final class TaskStore` with `var tasks: [TaskModel] = []`, `var selectedTaskId: String?`.
   - Methods: `func loadForList(listId:includeCompleted:)`, `func loadToday()`, `func loadRange(start:end:)`, `func add(...)`, `func update(id:fields:)`, `func delete(id:)`, `func complete(id:)`, `func move(id:toListId:sortOrder:)`.
3. Create `Sources/TickCloneShared/Stores/TagStore.swift`:
   - `@Observable final class TagStore` with `var tags: [TagModel] = []`.
   - CRUD methods + `tagTask` / `untagTask`.
4. All stores handle errors by storing `var errorMessage: String?` which the UI can display.

**DONE WHEN**
- [ ] Modifying `ListStore.add(name: "Work")` updates `lists` array, and a SwiftUI View observing `listStore.lists` rerenders.
- [ ] `TaskStore.loadToday()` populates `tasks` with only today's due tasks.
- [ ] Setting `selectedListId` and calling `loadForList` updates `tasks` reactively.

---

### Task 32 (A) +apple
**PURPOSE** — Builds the main navigation structure and sidebar for both macOS and iOS using SwiftUI's NavigationSplitView.

**WHAT TO DO**
1. Create `Sources/TickCloneShared/Views/MainView.swift`:
   - Use `NavigationSplitView` (3-column on macOS: sidebar, list, detail; 2-column on iOS with navigation stack).
   - Sidebar column: `SidebarView`.
   - Content column: switches on `currentView` state (`today`, `calendar`, `list`) to show `TodayView`, `CalendarView`, or `TaskListView`.
   - Detail column: `TaskDetailView` when a task is selected.
2. Create `Sources/TickCloneShared/Views/SidebarView.swift`:
   - "Today" item with calendar icon + badge of today's task count.
   - "Calendar" item with calendar-grid icon.
   - Section "Lists": ForEach over `listStore.lists`, each showing colored circle + name + open task count.
   - "New List" button: presents an alert with a text field.
   - Section "Tags": collapsible, shows all tags with colored dots.
   - Swipe-to-delete on lists (except Inbox). Context menu for rename/change color.
3. Inject `ListStore`, `TaskStore`, `TagStore` via `@Environment` in app entry points.

**DONE WHEN**
- [ ] macOS app shows a 3-column layout with sidebar, task list, and detail panel.
- [ ] iOS app shows a navigation stack that drills from sidebar → task list → task detail.
- [ ] Tapping "Today" in sidebar switches content to the Today view.
- [ ] Creating a new list via the sidebar adds it immediately to the list.
- [ ] Swipe-to-delete on a non-Inbox list removes it; Inbox has no delete action.

---

### Task 33 (A) +apple
**PURPOSE** — Builds the task list view in SwiftUI, displaying tasks with priorities, due dates, tags, and subtask nesting.

**WHAT TO DO**
1. Create `Sources/TickCloneShared/Views/TaskListView.swift`:
   - Header: list name + task count.
   - Quick-add `TextField` at top. On submit, parse with NLP (Task 37) and call `taskStore.add(...)`.
   - `List` or `LazyVStack` iterating over `taskStore.tasks`:
     - `TaskRowView` for each task (create as separate component).
   - `DisclosureGroup` for subtasks under each parent.
   - "Completed" section at bottom (collapsible), showing completed tasks with strikethrough.
2. Create `Sources/TickCloneShared/Views/TaskRowView.swift`:
   - Leading: checkbox (circle, filled when complete). On tap → `taskStore.complete(id:)`.
   - Priority indicator: colored left bar or tinted checkbox (none/green/blue/orange/red).
   - Title text (strikethrough if completed).
   - Trailing: due date badge (red if overdue, gray otherwise), tag pills.

**DONE WHEN**
- [ ] Task list renders all tasks for the selected list with correct priority coloring.
- [ ] Tapping the checkbox completes a task; it moves to the "Completed" section with strikethrough.
- [ ] Subtasks render indented under their parent task.
- [ ] Overdue tasks show a red due-date badge.

---

### Task 34 (A) +apple
**PURPOSE** — Builds the task detail editing view in SwiftUI for full task field manipulation.

**WHAT TO DO**
1. Create `Sources/TickCloneShared/Views/TaskDetailView.swift`:
   - Bound to `taskStore.selectedTaskId`. If nil, show "Select a task" placeholder.
   - Editable title `TextField`.
   - Notes `TextEditor` for markdown body.
   - Priority picker: segmented control or HStack of tappable icons (P0–P3).
   - Date picker: `DatePicker` for due date + toggle for "Include time".
   - Recurrence picker: `Picker` with options ("None", "Daily", "Weekly", "Monthly", "Yearly", "Custom"). "Custom" shows a `TextField` for raw RRULE.
   - Tags section: `FlowLayout` (or `HStack` wrapping) of tag pills with "+" button showing a picker.
   - Subtasks: inline list with "+" button.
   - List picker: `Picker` over `listStore.lists` for moving.
   - "Delete" button with confirmation alert.
2. All changes save immediately via `taskStore.update(id:fields:)` on `onChange` modifiers.

**DONE WHEN**
- [ ] Selecting a task shows all its fields in the detail view.
- [ ] Changing priority immediately persists (verified by re-selecting the task after navigating away).
- [ ] Changing the list via picker moves the task out of the current list.
- [ ] Adding/removing tags updates both the detail view and the task row.

---

### Task 35 (B) +apple
**PURPOSE** — Builds the Today smart view in SwiftUI, aggregating tasks due today across all lists.

**WHAT TO DO**
1. Create `Sources/TickCloneShared/Views/TodayView.swift`:
   - Header: "Today" + formatted date (e.g., "Thursday, March 12").
   - "Overdue" section (red accent) showing tasks with `due_date < today` and `status == 0`.
   - "Due Today" section grouped by list (sub-headers with list color dot + name).
   - Each task rendered with `TaskRowView`.
   - Quick-add at top, auto-sets `due_date` to today.
2. On appear, call `taskStore.loadToday()`.

**DONE WHEN**
- [ ] Today view shows only tasks due today + overdue, grouped by list.
- [ ] Completing a task removes it from the view.
- [ ] Quick-adding a task in the Today view creates it with today's date.

---

### Task 36 (A) +apple
**PURPOSE** — Builds the calendar month view in SwiftUI displaying tasks on their due dates.

**WHAT TO DO**
1. Create `Sources/TickCloneShared/Views/CalendarView.swift`:
   - Month header with navigation arrows and "Today" button.
   - 7-column `LazyVGrid` for the day grid (Mon–Sun headers).
   - Each day cell: date number (dimmed for outside current month), up to 3 task title snippets with priority colors, "+N" badge for overflow.
   - Tapping a day opens a sheet/popover listing all tasks for that day.
   - Tapping a task navigates to `TaskDetailView`.
2. Store: `@State private var displayedMonth: Date`. On change, call `taskStore.loadRange(start:end:)` with first/last visible dates.

**DONE WHEN**
- [ ] Calendar renders the correct number of days for the current month with correct weekday alignment.
- [ ] Tasks appear on their due date cells with priority color indicators.
- [ ] Navigating months loads and displays tasks for the new month.
- [ ] Tapping a day shows all tasks for that day.

---

### Task 37 (B) +apple
**PURPOSE** — Implements natural language date parsing in Swift for quick task entry on Apple platforms.

**WHAT TO DO**
1. Create `Sources/TickCloneShared/Services/NaturalDateParser.swift`:
   - `struct ParsedDate { let date: Date; let hasTime: Bool; let recurrenceRule: String? }`
   - `static func parse(_ input: String, reference: Date = Date()) -> (title: String, parsed: ParsedDate?)`
   - Use `NSDataDetector` with `.date` type to find date references in the string.
   - For recurrence keywords ("every day", "daily", "every weekday", "weekly", "monthly", "yearly", "every N days/weeks/months"), regex-match before running `NSDataDetector`, strip the recurrence phrase, generate RRULE string.
   - Return the remaining text (with date/recurrence phrases removed) as the title.
2. Integrate into the quick-add `TextField` in `TaskListView.swift`:
   - On text change (debounced 500ms), run `NaturalDateParser.parse` and show a preview label below the input: "📅 Tomorrow, 3:00 PM" or "🔁 Daily at 9:00 AM".
   - On submit, use the parsed date/recurrence if available.

**DONE WHEN**
- [ ] `NaturalDateParser.parse("Buy milk tomorrow 3pm")` returns title "Buy milk", date = tomorrow at 15:00, `hasTime = true`.
- [ ] `NaturalDateParser.parse("Standup every weekday 9am")` returns title "Standup", recurrenceRule = "FREQ=WEEKLY;BYDAY=MO,TU,WE,TH,FR", date = today at 09:00.
- [ ] `NaturalDateParser.parse("Just a normal task")` returns title "Just a normal task", parsed = nil.

---

## Module 7: Client-Side Sync (+sync)

---

### Task 38 (A) +sync +tauri
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
3. Modify all CRUD commands (Tasks 16–18) to call `record_change` after every write operation.
4. Create Tauri command `sync_now(state) -> Result<SyncStatus, String>`:
   - Get pending changes → push → pull → apply remote changes → update `last_sync_at` in a `settings` table (create if not exists: `key TEXT PRIMARY KEY, value TEXT`).
   - Return `SyncStatus { pushed: u32, pulled: u32, conflicts: u32 }`.

**DONE WHEN**
- [ ] Creating a task locally inserts a row into `sync_meta` with the task's field changes.
- [ ] `invoke('sync_now')` with a running server pushes pending changes and pulls remote changes.
- [ ] Remote changes (from another device) are applied to the local database after pull.
- [ ] Conflicting changes (older local timestamp) are skipped during pull application.

---

### Task 39 (A) +sync +apple
**PURPOSE** — Implements the sync client in the Swift shared package, mirroring the Tauri sync logic for Apple platforms.

**WHAT TO DO**
1. Create `Sources/TickCloneShared/Sync/SyncClient.swift`:
   - `class SyncClient` with `baseURL: URL`, `authToken: String?`, `deviceId: String` (generated once, stored in UserDefaults).
   - `func push(changes: [ChangeRecord]) async throws -> PushResult` — POST to `/api/sync/push` using `URLSession`.
   - `func pull(lastSyncAt: Date) async throws -> PullResult` — POST to `/api/sync/pull`.
2. Create `Sources/TickCloneShared/Sync/SyncTracker.swift`:
   - `func recordChange(db: Database, entityType:entityId:fieldName:newValue:)` — inserts into `sync_meta`.
   - `func getPendingChanges(db: Database, since: Date) -> [ChangeRecord]`.
   - `func applyRemoteChange(db: Database, change: ChangeRecord)` — same LWW logic.
3. Modify all repository methods to call `recordChange` after writes.
4. Create `Sources/TickCloneShared/Sync/SyncManager.swift`:
   - `@Observable class SyncManager` with `var isSyncing: Bool`, `var lastSyncAt: Date?`.
   - `func syncNow() async` — push → pull → apply → update `lastSyncAt` (stored in UserDefaults).
   - `func startAutoSync(interval: TimeInterval = 300)` — schedules periodic sync via `Timer`.

**DONE WHEN**
- [ ] Creating a task on iOS records a change in `sync_meta`.
- [ ] Calling `syncManager.syncNow()` with a running server pushes and pulls successfully.
- [ ] Auto-sync triggers every 5 minutes when enabled.
- [ ] `isSyncing` toggles to `true` during sync (UI can show a spinner).

---

### Task 40 (B) +sync +svelte
**PURPOSE** — Adds sync UI controls to the Tauri/Svelte app so users can configure and trigger sync.

**WHAT TO DO**
1. Create a Tauri command `get_sync_settings(state) -> Result<SyncSettings, String>` — reads `server_url`, `auth_token`, `last_sync_at`, `auto_sync_enabled` from the local `settings` table.
2. Create a Tauri command `save_sync_settings(state, server_url, auth_token?, auto_sync_enabled) -> Result<(), String>`.
3. Create `tauri-app/src/lib/components/SyncSettings.svelte`:
   - "Server URL" text input.
   - "Auth Token" text input (or "Login with Magic Link" button that opens a flow: enter email → call server `/api/auth/magic-link` → prompt for token from email → call `/api/auth/verify` → store token).
   - "Auto Sync" toggle.
   - "Sync Now" button showing status (spinner, "Last synced: 2 min ago").
   - Sync result summary: "Pushed 3, Pulled 5, Conflicts 0".
4. Accessible from a gear icon in the sidebar footer.

**DONE WHEN**
- [ ] Entering a server URL and clicking "Sync Now" triggers sync and shows results.
- [ ] The magic link login flow works: enter email → receive link → enter token → JWT stored.
- [ ] Auto-sync toggle persists across app restarts.
- [ ] "Last synced" timestamp updates after each sync.

---

### Task 41 (B) +sync +apple
**PURPOSE** — Adds sync settings UI to the SwiftUI app, mirroring the Tauri sync settings.

**WHAT TO DO**
1. Create `Sources/TickCloneShared/Views/SyncSettingsView.swift`:
   - `TextField` for server URL.
   - Magic link login flow: email input → "Send Link" button → token input → "Verify" button.
   - `Toggle` for auto-sync.
   - "Sync Now" button with `ProgressView` spinner during sync.
   - Last sync timestamp display.
2. Present as a sheet (iOS) or preferences pane (macOS) from a settings gear button in the sidebar.
3. Store settings in `UserDefaults` (suite: `"com.tickclone.app"`).

**DONE WHEN**
- [ ] Entering a server URL and tapping "Sync Now" performs a full sync cycle.
- [ ] The magic link flow stores a JWT and subsequent syncs use it.
- [ ] Settings persist across app launches.

---

## Module 8: Platform-Specific Polish (+macos, +ios)

---

### Task 42 (B) +macos
**PURPOSE** — Implements macOS-specific features: menu bar, global keyboard shortcuts, and window management.

**WHAT TO DO**
1. In `TickClone-macOS/TickCloneApp.swift`:
   - Add `.commands { ... }` modifier with menu items:
     - File → "New Task" (Cmd+N), "New List" (Cmd+Shift+N).
     - Edit → "Delete" (Cmd+Delete).
     - View → "Today" (Cmd+1), "Calendar" (Cmd+2).
   - Menu actions call the corresponding store methods.
2. Set `.windowStyle(.titleBar)` and `.windowToolbarStyle(.unified)`.
3. Add a toolbar with: "Today" button, "Calendar" button, search field (local search — filters tasks by title containing the query).
4. Support standard macOS behaviors: Cmd+, opens settings, Cmd+W closes window, Cmd+Q quits.

**DONE WHEN**
- [ ] Cmd+N focuses the quick-add input or opens a new-task sheet.
- [ ] Cmd+1 switches to Today view; Cmd+2 to Calendar view.
- [ ] The unified toolbar shows navigation buttons and a functional search field.
- [ ] Cmd+, opens the sync settings view.

---

### Task 43 (B) +ios
**PURPOSE** — Implements iOS-specific features: haptic feedback, swipe actions, and widget-ready data provider.

**WHAT TO DO**
1. In `TaskRowView`, add swipe actions:
   - Leading swipe: complete task (green checkmark). Trigger `UIImpactFeedbackGenerator(style: .medium)`.
   - Trailing swipe: delete task (red trash icon) with confirmation.
   - Secondary trailing swipe: flag/priority cycle.
2. Add pull-to-refresh on task list: calls `taskStore.loadForList(...)`.
3. Create `Sources/TickCloneShared/Services/WidgetDataProvider.swift`:
   - `static func getTodayTasks() -> [TaskModel]` — reads from the shared app group database (setup `App Groups` entitlement for widget access in a future task).
   - Returns max 5 tasks due today, ordered by priority.
4. Add haptic feedback on task completion and list switching using `UIImpactFeedbackGenerator`.

**DONE WHEN**
- [ ] Swiping right on a task completes it with a haptic tap.
- [ ] Swiping left shows a delete action with confirmation.
- [ ] Pull-to-refresh reloads the task list.
- [ ] `WidgetDataProvider.getTodayTasks()` returns up to 5 tasks due today.

---

## Module 9: Recurring Tasks Engine (+recurrence)

---

### Task 44 (A) +recurrence +tauri
**PURPOSE** — Implements the RRULE parsing and expansion engine in Rust for the Tauri app, matching the server's Go implementation.

**WHAT TO DO**
1. Add `rrule` crate to `src-tauri/Cargo.toml`: `rrule = "0.12"`.
2. Create `src-tauri/src/services/recurrence.rs`:
   - `pub fn expand_rrule(rule: &str, dtstart: &str, after: &str, limit: usize) -> Result<Vec<String>, String>` — parses RRULE string, returns next `limit` ISO8601 date strings after `after`.
   - `pub fn next_occurrence(rule: &str, dtstart: &str, after: &str) -> Result<Option<String>, String>` — convenience wrapper returning just the next occurrence.
3. Ensure `complete_recurring_task` (Task 17) calls `next_occurrence` to determine the next due date.
4. Create Tauri command `preview_recurrence(rule: String, start_date: String, count: u32) -> Result<Vec<String>, String>` — returns upcoming occurrence dates for UI preview.

**DONE WHEN**
- [ ] `expand_rrule("FREQ=WEEKLY;BYDAY=MO,WE,FR", "2026-03-12", "2026-03-12", 5)` returns 5 dates all on Mon/Wed/Fri.
- [ ] `next_occurrence("FREQ=MONTHLY;INTERVAL=1", "2026-03-01", "2026-03-15")` returns "2026-04-01".
- [ ] `invoke('preview_recurrence', { rule: 'FREQ=DAILY', startDate: '2026-03-12', count: 7 })` returns 7 consecutive dates.

---

### Task 45 (A) +recurrence +apple
**PURPOSE** — Implements RRULE parsing in Swift for the Apple platforms using a pure-Swift approach.

**WHAT TO DO**
1. Add a dependency on a Swift RRULE library. Options: `https://github.com/nicklama/swift-rrule` or implement a lightweight parser.
   - If no suitable library: create `Sources/TickCloneShared/Services/RRuleParser.swift` supporting `FREQ` (DAILY, WEEKLY, MONTHLY, YEARLY), `INTERVAL`, `COUNT`, `UNTIL`, `BYDAY`, `BYMONTHDAY`.
2. Create `Sources/TickCloneShared/Services/RecurrenceEngine.swift`:
   - `static func expand(rule: String, dtstart: Date, after: Date, limit: Int) -> [Date]`.
   - `static func nextOccurrence(rule: String, dtstart: Date, after: Date) -> Date?`.
3. Ensure `TaskRepository.completeRecurringTask` uses `RecurrenceEngine.nextOccurrence`.

**DONE WHEN**
- [ ] `RecurrenceEngine.expand(rule: "FREQ=DAILY;INTERVAL=2", ...)` returns dates 2 days apart.
- [ ] `RecurrenceEngine.expand(rule: "FREQ=WEEKLY;BYDAY=MO,WE,FR;COUNT=6", ...)` returns exactly 6 dates on Mon/Wed/Fri.
- [ ] `nextOccurrence` for a monthly rule returns the correct next month's date.

---

## Module 10: Search & Filtering (+search)

---

### Task 46 (B) +search +tauri
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
   - Query: `SELECT tasks.* FROM tasks JOIN tasks_fts ON tasks.rowid = tasks_fts.rowid WHERE tasks_fts MATCH $1 AND tasks.deleted_at IS NULL ORDER BY rank LIMIT 50`.
   - Populate subtasks and tags via the standard join approach.
4. Create `tauri-app/src/lib/components/SearchBar.svelte`: input with debounced (300ms) search, dropdown results list.

**DONE WHEN**
- [ ] Creating a task "Buy groceries for dinner" and searching "groceries" returns that task.
- [ ] Searching "nonexistent" returns an empty array.
- [ ] Updating a task title and searching for the new title returns the task.
- [ ] Search results appear within 300ms of typing in the search bar.

---

### Task 47 (B) +search +apple
**PURPOSE** — Implements task search on Apple platforms using the same FTS5 approach.

**WHAT TO DO**
1. In `AppDatabase.swift` migration `v1`, add the same FTS5 table and triggers from Task 46.
2. Create `Sources/TickCloneShared/Repositories/SearchRepository.swift`:
   - `func search(query: String) throws -> [TaskModel]` — uses GRDB's raw SQL to query `tasks_fts`, joins to get full `TaskModel` with subtasks and tags. Limit 50.
3. Add a `searchQuery` property to `TaskStore` and a `func searchTasks(query:)` method.
4. In `MainView.swift`, add a `.searchable(text: $searchQuery)` modifier. On commit, call `taskStore.searchTasks(query:)`. Display results in the content area.

**DONE WHEN**
- [ ] Typing "milk" in the macOS/iOS search field shows tasks containing "milk" in title or content.
- [ ] Search is integrated into the native SwiftUI `.searchable` experience.
- [ ] Results update as the user types (debounced).

---

## Module 11: Data Import/Export (+data)

---

### Task 48 (C) +data +tauri
**PURPOSE** — Enables users to export all their data as JSON and import from a JSON backup, ensuring data portability.

**WHAT TO DO**
1. Create Tauri command `export_data(state) -> Result<String, String>`:
   - Queries all non-deleted lists, tasks (with subtasks), tags, and task_tags.
   - Serializes to JSON: `{ "version": 1, "exportedAt": "<ISO8601>", "lists": [...], "tasks": [...], "tags": [...], "taskTags": [...] }`.
   - Uses `tauri::api::dialog::save_file` to let user choose save location. Writes the JSON string to the file.
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

### Task 49 (C) +data +apple
**PURPOSE** — Implements JSON export/import on Apple platforms, matching the Tauri format for cross-platform data portability.

**WHAT TO DO**
1. Create `Sources/TickCloneShared/Services/DataExporter.swift`:
   - `static func exportJSON(db: AppDatabase) throws -> Data` — queries all entities, encodes to the same JSON format as Task 48.
2. Create `Sources/TickCloneShared/Services/DataImporter.swift`:
   - `static func importJSON(db: AppDatabase, data: Data) throws -> ImportResult` — decodes, validates version, upserts in a transaction.
3. In settings view, add "Export" button (presents `fileExporter` on iOS / `NSSavePanel` on macOS) and "Import" button (presents `fileImporter` / `NSOpenPanel`).

**DONE WHEN**
- [ ] Exporting from the iOS app and importing into the Tauri app restores all data correctly.
- [ ] Exporting from Tauri and importing into macOS works correctly.
- [ ] Malformed JSON shows an error alert and makes no changes to the database.

---

## Module 12: Docker Deployment (+deploy)

---

### Task 50 (A) +deploy
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
       build: ./server
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
3. Create `README.md` in project root with:
   - Architecture overview diagram (ASCII).
   - Quick start: `cp .env.example .env && docker compose up -d`.
   - Client setup instructions for each platform.
   - SMTP configuration guide for magic link auth.

**DONE WHEN**
- [ ] `docker compose up -d` starts both services; `curl localhost:8080/health` returns 200.
- [ ] The server auto-migrates the database on startup.
- [ ] `docker compose down && docker compose up -d` restarts cleanly without data loss (volume persists).
- [ ] `.env.example` documents every environment variable.

---

## Module 13: Testing (+test)

---

### Task 51 (A) +test +server
**PURPOSE** — Implements integration tests for the server API covering all critical paths.

**WHAT TO DO**
1. Create `server/internal/handlers/handlers_test.go`:
   - Use `httptest.NewServer` with the full Echo app.
   - Setup: spin up a test PostgreSQL database (use `testcontainers-go` with the `postgres` module or a dedicated test DB URL from env).
   - Run migrations before tests, truncate tables between tests.
2. Test cases:
   - `TestListCRUD`: create → get all → update → delete → verify 404.
   - `TestTaskCRUD`: create list → create task → create subtask → get tasks (verify nesting) → update task → complete → delete.
   - `TestSubtaskDepthLimit`: create task → create subtask → attempt subtask-of-subtask → expect 400.
   - `TestTagOperations`: create tag → add to task → get tasks (verify tag present) → remove from task → delete tag.
   - `TestRecurringTaskCompletion`: create task with `FREQ=DAILY` → complete → verify new task created with next date.
   - `TestMagicLinkAuth`: request magic link → verify token in DB → validate token → get JWT → use JWT on protected route.
   - `TestSyncPushPull`: push changes from device A → pull from device B → verify received → push conflicting change from B (older) → verify rejected.
3. Each test function is self-contained with its own setup and teardown.

**DONE WHEN**
- [ ] `go test ./internal/handlers/ -v` passes all test cases.
- [ ] Test coverage for `handlers` package is ≥ 80% (measured by `go test -cover`).
- [ ] Tests can run in CI with a PostgreSQL service container.

---

### Task 52 (A) +test +tauri
**PURPOSE** — Implements Rust unit tests for the Tauri backend database operations and sync logic.

**WHAT TO DO**
1. In `src-tauri/src/commands/list_commands.rs`, add `#[cfg(test)] mod tests`:
   - Use an in-memory SQLite database (`:memory:`) initialized with the canonical schema.
   - `test_create_and_get_lists`: create 3 lists → get all → verify count and order.
   - `test_delete_inbox_rejected`: create inbox → attempt delete → verify error.
   - `test_soft_delete_cascades`: create list with tasks → delete list → verify tasks also soft-deleted.
2. In `src-tauri/src/commands/task_commands.rs`, add tests:
   - `test_subtask_depth_limit`: create task → create subtask → create sub-subtask → verify error.
   - `test_complete_recurring`: create daily task → complete → verify new task with next date.
   - `test_complete_sets_timestamp`: complete task → verify `completed_at` is set.
3. In `src-tauri/src/sync/tracker.rs`, add tests:
   - `test_record_and_retrieve_changes`: record 5 changes → get pending since past → verify 5 returned.
   - `test_apply_remote_newer_wins`: apply remote change with newer timestamp → verify field updated.
   - `test_apply_remote_older_skipped`: set local field → apply remote change with older timestamp → verify field unchanged.

**DONE WHEN**
- [ ] `cargo test` in `src-tauri/` passes all tests.
- [ ] All tests use in-memory databases (no filesystem side effects).
- [ ] Each test function tests exactly one behavior.

---

### Task 53 (B) +test +svelte
**PURPOSE** — Implements Svelte component tests for critical UI interactions.

**WHAT TO DO**
1. Install testing dependencies: `@testing-library/svelte`, `vitest`, `jsdom`.
2. Configure `vitest.config.ts` with `environment: 'jsdom'` and Svelte preprocessing.
3. Mock Tauri `invoke` globally in `tauri-app/src/test/setup.ts`: intercept all `invoke` calls and return pre-defined responses.
4. Test files:
   - `TaskList.test.ts`: render with mock tasks → verify task titles visible → click checkbox → verify `invoke('update_task', ...)` called with `status: 1`.
   - `Sidebar.test.ts`: render with mock lists → click a list → verify `selectedListId` store updated → click "+ New List" → type name → press Enter → verify `invoke('create_list', ...)` called.
   - `NLPDate.test.ts` (unit test, no component): test `parseNaturalDate` with 10+ inputs covering: "tomorrow", "next monday", "every weekday", "Dec 25 3pm", "in 2 hours", plain text with no date.
5. Add `"test"` script to `package.json`: `"vitest run"`.

**DONE WHEN**
- [ ] `npm run test` in `tauri-app/` passes all test files.
- [ ] The NLP date parser passes all 10+ test cases.
- [ ] Component tests verify that Tauri `invoke` is called with correct arguments.

---

### Task 54 (B) +test +apple
**PURPOSE** — Implements Swift unit tests for the shared package covering repositories, NLP, and recurrence logic.

**WHAT TO DO**
1. In `Packages/TickCloneShared/Tests/`:
   - `ListRepositoryTests.swift`: create → getAll → update → delete (verify soft-delete). Use in-memory GRDB database.
   - `TaskRepositoryTests.swift`: create → subtask depth limit → complete recurring → complete non-recurring.
   - `NaturalDateParserTests.swift`: test 10+ inputs matching the Svelte NLP tests.
   - `RecurrenceEngineTests.swift`: daily, weekly with BYDAY, monthly, yearly, COUNT, INTERVAL.
2. Use `XCTest` framework. Each test creates a fresh in-memory `AppDatabase`.

**DONE WHEN**
- [ ] `swift test` in the `TickCloneShared` package passes all tests.
- [ ] All tests use in-memory databases.
- [ ] NLP and recurrence tests cover the same cases as the Tauri/Svelte counterparts.

---

## Module 14: CI/CD (+ci)

---

### Task 55 (B) +ci
**PURPOSE** — Sets up GitHub Actions CI to build and test all components on every push.

**WHAT TO DO**
1. Create `.github/workflows/ci.yml`:
   ```yaml
   name: CI
   on: [push, pull_request]
   jobs:
     server:
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
         - run: cd server && go test ./... -v -cover
           env:
             DATABASE_URL: postgres://test:test@localhost:5432/tickclone_test?sslmode=disable
             MAGIC_LINK_SECRET: test-secret-at-least-32-characters!
     tauri:
       runs-on: ubuntu-latest
       steps:
         - uses: actions/checkout@v4
         - uses: dtolnay/rust-toolchain@stable
         - run: cd tauri-app/src-tauri && cargo test
         - uses: actions/setup-node@v4
           with: { node-version: '20' }
         - run: cd tauri-app && npm ci && npm run test
     apple:
       runs-on: macos-latest
       steps:
         - uses: actions/checkout@v4
         - run: cd apple && xcodebuild test -scheme TickCloneShared -destination 'platform=macOS'
   ```
2. Add status badge to `README.md`.

**DONE WHEN**
- [ ] Pushing to `main` triggers all three jobs (server, tauri, apple).
- [ ] All jobs pass on a clean checkout.
- [ ] PR checks block merge if any job fails.

---

## Module 15: Theming & Accessibility (+ui)

---

### Task 56 (C) +ui +svelte
**PURPOSE** — Implements dark/light theme toggling and system-preference detection in the Tauri app.

**WHAT TO DO**
1. Create `tauri-app/src/lib/stores/theme.ts`:
   - `theme` writable store: `'light' | 'dark' | 'system'`. Default: `'system'`.
   - On init, detect system preference via `window.matchMedia('(prefers-color-scheme: dark)')`.
   - On change, set `document.documentElement.dataset.theme` to `'light'` or `'dark'`.
   - Persist choice in local Tauri settings (via a `get_setting`/`set_setting` command pair using the `settings` table).
2. Define CSS custom properties in `tauri-app/src/app.css`:
   - `[data-theme="dark"]`: background `#1E1E2E`, surface `#313244`, text `#CDD6F4`, primary `#89B4FA`, danger `#F38BA8`, etc. (Catppuccin Mocha palette).
   - `[data-theme="light"]`: background `#EFF1F5`, surface `#CCD0DA`, text `#4C4F69`, primary `#1E66F5`, danger `#D20F39`, etc. (Catppuccin Latte palette).
3. Update all components to use `var(--bg)`, `var(--surface)`, `var(--text)`, etc. instead of hardcoded colors.
4. Add theme toggle (sun/moon icon) in the sidebar footer.

**DONE WHEN**
- [ ] Clicking the theme toggle switches between dark and light themes instantly.
- [ ] Setting "system" and changing OS dark mode preference updates the app theme.
- [ ] Theme preference persists across app restarts.
- [ ] All text has sufficient contrast ratio (≥ 4.5:1) in both themes.

---

### Task 57 (C) +ui +apple
**PURPOSE** — Ensures the SwiftUI app respects system appearance and supports Dynamic Type for accessibility.

**WHAT TO DO**
1. Verify all SwiftUI views use semantic colors (`Color.primary`, `Color.secondary`, `Color.accentColor`) and system materials (`.background(.thinMaterial)`) instead of hardcoded colors.
2. Ensure all text uses `Font.body`, `Font.headline`, `Font.caption`, etc. (Dynamic Type responsive) — no fixed `Font.system(size:)` calls.
3. Add `accessibilityLabel` and `accessibilityHint` to all interactive elements:
   - Checkboxes: `"Complete task: <title>"`.
   - Priority buttons: `"Set priority to high"`.
   - Sidebar items: `"List: <name>, <count> tasks"`.
4. Test with Accessibility Inspector: verify all elements are reachable via VoiceOver.

**DONE WHEN**
- [ ] The app renders correctly in both light and dark mode without any invisible or unreadable text.
- [ ] Increasing Dynamic Type to the largest setting does not cause text truncation or overlapping.
- [ ] VoiceOver can navigate every interactive element with meaningful labels.

---

## Module 16: Performance (+perf)

---

### Task 58 (C) +perf +tauri
**PURPOSE** — Ensures the Tauri app handles large datasets (10,000+ tasks) without UI lag.

**WHAT TO DO**
1. Create a Tauri command `seed_benchmark_data(state, task_count: u32) -> Result<(), String>`:
   - Creates 10 lists, `task_count` tasks distributed across lists, 20% with subtasks, 30% with tags, 10% with recurrence rules.
   - Uses a transaction with batched inserts (500 per batch).
2. In `TaskList.svelte`, implement virtual scrolling: only render visible task rows + a buffer of 20 above/below. Use a simple implementation: calculate total height, translate visible rows to correct positions.
3. In `CalendarView.svelte`, lazy-load tasks only for the visible month range (already done if Task 24 was implemented correctly — verify).
4. Add `EXPLAIN QUERY PLAN` checks in Rust tests for the 5 most common queries to verify they use indexes (no full table scans).

**DONE WHEN**
- [ ] After seeding 10,000 tasks, `invoke('get_tasks_by_list', ...)` for a list with 500 tasks returns in < 100ms.
- [ ] Scrolling through a list of 500 tasks maintains 60fps (no visible stutter in dev tools performance tab).
- [ ] All 5 critical queries use indexes (verified by `EXPLAIN QUERY PLAN` showing `USING INDEX`).

---

### Task 59 (C) +perf +server
**PURPOSE** — Adds database query optimization and connection pool tuning to the Go server for production readiness.

**WHAT TO DO**
1. In `pool.go`, add pool configuration: `pool_min_conns=5`, `pool_max_conn_lifetime=1h`, `pool_max_conn_idle_time=30m`.
2. Add prepared statement caching: create a `Queries` struct in `server/internal/database/queries.go` that holds prepared `pgx.PreparedStatement` references for the 10 most-used queries (list tasks, get lists, search sync log, etc.).
3. Add `EXPLAIN ANALYZE` logging in development mode: if `LOG_LEVEL=debug`, log query plans for any query taking > 50ms.
4. Create `server/migrations/003_indexes.up.sql`: add any missing indexes identified by slow query analysis. At minimum add `idx_sync_log_user_device` on `sync_log(user_id, device_id, timestamp)`.

**DONE WHEN**
- [ ] The connection pool is configured with min/max/idle settings (verified by log output on startup).
- [ ] In debug mode, queries > 50ms log their `EXPLAIN ANALYZE` output.
- [ ] The `003_indexes` migration runs cleanly.

---

This PRD contains **59 tasks**: 31 priority (A), 19 priority (B), 9 priority (C).

**Recommended execution order (critical path):**
1. Tasks 1–3 (schema) — unblocks everything
2. Tasks 4–5 (server foundation) — then 6–8 (CRUD) — then 9–11 (auth + recurrence)
3. Tasks 14–18 (Tauri shell + IPC) in parallel with 27–30 (Apple shell + DB)
4. Tasks 19–25 (Svelte UI) in parallel with 31–37 (SwiftUI UI)
5. Tasks 12–13 (sync server) → 38–41 (sync clients)
6. Remaining modules in priority order
