import browser from 'webextension-polyfill';
import dayjs from '@/lib/dayjs';
import decryptFlow, { getWorkflowPass } from '@/utils/decryptFlow';
import { parseJSON } from '@/utils/helper';
import { fetchApi } from '@/utils/api';
import { sendMessage } from '@/utils/message';
import getBlockMessage from '@/utils/getBlockMessage';
import convertWorkflowData from '@/utils/convertWorkflowData';
import WorkflowState from './WorkflowState';
import WorkflowLogger from './WorkflowLogger';
import WorkflowEngine from './WorkflowEngine';
import blocksHandler from './blocksHandler';

const workflowStateStorage = {
  get() {
    return browser.storage.local
      .get('workflowStates')
      .then(({ workflowStates }) => workflowStates || []);
  },
  set(key, value) {
    const states = Object.values(value);

    return browser.storage.local.set({ workflowStates: states });
  },
};

export const workflowLogger = new WorkflowLogger();
export const workflowState = new WorkflowState({
  storage: workflowStateStorage,
});

export function stopWorkflowExec(executionId) {
  workflowState.stop(executionId);
  sendMessage('workflow:stop', executionId, 'background');
}

export function startWorkflowExec(workflowData, options, isPopup = true) {
  if (workflowData.isProtected) {
    const flow = parseJSON(workflowData.drawflow, null);

    if (!flow) {
      const pass = getWorkflowPass(workflowData.pass);

      workflowData.drawflow = decryptFlow(workflowData, pass);
    }
  }

  const convertedWorkflow = convertWorkflowData(workflowData);
  const engine = new WorkflowEngine(convertedWorkflow, {
    options,
    isPopup,
    states: workflowState,
    logger: workflowLogger,
    blocksHandler: blocksHandler(),
  });

  engine.init();
  engine.on(
    'destroyed',
    ({
      id,
      status,
      history,
      startedTimestamp,
      endedTimestamp,
      blockDetail,
    }) => {
      if (workflowData.id.startsWith('team') && workflowData.teamId) {
        const payload = {
          status,
          workflowId: workflowData.id,
          workflowLog: {
            status,
            endedTimestamp,
            startedTimestamp,
          },
        };

        if (status === 'error') {
          const message = getBlockMessage(blockDetail);
          const workflowHistory = history.map((item) => {
            delete item.logId;
            delete item.prevBlockData;
            delete item.workerId;

            item.description = item.description || '';

            return item;
          });
          payload.workflowLog = {
            status,
            message,
            endedTimestamp,
            startedTimestamp,
            history: workflowHistory,
            blockId: blockDetail.blockId,
          };
        }

        fetchApi(`/teams/${workflowData.teamId}/workflows/logs`, {
          method: 'POST',
          body: JSON.stringify(payload),
        }).catch((error) => {
          console.error(error);
        });
      }

      if (status !== 'stopped') {
        browser.permissions
          .contains({ permissions: ['notifications'] })
          .then((hasPermission) => {
            if (!hasPermission || !workflowData.settings.notification) return;

            const name = workflowData.name.slice(0, 32);

            browser.notifications.create(`logs:${id}`, {
              type: 'basic',
              iconUrl: browser.runtime.getURL('icon-128.png'),
              title: status === 'success' ? 'Success' : 'Error',
              message: `${
                status === 'success' ? 'Successfully' : 'Failed'
              } to run the "${name}" workflow`,
            });
          });
      }
    }
  );

  browser.storage.local.get('checkStatus').then(({ checkStatus }) => {
    const isSameDay = dayjs().isSame(checkStatus, 'day');
    if (!isSameDay || !checkStatus) {
      fetchApi('/status')
        .then((response) => response.json())
        .then(() => {
          browser.storage.local.set({ checkStatus: new Date().toString() });
        });
    }
  });

  return engine;
}

export function executeWorkflow(workflowData, options) {
  if (!workflowData || workflowData.isDisabled) return;

  const isMV2 = browser.runtime.getManifest().manifest_version === 2;
  const context = workflowData.settings.execContext;
  if (isMV2 || context === 'background') {
    sendMessage('workflow:execute', { ...workflowData, options }, 'background');
    return;
  }

  browser.tabs
    .query({ active: true, currentWindow: true })
    .then(async ([tab]) => {
      if (tab && tab.url.includes(browser.runtime.getURL(''))) {
        await browser.windows.update(tab.windowId, { focused: false });
      }

      startWorkflowExec(workflowData, options);
    });
}
