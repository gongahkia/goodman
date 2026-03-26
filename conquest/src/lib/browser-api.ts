type ExtensionBrowserApi = typeof chrome

type ExtensionGlobal = typeof globalThis & {
  browser?: ExtensionBrowserApi
  chrome?: ExtensionBrowserApi
}

const extensionGlobal = globalThis as ExtensionGlobal

export const browserApi = extensionGlobal.browser ?? extensionGlobal.chrome

if (!browserApi) {
  throw new Error('Conquest browser API unavailable: expected browser.* or chrome.*')
}

export const storageArea = {
  local: browserApi.storage.local,
  session: browserApi.storage.session ?? browserApi.storage.local,
}

export type MessageSender = chrome.runtime.MessageSender
export type ExtensionTab = chrome.tabs.Tab
export type TabActiveInfo = chrome.tabs.TabActiveInfo
export type TabChangeInfo = chrome.tabs.TabChangeInfo
export type ExtensionStorageArea = chrome.storage.StorageArea
