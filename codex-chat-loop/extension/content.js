if (!globalThis.__codexChatLoopInstalled) {
  globalThis.__codexChatLoopInstalled = true;

  const MAX_REPLY_CHARS = 12_000;
  const sleep = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds));

  function conversationKey() {
    const pathname = location.pathname.replace(/\/+$/, "");
    if (!/^\/c\/[A-Za-z0-9-]+$/.test(pathname)) throw new Error("this tab is not a canonical ChatGPT conversation");
    return `${location.origin}${pathname}`;
  }

  function messages(role) {
    return [...document.querySelectorAll(`[data-message-author-role="${role}"]`)];
  }

  function composer() {
    return document.querySelector("textarea#prompt-textarea")
      || document.querySelector('[contenteditable="true"]#prompt-textarea')
      || document.querySelector('[contenteditable="true"][data-id="root"]')
      || document.querySelector('[contenteditable="true"][role="textbox"]');
  }

  function setComposerText(element, value) {
    element.focus();
    if (element instanceof HTMLTextAreaElement) {
      const setter = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, "value").set;
      setter.call(element, value);
      element.dispatchEvent(new InputEvent("input", { bubbles: true, inputType: "insertText", data: value }));
      return;
    }
    document.execCommand("selectAll", false, null);
    document.execCommand("insertText", false, value);
    element.dispatchEvent(new InputEvent("input", { bubbles: true, inputType: "insertText", data: value }));
  }

  function sendButton() {
    return document.querySelector('[data-testid="send-button"]')
      || document.querySelector('button[aria-label="Send prompt"]')
      || [...document.querySelectorAll("button")].find((button) => /send/i.test(button.getAttribute("aria-label") || ""));
  }

  function isStreaming() {
    return Boolean(document.querySelector('[data-testid="stop-button"], button[aria-label*="Stop"]'));
  }

  function follows(first, second) {
    return Boolean(first.compareDocumentPosition(second) & Node.DOCUMENT_POSITION_FOLLOWING);
  }

  async function waitForReply(beforeAssistant, beforeUser, submittedText) {
    const deadline = Date.now() + 6 * 60_000;
    let candidate = "";
    let stableSince = 0;
    let submittedUser = null;
    while (Date.now() < deadline) {
      const currentUsers = messages("user");
      const newUsers = currentUsers.filter((node) => !beforeUser.has(node));
      if (!submittedUser) {
        submittedUser = newUsers.find((node) => node.innerText?.trim() === submittedText.trim()) || null;
        if (!submittedUser && newUsers.length) {
          throw new Error("another user message appeared in this ChatGPT conversation during the handoff");
        }
      }
      if (submittedUser) {
        const unexpectedUser = newUsers.find((node) => node !== submittedUser);
        if (unexpectedUser) throw new Error("another user message appeared in this ChatGPT conversation during the handoff");
        const replies = messages("assistant").filter((node) => !beforeAssistant.has(node) && follows(submittedUser, node));
        const last = replies.at(-1);
        const current = last?.innerText?.trim() || "";
        if (current && !isStreaming()) {
          if (current !== candidate) {
            candidate = current;
            stableSince = Date.now();
          } else if (Date.now() - stableSince >= 2_500) {
            if (current.length > MAX_REPLY_CHARS) throw new Error(`ChatGPT reply exceeds the ${MAX_REPLY_CHARS}-character safety limit`);
            return current;
          }
        } else {
          candidate = "";
          stableSince = 0;
        }
      }
      await sleep(750);
    }
    throw new Error("timed out waiting for ChatGPT's completed reply");
  }

  async function persistFallback(message) {
    const saved = await chrome.storage.local.get({ pendingResults: {} });
    const pendingResults = { ...saved.pendingResults };
    pendingResults[message.actionId] = {
      actionId: message.actionId,
      tabId: null,
      conversationKey: message.conversationKey,
      ...(message.error ? { error: message.error } : { reply: message.reply }),
      queuedAt: new Date().toISOString(),
    };
    await chrome.storage.local.set({ pendingResults });
  }

  async function report(message) {
    try {
      const result = await chrome.runtime.sendMessage({ type: "chatgpt_result", ...message });
      if (!result?.ok) throw new Error(result?.error || "background did not accept the result");
    } catch {
      await persistFallback(message);
    }
  }

  async function runTurn(message, expectedConversationKey) {
    if (conversationKey() !== expectedConversationKey) throw new Error("ChatGPT conversation changed before submission");
    const beforeAssistant = new Set(messages("assistant"));
    const beforeUser = new Set(messages("user"));
    const input = composer();
    if (!input) throw new Error("could not find the ChatGPT message composer; sign in and open the conversation");
    setComposerText(input, message);
    await sleep(100);
    const button = sendButton();
    if (!button || button.disabled) throw new Error("could not send the ChatGPT message");
    button.click();
    return waitForReply(beforeAssistant, beforeUser, message);
  }

  chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
    if (message.type !== "chatgpt_turn") return;
    runTurn(message.message, message.conversationKey)
      .then((reply) => report({ actionId: message.actionId, conversationKey: message.conversationKey, reply }))
      .catch((error) => report({
        actionId: message.actionId,
        conversationKey: message.conversationKey,
        error: error instanceof Error ? error.message.slice(0, 2_000) : String(error).slice(0, 2_000),
      }));
    sendResponse({ accepted: true });
  });
}
