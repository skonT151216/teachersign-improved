export interface GasRuntime {
  school: string;
  webAppUrl: string;
  params: Record<string, string>;
  serverVersion: string;
}
declare global {
  interface Window { __TEACHERSIGN_GAS__?: GasRuntime; google?: any }
}
export const getGasRuntime = () => {
  const runtime = window.__TEACHERSIGN_GAS__;
  return runtime && typeof runtime === 'object' && typeof runtime.school === 'string' && typeof runtime.webAppUrl === 'string' && runtime.params && typeof runtime.params === 'object' ? runtime : undefined;
};
export const isGasStandalone = () => Boolean(getGasRuntime());
export const getAppParams = () => getGasRuntime()
  ? new URLSearchParams(getGasRuntime()!.params)
  : new URLSearchParams(location.search);
export const getAppUrl = () => getGasRuntime()?.webAppUrl || location.href.split('?')[0];
export const getSchoolLink = (school: string) => getGasRuntime()?.webAppUrl || `${location.origin}${location.pathname}?school=${encodeURIComponent(school)}`;
