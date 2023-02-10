import browser from 'webextension-polyfill';
import { isXPath, sleep } from '@/utils/helper';

const isMV2 = browser.runtime.getManifest().manifest_version === 2;

async function getActiveTab() {
  const currentWindow = await browser.windows.getCurrent();
  if (currentWindow)
    await browser.windows.update(currentWindow.id, { focused: false });

  await sleep(200);

  const [tab] = await browser.tabs.query({
    active: true,
    url: '*://*/*',
    lastFocusedWindow: true,
  });
  if (!tab) throw new Error('No active tab');

  return tab;
}
async function makeDashboardFocus() {
  const [currentTab] = await browser.tabs.query({
    active: true,
    currentWindow: true,
  });
  await browser.windows.update(currentTab.windowId, {
    focused: true,
  });
}

export async function initElementSelector(tab = null) {
  let activeTab = tab;

  if (!tab) {
    activeTab = await getActiveTab();
  }

  const result = await browser.tabs.sendMessage(activeTab.id, {
    type: 'automa-element-selector',
  });

  if (!result) {
    if (isMV2) {
      await browser.tabs.executeScript(activeTab.id, {
        allFrames: true,
        runAt: 'document_start',
        file: './elementSelector.bundle.js',
      });
    } else {
      await browser.scripting.executeScript({
        target: {
          allFrames: true,
          tabId: activeTab.id,
        },
        files: ['./elementSelector.bundle.js'],
      });
    }
  }

  await browser.tabs.update(activeTab.id, { active: true });
  await browser.windows.update(activeTab.windowId, { focused: true });
}

async function verifySelector(data) {
  try {
    const activeTab = await getActiveTab();

    if (!data.findBy) {
      data.findBy = isXPath(data.selector) ? 'xpath' : 'cssSelector';
    }

    await browser.tabs.update(activeTab.id, { active: true });
    await browser.windows.update(activeTab.windowId, { focused: true });

    const result = await browser.tabs.sendMessage(
      activeTab.id,
      {
        data,
        isBlock: true,
        label: 'verify-selector',
      },
      { frameId: 0 }
    );

    return result;
  } catch (error) {
    console.error(error);
    await sleep(1000);

    return { notFound: true };
  } finally {
    await makeDashboardFocus();
  }
}

async function selectElement(name) {
  const tab = await getActiveTab();

  await initElementSelector(tab);

  const port = await browser.tabs.connect(tab.id, { name });
  const getSelector = () => {
    return new Promise((resolve, reject) => {
      port.onDisconnect.addListener(() => {
        reject(new Error('Port closed'));
      });
      port.onMessage.addListener(async (message) => {
        try {
          makeDashboardFocus();
        } catch (error) {
          console.error(error);
        } finally {
          resolve(message);
        }
      });
    });
  };

  const selector = await getSelector();

  return selector;
}

export default {
  selectElement,
  verifySelector,
};
