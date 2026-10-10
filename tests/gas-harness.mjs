import vm from "node:vm";
import { readFileSync } from "node:fs";
import { createHash, createHmac, randomUUID } from "node:crypto";
const source = readFileSync(
  new URL("../Code.gs", import.meta.url),
  "utf8",
);
export function createFakeDrive() {
  const files = new Map();
  const sheets = new Map();
  let sequence = 0;
  const file = (name, content = "") => {
    const id = `file-${++sequence}`;
    const value = {
      id,
      name,
      content,
      getId() {
        return id;
      },
      getName: () => value.name,
      getSize: () => Buffer.byteLength(value.content),
      getLastUpdated: () => new Date(0),
      isTrashed: () => false,
      makeCopy(name, folder) {
        const copy = file(name, value.content);
        copy.moveTo(folder);
        if (sheets.has(id)) {
          const original = sheets.get(id).getSheetByName('signatures');
          spreadsheet.createCopy(copy.id, original?.getDataRange().getValues() || []);
        }
        return copy;
      },
      getBlob() {
        return { getDataAsString: () => value.content };
      },
      setContent(text) {
        value.content = text;
      },
      setName(text) {
        value.name = text;
      },
      moveTo(folder) {
        value.folder = folder.getId();
      },
    };
    files.set(id, value);
    return value;
  };
  const drive = {
    getFilesByName: name => {
      const matches = [...files.values()].filter(file => file.name === name);
      let index = 0;
      return { hasNext: () => index < matches.length, next: () => matches[index++] };
    },
    createFolder: (name) => {
      const folder = file(name);
      folder.createFile = (name, content) => {
        const child = file(name, content);
        child.moveTo(folder);
        return child;
      };
      return folder;
    },
    getFolderById: (id) => files.get(id),
    getFileById: (id) => {
      if (!files.has(id)) throw Error("Missing file");
      return files.get(id);
    },
  };
  const spreadsheet = {
    createCopy: (id, rows) => {
      const copy = spreadsheet.create('copy-temporary');
      const sheet = copy.insertSheet('signatures');
      rows.forEach(row => sheet.appendRow(row));
      sheets.delete(copy.getId());
      files.delete(copy.getId());
      sheets.set(id, { ...copy, getId: () => id });
    },
    create: (name) => {
      const f = file(name);
      const tabs = new Map();
      const sheet = {
        getId: () => f.id,
        getSheetByName: (name) => tabs.get(name),
        insertSheet: (name) => {
          const rows = [];
          const s = {
            appendRow: (row) => rows.push([...row]),
            getLastRow: () => rows.length,
            getDataRange: () => ({
              getValues: () => rows.map((row) => [...row]),
            }),
            getRange: (r, c, height = 1, width = 1) => ({
              getValues: () =>
                Array.from({ length: height }, (_, i) =>
                  Array.from(
                    { length: width },
                    (_, j) => rows[r - 1 + i]?.[c - 1 + j] || "",
                  ),
                ),
              setValues: (values) =>
                values.forEach((row, i) => {
                  rows[r - 1 + i] ||= [];
                  row.forEach(
                    (value, j) => (rows[r - 1 + i][c - 1 + j] = value),
                  );
                }),
            }),
            deleteRow: (r) => rows.splice(r - 1, 1),
          };
          tabs.set(name, s);
          return s;
        },
      };
      sheets.set(f.id, sheet);
      return sheet;
    },
    openById: (id) => sheets.get(id),
  };
  return { files, drive, spreadsheet };
}
export function createGasHarness(
  id = "school-test",
  shared = createFakeDrive(),
  options = {},
) {
  const props = new Map();
  const session = { activeEmail: '', effectiveEmail: 'installer@example.test' };
  const logs = [];
  let clock = Date.now();
  let locked = false;
  class Clock extends Date {
    static now() {
      return clock;
    }
  }
  const bytes = (value) =>
    Array.from(Buffer.isBuffer(value) ? value : Buffer.from(value), (b) =>
      b > 127 ? b - 256 : b,
    );
  const signedBuffer = (value) =>
    Array.isArray(value)
      ? Buffer.from(value.map((b) => (b + 256) % 256))
      : Buffer.from(value);
  const context = vm.createContext({
    Date: Clock,
    console: { log: message => logs.push(message) },
    Session: {
      getActiveUser: () => ({ getEmail: () => session.activeEmail }),
      getEffectiveUser: () => ({ getEmail: () => session.effectiveEmail }),
    },
    DriveApp: shared.drive,
    SpreadsheetApp: shared.spreadsheet,
    ScriptApp: { getScriptId: () => id, getService: () => ({ getUrl: () => options.webAppUrl || `https://script.google.com/macros/s/${id}/exec` }) },
    HtmlService: {
      createHtmlOutputFromFile: () => ({ getContent: () => readFileSync(new URL('../gas/standalone/Index.html', import.meta.url), 'utf8') }),
      createHtmlOutput: html => ({ getContent: () => html, setTitle() { return this; }, addMetaTag() { return this; } }),
    },
    PropertiesService: {
      getScriptProperties: () => ({
        getProperty: (k) => props.get(k),
        setProperty: (k, v) => props.set(k, v),
        setProperties: values => Object.entries(values).forEach(([k, v]) => props.set(k, v)),
      }),
    },
    LockService: {
      getScriptLock: () => ({
        waitLock: () => {
          if (locked) throw Error("Nested lock");
          locked = true;
        },
        releaseLock: () => {
          locked = false;
        },
      }),
    },
    Utilities: {
      getUuid: randomUUID,
      Charset: { UTF_8: "utf8" },
      DigestAlgorithm: { SHA_256: "sha256" },
      computeDigest: (_, value) =>
        bytes(createHash("sha256").update(value).digest()),
      computeHmacSha256Signature: (message, key) =>
        bytes(
          createHmac("sha256", signedBuffer(key))
            .update(signedBuffer(message))
            .digest(),
        ),
      newBlob: (value) => ({ getBytes: () => bytes(Buffer.from(value)) }),
    },
    ContentService: {
      MimeType: { JSON: "application/json" },
      createTextOutput: (text) => ({
        setMimeType() {
          return this;
        },
        getContent: () => text,
      }),
    },
  });
  vm.runInContext(source, context);
  if (options.initialize !== false) context.setupTeacherSign_();
  return {
    context,
    props,
    session,
    logs,
    shared,
    key: props.get("TEACHERSIGN_ADMIN_KEY"),
    now: () => clock,
    advance: (ms) => {
      clock += ms;
    },
    state: () =>
      JSON.parse(
        shared.files.get(props.get("TEACHERSIGN_AUTH_FILE_ID")).content,
      ),
    dispatch: (request) =>
      JSON.parse(
        context
          .doPost({ postData: { contents: JSON.stringify(request) } })
          .getContent(),
      ),
    rpc: request => JSON.parse(JSON.stringify(context.teacherSignRpc(request))),
  };
}
export function gasFetch(schools, calls = []) {
  return async (url, options) => {
    const id = /^https:\/\/script.google.com\/macros\/s\/([^/]+)\/exec$/.exec(
      url,
    )?.[1];
    if (!schools.has(id))
      return new Response("Missing school", { status: 404 });
    const body = JSON.parse(options.body);
    calls.push({ school: id, body });
    return new Response(JSON.stringify(schools.get(id).dispatch(body)), {
      headers: { "Content-Type": "application/json" },
    });
  };
}
