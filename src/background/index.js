import browser from 'webextension-polyfill';
import { MessageListener } from '@/utils/message';
import { sleep } from '@/utils/helper';
import getFile from '@/utils/getFile';
import automa from '@business';
import { workflowState } from '@/workflowEngine';
import { registerWorkflowTrigger } from '../utils/workflowTrigger';
import BackgroundUtils from './BackgroundUtils';
import BackgroundWorkflowUtils from './BackgroundWorkflowUtils';
import BackgroundEventsListeners from './BackgroundEventsListeners';
import startRecordWorkflow from '@/newtab/utils/startRecordWorkflow';

browser.alarms.onAlarm.addListener(BackgroundEventsListeners.onAlarms);

browser.commands.onCommand.addListener(BackgroundEventsListeners.onCommand);

(browser.action || browser.browserAction).onClicked.addListener(
  BackgroundEventsListeners.onActionClicked
);

browser.runtime.onStartup.addListener(
  BackgroundEventsListeners.onRuntimeStartup
);
browser.runtime.onInstalled.addListener(
  BackgroundEventsListeners.onRuntimeInstalled
);

browser.webNavigation.onCompleted.addListener(
  BackgroundEventsListeners.onWebNavigationCompleted
);
browser.webNavigation.onHistoryStateUpdated.addListener(
  BackgroundEventsListeners.onHistoryStateUpdated
);

const contextMenu =
  BROWSER_TYPE === 'firefox' ? browser.menus : browser.contextMenus;
if (contextMenu && contextMenu.onClicked) {
  contextMenu.onClicked.addListener(
    BackgroundEventsListeners.onContextMenuClicked
  );
}

if (browser.notifications && browser.notifications.onClicked) {
  browser.notifications.onClicked.addListener(
    BackgroundEventsListeners.onNotificationClicked
  );
}

const message = new MessageListener('background');

message.on('fetch', ({ type, resource }) => {
  return fetch(resource.url, resource).then((response) => {
    if (!response.ok) throw new Error(response.statusText);

    return response[type]();
  });
});
message.on('fetch:text', (url) => {
  return fetch(url).then((response) => response.text());
});

message.on('open:dashboard', (url) => BackgroundUtils.openDashboard(url));
message.on('set:active-tab', (tabId) => {
  return browser.tabs.update(tabId, { active: true });
});

message.on('debugger:send-command', ({ tabId, method, params }) => {
  return new Promise((resolve) => {
    chrome.debugger.sendCommand({ tabId }, method, params, resolve);
  });
});
message.on('debugger:type', ({ tabId, commands, delay }) => {
  return new Promise((resolve) => {
    let index = 0;
    async function executeCommands() {
      const command = commands[index];
      if (!command) {
        resolve();
        return;
      }

      chrome.debugger.sendCommand(
        { tabId },
        'Input.dispatchKeyEvent',
        command,
        async () => {
          if (delay > 0) await sleep(delay);

          index += 1;
          executeCommands();
        }
      );
    }
    executeCommands();
  });
});

message.on('get:sender', (_, sender) => sender);
message.on('get:file', (path) => getFile(path));
message.on('get:tab-screenshot', (options, sender) =>
  browser.tabs.captureVisibleTab(sender.tab.windowId, options)
);

message.on('dashboard:refresh-packages', async () => {
  const tabs = await browser.tabs.query({
    url: browser.runtime.getURL('/newtab.html'),
  });

  tabs.forEach((tab) => {
    browser.tabs.sendMessage(tab.id, {
      type: 'refresh-packages',
    });
  });
});

message.on('workflow:stop', (stateId) => workflowState.stop(stateId));
message.on('workflow:execute', async (workflowData, sender) => {
  const context = workflowData.settings.execContext;
  const isMV2 = browser.runtime.getManifest().manifest_version === 2;
  if (!isMV2 && (!context || context === 'popup')) {
    await BackgroundUtils.openDashboard('', false);
    await BackgroundUtils.sendMessageToDashboard('workflow:execute', {
      data: workflowData,
      options: workflowData.option,
    });
    return;
  }

  if (workflowData.includeTabId) {
    if (!workflowData.options) workflowData.options = {};

    workflowData.options.tabId = sender.tab.id;
  }
  BackgroundWorkflowUtils.executeWorkflow(
    workflowData,
    workflowData?.options || {}
  );
});
message.on(
  'workflow:added',
  ({ workflowId, teamId, workflowData, source = 'community' }) => {
    let path = `/workflows/${workflowId}`;

    if (source === 'team') {
      if (!teamId) return;
      path = `/teams/${teamId}/workflows/${workflowId}`;
    }

    browser.tabs
      .query({ url: browser.runtime.getURL('/newtab.html') })
      .then((tabs) => {
        if (tabs.length >= 1) {
          const lastTab = tabs.at(-1);

          tabs.forEach((tab) => {
            browser.tabs.sendMessage(tab.id, {
              data: { workflowId, teamId, source, workflowData },
              type: 'workflow:added',
            });
          });

          browser.tabs.update(lastTab.id, {
            active: true,
          });
          browser.windows.update(lastTab.windowId, { focused: true });
        } else {
          BackgroundUtils.openDashboard(`${path}?permission=true`);
        }
      });
  }
);
message.on('workflow:register', ({ triggerBlock, workflowId }) => {
  registerWorkflowTrigger(workflowId, triggerBlock);
});
message.on('recording:stop', async () => {
  try {
    //let { recording } = await browser.storage.local.get('recording');

    //browser.storage.local.set({ recording });

    await BackgroundUtils.openDashboard('', false);
    await BackgroundUtils.sendMessageToDashboard('recording:stop');
  } catch (error) {
    console.error(error);
  }
});

automa('background', message);

browser.runtime.onMessage.addListener(message.listener());

/* eslint-disable no-use-before-define */

const isMV2 = browser.runtime.getManifest().manifest_version === 2;
let lifeline;
async function keepAlive() {
  if (lifeline) return;
  for (const tab of await browser.tabs.query({ url: '*://*/*' })) {
    try {
      await browser.scripting.executeScript({
        target: { tabId: tab.id },
        func: () => chrome.runtime.connect({ name: 'keepAlive' }),
      });
      browser.tabs.onUpdated.removeListener(retryOnTabUpdate);
      return;
    } catch (e) {
      // Do nothing
    }
  }
  browser.tabs.onUpdated.addListener(retryOnTabUpdate);
}
async function retryOnTabUpdate(tabId, info) {
  if (info.url && /^(file|https?):/.test(info.url)) {
    keepAlive();
  }
}
function keepAliveForced() {
  lifeline?.disconnect();
  lifeline = null;
  keepAlive();
}

if (!isMV2) {
  browser.runtime.onConnect.addListener((port) => {
    if (port.name === 'keepAlive') {
      lifeline = port;
      /* eslint-disable-next-line */
      console.log('Stayin alive: ', new Date());
      setTimeout(keepAliveForced, 295e3);
      port.onDisconnect.addListener(keepAliveForced);
    }
  });

  keepAlive();
}

// Dara additions start
message.on('from-javascript', (detail, sender) => {
  console.log('Got from-javascript event', detail);
  if (detail.type === 'to_active') {
    detail.data.workflowTabId = sender.tab.id;
    let queryOptions = { url: ['https://daskita.github.io/dara-frontend*'] };
    browser.tabs.query(queryOptions).then(tabs => {
      browser.tabs.sendMessage(tabs[0].id, detail);
    });
  }
});
message.on('remove:tab', (tabId) => {
  return browser.tabs.remove(tabId);
});

message.on('record:workflowAtUrl', async (url) => {
  // open tab, focus, start recording
  let newTab = await browser.tabs.create({
    url: url
  })

  function handleUpdated(tabId, changeInfo, tabInfo) {
    if (tabId == newTab.id && tabInfo.status == "complete") {
      url = new URL(url)
      let options = {
        name: tabInfo.title || url.hostname,
      }
      startRecordWorkflow(options);
      BackgroundUtils.openDashboard('/recording', true, { focused: false, height: 260 });
      browser.tabs.update(tabId, { active: true });
      browser.windows.update(tabInfo.windowId, { focused: true })
      browser.tabs.onUpdated.removeListener(handleUpdated);
    }
  };
  browser.tabs.onUpdated.addListener(handleUpdated);
});

message.on('workflow:delete', async (id = "") => {
  let { workflows } = await browser.storage.local.get('workflows');
  delete workflows[id];
  browser.storage.local.set({ workflows: workflows })
});

// Update frontend when workflows is updated
async function updateFrontendOnStorageChange(changes, area) {
  if (area === "local") {
    if (Object.keys(changes).includes("workflows")) {
      let detail = {}
      detail.data = await browser.storage.local.get('workflows')
      detail.type = 'to_active'
      let queryOptions = { url: ['https://daskita.github.io/dara-frontend*'] };
      browser.tabs.query(queryOptions).then((tabs) => {
        browser.tabs.sendMessage(tabs[0]['id'], detail);
      });
    }
  }
}

browser.storage.onChanged.addListener(updateFrontendOnStorageChange);
