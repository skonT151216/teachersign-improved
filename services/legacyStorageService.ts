import { Staff } from '../types';
import { schoolEndpoint } from './schoolEndpoint.mjs';

const CONFIG_KEY = 'training_app_cloud_config';
const STAFF_KEY = 'training_app_staff_list_v1';
const SCHOOL_KEY = 'training_app_last_school';

const read = (key: string): string | null => {
  try { return localStorage.getItem(key); } catch { return null; }
};

const write = (key: string, value: string) => {
  try { localStorage.setItem(key, value); } catch { /* This browser can still use the current connection in memory. */ }
};

const matchingConnection = (endpoint: string) => {
  try {
    const config = JSON.parse(read(CONFIG_KEY) || '{}');
    return schoolEndpoint(endpoint) && schoolEndpoint(config.scriptUrl) === endpoint && config.enabled === true ? config : null;
  } catch { return null; }
};

/** A legacy master key is used only by the school for which it was saved. */
export const legacyAdminKey = (endpoint: string): string => {
  const config = matchingConnection(endpoint);
  return typeof config?.adminKey === 'string' ? config.adminKey.trim() : '';
};

export const saveLegacyConnection = (endpoint: string, adminKey: string) => {
  const url = schoolEndpoint(endpoint);
  if (!url || !adminKey.trim()) throw new Error('학교 주소와 기존 관리자 연결키를 확인해주세요.');
  // The old unscoped roster belongs to the previously saved school. Do not
  // adopt it on the next load merely because this new connection was saved.
  if (!matchingConnection(url)) {
    const suffix = encodeURIComponent(url);
    write(`teachersign_v4_ignore_unscoped:${suffix}`, '1');
  }
  write(CONFIG_KEY, JSON.stringify({ enabled: true, scriptUrl: url, adminKey: adminKey.trim() }));
};

/** Only roster preferences are local. Cloud sessions/signature images never fall back to local data. */
export const legacySchoolStorage = (endpoint: string, administrator: boolean) => {
  const school = schoolEndpoint(endpoint);
  const suffix = encodeURIComponent(school);
  const staffKey = `teachersign_v4_staff:${suffix}`;
  const schoolKey = `teachersign_v4_last_school:${suffix}`;
  const previousSchoolMatches = administrator && Boolean(matchingConnection(school)) && read(`teachersign_v4_ignore_unscoped:${suffix}`) !== '1';
  const valid = administrator && Boolean(school);
  return {
    hasStaffList(): boolean {
      return valid && (read(staffKey) !== null || previousSchoolMatches && read(STAFF_KEY) !== null);
    },
    getStaffList(): Staff[] {
      if (!valid) return [];
      try {
        const current = read(staffKey);
        const raw = current !== null ? current : previousSchoolMatches ? read(STAFF_KEY) : null;
        const staff = raw ? JSON.parse(raw) : [];
        const result = Array.isArray(staff) ? staff.filter(item => item && typeof item.id === 'string' && typeof item.name === 'string' && typeof item.department === 'string') : [];
        if (current === null && previousSchoolMatches && raw !== null) write(staffKey, JSON.stringify(result));
        return result;
      } catch { return []; }
    },
    saveStaffList(staff: Staff[]) { if (valid) write(staffKey, JSON.stringify(staff)); },
    getLastSchool(): string {
      if (!valid) return '';
      const current = read(schoolKey);
      const name = current !== null ? current : previousSchoolMatches ? read(SCHOOL_KEY) || '' : '';
      if (current === null && previousSchoolMatches) write(schoolKey, name);
      return name;
    },
    saveLastSchool(name: string) { if (valid) write(schoolKey, name); },
  };
};
