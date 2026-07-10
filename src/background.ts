import browser from './browser';
import type { Menus, Scripting, Tabs } from 'webextension-polyfill';
import { isRuntimeMessage } from './messages';
import type { ActiveTabContext, ManualConvertResponse, RuntimeMessage } from './messages';
import { detectBrowserKind, getOriginPattern, isRestrictedUrl, toContentScriptId } from './site-access';
import { setOnboardingDismissed } from './storage';

const CONTEXT_MENU_ID = 'onul-convert';
const LIVE_SCRIPT_PREFIX = 'live-';

void initializeExtension();

browser.runtime.onInstalled.addListener((details) => {
    void handleInstalled(details.reason);
});

browser.runtime.onStartup.addListener(() => {
    void initializeExtension();
});

browser.permissions.onAdded.addListener(() => {
    void syncLiveContentScripts();
});

browser.permissions.onRemoved.addListener(() => {
    void syncLiveContentScripts();
});

browser.contextMenus.onClicked.addListener((info: Menus.OnClickData, tab?: Tabs.Tab) => {
    if (info.menuItemId !== CONTEXT_MENU_ID || !tab?.id) {
        return;
    }

    void handleContextMenuClick(tab.id, info.selectionText ?? '');
});

browser.runtime.onMessage.addListener((message: unknown) => {
    if (!isRuntimeMessage(message)) {
        return undefined;
    }

    return handleRuntimeMessage(message);
});

async function initializeExtension(): Promise<void> {
    await ensureContextMenu();
    await syncLiveContentScripts();
}

async function handleInstalled(reason: string): Promise<void> {
    if (reason === 'install') {
        await setOnboardingDismissed(false);
    }

    await initializeExtension();
}

async function handleRuntimeMessage(message: RuntimeMessage): Promise<ActiveTabContext | ManualConvertResponse | { liveSelectionEnabled: boolean } | { ok: true }> {
    switch (message.type) {
        case 'ONUL_GET_ACTIVE_TAB_CONTEXT':
            return getActiveTabContext();
        case 'ONUL_RUN_MANUAL_CONVERT':
            return runManualConvert(message.tabId);
        case 'ONUL_GET_CONTENT_MODE':
            return getContentMode(message.url);
        case 'ONUL_SET_LIVE_MODE':
            if (typeof message.tabId === 'number') {
                await setLiveMode(message.tabId, message.enabled);
            }
            return { ok: true };
        case 'ONUL_CONTEXT_MENU_CONVERT':
            return { ok: true };
    }
}

async function ensureContextMenu(): Promise<void> {
    try {
        await browser.contextMenus.remove(CONTEXT_MENU_ID);
    } catch {
        // Ignore remove errors if the menu does not exist yet.
    }

    browser.contextMenus.create({
        id: CONTEXT_MENU_ID,
        title: 'Convert timezone with ONUL',
        contexts: ['selection']
    });
}

async function getActiveTabContext(): Promise<ActiveTabContext> {
    const tab = await getActiveTab();
    const url = tab?.url ?? null;
    const originPattern = url ? getOriginPattern(url) : null;
    const restricted = !url || isRestrictedUrl(url);
    const liveEnabled = originPattern ? await browser.permissions.contains({ origins: [originPattern] }) : false;

    return {
        browser: detectBrowserKind(),
        tabId: tab?.id ?? null,
        url,
        originPattern,
        restricted,
        liveEnabled,
    };
}

async function getContentMode(url: string): Promise<{ liveSelectionEnabled: boolean }> {
    const originPattern = getOriginPattern(url);

    if (!originPattern) {
        return { liveSelectionEnabled: false };
    }

    return {
        liveSelectionEnabled: await browser.permissions.contains({ origins: [originPattern] }),
    };
}

async function handleContextMenuClick(tabId: number, selectionText: string): Promise<void> {
    if (!selectionText.trim()) {
        return;
    }

    await ensureContentScript(tabId);
    await browser.tabs.sendMessage(tabId, {
        type: 'ONUL_CONTEXT_MENU_CONVERT',
        text: selectionText,
    } satisfies RuntimeMessage);
}

async function runManualConvert(tabId: number): Promise<ManualConvertResponse> {
    await ensureContentScript(tabId);
    const response: ManualConvertResponse = await browser.tabs.sendMessage(tabId, {
        type: 'ONUL_RUN_MANUAL_CONVERT',
        tabId,
    } satisfies RuntimeMessage);

    return response;
}

async function ensureContentScript(tabId: number): Promise<void> {
    await browser.scripting.executeScript({
        target: { tabId },
        files: ['assets/content.js'],
    });
}

async function syncLiveContentScripts(): Promise<void> {
    const granted = await browser.permissions.getAll();
    const desiredOrigins = new Map<string, string>();

    for (const origin of granted.origins ?? []) {
        if (!origin.startsWith('http://') && !origin.startsWith('https://')) {
            continue;
        }

        desiredOrigins.set(toContentScriptId(origin), origin);
    }

    const existingScripts = await browser.scripting.getRegisteredContentScripts();
    const existingLiveScripts = existingScripts.filter((script: Scripting.RegisteredContentScript) =>
        script.id.startsWith(LIVE_SCRIPT_PREFIX)
    );

    const toRemove = existingLiveScripts
        .filter((script: Scripting.RegisteredContentScript) => !desiredOrigins.has(script.id))
        .map((script: Scripting.RegisteredContentScript) => script.id);

    if (toRemove.length > 0) {
        await browser.scripting.unregisterContentScripts({ ids: toRemove });
    }

    const existingIds = new Set(existingLiveScripts.map((script: Scripting.RegisteredContentScript) => script.id));
    const toRegister = Array.from(desiredOrigins.entries())
        .filter(([id]) => !existingIds.has(id))
        .map(([id, origin]) => ({
            id,
            js: ['assets/content.js'],
            matches: [origin],
            persistAcrossSessions: true,
            runAt: 'document_idle' as const,
        }));

    if (toRegister.length > 0) {
        await browser.scripting.registerContentScripts(toRegister);
    }
}

async function setLiveMode(tabId: number, enabled: boolean): Promise<void> {
    await ensureContentScript(tabId);
    await browser.tabs.sendMessage(tabId, {
        type: 'ONUL_SET_LIVE_MODE',
        enabled,
    } satisfies RuntimeMessage);
}

async function getActiveTab(): Promise<Tabs.Tab | null> {
    const tabs = await browser.tabs.query({
        active: true,
        currentWindow: true,
    });

    if (tabs.length === 0) {
        return null;
    }

    return tabs[0];
}
