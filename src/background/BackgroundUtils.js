import browser from 'webextension-polyfill';
import { waitTabLoaded } from '@/workflowEngine/helper';

class BackgroundUtils {
  static async openDashboard(url, updateTab = true, options = {}) {
    const tabUrl = browser.runtime.getURL(
      `/newtab.html#${typeof url === 'string' ? url : ''}`
    );

    try {
      const [tab] = await browser.tabs.query({
        url: browser.runtime.getURL('/newtab.html'),
      });

      if (tab) {
        const tabOptions = { active: true };
        if (updateTab) tabOptions.url = tabUrl;

        await browser.tabs.update(tab.id, tabOptions);

        if (updateTab) {
          await browser.windows.update(tab.windowId, {
            focused: true,
            state: 'maximized',
          });
        }
      } else {
        let windowOptions = {
          url: tabUrl,
          type: 'popup',
        };

        if (updateTab) {
          windowOptions.height = 715;
          windowOptions.width = 715;
          windowOptions.focused = true;
        } else {
          windowOptions.state = 'minimized';
        }

        windowOptions = { ...windowOptions, ...options };
        await browser.windows.create(windowOptions);
      }
    } catch (error) {
      console.error(error);
      throw error;
    }
  }

  static async sendMessageToDashboard(type, data) {
    const [tab] = await browser.tabs.query({
      url: browser.runtime.getURL('/newtab.html'),
    });

    await waitTabLoaded({ tabId: tab.id });
    const result = await browser.tabs.sendMessage(tab.id, { type, data });

    return result;
  }
}

export default BackgroundUtils;
