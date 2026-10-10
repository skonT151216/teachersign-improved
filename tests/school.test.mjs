import test from "node:test";
import assert from "node:assert/strict";
import { Readable } from "node:stream";
import {
  createSchoolGateway,
  schoolFromUrl,
} from "../server/school-gateway.mjs";
import { createFakeDrive, createGasHarness, gasFetch } from "./gas-harness.mjs";
const A = "SCHOOL_A_TEST_0001",
  B = "SCHOOL_B_TEST_0002";
const origin = "https://teachersign.test";
const secret = "ab".repeat(32);
const password = "Fictional-School-Password-2026!";
async function call(
  handler,
  path,
  body,
  { cookie = "", csrf = "", headers = {}, parsed = false } = {},
) {
  const raw = JSON.stringify(body);
  const req = Readable.from(body === undefined ? [] : [Buffer.from(raw)]);
  Object.assign(req, {
    url: path,
    method: body === undefined ? "GET" : "POST",
    headers: {
      origin,
      "content-type": "application/json",
      cookie,
      "x-csrf-token": csrf,
      ...headers,
    },
  });
  if (parsed) req.body = body;
  const res = {
    headers: {},
    status: 0,
    setHeader(k, v) {
      this.headers[k.toLowerCase()] = v;
    },
    writeHead(status, h) {
      this.status = status;
      Object.assign(this.headers, h);
    },
    end(value) {
      this.body = JSON.parse(value);
    },
  };
  await handler(req, res);
  return res;
}
const authOpts = (login) => ({
  cookie: login.headers["set-cookie"],
  csrf: login.body.csrf,
});
const path = (route, id = A) => `${route}?school=${id}`;
async function environment() {
  const drive = createFakeDrive();
  const a = createGasHarness(A, drive);
  const b = createGasHarness(B, drive);
  const schools = new Map([
    [A, a],
    [B, b],
  ]);
  const calls = [];
  const handler = createSchoolGateway({
    secret,
    origins: [origin],
    fetchImpl: gasFetch(schools, calls),
    now: a.now,
  });
  for (const [id, gas] of schools) {
    const response = await call(handler, "/api/school/register", {
      scriptUrl: `https://script.google.com/macros/s/${id}/exec`,
      setupKey: gas.key,
      label: `학교 ${id}`,
      username: "same-admin",
      password,
    });
    assert.equal(response.status, 200);
  }
  return { handler, a, b, schools, calls, drive };
}

test('school gateway forwards authenticated migration actions and keeps actionable failures', async () => {
  const { handler, a } = await environment();
  const login = await call(handler, path('/api/auth/login'), { username: 'same-admin', password });
  const access = authOpts(login);
  const scan = await call(handler, path('/api/admin/action'), { action: 'findLegacyData' }, access);
  assert.equal(scan.status, 200); assert.equal(scan.body.data.current.sessions, 0);
  const source = a.shared.drive.createFolder('old-school').createFile('TrainingApp_DB.json', JSON.stringify({ sessions: [{ id: 'old-school-training', title: '가상 이전 연수' }] }));
  const selection = { action: 'previewLegacyData', dbFileId: source.getId(), signatureFileId: 'NONE' };
  const preview = await call(handler, path('/api/admin/action'), selection, access);
  assert.equal(preview.status, 200); assert.equal(preview.body.data.sessions, 1);
  const unauthorized = await call(handler, path('/api/admin/action'), { action: 'connectLegacyData', ticket: preview.body.data.ticket });
  assert.equal(unauthorized.status, 401);
  const done = await call(handler, path('/api/admin/action'), { action: 'connectLegacyData', ticket: preview.body.data.ticket }, { ...access, headers: { 'idempotency-key': 'migration-gateway-1234567890' } });
  assert.equal(done.status, 200); assert.equal(done.body.data.sessions, 1);
  const repeated = await call(handler, path('/api/admin/action'), selection, access);
  assert.equal(repeated.status, 409); assert.match(repeated.body.message, /ERR-MIGRATION-DONE/);
});

test("two school GAS installations on the same Drive keep file IDs, accounts and sessions separate", async () => {
  const { handler, a, b, drive } = await environment();
  for (const property of [
    "TEACHERSIGN_DB_FILE_ID",
    "TEACHERSIGN_SIGNATURE_FILE_ID",
    "TEACHERSIGN_AUTH_FILE_ID",
  ])
    assert.notEqual(a.props.get(property), b.props.get(property));
  assert.equal(
    [...drive.files.values()].filter((f) => f.name === "TrainingApp_DB.json")
      .length,
    2,
  );
  const login = await call(handler, path("/api/auth/login"), {
    username: "same-admin",
    password,
  });
  assert.equal(login.status, 200);
  assert.match(
    login.headers["set-cookie"],
    /HttpOnly; Secure; SameSite=Strict/,
  );
  assert.equal(Object.keys(a.state().sessions).length, 1);
  assert.equal(Object.keys(b.state().sessions).length, 0);
  assert.equal(
    (
      await call(
        handler,
        path("/api/auth/session", B),
        undefined,
        authOpts(login),
      )
    ).status,
    401,
  );
  assert.equal(
    (
      await call(
        handler,
        path("/api/admin/action", B),
        { action: "getAdminSessions" },
        authOpts(login),
      )
    ).status,
    401,
  );
  const stateText = JSON.stringify(a.state());
  assert.ok(!stateText.includes(password));
  assert.match(a.state().account.passwordHash, /^scrypt\$/);
  const hash = Object.keys(a.state().sessions)[0];
  assert.equal(
    a.dispatch({
      action: "schoolGateway",
      operation: "session",
      sessionToken: hash,
    }).status,
    "error",
  );
  assert.equal(
    (
      await call(handler, path("/api/auth/session"), undefined, {
        cookie: login.headers["set-cookie"].replace(/=./, "=z"),
      })
    ).status,
    401,
  );
});

test("GAS challenge proofs are single use, version bound and school specific", async () => {
  const { handler, a, b, calls } = await environment();
  const login = await call(handler, path("/api/auth/login"), {
    username: "same-admin",
    password,
  });
  assert.equal(login.status, 200);
  const proof = calls.find((c) => c.body.operation === "login").body;
  assert.equal(a.dispatch(proof).status, "error");
  assert.equal(b.dispatch(proof).status, "error");
  assert.equal(
    a.context.doGet({ parameter: proof }).getContent().includes("ERR-METHOD"),
    true,
  );
  assert.ok(!JSON.stringify(login.body).includes("token"));
  assert.ok(!JSON.stringify(login.body).includes("passwordHash"));
});

test("persistent GAS logout and idle/absolute expiry work across stateless gateway instances", async () => {
  const { handler, a, schools } = await environment();
  const second = createSchoolGateway({
    secret,
    origins: [origin],
    fetchImpl: gasFetch(schools),
    now: a.now,
  });
  const login = await call(handler, path("/api/auth/login"), {
    username: "same-admin",
    password,
  });
  const opts = authOpts(login);
  assert.equal(
    (await call(second, path("/api/auth/session"), undefined, opts)).status,
    200,
  );
  assert.equal(
    (
      await call(
        second,
        path("/api/auth/logout"),
        {},
        { ...opts, csrf: "wrong" },
      )
    ).status,
    403,
  );
  assert.equal(
    (await call(second, path("/api/auth/logout"), {}, opts)).status,
    200,
  );
  assert.equal(
    (await call(handler, path("/api/auth/session"), undefined, opts)).status,
    401,
  );
  const again = await call(handler, path("/api/auth/login"), {
    username: "same-admin",
    password,
  });
  a.advance(1800001);
  assert.equal(
    (await call(second, path("/api/auth/session"), undefined, authOpts(again)))
      .status,
    401,
  );
  const third = await call(handler, path("/api/auth/login"), {
    username: "same-admin",
    password,
  });
  for (let i = 0; i < 16; i++) {
    a.advance(1700000);
    assert.equal(
      (
        await call(
          second,
          path("/api/admin/connection"),
          {},
          authOpts(third),
        )
      ).status,
      200,
    );
  }
  a.advance(1600001);
  assert.equal(
    (await call(second, path("/api/auth/session"), undefined, authOpts(third)))
      .status,
    401,
  );
});

test("bootstrap cannot overwrite an account; direct GAS admin action requires a session and CSRF", async () => {
  const { handler, a } = await environment();
  assert.equal(
    a.dispatch({
      action: "schoolGateway",
      operation: "admin",
      name: "getAdminSessions",
      payload: {},
    }).status,
    "error",
  );
  const register = {
    scriptUrl: `https://script.google.com/macros/s/${A}/exec`,
    setupKey: a.key,
    label: "other",
    username: "attacker",
    password,
  };
  assert.equal(
    (
      await call(handler, "/api/school/register", {
        ...register,
        setupKey: "invalid-key-that-is-not-authorized-0000",
      })
    ).status,
    403,
  );
  assert.equal(
    (await call(handler, "/api/school/register", register)).status,
    409,
  );
  assert.equal(a.state().account.username, "same-admin");
  assert.equal(a.dispatch({ action: 'getAdminSessions', adminKey: a.key }).status, 'error');
  assert.equal(a.dispatch({ action: 'createSession', adminKey: a.key, session: {} }).status, 'error');
  const login = await call(handler, path("/api/auth/login"), {
    username: "same-admin",
    password,
  });
  assert.equal(
    (
      await call(
        handler,
        path("/api/admin/action"),
        { action: "getAdminSessions" },
        { ...authOpts(login), csrf: "wrong" },
      )
    ).status,
    403,
  );
});

test("school CRUD, receipt retry and participant token checks use actual v5 GAS functions", async () => {
  const { handler, a, b } = await environment();
  const login = await call(handler, path("/api/auth/login"), {
    username: "same-admin",
    password,
  });
  const opts = authOpts(login);
  const incoming = {
    id: "same-session-id",
    type: "school",
    title: "격리 시험 연수",
    date: "2026-10-03",
    schoolName: "시험 학교 A",
    maxParticipants: 2,
    staffList: [{ id: "staff-1", name: "가상 교직원", department: "교무" }],
    authCode: "1234",
    createdAt: Date.now(),
    participantToken: "CLIENT_CHOSEN_NOT_ALLOWED",
  };
  const write = {
    ...opts,
    headers: { "idempotency-key": "write-id-1234567890" },
  };
  const created = await call(
    handler,
    path("/api/admin/action"),
    { action: "createSession", session: incoming },
    write,
  );
  assert.equal(created.status, 200);
  const token = created.body.data.participantToken;
  assert.notEqual(token, incoming.participantToken);
  const repeated = await call(
    handler,
    path("/api/admin/action"),
    { action: "createSession", session: incoming },
    write,
  );
  assert.deepEqual(repeated.body, created.body);
  assert.equal(
    (
      await call(
        handler,
        path("/api/admin/action"),
        { action: "createSession", session: { ...incoming, title: "changed" } },
        write,
      )
    ).status,
    409,
  );
  const sessions = await call(
    handler,
    path("/api/admin/action"),
    { action: "getAdminSessions" },
    opts,
  );
  assert.equal(sessions.body.data.length, 1);
  const bLogin = await call(handler, path("/api/auth/login", B), {
    username: "same-admin",
    password,
  });
  assert.equal(
    (
      await call(
        handler,
        path("/api/admin/action", B),
        { action: "getAdminSessions" },
        authOpts(bLogin),
      )
    ).body.data.length,
    0,
  );
  const participant = {
    action: "getParticipantSession",
    sessionId: incoming.id,
    participantToken: token,
    authCode: "",
  };
  const locked = await call(handler, path("/api/participant"), participant);
  assert.equal(locked.body.data.staffList.length, 0);
  assert.equal(locked.body.data.authCode, undefined);
  assert.equal(locked.body.data.participantToken, undefined);
  assert.equal(
    (
      await call(handler, path("/api/participant"), {
        ...participant,
        participantToken: "wrong",
      })
    ).status,
    403,
  );
  assert.equal(
    (await call(handler, path("/api/participant", B), participant)).status,
    400,
  );
  const signed = await call(
    handler,
    path("/api/participant"),
    {
      action: "addParticipantSignature",
      sessionId: incoming.id,
      participantToken: token,
      authCode: "1234",
      signature: {
        staffId: "staff-1",
        staffName: "Spoofed",
        department: "Spoofed",
        signatureData: "data:image/webp;base64,UklGRg==",
        timestamp: Date.now(),
      },
    },
    { headers: { "idempotency-key": "signature-id-1234567890" } },
  );
  assert.equal(signed.status, 200);
  assert.equal(signed.body.data.updatedCount, 1);
  const updated = await call(
    handler,
    path("/api/admin/action"),
    { action: "getAdminSessions" },
    opts,
  );
  assert.equal(updated.body.data[0].signatures[0].staffName, "가상 교직원");
  assert.equal(
    JSON.parse(
      b.shared.files.get(b.props.get("TEACHERSIGN_DB_FILE_ID")).content,
    ).sessions.length,
    0,
  );
});

test("account change revokes all old sessions and in-flight challenges for only that school", async () => {
  const { handler, a } = await environment();
  const first = await call(handler, path("/api/auth/login"), {
    username: "same-admin",
    password,
  });
  const second = await call(handler, path("/api/auth/login"), {
    username: "same-admin",
    password,
  });
  const other = await call(handler, path("/api/auth/login", B), {
    username: "same-admin",
    password,
  });
  const pending = a.dispatch({
    action: "schoolGateway",
    operation: "challenge",
    username: "same-admin",
  });
  assert.equal(pending.status, "success");
  const change = {
    username: "new-admin",
    password: "New-Fictional-Password-2026!",
    currentPassword: "incorrect",
    revision: 1,
  };
  assert.equal(
    (
      await call(
        handler,
        path("/api/admin/account/update"),
        change,
        authOpts(first),
      )
    ).status,
    403,
  );
  const changed = await call(
    handler,
    path("/api/admin/account/update"),
    { ...change, currentPassword: password },
    authOpts(first),
  );
  assert.equal(changed.status, 200);
  assert.equal(Object.keys(a.state().challenges).length, 0);
  for (const old of [first, second])
    assert.equal(
      (await call(handler, path("/api/auth/session"), undefined, authOpts(old)))
        .status,
      401,
    );
  assert.equal(
    (
      await call(
        handler,
        path("/api/auth/session", B),
        undefined,
        authOpts(other),
      )
    ).status,
    200,
  );
  assert.equal(
    (
      await call(handler, path("/api/auth/login"), {
        username: "new-admin",
        password: change.password,
      })
    ).status,
    200,
  );
});

test("GAS login reservations persist across instances and failed challenge replay does not bypass limits", async () => {
  const { handler, schools } = await environment();
  const second = createSchoolGateway({
    secret,
    origins: [origin],
    fetchImpl: gasFetch(schools),
  });
  const attempts = await Promise.all(
    Array.from({ length: 8 }, (_, index) =>
      call(index % 2 ? handler : second, path("/api/auth/login"), {
        username: "same-admin",
        password: "Wrong-Fictional-Password!",
      }),
    ),
  );
  assert.equal(attempts.filter((r) => r.status === 401).length, 5);
  assert.equal(attempts.filter((r) => r.status === 429).length, 3);
  assert.equal(
    (
      await call(handler, path("/api/auth/login", B), {
        username: "same-admin",
        password,
      })
    ).status,
    200,
  );
});

test("gateway fails closed without secret and rejects SSRF, unsafe redirects, cross-origin and injected admin credentials", async () => {
  assert.throws(() => schoolFromUrl("http://127.0.0.1/exec"));
  assert.throws(() =>
    schoolFromUrl("https://script.google.com.evil/macros/s/SCHOOL_TEST/exec"),
  );
  const closed = createSchoolGateway({ origins: [origin] });
  assert.equal((await call(closed, "/api/runtime")).body.ready, false);
  assert.equal((await call(closed, "/api/auth/login", {})).status, 503);
  const unsafe = createSchoolGateway({
    secret,
    origins: [origin],
    fetchImpl: async () =>
      new Response("", {
        status: 302,
        headers: { location: "http://127.0.0.1/" },
      }),
  });
  assert.equal((await call(unsafe, path("/api/school/info"), {})).status, 502);
  assert.equal(
    (
      await call(
        unsafe,
        path("/api/auth/login"),
        {},
        { headers: { origin: "https://evil.test" } },
      )
    ).status,
    403,
  );
  const { handler } = await environment();
  const login = await call(
    handler,
    path("/api/auth/login"),
    { username: "same-admin", password },
    { parsed: true },
  );
  assert.equal(login.status, 200);
  assert.equal(
    (
      await call(
        handler,
        path("/api/admin/action"),
        { action: "getAdminSessions", adminKey: "injected" },
        authOpts(login),
      )
    ).status,
    403,
  );
  assert.equal(
    (
      await call(
        handler,
        "/api/gateway?route=auth/session&school=" + A,
        undefined,
        authOpts(login),
      )
    ).status,
    200,
  );
});

test("transient GAS read failures retry once and retain safe diagnostic metadata", async () => {
  const env = await environment();
  const login = await call(env.handler, path("/api/auth/login"), { username: "same-admin", password });
  const fetchGas = gasFetch(env.schools);
  for (const failure of [
    () => { throw new TypeError("PRIVATE-UPSTREAM-NETWORK-DETAIL"); },
    () => { throw new DOMException("PRIVATE-UPSTREAM-TIMEOUT-DETAIL", "TimeoutError"); },
    () => new Response("<html>PRIVATE-UPSTREAM-BODY</html>"),
    () => new Response("PRIVATE-UPSTREAM-BODY", { status: 503 }),
  ]) {
    let attempts = 0;
    const logs = [];
    const handler = createSchoolGateway({ secret, origins: [origin], now: env.a.now,
      reportGasFailure: (details) => logs.push(details),
      fetchImpl: async (url, options) => ++attempts === 1 ? failure() : fetchGas(url, options),
    });
    const response = await call(handler, path("/api/admin/connection"), {}, authOpts(login));
    assert.equal(response.status, 200);
    assert.equal(attempts, 2);
    assert.equal(logs.length, 1);
    assert.equal(logs[0].operation, "connection");
    assert.equal(logs[0].attempt, 1);
    const logged = JSON.stringify(logs);
    for (const privateValue of [A, password, login.body.csrf, login.headers["set-cookie"], "PRIVATE-UPSTREAM"])
      assert.ok(!logged.includes(privateValue));
  }
});

test("persistent GAS failures distinguish timeout, JSON and network errors without unbounded retries", async () => {
  for (const [failure, code] of [
    [() => { throw new DOMException("timeout", "TimeoutError"); }, "ERR-GAS-TIMEOUT"],
    [() => new Response("<html>UPSTREAM-SECRET</html>"), "ERR-GAS-RESPONSE"],
    [() => { throw new TypeError("UPSTREAM-SECRET"); }, "ERR-GAS-NETWORK"],
  ]) {
    let attempts = 0;
    const handler = createSchoolGateway({ secret, origins: [origin], reportGasFailure() {},
      fetchImpl: async () => { attempts++; return failure(); },
    });
    const response = await call(handler, path("/api/school/info"), {});
    assert.equal(response.status, 502);
    assert.match(response.body.message, new RegExp(code));
    assert.ok(!JSON.stringify(response.body).includes("UPSTREAM-SECRET"));
    assert.equal(attempts, 2);
  }
});

test("lost GAS write and login responses are never automatically replayed", async () => {
  const env = await environment();
  const login = await call(env.handler, path("/api/auth/login"), { username: "same-admin", password });
  const fetchGas = gasFetch(env.schools);
  for (const operation of ["admin", "login"]) {
    let attempts = 0;
    const handler = createSchoolGateway({ secret, origins: [origin], now: env.a.now, reportGasFailure() {},
      fetchImpl: async (url, options) => {
        const body = JSON.parse(options.body);
        if (body.operation === operation) {
          attempts++;
          if (operation === "login") await fetchGas(url, options);
          throw new TypeError("Lost response");
        }
        return fetchGas(url, options);
      },
    });
    const response = operation === "admin"
      ? await call(handler, path("/api/admin/action"), { action: "deleteSession", sessionId: "fictional-session", requestId: "fictional-request-0001" }, authOpts(login))
      : await call(handler, path("/api/auth/login"), { username: "same-admin", password });
    assert.equal(response.status, 502);
    assert.equal(attempts, 1);
    assert.equal(response.headers["set-cookie"], undefined);
  }
});
