import browser from 'webextension-polyfill';
import { sleep } from '@/utils/helper';
import { attachDebugger, injectPreloadScript } from '../helper';

async function activeTab(block) {
  try {
    const data = {
      data: '',
      nextBlockId: this.getBlockConnections(block.id),
    };

    if (this.activeTab.id) {
      await browser.tabs.update(this.activeTab.id, { active: true });

      return data;
    }

    const minimizeDashboard = async (currentWindow) => {
      if (currentWindow.type !== 'popup') return;

      const [tab] = currentWindow.tabs;
      const isDashboard = tab && tab.url.includes(browser.runtime.getURL(''));
      const isWindowFocus =
        currentWindow.focused || currentWindow.state === 'maximized';

      if (isWindowFocus && isDashboard) {
        const windowOptions = { focused: false };
        if (currentWindow.state === 'maximized')
          windowOptions.state = 'minimized';

        await browser.windows.update(currentWindow.id, windowOptions);
      }
    };

    if (this.engine.isPopup) {
      const currentWindow = await browser.windows.getCurrent({
        populate: true,
      });
      await minimizeDashboard(currentWindow);
    } else {
      const allWindows = await browser.windows.getAll({ populate: true });
      for (const currWindow of allWindows) {
        await minimizeDashboard(currWindow);
      }
    }

    const [tab] = await browser.tabs.query({
      active: true,
      lastFocusedWindow: true,
    });
    if (!tab || !tab?.url.startsWith('http')) {
      const error = new Error('invalid-active-tab');
      error.data = { url: tab?.url };

      throw error;
    }

    this.activeTab = {
      ...this.activeTab,
      frameId: 0,
      id: tab.id,
      url: tab.url,
    };
    this.windowId = tab.windowId;

    if (this.settings.debugMode) {
      await attachDebugger(tab.id, this.activeTab.id);
      this.debugAttached = true;
    }

    if (this.preloadScripts.length > 0) {
      if (this.engine.isMV2) {
        await this._sendMessageToTab({
          isPreloadScripts: true,
          label: 'javascript-code',
          data: { scripts: this.preloadScripts },
        });
      } else {
        await injectPreloadScript({
          scripts: this.preloadScripts,
          frameSelector: this.frameSelector,
          target: {
            tabId: this.activeTab.id,
            frameIds: [this.activeTab.frameId || 0],
          },
        });
      }
    }

    await browser.tabs.update(tab.id, { active: true });
    await browser.windows.update(tab.windowId, { focused: true });

    await sleep(200);

    return data;
  } catch (error) {
    console.error(error);
    error.data = error.data || {};

    throw error;
  }
}

export default activeTab;
