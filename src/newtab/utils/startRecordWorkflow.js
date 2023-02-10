import browser from 'webextension-polyfill';

const isMV2 = browser.runtime.getManifest().manifest_version === 2;

export default async function (options = {}) {
  try {
    const flows = [];
    const [activeTab] = await browser.tabs.query({
      active: true,
      url: '*://*/*',
    });

    if (activeTab && activeTab.url.startsWith('http')) {
      flows.push({
        id: 'new-tab',
        description: activeTab.title || activeTab.url,
        data: {
          url: activeTab.url,
          active: false,
          waitTabLoaded: true,
        },
      });
      flows.push({
        id: 'javascript-code',
        description: "Send start signal to backend",
        data: {
          code: `
            const event = (state) => new CustomEvent( '__js-event__', {
              'detail': {
                'type': 'to_active',
                'data': { 'workflow_state': state }
              }
            });
            if (window.location.href == "${activeTab.url}"){
              window.dispatchEvent(event('started'));
            } else {
              window.dispatchEvent(event('start-failed'));
            }`,
        },
      });

      await browser.windows.update(activeTab.windowId, { focused: true });
    }

    await browser.storage.local.set({
      isRecording: true,
      recording: {
        flows,
        name: 'unnamed',
        activeTab: {
          id: activeTab?.id,
          url: activeTab?.url,
        },
        ...options,
      },
    });

    const action = browser.action || browser.browserAction;
    await action.setBadgeBackgroundColor({ color: '#ef4444' });
    await action.setBadgeText({ text: 'rec' });

    const tabs = await browser.tabs.query({});
    for (const tab of tabs) {
      if (
        tab.url.startsWith('http') &&
        !tab.url.includes('chrome.google.com')
      ) {
        if (isMV2) {
          await browser.tabs.executeScript(tab.id, {
            allFrames: true,
            runAt: 'document_start',
            file: './recordWorkflow.bundle.js',
          });
        } else {
          await browser.scripting.executeScript({
            target: {
              tabId: tab.id,
              allFrames: true,
            },
            files: ['recordWorkflow.bundle.js'],
          });
        }
      }
    }
  } catch (error) {
    console.error(error);
  }
}
