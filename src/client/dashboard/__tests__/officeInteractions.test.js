describe('office interaction runtime', () => {
  let canvasHost;
  let officeCharacters;

  function makeEventTarget(name) {
    const listeners = new Map();
    const target = {
      name,
      style: {},
      addEventListener: jest.fn((type, listener, options) => {
        listeners.set(type, { listener, options });
      }),
      removeEventListener: jest.fn((type, listener, options) => {
        const current = listeners.get(type);
        if (current?.listener === listener && current?.options === options) {
          listeners.delete(type);
        }
      }),
      contains: jest.fn((node) => node === target),
      getBoundingClientRect: jest.fn(() => ({ left: 0, top: 0, width: 200, height: 200 })),
      height: 200,
      width: 200,
      listeners,
    };
    return target;
  }

  beforeEach(() => {
    jest.resetModules();
    canvasHost = null;
    officeCharacters = {
      dropCharacterAt: jest.fn(),
      getCharacterArray: jest.fn(() => []),
    };
    global.localStorage = {
      getItem: jest.fn(() => null),
      setItem: jest.fn(),
    };
    global.window = {
      addEventListener: jest.fn(),
      removeEventListener: jest.fn(),
    };
    global.document = {
      addEventListener: jest.fn(),
      removeEventListener: jest.fn(),
    };

    jest.doMock('../../office/index.ts', () => ({
      getOfficeCanvasHost: jest.fn(() => canvasHost),
      OFFICE: { FRAME_W: 106, FRAME_H: 140 },
      officeCharacters,
      officeRenderer: {},
    }));
    jest.doMock('../modals/registry.ts', () => ({
      dashboardModalRegistry: {},
    }));
    jest.doMock('../officeRuntime/popover.ts', () => ({
      getOfficePopoverHost: jest.fn(() => null),
      hideOfficePopover: jest.fn(),
      showOfficePopover: jest.fn(),
    }));
  });

  afterEach(() => {
    jest.dontMock('../../office/index.ts');
    jest.dontMock('../modals/registry.ts');
    jest.dontMock('../officeRuntime/popover.ts');
    delete global.document;
    delete global.localStorage;
    delete global.window;
  });

  test('binds office listeners to the current React canvas host', () => {
    canvasHost = makeEventTarget('canvas-a');
    const { setupOfficeInteractionRuntime } = require('../officeRuntime/interactions.ts');

    setupOfficeInteractionRuntime({ openTerminalForAgent: jest.fn() });

    expect(canvasHost.addEventListener).toHaveBeenCalledWith('mousedown', expect.any(Function));
    expect(canvasHost.addEventListener).toHaveBeenCalledWith('click', expect.any(Function));
    expect(global.window.addEventListener).toHaveBeenCalledWith('mousemove', expect.any(Function));
    expect(global.window.addEventListener).toHaveBeenCalledWith('mouseup', expect.any(Function));
    expect(global.document.addEventListener).toHaveBeenCalledWith('click', expect.any(Function));
    expect(global.document.addEventListener).toHaveBeenCalledWith('keydown', expect.any(Function));
  });

  test('moves listeners when React replaces the canvas host', () => {
    const firstCanvas = makeEventTarget('canvas-a');
    const nextCanvas = makeEventTarget('canvas-b');
    canvasHost = firstCanvas;
    const { setupOfficeInteractionRuntime, updateOfficeInteractionRuntime } = require('../officeRuntime/interactions.ts');

    setupOfficeInteractionRuntime({ openTerminalForAgent: jest.fn() });
    canvasHost = nextCanvas;
    updateOfficeInteractionRuntime();

    expect(firstCanvas.removeEventListener).toHaveBeenCalledWith('mousedown', expect.any(Function));
    expect(firstCanvas.removeEventListener).toHaveBeenCalledWith('click', expect.any(Function));
    expect(nextCanvas.addEventListener).toHaveBeenCalledWith('mousedown', expect.any(Function));
    expect(nextCanvas.addEventListener).toHaveBeenCalledWith('click', expect.any(Function));
  });

  test('tears down current host listeners explicitly', () => {
    canvasHost = makeEventTarget('canvas-a');
    const { setupOfficeInteractionRuntime, teardownOfficeInteractionRuntime } = require('../officeRuntime/interactions.ts');
    const { hideOfficePopover } = require('../officeRuntime/popover.ts');

    setupOfficeInteractionRuntime({ openTerminalForAgent: jest.fn() });
    teardownOfficeInteractionRuntime();

    expect(canvasHost.removeEventListener).toHaveBeenCalledWith('mousedown', expect.any(Function));
    expect(canvasHost.removeEventListener).toHaveBeenCalledWith('click', expect.any(Function));
    expect(global.window.removeEventListener).toHaveBeenCalledWith('mousemove', expect.any(Function));
    expect(global.window.removeEventListener).toHaveBeenCalledWith('mouseup', expect.any(Function));
    expect(global.document.removeEventListener).toHaveBeenCalledWith('click', expect.any(Function));
    expect(global.document.removeEventListener).toHaveBeenCalledWith('keydown', expect.any(Function));
    expect(hideOfficePopover).toHaveBeenCalled();
  });
});
