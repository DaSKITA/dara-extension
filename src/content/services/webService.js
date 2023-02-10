import { openDB } from 'idb';
import { nanoid } from 'nanoid';
import browser from 'webextension-polyfill';
import deepmerge from 'lodash.merge';
import { sendMessage } from '@/utils/message';
import { objectHasKey, parseJSON } from '@/utils/helper';

function initWebListener() {
  const listeners = {};

  function on(name, callback) {
    (listeners[name] = listeners[name] || []).push(callback);
  }

  window.addEventListener('__automa-ext__', ({ detail }) => {
    if (!detail || !objectHasKey(listeners, detail.type)) return;

    listeners[detail.type].forEach((listener) => {
      listener(detail.data);
    });
  });

  return { on };
}
function sendMessageBack(type, payload = {}) {
  const event = new CustomEvent(`__automa-ext__${type}`, {
    detail: payload,
  });

  window.dispatchEvent(event);
}

window.addEventListener('DOMContentLoaded', async () => {
  try {
    document.body.setAttribute(
      'data-atm-ext-installed',
      browser.runtime.getManifest().version
    );

    const { workflows } = await browser.storage.local.get('workflows');
    const db = await openDB('automa', 1, {
      upgrade(event) {
        event.createObjectStore('store');
      },
    });

    await db.put('store', workflows, 'workflows');

    const session =
      parseJSON(localStorage.getItem('supabase.auth.token'), null)
        ?.currentSession ?? null;
    await browser.storage.local.set({ session });

    const webListener = initWebListener();
    webListener.on('open-dashboard', ({ path }) => {
      if (!path) return;

      sendMessage('open:dashboard', path, 'background');
    });
    webListener.on('open-workflow', ({ workflowId }) => {
      if (!workflowId) return;

      sendMessage('open:dashboard', `/workflows/${workflowId}`, 'background');
    });
    webListener.on('add-workflow', async ({ workflow }) => {
      try {
        const { workflows: workflowsStorage } = await browser.storage.local.get(
          'workflows'
        );

        const workflowId = nanoid();
        const workflowData = {
          ...workflow,
          id: workflowId,
          dataColumns: [],
          createdAt: Date.now(),
          table: workflow.table || workflow.dataColumns,
        };

        workflowData.drawflow =
          typeof workflowData.drawflow === 'string'
            ? parseJSON(workflowData.drawflow, workflowData.drawflow)
            : workflowData.drawflow;

        if (Array.isArray(workflowsStorage)) {
          workflowsStorage.push(workflowData);
        } else {
          workflowsStorage[workflowId] = workflowData;
        }

        await browser.storage.local.set({ workflows: workflowsStorage });
        sendMessage(
          'workflow:added',
          { workflowId, workflowData },
          'background'
        );
      } catch (error) {
        console.error(error);
      }
    });
    webListener.on('add-team-workflow', async ({ workflow }) => {
      let { teamWorkflows } = await browser.storage.local.get('teamWorkflows');

      let workflowData = {
        ...workflow,
        createdAt: Date.now(),
        table: workflow.table ?? [],
      };
      workflowData.drawflow =
        typeof workflowData.drawflow === 'string'
          ? parseJSON(workflowData.drawflow, workflowData.drawflow)
          : workflowData.drawflow;

      if (!teamWorkflows) teamWorkflows = {};
      if (!teamWorkflows[workflowData.teamId])
        teamWorkflows[workflowData.teamId] = {};

      const workflowToMerge =
        teamWorkflows[workflowData.teamId][workflow.id] || null;
      if (workflowToMerge) {
        workflowData = deepmerge(workflowToMerge, workflowData);
      }

      teamWorkflows[workflowData.teamId][workflow.id] = workflowData;
      await browser.storage.local.set({ teamWorkflows });

      const triggerBlock = workflowData.drawflow.nodes?.find(
        (node) => node.label === 'trigger'
      );
      if (triggerBlock) {
        await sendMessage(
          'workflow:register',
          { triggerBlock, workflowId: workflowData.id },
          'background'
        );
      }

      sendMessage(
        'workflow:added',
        {
          workflowId: workflowData.id,
          teamId: workflowData.teamId,
          source: 'team',
        },
        'background'
      );
    });
    webListener.on('check-team-workflow', async ({ teamId, workflowId }) => {
      const { teamWorkflows } = await browser.storage.local.get(
        'teamWorkflows'
      );
      const workflowExist = Boolean(teamWorkflows?.[teamId]?.[workflowId]);

      window.dispatchEvent(
        new CustomEvent('__automa-team-workflow__', {
          detail: { exists: workflowExist },
        })
      );
    });
    webListener.on('add-package', async (data) => {
      try {
        const { savedBlocks } = await browser.storage.local.get('savedBlocks');
        const packages = savedBlocks || [];

        packages.push({ ...data.package, createdAt: Date.now() });

        await browser.storage.local.set({ savedBlocks: packages });

        sendMessage('dashboard:refresh-packages', '', 'background');
      } catch (error) {
        console.error(error);
      }
    });
    webListener.on('update-package', async (data) => {
      const { savedBlocks } = await browser.storage.local.get('savedBlocks');
      const packages = savedBlocks || [];

      const index = packages.findIndex((pkg) => pkg.id === data.id);
      if (index === -1) return;

      Object.assign(packages[index], data.package);

      await browser.storage.local.set({ savedBlocks: packages });

      sendMessage('dashboard:refresh-packages', '', 'background');
    });
    webListener.on('send-message', async ({ type, data }) => {
      if (type === 'package-installed') {
        const { savedBlocks } = await browser.storage.local.get('savedBlocks');
        const packages = savedBlocks || [];
        const isInstalled = packages.some((pkg) => pkg.id === data);

        sendMessageBack(type, isInstalled);
      }
    });
  } catch (error) {
    console.error(error);
  }
});

const isMV2 = browser.runtime.getManifest().manifest_version === 2;

window.addEventListener('DOMContentLoaded', async () => {
  try {
    const webListener = initWebListener();
    webListener.on('execute-workflow', async ({ workflow }) => {
      try {
        if (!workflow) return;
        workflow.includeTabId = true;
        sendMessage('workflow:execute', workflow, 'background');
        /*
        const [tab] = await browser.tabs.query({
          url: browser.runtime.getURL('/newtab.html'),
        });
        if (tab && !isMV2) {
          await browser.tabs.sendMessage(tab.id, {
            type: 'workflow:execute',
            data: {
              data: workflow,
              options: workflow?.options,
            },
          });
        } else {
          await sendMessage('workflow:execute', workflow, 'background');
        }
        */
      } catch (error) {
        console.error(error);
      }
    });
    webListener.on('set-active-tab', async ({ tabId }) => {
      if (!tabId) return;
      await sendMessage('set:active-tab', tabId, 'background');
    });
    webListener.on('remove-tab', async ({ tabId }) => {
      if (!tabId) return;
      sendMessage('remove:tab', tabId, 'background');
    });
    webListener.on('record-workflow', async ({ url }) => {
      sendMessage('record:workflowAtUrl', url, 'background');
    });
    // TODO Only transmit wf-ids, not the whole wf.
    webListener.on('worflow-fetchall', async ({ revalidate }) => {
      if (revalidate) await syncWorkflowsBackend();
      const { workflows } = await browser.storage.local.get('workflows');
      window.postMessage({ "workflows": workflows });
    });
    webListener.on('workflow-delete', async ({ workflowId }) => {
      await sendMessage('workflow:delete', workflowId, 'background');
    });
  } catch (error) {
    console.error(error);
  }
});
browser.runtime.onMessage.addListener(function (message, sender, sendResponse) {
  console.log("got message:", message)
  if (message.type === 'to_active') {
    window.postMessage(message.data)
  }
});

async function syncWorkflowsBackend() {
  let { workflows } = await browser.storage.local.get('workflows');
  fetch('https://v2202301191442214869.powersrv.de/controllers/')
    .then(response => response.json())
    .then(data => {
      let fetched_workflows = {}
      for (const entry of data) {
        let wf = entry.automation.definition
        fetched_workflows[wf.id] = wf
      }
      browser.storage.local.set({ workflows: { ...workflows, ...fetched_workflows } })
    })
    .catch(error => console.log(error));
}
