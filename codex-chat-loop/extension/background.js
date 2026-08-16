const defaults = {
  endpoint: "http://127.0.0.1:41671",
  token: "",
  clientId: crypto.randomUUID(),
  pendingResults: {},
};

function conversationKey(rawUrl) {
  const url = new URL(rawUrl);
  const pathname = url.pathname.replace(/\/+$/, "");
  if (!/^\/c\/[A-Za-z0-9-]+$/.test(pathname)) throw new Error("target tab is not a canonical ChatGPT conversation");
  return `${url.origin}${pathname}`;
}

function errorText(error) {
  return (error instanceof Error ? error.message : String(error)).slice(0, 2_000);
}

async function settings() {
  const saved = await chrome.storage.local.get(defaults);
  if (!saved.clientId) {
    saved.clientId = crypto.randomUUID();
    await chrome.storage.local.set({ clientId: saved.clientId });
  }
  return saved;
}

async function api(path, options = {}) {
  const config = await settings();
  if (!config.token) throw new Error("set the supervisor token in the Codex Chat Loop dashboard");
  const response = await fetch(`${config.endpoint}${path}`, {
    ...options,
    headers: {
      authorization: `Bearer ${config.token}`,
      "content-type": "application/json",
      ...(options.headers || {}),
    },
  });
  if (response.status === 204) return null;
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(payload.error || `supervisor returned ${response.status}`);
  return payload;
}

async function ensureContentScript(tabId) {
  await chrome.scripting.executeScript({ target: { tabId }, files: ["content.js"] });
}

async function waitForTab(tabId) {
  const tab = await chrome.tabs.get(tabId);
  if (tab.status === "complete") return tab;
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      chrome.tabs.onUpdated.removeListener(listener);
      reject(new Error("ChatGPT tab did not finish loading"));
    }, 30_000);
    function listener(updatedId, change, updatedTab) {
      if (updatedId === tabId && change.status === "complete") {
        clearTimeout(timeout);
        chrome.tabs.onUpdated.removeListener(listener);
        resolve(updatedTab);
      }
    }
    chrome.tabs.onUpdated.addListener(listener);
  });
}

async function tabForAction(action) {
  if (Number.isInteger(action.tabId)) {
    try {
      const tab = await chrome.tabs.get(action.tabId);
      if (tab.url && conversationKey(tab.url) === action.conversationKey) return tab;
    } catch {}
  }
  const tabs = await chrome.tabs.query({ url: ["https://chatgpt.com/c/*", "https://chat.openai.com/c/*"] });
  const match = tabs.find((tab) => {
    try { return conversationKey(tab.url) === action.conversationKey; } catch { return false; }
  });
  if (match) return match;
  return chrome.tabs.create({ url: action.chatUrl, active: false });
}

async function queueActionResult(actionId, tabId, conversation, result) {
  const config = await settings();
  const pendingResults = { ...config.pendingResults };
  pendingResults[actionId] = {
    actionId,
    tabId: Number.isInteger(tabId) ? tabId : null,
    conversationKey: conversation,
    ...result,
    queuedAt: new Date().toISOString(),
  };
  await chrome.storage.local.set({ pendingResults });
  await flushPendingResults();
}

async function flushPendingResults() {
  const config = await settings();
  if (!config.token) return;
  const pendingResults = { ...config.pendingResults };
  for (const [actionId, result] of Object.entries(pendingResults)) {
    try {
      await api(`/v1/actions/${actionId}/result`, {
        method: "POST",
        body: JSON.stringify({ clientId: config.clientId, ...result }),
      });
      delete pendingResults[actionId];
      await chrome.storage.local.set({ pendingResults });
    } catch (error) {
      console.warn("Codex Chat Loop result delivery failed", error);
      break;
    }
  }
}

async function runAction(action) {
  let tab;
  let key = action.conversationKey;
  try {
    tab = await tabForAction(action);
    const loaded = await waitForTab(tab.id);
    key = conversationKey(loaded.url || tab.url);
    if (key !== action.conversationKey) throw new Error("ChatGPT tab changed to a different conversation");
    await ensureContentScript(tab.id);
    const result = await chrome.tabs.sendMessage(tab.id, {
      type: "chatgpt_turn",
      actionId: action.id,
      conversationKey: action.conversationKey,
      message: action.message,
    });
    if (!result?.accepted) throw new Error(result?.error || "ChatGPT handoff was not accepted");
  } catch (error) {
    await queueActionResult(action.id, tab?.id, key, { error: errorText(error) });
    await chrome.notifications.create({
      type: "basic",
      iconUrl: "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVQIHWP4z8DwHwAFgAI/ScL7OwAAAABJRU5ErkJggg==",
      title: "Codex Chat Loop paused",
      message: errorText(error),
    });
  }
}

let polling = false;
async function poll() {
  if (polling) return;
  polling = true;
  try {
    const config = await settings();
    if (!config.token) return;
    await flushPendingResults();
    const payload = await api("/v1/actions/claim", {
      method: "POST",
      body: JSON.stringify({ clientId: config.clientId }),
    });
    if (payload.action) await runAction(payload.action);
  } catch (error) {
    console.warn("Codex Chat Loop polling failed", error);
  } finally {
    polling = false;
  }
}

function startPolling() {
  chrome.alarms.create("codex-chat-loop-poll", { periodInMinutes: 0.5 });
  void poll();
}

chrome.runtime.onInstalled.addListener(startPolling);
chrome.runtime.onStartup.addListener(startPolling);
chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === "codex-chat-loop-poll") void poll();
});
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === "poll_now") {
    poll().then(() => sendResponse({ ok: true })).catch((error) => sendResponse({ error: errorText(error) }));
    return true;
  }
  if (message.type === "chatgpt_result") {
    const tabUrl = sender.tab?.url;
    let key;
    try {
      key = conversationKey(tabUrl);
      if (key !== message.conversationKey) throw new Error("content script reported a different conversation");
    } catch (error) {
      sendResponse({ error: errorText(error) });
      return false;
    }
    queueActionResult(
      message.actionId,
      sender.tab?.id,
      key,
      message.error ? { error: errorText(message.error) } : { reply: message.reply },
    ).then(() => sendResponse({ ok: true })).catch((error) => sendResponse({ error: errorText(error) }));
    return true;
  }
});
