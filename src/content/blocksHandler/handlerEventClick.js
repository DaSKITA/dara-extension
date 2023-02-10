import { sendMessage } from '@/utils/message';
import { getElementPosition, simulateClickElement } from '../utils';
import handleSelector from '../handleSelector';

function eventClick(block) {
  return new Promise((resolve, reject) => {
    handleSelector(block, {
      async onSelected(element) {
        if (block.debugMode) {
          const { x, y } = await getElementPosition(element);
          const payload = {
            tabId: block.activeTabId,
            method: 'Input.dispatchMouseEvent',
            params: {
              x,
              y,
              button: 'left',
            },
          };
          const executeCommand = (type) => {
            payload.params.type = type;

            if (type === 'mousePressed') {
              payload.params.clickCount = 1;
            }

            return sendMessage('debugger:send-command', payload, 'background');
          };

          await executeCommand('mousePressed');
          await executeCommand('mouseReleased');

          return;
        }

        simulateClickElement(element, () => element.click());
      },
      onError(error) {
        reject(error);
      },
      onSuccess() {
        resolve('');
      },
    });
  });
}

export default eventClick;
