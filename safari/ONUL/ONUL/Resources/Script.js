/* global webkit */

function show(enabled, useSettingsInsteadOfPreferences) {
    if (useSettingsInsteadOfPreferences) {
        document.getElementsByClassName('state-on')[0].innerText =
            'The ONUL extension is on. Review website access in Safari Settings if live conversion is not running on a site.'
        document.getElementsByClassName('state-off')[0].innerText =
            'The ONUL extension is off. Turn it on in Safari Settings, then allow website access for the sites you want to use.'
        document.getElementsByClassName('state-unknown')[0].innerText =
            'Turn on ONUL in Safari Settings, then grant website access for the sites you approve.'
        document.getElementsByClassName('open-preferences')[0].innerText = 'Quit and Open Safari Settings…'
    }

    if (typeof enabled === 'boolean') {
        document.body.classList.toggle('state-on', enabled)
        document.body.classList.toggle('state-off', !enabled)
    } else {
        document.body.classList.remove('state-on')
        document.body.classList.remove('state-off')
    }
}

function setBuildDetails(version, build) {
    document.querySelector('[data-version]').innerText = `Version ${version} (${build})`
}

function openPreferences() {
    webkit.messageHandlers.controller.postMessage('open-preferences')
}

window.show = show
window.setBuildDetails = setBuildDetails
document.querySelector('button.open-preferences').addEventListener('click', openPreferences)
