export interface GasRuntime {
  school: string;
  webAppUrl: string;
  params: Record<string, string>;
  serverVersion: string;
  transport?: 'http';
}
declare global {
  interface Window { __TEACHERSIGN_GAS__?: GasRuntime; google?: any }
}
export const getGasRuntime = () => {
  const runtime = window.__TEACHERSIGN_GAS__;
  return runtime && typeof runtime === 'object' && typeof runtime.school === 'string' && typeof runtime.webAppUrl === 'string' && runtime.params && typeof runtime.params === 'object' ? runtime : undefined;
};
export const hasGasConnection = () => Boolean(getGasRuntime());
export const isGasStandalone = () => Boolean(getGasRuntime() && getGasRuntime()!.transport !== 'http');
export const getAppParams = () => getGasRuntime()
  ? new URLSearchParams(getGasRuntime()!.params)
  : new URLSearchParams(location.search);
export const getAppUrl = () => isGasStandalone() ? getGasRuntime()!.webAppUrl : `${location.origin}${location.pathname}`;
export const getSchoolLink = (school: string) => isGasStandalone() ? getGasRuntime()!.webAppUrl : getGasRuntime()?.transport === 'http' ? `${getAppUrl()}?endpoint=${encodeURIComponent(getGasRuntime()!.webAppUrl)}` : `${location.origin}${location.pathname}?school=${encodeURIComponent(school)}`;
