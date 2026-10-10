import {
  createCipheriv,
  createDecipheriv,
  createHash,
  createHmac,
  randomBytes,
} from "node:crypto";
import { hashPassword } from "./auth.mjs";

const COOKIE = "__Host-teachersign_school_session";
const digest = (value) => createHash("sha256").update(value).digest("hex");
const schoolPattern = /^[A-Za-z0-9_-]{10,200}$/;
const adminActions = new Set([
  "getAdminSessions",
  "findLegacyData",
  "previewLegacyData",
  "connectLegacyData",
  "createSession",
  "deleteSession",
  "addSignatureBatch",
  "removeSignatureBatch",
]);
const participantActions = new Set([
  "getParticipantSession",
  "addParticipantSignature",
]);
const error = (status, message) =>
  Object.assign(new Error(message), { status });
export function schoolFromUrl(value) {
  const match =
    /^https:\/\/script\.google\.com\/macros\/s\/([A-Za-z0-9_-]{10,200})\/exec$/.exec(
      value || "",
    );
  if (!match)
    throw error(
      400,
      "[ERR-URL] 배포된 Google Apps Script /exec 주소를 확인하세요.",
    );
  return match[1];
}
export function createSchoolGateway({
  secret,
  origins = [],
  fetchImpl = fetch,
  now = Date.now,
  reportGasFailure = (details) =>
    console.warn("[teachersign:gas]", JSON.stringify(details)),
} = {}) {
  const ready = typeof secret === "string" && /^[a-f0-9]{64}$/.test(secret);
  const key = ready ? Buffer.from(secret, "hex") : null;
  const cookie = (value) =>
    `${COOKIE}=${value}; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=${value ? 28800 : 0}`;
  function seal(value) {
    const iv = randomBytes(12);
    const cipher = createCipheriv("aes-256-gcm", key, iv);
    const encrypted = Buffer.concat([
      cipher.update(JSON.stringify(value)),
      cipher.final(),
    ]);
    return Buffer.concat([iv, cipher.getAuthTag(), encrypted]).toString(
      "base64url",
    );
  }
  function open(value = "") {
    try {
      const raw = value
        .split(";")
        .map((s) => s.trim())
        .find((s) => s.startsWith(COOKIE + "="))
        ?.slice(COOKIE.length + 1);
      if (!raw || raw.length > 1000 || !ready) return null;
      const packed = Buffer.from(raw, "base64url");
      const decipher = createDecipheriv(
        "aes-256-gcm",
        key,
        packed.subarray(0, 12),
      );
      decipher.setAuthTag(packed.subarray(12, 28));
      const session = JSON.parse(
        Buffer.concat([
          decipher.update(packed.subarray(28)),
          decipher.final(),
        ]).toString(),
      );
      if (
        !schoolPattern.test(session.school) ||
        !/^[A-Za-z0-9_-]{43}$/.test(session.token) ||
        session.expiresAt <= now()
      )
        return null;
      return session;
    } catch {
      return null;
    }
  }
  async function gas(school, operation, payload = {}) {
    const readOnly =
      ["info", "session", "connection", "account"].includes(operation) ||
      (operation === "admin" && ["getAdminSessions", "findLegacyData"].includes(payload.name)) ||
      (operation === "participant" && payload.name === "getParticipantSession");
    for (let attempt = 1; attempt <= (readOnly ? 2 : 1); attempt++) {
      try {
        return await gasAttempt(school, operation, payload);
      } catch (e) {
        // Never log URLs, upstream bodies, credentials, challenges or session tokens.
        if (e.gasFailure)
          reportGasFailure({ operation, attempt, ...e.gasFailure });
        if (!readOnly || attempt === 2 || !e.retryable) throw e;
      }
    }
  }
  async function gasAttempt(school, operation, payload = {}) {
    if (!schoolPattern.test(school || ""))
      throw error(400, "[ERR-SCHOOL] 학교 접속 링크를 확인하세요.");
    const migration = operation === "admin" && ["findLegacyData", "previewLegacyData", "connectLegacyData"].includes(payload.name);
    const timeout = AbortSignal.timeout(migration ? 90_000 : 25_000);
    let url = `https://script.google.com/macros/s/${school}/exec`;
    let options = {
      method: "POST",
      redirect: "manual",
      credentials: "omit",
      headers: { "Content-Type": "text/plain;charset=utf-8" },
      body: JSON.stringify({ ...payload, action: "schoolGateway", operation }),
      signal: timeout,
    };
    let response;
    let phase = "request";
    const started = Date.now();
    try {
      for (let hop = 0; hop < 3; hop++) {
        response = await fetchImpl(url, options);
        if (![301, 302, 303, 307, 308].includes(response.status)) break;
        const redirect = new URL(response.headers.get("location"), url);
        // Google ContentService returns a GET-only, one-time googleusercontent URL.
        if (
          !["301", "302", "303"].includes(String(response.status)) ||
          redirect.protocol !== "https:" ||
          redirect.hostname !== "script.googleusercontent.com" ||
          redirect.port ||
          redirect.username ||
          redirect.password ||
          redirect.pathname !== "/macros/echo"
        )
          throw Object.assign(error(
            502,
            "[ERR-GAS] Google 웹앱 배포 권한과 응답을 확인하세요.",
          ), { gasFailure: { kind: "redirect", phase, status: response.status } });
        url = redirect.href;
        options = {
          method: "GET",
          redirect: "manual",
          credentials: "omit",
          signal: timeout,
        };
      }
      if (!response?.ok)
        throw Object.assign(
          error(502, "[ERR-GAS] 학교 Google 서버에 연결하지 못했습니다. 잠시 후 다시 시도하세요."),
          {
            retryable: [429, 500, 502, 503, 504].includes(response?.status),
            gasFailure: { kind: "http", phase, status: response?.status },
          },
        );
      // Cap data before parsing; arbitrary upstream pages are never forwarded.
      phase = "body";
      const reader = response.body?.getReader();
      let text = "";
      if (reader) {
        const decoder = new TextDecoder();
        let size = 0;
        for (;;) {
          const { done, value } = await reader.read();
          if (done) break;
          size += value.length;
          if (size > 8_000_000) {
            await reader.cancel();
            throw error(502, "[ERR-SIZE] 학교 서버 응답이 너무 큽니다.");
          }
          text += decoder.decode(value, { stream: true });
        }
        text += decoder.decode();
      } else text = await response.text();
      phase = "json";
      const result = JSON.parse(text);
      if (!result || typeof result !== "object" || Array.isArray(result) ||
          !["success", "error"].includes(result.status))
        throw Object.assign(error(502, "[ERR-GAS-RESPONSE] 학교 GAS 응답 형식이 다릅니다. v5 배포 버전을 확인하세요."), {
          gasFailure: { kind: "format", phase, status: response.status },
        });
      if (result.status !== "success") {
        const code = /^\[ERR-([A-Z-]+)\]/.exec(result.message || "")?.[1];
        const messages = {
          AUTH: [
            401,
            "[ERR-AUTH] 학교 관리자 세션이 만료되었습니다. 다시 로그인하세요.",
          ],
          LOGIN: [401, "[ERR-LOGIN] 아이디 또는 암호가 일치하지 않습니다."],
          LIMIT: [
            429,
            "[ERR-LIMIT] 요청이 많습니다. 잠시 후 다시 시도하세요. 로그인은 15분 동안 5회로 제한됩니다.",
          ],
          CSRF: [403, "[ERR-CSRF] 로그인 상태를 다시 확인하세요."],
          ACCOUNT: [
            403,
            "[ERR-ACCOUNT] 현재 암호 또는 계정 설정을 확인하세요.",
          ],
          "ACCOUNT-EXISTS": [
            409,
            "[ERR-ACCOUNT-EXISTS] 이 학교는 이미 설정되었습니다. 학교 링크로 로그인하세요.",
          ],
          CONFLICT: [
            409,
            "[ERR-CONFLICT] 설정이 변경되었습니다. 다시 로그인하세요.",
          ],
          "ADMIN-KEY": [
            403,
            "[ERR-ADMIN-KEY] 학교 관리자 연결키를 확인하세요.",
          ],
          "SCHOOL-SETUP": [
            409,
            "[ERR-SCHOOL-SETUP] v5 시험용 GAS에서 setupTeacherSign을 실행하고 학교 계정을 설정하세요.",
          ],
          "PARTICIPANT-CODE": [
            403,
            "[ERR-PARTICIPANT-CODE] 참여 인증번호를 확인하세요.",
          ],
          "PARTICIPANT-LINK": [
            403,
            "[ERR-PARTICIPANT-LINK] 유효한 학교 참여 QR로 접속하세요.",
          ],
          "FULL-01": [409, "[ERR-FULL] 참가 가능 인원을 초과했습니다."],
          RETRY: [409, "[ERR-RETRY] 요청 식별자와 내용을 확인하세요."],
          ACTION: [400, "[ERR-ACTION] 최신 학교 GAS를 배포한 뒤 다시 시도하세요."],
          "MIGRATION-SOURCE": [400, "[ERR-MIGRATION-SOURCE] 기존 연수·서명 파일을 확인해 선택하세요."],
          "MIGRATION-NOT-EMPTY": [409, "[ERR-MIGRATION-NOT-EMPTY] 현재 자료가 있어 중단했습니다. 두 자료를 보존한 뒤 별도 병합이 필요합니다."],
          "MIGRATION-DONE": [409, "[ERR-MIGRATION-DONE] 이미 자료를 연결했습니다. 연수 목록을 확인하세요."],
          "MIGRATION-PREVIEW": [409, "[ERR-MIGRATION-PREVIEW] 확인이 만료되었거나 자료가 바뀌었습니다. 선택한 자료 확인을 다시 누르세요."],
          "MIGRATION-COPY": [409, "[ERR-MIGRATION-COPY] 백업·복사 검증에 실패하여 기존 연결을 유지했습니다."],
          "MIGRATION-FILE": [400, "[ERR-MIGRATION-FILE] 휴지통 여부와 파일 크기를 확인하세요."],
          "MIGRATION-DB": [400, "[ERR-MIGRATION-DB] 기존 연수 JSON 형식을 확인하세요."],
          "MIGRATION-SHEET": [400, "[ERR-MIGRATION-SHEET] 같은 학교의 서명 파일인지 확인하세요."],
        };
        throw error(
          ...(messages[code] || [
            400,
            "[ERR-GAS] 학교 저장소에서 요청을 처리하지 못했습니다. 설치·입력 정보를 확인하세요.",
          ]),
        );
      }
      return result.data;
    } catch (e) {
      if (e.status) throw e;
      const timedOut = timeout.aborted || e.name === "TimeoutError" || e.name === "AbortError";
      const invalidJson = phase === "json" && e instanceof SyntaxError;
      throw Object.assign(error(502, timedOut
        ? "[ERR-GAS-TIMEOUT] 학교 Google 서버 응답이 지연되었습니다. 잠시 후 다시 시도하세요."
        : invalidJson
          ? "[ERR-GAS-RESPONSE] 학교 GAS가 JSON 대신 다른 화면을 반환했습니다. 웹앱 공개 접근과 배포 버전을 확인하세요."
          : "[ERR-GAS-NETWORK] 학교 Google 서버와 통신하지 못했습니다. 잠시 후 다시 시도하세요."), {
        retryable: true,
        gasFailure: { kind: timedOut ? "timeout" : invalidJson ? "json" : "network", phase, elapsedMs: Date.now() - started },
      });
    }
  }
  return async function handler(req, res) {
    res.setHeader("Cache-Control", "no-store, private, max-age=0");
    res.setHeader("X-Content-Type-Options", "nosniff");
    res.setHeader("Referrer-Policy", "no-referrer");
    const send = (status, value) => {
      res.writeHead(status, {
        "Content-Type": "application/json; charset=utf-8",
      });
      res.end(JSON.stringify(value));
    };
    try {
      const url = new URL(req.url, "http://gateway.invalid");
      const path =
        url.pathname === "/api/gateway"
          ? "/api/" + (url.searchParams.get("route") || "")
          : url.pathname;
      if (req.method === "GET" && path === "/api/runtime")
        return send(200, { mode: "gas", ready });
      if (!ready)
        throw error(
          503,
          "[ERR-SETUP] Vercel에 학교 로그인용 서버 설정이 필요합니다.",
        );
      const school = url.searchParams.get("school");
      if (path === "/api/auth/session" && req.method === "GET") {
        const session = open(req.headers.cookie);
        if (!session || session.school !== school)
          throw error(401, "[ERR-AUTH] 학교 관리자 로그인이 필요합니다.");
        return send(
          200,
          await gas(school, "session", { sessionToken: session.token }),
        );
      }
      if (req.method !== "POST")
        throw error(404, "[ERR-ROUTE] 요청을 찾을 수 없습니다.");
      if (
        !origins.includes(req.headers.origin) ||
        req.headers["sec-fetch-site"] === "cross-site"
      )
        throw error(403, "[ERR-ORIGIN] 같은 앱에서 다시 요청하세요.");
      if (!/^application\/json(?:;|$)/i.test(req.headers["content-type"] || ""))
        throw error(415, "[ERR-FORMAT] JSON 요청이 필요합니다.");
      let body;
      if (req.body !== undefined) {
        const raw =
          typeof req.body === "string" ? req.body : JSON.stringify(req.body);
        if (Buffer.byteLength(raw) > 2_000_000)
          throw error(413, "[ERR-SIZE] 요청 크기를 초과했습니다.");
        body = JSON.parse(raw);
      } else {
        const chunks = [];
        let size = 0;
        for await (const chunk of req) {
          size += chunk.length;
          if (size > 2_000_000)
            throw error(413, "[ERR-SIZE] 요청 크기를 초과했습니다.");
          chunks.push(chunk);
        }
        try {
          body = JSON.parse(Buffer.concat(chunks).toString());
        } catch {
          throw error(400, "[ERR-JSON] 요청 형식을 확인하세요.");
        }
      }
      if (!body || typeof body !== "object" || Array.isArray(body))
        throw error(400, "[ERR-JSON] 요청 형식을 확인하세요.");
      const credentials = () => {
        if (
          !/^[A-Za-z0-9_.@-]{3,64}$/.test(body.username || "") ||
          typeof body.password !== "string" ||
          body.password.length < 12 ||
          body.password.length > 256
        )
          throw error(
            400,
            "[ERR-ACCOUNT] 아이디는 영문·숫자 3~64자, 암호는 12~256자로 입력하세요.",
          );
      };
      if (path === "/api/school/register") {
        credentials();
        const id = schoolFromUrl(body.scriptUrl);
        if (
          typeof body.setupKey !== "string" ||
          body.setupKey.length < 32 ||
          body.setupKey.length > 256 ||
          typeof body.label !== "string" ||
          !body.label.trim() ||
          body.label.length > 80
        )
          throw error(400, "[ERR-SCHOOL] 학교 이름과 연결키를 확인하세요.");
        await gas(id, "bootstrap", {
          setupKey: body.setupKey,
          username: body.username,
          label: body.label,
          passwordHash: await hashPassword(body.password),
        });
        return send(200, { school: id });
      }
      if (path === "/api/school/info")
        return send(200, await gas(school, "info"));
      if (path === "/api/auth/login") {
        credentials();
        const challenge = await gas(school, "challenge", {
          username: body.username,
        });
        if (
          !/^[a-f0-9]{32}$/.test(challenge.salt || "") ||
          !/^[a-f0-9]{64}$/.test(challenge.nonce || "") ||
          !Number.isSafeInteger(challenge.revision)
        )
          throw error(502, "[ERR-GAS] 학교 인증 형식이 호환되지 않습니다.");
        const hash = await hashPassword(body.password, challenge.salt);
        const token = randomBytes(32).toString("base64url");
        const csrf = randomBytes(32).toString("base64url");
        const tokenHash = digest(token);
        const proof = createHmac(
          "sha256",
          Buffer.from(hash.split("$")[5], "hex"),
        )
          .update(
            JSON.stringify([
              challenge.nonce,
              body.username,
              challenge.revision,
              tokenHash,
              csrf,
            ]),
          )
          .digest("hex");
        const session = await gas(school, "login", {
          nonce: challenge.nonce,
          username: body.username,
          tokenHash,
          csrf,
          proof,
        });
        if (
          session.csrf !== csrf ||
          session.username !== body.username ||
          !Number.isSafeInteger(session.expiresAt) ||
          session.expiresAt > now() + 28860000
        )
          throw error(502, "[ERR-GAS] 학교 세션 형식을 확인하세요.");
        res.setHeader(
          "Set-Cookie",
          cookie(seal({ school, token, expiresAt: session.expiresAt })),
        );
        return send(200, session);
      }
      const participant = path === "/api/participant";
      const stored = participant ? null : open(req.headers.cookie);
      if (!participant && (!stored || stored.school !== school))
        throw error(401, "[ERR-AUTH] 해당 학교 관리자 로그인이 필요합니다.");
      const access = stored
        ? { sessionToken: stored.token, csrf: req.headers["x-csrf-token"] }
        : {};
      if (path === "/api/auth/logout") {
        const result = await gas(school, "logout", access);
        res.setHeader("Set-Cookie", cookie(""));
        return send(200, result);
      }
      if (path === "/api/admin/connection")
        return send(200, await gas(school, "connection", access));
      if (path === "/api/admin/account")
        return send(200, await gas(school, "account", access));
      if (path === "/api/admin/account/update") {
        credentials();
        if (
          typeof body.currentPassword !== "string" ||
          body.currentPassword.length > 256
        )
          throw error(400, "[ERR-ACCOUNT] 현재 암호를 입력하세요.");
        const salt = await gas(school, "accountSalt", access);
        if (!/^[a-f0-9]{32}$/.test(salt.salt || ""))
          throw error(502, "[ERR-GAS] 학교 계정 형식을 확인하세요.");
        const oldHash = await hashPassword(body.currentPassword, salt.salt);
        const passwordHash = await hashPassword(body.password);
        const message = JSON.stringify([
          "accountUpdate",
          digest(stored.token),
          body.revision,
          body.username,
          passwordHash,
        ]);
        const proof = createHmac(
          "sha256",
          Buffer.from(oldHash.split("$")[5], "hex"),
        )
          .update(message)
          .digest("hex");
        const result = await gas(school, "accountUpdate", {
          ...access,
          proof,
          username: body.username,
          passwordHash,
          revision: body.revision,
        });
        res.setHeader("Set-Cookie", cookie(""));
        return send(200, result);
      }
      if (path !== "/api/admin/action" && !participant)
        throw error(404, "[ERR-ROUTE] 지원하지 않는 요청입니다.");
      if (
        !(participant ? participantActions : adminActions).has(body.action) ||
        Object.hasOwn(body, "adminKey") ||
        Object.hasOwn(body, "scriptUrl")
      )
        throw error(403, "[ERR-ACTION] 허용되지 않는 학교 요청입니다.");
      const payload = { ...body };
      delete payload.action;
      const result = await gas(school, participant ? "participant" : "admin", {
        ...access,
        name: body.action,
        payload,
        requestId: req.headers["idempotency-key"],
      });
      return send(200, { status: "success", data: result });
    } catch (e) {
      send(e.status || 400, {
        message: e.status
          ? e.message
          : "[ERR-SERVER] 요청을 처리하지 못했습니다.",
      });
    }
  };
}
