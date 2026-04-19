const { buildGuestInviteLink, parseGuestInviteLink } = require('../public/dashboard/remoteMode.ts');

describe('remoteMode helpers', () => {
  test('buildGuestInviteLink uses the central server origin and guest secret fragment', () => {
    expect(buildGuestInviteLink('https://central.example.test/', 'guest-secret'))
      .toBe('https://central.example.test/#aoGuestSecret=guest-secret');
  });

  test('parseGuestInviteLink extracts origin and guest secret', () => {
    expect(parseGuestInviteLink('https://central.example.test/#aoGuestSecret=guest-secret'))
      .toEqual({
        baseUrl: 'https://central.example.test',
        guestSecret: 'guest-secret',
      });
  });
});
