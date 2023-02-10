import { onUnmounted, onMounted } from 'vue';
import defu from 'defu';
import Mousetrap from 'mousetrap';
import { isObject, parseJSON } from '@/utils/helper';

const defaultShortcut = {
  'page:dashboard': {
    id: 'page:dashboard',
    combo: 'option+1',
  },
  'page:workflows': {
    id: 'page:workflows',
    combo: 'option+w',
  },
  'page:schedule': {
    id: 'page:schedule',
    combo: 'option+t',
  },
  'page:logs': {
    id: 'page:logs',
    combo: 'option+l',
  },
  'page:storage': {
    id: 'page:storage',
    combo: 'option+a',
  },
  'page:settings': {
    id: 'page:settings',
    combo: 'option+s',
  },
  'action:search': {
    id: 'action:search',
    combo: 'mod+f',
  },
  'action:new': {
    id: 'action:new',
    combo: 'mod+option+n',
  },
  'editor:duplicate-block': {
    id: 'editor:duplicate-block',
    combo: 'mod+option+d',
  },
  'editor:search-blocks': {
    id: 'editor:search-blocks',
    combo: 'mod+b',
  },
  'editor:save': {
    id: 'editor:save',
    combo: 'mod+shift+s',
  },
  'editor:execute-workflow': {
    id: 'editor:execute-workflow',
    combo: 'option+enter',
  },
  'editor:toggle-sidebar': {
    id: 'editor:toggle-sidebar',
    combo: 'mod+[',
  },
};
const customShortcut = parseJSON(localStorage.getItem('shortcuts', {})) || {};

export const mapShortcuts = defu(customShortcut, defaultShortcut);

const os = navigator.appVersion.indexOf('Mac') !== -1 ? 'mac' : 'win';
export function getReadableShortcut(str) {
  const list = {
    option: {
      win: 'alt',
      mac: 'option',
    },
    mod: {
      win: 'ctrl',
      mac: '⌘',
    },
  };
  const regex = /option|mod/g;
  const replacedStr = str.replace(regex, (match) => {
    return list[match][os];
  });

  return replacedStr;
}

export function getShortcut(id, data) {
  const shortcut = mapShortcuts[id] || {};

  if (data) shortcut.data = data;
  if (!shortcut.readable) {
    shortcut.readable = getReadableShortcut(shortcut.combo);
  }

  return shortcut;
}

export function useShortcut(shortcuts, handler) {
  Mousetrap.prototype.stopCallback = () => false;

  const extractedShortcuts = {
    ids: {},
    keys: [],
    data: {},
  };
  const handleShortcut = (event, combo) => {
    const shortcutId = extractedShortcuts.ids[combo];
    const params = {
      event,
      ...extractedShortcuts.data[shortcutId],
    };

    if (shortcutId) event.preventDefault();

    if (typeof params.data === 'function') {
      params.data(params, event);
    } else if (handler) {
      handler(params, event);
    }
  };
  const addShortcutData = ({ combo, id, readable, ...rest }) => {
    extractedShortcuts.ids[combo] = id;
    extractedShortcuts.keys.push(combo);
    extractedShortcuts.data[id] = { combo, id, readable, ...rest };
  };

  if (isObject(shortcuts)) {
    addShortcutData(getShortcut(shortcuts.id, shortcuts.data));
  } else if (typeof shortcuts === 'string') {
    addShortcutData(getShortcut(shortcuts));
  } else {
    shortcuts.forEach((item) => {
      const currentShortcut =
        typeof item === 'string' ? getShortcut(item) : item;

      addShortcutData(currentShortcut);
    });
  }

  onMounted(() => {
    Mousetrap.bind(extractedShortcuts.keys, handleShortcut);
  });
  onUnmounted(() => {
    Mousetrap.unbind(extractedShortcuts.keys);
  });

  return extractedShortcuts.data;
}
