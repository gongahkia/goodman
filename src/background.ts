/* eslint-disable */
chrome.runtime.onInstalled.addListener(() => {
    chrome.contextMenus.create({
        id: 'onul-convert',
        title: 'Convert timezone with ONUL',
        contexts: ['selection']
    });
});
chrome.contextMenus.onClicked.addListener((info, tab) => {
    if (info.menuItemId !== 'onul-convert' || !tab?.id) return;
    chrome.tabs.sendMessage(tab.id, {
        type: 'ONUL_CONTEXT_MENU_CONVERT',
        text: info.selectionText || ''
    });
});
