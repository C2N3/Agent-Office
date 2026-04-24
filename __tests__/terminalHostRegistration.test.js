function createFakeDocument() {
  const doc = {
    createElement: jest.fn((tagName) => createFakeElement(doc, tagName)),
  };
  return doc;
}

function createFakeElement(ownerDocument, tagName = 'div') {
  const children = [];
  return {
    appendChild: jest.fn((child) => {
      children.push(child);
      return child;
    }),
    children,
    classList: {
      remove: jest.fn(),
    },
    className: '',
    dataset: {},
    innerHTML: '',
    ownerDocument,
    querySelectorAll: jest.fn((selector) => (
      selector === '.terminal-instance'
        ? children.filter((child) => String(child.className).includes('terminal-instance'))
        : []
    )),
    remove: jest.fn(),
    scrollHeight: 0,
    scrollTop: 0,
    style: {},
    tagName: String(tagName).toUpperCase(),
    textContent: '',
  };
}

describe('terminal host registration', () => {
  beforeEach(() => {
    jest.resetModules();
    global.localStorage = {
      getItem: jest.fn(() => null),
      setItem: jest.fn(),
    };
    global.document = {
      getElementById: jest.fn(() => null),
    };
  });

  afterEach(() => {
    delete global.FitAddon;
    delete global.ResizeObserver;
    delete global.Terminal;
    delete global.dashboardAPI;
    delete global.document;
    delete global.localStorage;
    delete global.requestAnimationFrame;
  });

  test('creates xterm instances from the registered React container host', () => {
    const doc = createFakeDocument();
    const container = createFakeElement(doc);
    const { termState } = require('../src/client/dashboard/shared.ts');
    const {
      createXtermInstance,
      registerTerminalContainerHost,
    } = require('../src/client/dashboard/terminal/ui.ts');

    global.dashboardAPI = {};
    global.requestAnimationFrame = jest.fn((callback) => {
      callback();
      return 1;
    });
    global.ResizeObserver = class {
      observe = jest.fn();
    };
    global.Terminal = class {
      attachCustomKeyEventHandler = jest.fn();
      focus = jest.fn();
      loadAddon = jest.fn();
      onData = jest.fn();
      open = jest.fn();
      scrollToBottom = jest.fn();
      write = jest.fn();
    };

    termState.terminals.clear();
    termState.activeId = null;
    registerTerminalContainerHost(container);

    createXtermInstance('agent-1', 'Agent One');

    expect(global.document.getElementById).not.toHaveBeenCalled();
    expect(container.appendChild).toHaveBeenCalled();
    expect(container.children[0].dataset.agentId).toBe('agent-1');
    expect(termState.terminals.get('agent-1')?.label).toBe('Agent One');
    expect(termState.activeId).toBe('agent-1');

    registerTerminalContainerHost(null);
  });

});
