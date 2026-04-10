# Agent Office

## macOS Release

This repository already ships an Electron Builder mac target. For a signed local macOS release, run:

```bash
npm install
npm run dist:mac:signed
```

`npm run dist:mac:signed` runs `rebuild`, `build:dist`, `typecheck`, `npm test -- --runInBand`, and then builds notarized DMG artifacts into `release/`.

Required environment variables for local notarization:

- `APPLE_API_KEY` or `APPLE_API_KEY_BASE64`
- `APPLE_API_KEY_ID`
- `APPLE_API_ISSUER`

Or use the Apple ID fallback:

- `APPLE_ID`
- `APPLE_APP_SPECIFIC_PASSWORD`
- `APPLE_TEAM_ID`

For code signing, set one of:

- `CSC_LINK` and `CSC_KEY_PASSWORD`
- `CSC_NAME` if the Developer ID Application certificate is already installed in the macOS keychain

GitHub Actions release signing/notarization expects these repository secrets:

- `APPLE_DEVELOPER_ID_APPLICATION_CERT_BASE64`
- `APPLE_DEVELOPER_ID_APPLICATION_CERT_PASSWORD`
- `APPLE_API_KEY_BASE64`
- `APPLE_API_KEY_ID`
- `APPLE_API_ISSUER`

## License

- **Source code:** [MIT License](LICENSE)
