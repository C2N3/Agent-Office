const {
  beginHorizontalPanelResize,
  beginVerticalPanelResize,
} = require('../terminal/resizable.ts');

function fakeDocument() {
  const listeners = new Map();
  return {
    body: { style: {} },
    addEventListener: jest.fn((eventName, listener) => {
      listeners.set(eventName, listener);
    }),
    removeEventListener: jest.fn((eventName, listener) => {
      if (listeners.get(eventName) === listener) {
        listeners.delete(eventName);
      }
    }),
    listeners,
  };
}

function fakeClassList() {
  const values = new Set();
  return {
    add: jest.fn((value) => values.add(value)),
    remove: jest.fn((value) => values.delete(value)),
    values,
  };
}

function fakeElement(ownerDocument, sizes = {}) {
  return {
    ownerDocument,
    classList: fakeClassList(),
    clientWidth: sizes.clientWidth || 0,
    offsetHeight: sizes.offsetHeight || 0,
    offsetWidth: sizes.offsetWidth || 0,
    style: {},
  };
}

describe('terminal resizable panel adapter', () => {
  beforeEach(() => {
    global.document = {
      getElementById: jest.fn(),
    };
  });

  afterEach(() => {
    delete global.document;
  });

  test('starts vertical resizing from React-owned handle refs', () => {
    const doc = fakeDocument();
    const handle = fakeElement(doc);
    const leftCol = fakeElement(doc, { offsetWidth: 320 });
    const mainLayout = fakeElement(doc, { clientWidth: 900 });
    const fitActiveTerminal = jest.fn();
    const event = {
      clientX: 100,
      clientY: 0,
      preventDefault: jest.fn(),
    };

    const cleanup = beginVerticalPanelResize({
      event,
      fitActiveTerminal,
      handle,
      leftCol,
      mainLayout,
    });

    expect(cleanup).toEqual(expect.any(Function));
    expect(event.preventDefault).toHaveBeenCalled();
    expect(global.document.getElementById).not.toHaveBeenCalled();
    expect(handle.classList.add).toHaveBeenCalledWith('dragging');
    expect(doc.body.style.cursor).toBe('col-resize');
    expect(doc.body.style.userSelect).toBe('none');

    doc.listeners.get('mousemove')({ clientX: 160 });

    expect(leftCol.style.width).toBe('380px');
    expect(fitActiveTerminal).toHaveBeenCalled();

    doc.listeners.get('mouseup')();

    expect(handle.classList.remove).toHaveBeenCalledWith('dragging');
    expect(doc.body.style.cursor).toBe('');
    expect(doc.body.style.userSelect).toBe('');
    expect(doc.removeEventListener).toHaveBeenCalledWith('mousemove', expect.any(Function));
    expect(doc.removeEventListener).toHaveBeenCalledWith('mouseup', expect.any(Function));
  });

  test('starts horizontal resizing from React-owned handle refs', () => {
    const doc = fakeDocument();
    const handle = fakeElement(doc);
    const leftCol = fakeElement(doc, { offsetHeight: 700 });
    const officePanel = fakeElement(doc, { offsetHeight: 240 });
    const agentListPanel = fakeElement(doc);
    const event = {
      clientX: 0,
      clientY: 200,
      preventDefault: jest.fn(),
    };

    const cleanup = beginHorizontalPanelResize({
      agentListPanel,
      event,
      handle,
      leftCol,
      officePanel,
    });

    expect(cleanup).toEqual(expect.any(Function));
    expect(event.preventDefault).toHaveBeenCalled();
    expect(global.document.getElementById).not.toHaveBeenCalled();
    expect(handle.classList.add).toHaveBeenCalledWith('dragging');
    expect(doc.body.style.cursor).toBe('row-resize');

    doc.listeners.get('mousemove')({ clientY: 360 });

    expect(officePanel.style.flex).toBe('none');
    expect(officePanel.style.height).toBe('400px');
    expect(agentListPanel.style.flex).toBe('1');
  });

  test('ignores missing host refs without binding document listeners', () => {
    const doc = fakeDocument();
    const event = {
      clientX: 100,
      clientY: 0,
      preventDefault: jest.fn(),
    };

    expect(beginVerticalPanelResize({
      event,
      fitActiveTerminal: jest.fn(),
      handle: null,
      leftCol: fakeElement(doc),
      mainLayout: fakeElement(doc),
    })).toBeNull();
    expect(event.preventDefault).not.toHaveBeenCalled();
    expect(doc.addEventListener).not.toHaveBeenCalled();
  });
});
