import FindElement from '@/utils/FindElement';
import { getElementRect } from '../utils';
import findElementList from './listSelector';
import generateElementsSelector from './generateElementsSelector';
import getSelectorOptions from './getSelectorOptions';

let hoveredElements = [];
let prevSelectedElement = null;

function getElementRectWithOffset(element, data) {
  const withAttributes = data.withAttributes && data.click;
  const elementRect = getElementRect(element, withAttributes);

  elementRect.y += data.top;
  elementRect.x += data.left;

  return elementRect;
}
function getElementsRect(data) {
  const [element] = document.elementsFromPoint(
    data.clientX - data.left,
    data.clientY - data.top
  );
  if ((!element || element === prevSelectedElement) && !data.click) return;

  const payload = {
    elements: [],
    type: 'automa:iframe-element-rect',
  };

  if (data.click) {
    if (hoveredElements.length === 0) return;

    payload.click = true;

    const [selectedElement] = hoveredElements;
    const selector = generateElementsSelector({
      hoveredElements,
      list: data.list,
      target: selectedElement,
      selectorType: data.selectorType,
      selectorSettings: getSelectorOptions(data.selectorSettings || {}),
    });

    payload.selector = selector;
    payload.elements = hoveredElements.map((el) =>
      getElementRectWithOffset(el, data)
    );
  } else {
    prevSelectedElement = element;
    let elementsRect = [];

    if (data.list) {
      const elements =
        findElementList(element, {
          onlyInList: data.onlyInList,
        }) || [];

      hoveredElements = elements;
      elementsRect = elements.map((el) => getElementRectWithOffset(el, data));
    } else {
      hoveredElements = [element];
      elementsRect = [getElementRectWithOffset(element, data)];
    }

    payload.elements = elementsRect;
  }

  window.top.postMessage(payload, '*');
}
function resetElementSelector(data) {
  const prevSelectedList = document.querySelectorAll('[automa-el-list]');
  prevSelectedList.forEach((el) => {
    el.removeAttribute('automa-el-list');
  });

  if (data.clearCache) {
    hoveredElements = [];
    prevSelectedElement = null;
  }
}
function findElement({ selector, selectorType, frameRect }) {
  const payload = {
    elements: [],
    type: 'automa:selected-elements',
  };

  try {
    const elements = FindElement[selectorType]({ multiple: true, selector });

    payload.elements = Array.from(elements || []).map((el) =>
      getElementRectWithOffset(el, {
        withAttributes: true,
        click: true,
        ...frameRect,
      })
    );
  } catch (error) {
    console.error(error);
    payload.elements = [];
  }

  window.top.postMessage(payload, '*');
}
function onMessage({ data }) {
  switch (data.type) {
    case 'automa:get-element-rect':
      getElementsRect(data);
      break;
    case 'automa:reset-element-selector':
      resetElementSelector(data);
      break;
    case 'automa:find-element':
      findElement(data);
      break;
    default:
  }
}

export default function () {
  window.addEventListener('message', onMessage);
}
