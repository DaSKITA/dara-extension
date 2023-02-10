import { objectHasKey, sleep } from '@/utils/helper';
import { getFrames } from '../helper';

async function switchTo(block) {
  const nextBlockId = this.getBlockConnections(block.id);

  try {
    if (block.data.windowType === 'main-window') {
      this.activeTab.frameId = 0;

      delete this.frameSelector;

      return {
        data: '',
        nextBlockId,
      };
    }

    const { url, isSameOrigin } = await this._sendMessageToTab(block, {
      frameId: 0,
    });

    if (isSameOrigin) {
      this.frameSelector = block.data.selector;

      return {
        data: block.data.selector,
        nextBlockId,
      };
    }

    const frames = await getFrames(this.activeTab.id);

    if (objectHasKey(frames, url)) {
      this.activeTab.frameId = frames[url];

      await sleep(1000);

      return {
        data: this.activeTab.frameId,
        nextBlockId,
      };
    }

    throw new Error('no-iframe-id');
  } catch (error) {
    error.data = { selector: block.data.selector };
    error.nextBlockId = nextBlockId;

    throw error;
  }
}

export default switchTo;
