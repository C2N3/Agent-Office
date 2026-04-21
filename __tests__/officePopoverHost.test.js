describe('office popover host registration', () => {
  let mockOfficeCanvasHost;

  beforeEach(() => {
    jest.resetModules();
    mockOfficeCanvasHost = null;
    jest.doMock('../src/client/office/index.ts', () => ({
      getOfficeCanvasHost: jest.fn(() => mockOfficeCanvasHost),
      OFFICE: { FRAME_H: 140, FRAME_W: 106 },
      officeCharacters: null,
      officeRenderer: null,
    }));
    global.localStorage = {
      getItem: jest.fn(() => null),
      setItem: jest.fn(),
    };
  });

  afterEach(() => {
    jest.dontMock('../src/client/office/index.ts');
    delete global.HTMLCanvasElement;
    delete global.document;
    delete global.localStorage;
    delete global.window;
  });

  test('uses the registered React popover host for outside-click hiding', () => {
    const documentListeners = {};
    const canvasListeners = {};
    global.HTMLCanvasElement = class {};
    const canvas = new global.HTMLCanvasElement();
    mockOfficeCanvasHost = canvas;
    Object.assign(canvas, {
      addEventListener: jest.fn((eventName, listener) => {
        canvasListeners[eventName] = listener;
      }),
      style: {},
    });
    const popover = {
      contains: jest.fn(() => false),
      style: { display: 'block' },
    };
    global.document = {
      addEventListener: jest.fn((eventName, listener) => {
        documentListeners[eventName] = listener;
      }),
      getElementById: jest.fn(() => null),
    };
    global.window = {
      addEventListener: jest.fn(),
    };

    const {
      registerOfficePopoverHost,
      setupOfficeClickHandler,
    } = require('../src/client/dashboard/office.ts');

    registerOfficePopoverHost(popover);
    setupOfficeClickHandler(jest.fn());

    expect(global.document.getElementById).not.toHaveBeenCalled();
    expect(global.document.getElementById).not.toHaveBeenCalledWith('officePopover');
    expect(typeof canvasListeners.click).toBe('function');

    documentListeners.click({ target: { id: 'outside' } });

    expect(popover.contains).toHaveBeenCalled();
    expect(popover.style.display).toBe('none');

    registerOfficePopoverHost(null);
  });
});
