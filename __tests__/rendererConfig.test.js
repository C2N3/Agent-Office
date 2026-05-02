const fs = require('fs');
const path = require('path');

describe('renderer config', () => {
  test('loads shared JSON through Vite raw imports instead of browser JSON modules', () => {
    const source = fs.readFileSync(path.join(__dirname, '..', 'src', 'renderer', 'config.ts'), 'utf8');

    expect(source).toContain("avatars.json?raw");
    expect(source).toContain("sprite-frames.json?raw");
    expect(source).not.toContain("with { type: 'json' }");
  });
});
