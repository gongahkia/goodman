const defaults = { endpoint: "http://127.0.0.1:41671", token: "" };
const connection = document.querySelector("#connection");
const errorBox = document.querySelector("#error");
const endpoint = document.querySelector("#endpoint");
const token = document.querySelector("#token");
const projectForm = document.querySelector("#project-form");
const sessionSelect = document.querySelector("#session-id");
const tabSelect = document.querySelector("#chat-tab");
const review = document.querySelector("#prompt-review");
const handoffReview = document.querySelector("#handoff-review");
let saved = await chrome.storage.local.get(defaults);
let knownSessions = [];
let reviewingProjectId = null;
let handoffProjectId = null;

endpoint.value = defaults.endpoint;
token.value = saved.token;

function errorText(error) {
  return error instanceof Error ? error.message : String(error);
}

function showError(error) {
  errorBox.textContent = errorText(error);
}

function canonicalChat(url) {
  const parsed = new URL(url);
  const pathname = parsed.pathname.replace(/\/+$/, "");
  if (!/^\/c\/[A-Za-z0-9-]+$/.test(pathname)) return null;
  return `${parsed.origin}${pathname}`;
}

async function api(path, options = {}) {
  saved = await chrome.storage.local.get(defaults);
  const response = await fetch(`${defaults.endpoint}${path}`, {
    ...options,
    headers: { authorization: `Bearer ${saved.token}`, "content-type": "application/json" },
  });
  if (response.status === 204) return null;
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(payload.error || `supervisor returned ${response.status}`);
  return payload;
}

function option(select, value, text) {
  const element = document.createElement("option");
  element.value = value;
  element.textContent = text;
  select.append(element);
}

async function loadTabs() {
  const tabs = await chrome.tabs.query({ url: ["https://chatgpt.com/c/*", "https://chat.openai.com/c/*"] });
  tabSelect.replaceChildren();
  for (const tab of tabs) {
    const chatUrl = canonicalChat(tab.url);
    if (chatUrl) option(tabSelect, JSON.stringify({ id: tab.id, url: chatUrl }), tab.title || chatUrl);
  }
  if (!tabSelect.options.length) option(tabSelect, "", "Open the target ChatGPT conversation first");
}

function renderEvents(events) {
  const section = document.querySelector("#events-section");
  const target = document.querySelector("#events");
  section.hidden = !events.length;
  target.textContent = events.slice(-12).map((event) => {
    const { at, type, projectId, actionId, reason, durationMs } = event;
    return [at, type, projectId && `project=${projectId.slice(0, 8)}`, actionId && `action=${actionId.slice(0, 8)}`, durationMs && `${durationMs}ms`, reason].filter(Boolean).join(" — ");
  }).join("\n");
}

async function refresh() {
  errorBox.textContent = "";
  try {
    const [{ sessions }, status, { events }] = await Promise.all([api("/v1/sessions"), api("/v1/status"), api("/v1/events")]);
    knownSessions = sessions;
    sessionSelect.replaceChildren();
    for (const session of sessions) {
      option(sessionSelect, session.id, `${session.cwd} — ${session.id.slice(0, 8)} — ${new Date(session.updatedAt).toLocaleString()}`);
    }
    if (!document.querySelector("#cwd").value && sessions[0]) document.querySelector("#cwd").value = sessions[0].cwd;
    await loadTabs();
    document.querySelector("#new-project").hidden = false;
    document.querySelector("#projects-section").hidden = false;
    connection.textContent = `${status.projects.length} mapped workstream${status.projects.length === 1 ? "" : "s"}; ${status.pendingActions} browser handoff${status.pendingActions === 1 ? "" : "s"} pending.`;
    renderProjects(status.projects);
    renderEvents(events);
  } catch (error) {
    document.querySelector("#new-project").hidden = true;
    document.querySelector("#projects-section").hidden = true;
    document.querySelector("#events-section").hidden = true;
    connection.textContent = "Unable to reach the local supervisor.";
    showError(error);
  }
}

async function openReview(project) {
  try {
    const payload = await api(`/v1/projects/${project.id}/pending-prompt`);
    reviewingProjectId = project.id;
    document.querySelector("#review-project").textContent = `${project.name} — ${payload.chars} characters`;
    document.querySelector("#review-prompt").value = payload.prompt;
    review.hidden = false;
  } catch (error) { showError(error); }
}

async function openHandoffReview(project) {
  try {
    const payload = await api(`/v1/projects/${project.id}/current-completion`);
    handoffProjectId = project.id;
    document.querySelector("#handoff-project").textContent = `${project.name} — ${payload.chars} characters, approximately ${payload.estimatedTokens} tokens${payload.redactions ? `; ${payload.redactions} sensitive value${payload.redactions === 1 ? "" : "s"} redacted` : ""}`;
    document.querySelector("#handoff-completion").value = payload.completion;
    handoffReview.hidden = false;
  } catch (error) { showError(error); }
}

function projectButton(label, operation, project, disabled = false) {
  const button = document.createElement("button");
  button.type = "button";
  button.textContent = label;
  button.disabled = disabled;
  button.addEventListener("click", async () => {
    try {
      if (operation === "review") await openReview(project);
      else if (operation === "review-handoff") await openHandoffReview(project);
      else if (operation === "delete") await api(`/v1/projects/${project.id}`, { method: "DELETE" });
      else await api(`/v1/projects/${project.id}/${operation}`, { method: "POST", body: "{}" });
      if (!operation.startsWith("review")) {
        await chrome.runtime.sendMessage({ type: "poll_now" });
        await refresh();
      }
    } catch (error) { showError(error); }
  });
  return button;
}

function renderProjects(projects) {
  const container = document.querySelector("#projects");
  container.replaceChildren();
  for (const project of projects) {
    const card = document.createElement("article");
    card.className = "project";
    const header = document.createElement("header");
    const name = document.createElement("strong");
    name.textContent = project.name;
    const state = document.createElement("span");
    state.className = "status";
    state.textContent = project.status;
    header.append(name, state);
    const detail = document.createElement("p");
    detail.className = "muted";
    detail.textContent = `${project.cwd}\nrounds: ${project.rounds}/${project.limits.maxRounds}; remote chars: ${project.remoteCharsSent}/${project.limits.maxRemoteChars} (~${project.estimatedRemoteTokens} tokens)${project.autonomous ? "\nautomatic next prompts enabled" : "\nmanual prompt review required"}${project.activeRun ? `\nrecovered Codex PID: ${project.activeRun.pid}` : ""}${project.pauseReason ? `\n${project.pauseReason}` : ""}`;
    const actions = document.createElement("div");
    actions.className = "actions";
    if (project.status === "paused") {
      if (project.activeRun) {
        actions.append(projectButton("Confirm prior Codex stopped", "acknowledge-recovered-run", project));
      } else {
        actions.append(projectButton("Adopt latest", "adopt", project));
        if (project.hasCurrentCompletion) actions.append(projectButton("Review handoff", "review-handoff", project));
        if (project.hasPendingPrompt) actions.append(projectButton("Review prompt", "review", project));
      }
    }
    if (project.status === "awaiting_handoff_review") actions.append(projectButton("Review handoff", "review-handoff", project));
    if (project.status === "awaiting_approval") actions.append(projectButton("Review prompt", "review", project));
    if (project.status === "waiting_chatgpt") actions.append(projectButton("Pause", "pause", project));
    if (project.status === "running_codex") actions.append(projectButton("Cancel", "cancel", project));
    actions.append(projectButton("Remove", "delete", project, project.status === "running_codex" || Boolean(project.activeRun)));
    card.append(header, detail, actions);
    container.append(card);
  }
}

document.querySelector("#settings-form").addEventListener("submit", async (event) => {
  event.preventDefault();
  await chrome.storage.local.set({ endpoint: defaults.endpoint, token: token.value.trim() });
  await refresh();
});

projectForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  try {
    const chat = JSON.parse(tabSelect.value);
    await api("/v1/projects", {
      method: "POST",
      body: JSON.stringify({
        name: document.querySelector("#name").value,
        cwd: document.querySelector("#cwd").value,
        sessionId: sessionSelect.value,
        chatUrl: chat.url,
        tabId: chat.id,
        autonomous: document.querySelector("#autonomous").checked,
        retainTranscripts: document.querySelector("#retain-transcripts").checked,
      }),
    });
    projectForm.reset();
    await refresh();
  } catch (error) { showError(error); }
});

sessionSelect.addEventListener("change", () => {
  const session = knownSessions.find((candidate) => candidate.id === sessionSelect.value);
  if (session) document.querySelector("#cwd").value = session.cwd;
});

document.querySelector("#approve-prompt").addEventListener("click", async () => {
  if (!reviewingProjectId) return;
  try {
    await api(`/v1/projects/${reviewingProjectId}/approve`, { method: "POST", body: "{}" });
    review.hidden = true;
    reviewingProjectId = null;
    await refresh();
  } catch (error) { showError(error); }
});

document.querySelector("#close-review").addEventListener("click", () => {
  review.hidden = true;
  reviewingProjectId = null;
});

document.querySelector("#send-handoff").addEventListener("click", async () => {
  if (!handoffProjectId) return;
  try {
    await api(`/v1/projects/${handoffProjectId}/send`, { method: "POST", body: "{}" });
    handoffReview.hidden = true;
    handoffProjectId = null;
    await chrome.runtime.sendMessage({ type: "poll_now" });
    await refresh();
  } catch (error) { showError(error); }
});

document.querySelector("#close-handoff").addEventListener("click", () => {
  handoffReview.hidden = true;
  handoffProjectId = null;
});

await refresh();
setInterval(() => { void refresh(); }, 5_000);
