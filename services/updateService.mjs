import installed from '../version.json' with { type: 'json' };

export const APP_VERSION = installed.appVersion;
export const GITHUB_URL = 'https://github.com/skonT151216/teachersign-improved';
export const DOWNLOAD_URL = `${GITHUB_URL}/releases/latest/download/TeacherSign-GAS.zip`;
export const VERSION_URL = 'https://raw.githubusercontent.com/skonT151216/teachersign-improved/main/version.json';
export const GAS_CODE_URL = 'https://raw.githubusercontent.com/skonT151216/teachersign-improved/main/Code.gs';

const versionPattern = /^(0|[1-9]\d{0,5})\.(0|[1-9]\d{0,5})\.(0|[1-9]\d{0,5})$/;
export function compareVersions(left, right) {
  if (typeof left !== 'string' || typeof right !== 'string' || !versionPattern.test(left) || !versionPattern.test(right)) throw new Error('잘못된 버전 정보입니다.');
  const a = left.split('.').map(Number), b = right.split('.').map(Number);
  for (let i = 0; i < 3; i++) if (a[i] !== b[i]) return a[i] > b[i] ? 1 : -1;
  return 0;
}
export function validateUpdate(value) {
  if (!value || typeof value.appVersion !== 'string' || typeof value.gasVersion !== 'string' ||
      !versionPattern.test(value.appVersion) || !versionPattern.test(value.gasVersion) || typeof value.publishedAt !== 'string' ||
      !/^\d{4}-\d{2}-\d{2}$/.test(value.publishedAt) || typeof value.notes !== 'string' || value.notes.length > 1000) {
    throw new Error('GitHub의 버전 정보 형식이 올바르지 않습니다.');
  }
  // Navigation destinations stay fixed to the official repository.
  return { appVersion: value.appVersion, gasVersion: value.gasVersion, publishedAt: value.publishedAt, notes: value.notes };
}
export async function fetchLatestUpdate(signal, fetchImpl = fetch) {
  const response = await fetchImpl(VERSION_URL, { signal, cache: 'no-store', credentials: 'omit', referrerPolicy: 'no-referrer' });
  if (!response.ok) throw new Error('GitHub에서 최신 버전을 확인하지 못했습니다.');
  return validateUpdate(await response.json());
}

export async function fetchLatestGasCode(signal, fetchImpl = fetch) {
  const [release, response] = await Promise.all([
    fetchLatestUpdate(signal, fetchImpl),
    fetchImpl(GAS_CODE_URL, { signal, cache: 'no-store', credentials: 'omit', referrerPolicy: 'no-referrer' }),
  ]);
  if (!response.ok) throw new Error('GitHub에서 GAS 코드를 확인하지 못했습니다.');
  const source = await response.text();
  const version = /\bconst SERVER_VERSION = "([0-9]+\.[0-9]+\.[0-9]+)";/.exec(source)?.[1];
  if (source.length > 500000 || !source.startsWith('// TeacherSign Google Apps Script server') || version !== release.gasVersion)
    throw new Error('GAS 코드와 최신 버전 정보가 일치하지 않습니다. 설치 ZIP을 이용하세요.');
  return { version, source };
}
