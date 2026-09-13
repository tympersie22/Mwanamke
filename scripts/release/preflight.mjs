import { readFileSync, existsSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
const root = fileURLToPath(new URL('../../', import.meta.url));
const app = JSON.parse(readFileSync(`${root}/apps/mobile/app.json`, 'utf8')).expo;
const tools = ['xcodebuild', 'pod', 'fastlane', 'eas', 'adb', 'java', 'docker', 'gitleaks', 'trivy', 'semgrep'];
const available = Object.fromEntries(tools.map(name => [name, spawnSync('which', [name], { stdio: 'ignore' }).status === 0]));
const report = {
  date: new Date().toISOString(),
  android: { package: app.android?.package, version: app.version, versionCode: app.android?.versionCode ?? null },
  ios: { bundleIdentifier: app.ios?.bundleIdentifier, version: app.version, buildNumber: app.ios?.buildNumber ?? null },
  easConfiguration: existsSync(`${root}/apps/mobile/eas.json`), tools: available,
  credentialPresence: Object.fromEntries(['EXPO_TOKEN', 'ANDROID_HOME', 'ANDROID_SDK_ROOT'].map(key => [key, Boolean(process.env[key])])),
  signingOwnership: 'not verified', submissions: 'not performed',
};
console.log(JSON.stringify(report, null, 2));
if (process.argv.includes('--require-build-tools') && (!available.eas || !report.easConfiguration)) process.exitCode = 1;
