import browser from 'webextension-polyfill';

const getFileExtension = (str) => /(?:\.([^.]+))?$/.exec(str)[1];
function determineFilenameListener(item, suggest) {
  const filesname =
    JSON.parse(sessionStorage.getItem('rename-downloaded-files')) || {};
  const suggestion = filesname[item.id];

  if (!suggestion) return true;

  const hasFileExt = getFileExtension(suggestion.filename);

  if (!hasFileExt) {
    const filExtension = getFileExtension(item.filename);
    suggestion.filename += `.${filExtension}`;
  }

  if (!suggestion.waitForDownload) delete filesname[item.id];

  sessionStorage.setItem('rename-downloaded-files', JSON.stringify(filesname));

  suggest({
    filename: suggestion.filename,
    conflictAction: suggestion.onConflict,
  });

  return false;
}

function handleDownload({ data, id: blockId }) {
  const nextBlockId = this.getBlockConnections(blockId);
  const getFilesname = () =>
    JSON.parse(sessionStorage.getItem('rename-downloaded-files')) || {};

  return new Promise((resolve) => {
    if (!this.activeTab.id) throw new Error('no-tab');

    const hasListener =
      BROWSER_TYPE === 'chrome' &&
      chrome.downloads.onDeterminingFilename.hasListeners(() => {});
    if (!hasListener) {
      chrome.downloads.onDeterminingFilename.addListener(
        determineFilenameListener
      );
    }

    let downloadId = null;
    const handleCreated = ({ id }) => {
      if (downloadId) return;

      const names = getFilesname();

      downloadId = id;
      names[id] = data;
      sessionStorage.setItem('rename-downloaded-files', JSON.stringify(names));

      browser.downloads.onCreated.removeListener(handleCreated);
    };
    browser.downloads.onCreated.addListener(handleCreated);

    if (!data.waitForDownload) {
      resolve({
        nextBlockId,
        data: data.filename,
      });

      return;
    }

    let isResolved = false;
    let currentFilename = data.filename;

    const timeout = setTimeout(() => {
      if (isResolved) return;

      isResolved = true;

      resolve({
        nextBlockId,
        data: currentFilename,
      });
    }, data.timeout);

    const resolvePromise = (id) => {
      if (data.saveData) {
        this.addDataToColumn(data.dataColumn, currentFilename);
      }
      if (data.assignVariable) {
        this.setVariable(data.variableName, currentFilename);
      }

      clearTimeout(timeout);
      isResolved = true;

      const filesname = getFilesname();
      delete filesname[id];
      sessionStorage.setItem(
        'rename-downloaded-files',
        JSON.stringify(filesname)
      );

      chrome.downloads.onDeterminingFilename.removeListener(
        determineFilenameListener
      );

      resolve({
        nextBlockId,
        data: currentFilename,
      });
    };

    const handleChanged = ({ state, id, filename }) => {
      if (this.engine.isDestroyed || isResolved) {
        browser.downloads.onChanged.removeListener(handleChanged);
        return;
      }

      if (downloadId !== id) return;

      if (filename) currentFilename = filename.current;

      if (state && state.current === 'complete') {
        resolvePromise(id);
      } else {
        browser.downloads.search({ id }).then(([download]) => {
          if (!download || !download.endTime) return;

          resolvePromise(id);
        });
      }
    };

    browser.downloads.onChanged.addListener(handleChanged);
  });
}

export default handleDownload;
