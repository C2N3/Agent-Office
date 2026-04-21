describe('overlay keyboard adapter', () => {
  let keydownListener;

  beforeEach(() => {
    jest.resetModules();
    keydownListener = null;
    global.document = {
      activeElement: null,
      addEventListener: jest.fn((eventName, listener) => {
        if (eventName === 'keydown') keydownListener = listener;
      }),
      getElementById: jest.fn(),
      querySelector: jest.fn(() => null),
      querySelectorAll: jest.fn(() => []),
    };
  });

  afterEach(() => {
    delete global.document;
  });

  test('does not rediscover or click the React-owned dashboard button for Ctrl+D', () => {
    const { setupKeyboardShortcuts } = require('../uiComponents.ts');
    const preventDefault = jest.fn();

    setupKeyboardShortcuts();
    keydownListener({ ctrlKey: true, metaKey: false, altKey: false, key: 'd', preventDefault });

    expect(preventDefault).not.toHaveBeenCalled();
    expect(global.document.getElementById).not.toHaveBeenCalled();
  });

  test('leaves context menu ownership with the React grid host', () => {
    const { setupKeyboardShortcuts } = require('../uiComponents.ts');

    setupKeyboardShortcuts();

    expect(global.document.addEventListener).not.toHaveBeenCalledWith('contextmenu', expect.any(Function));
  });
});
