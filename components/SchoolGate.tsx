import React, { useEffect, useRef, useState } from "react";
const App = React.lazy(() => import("../App"));
const AdminGate = React.lazy(() => import("./AdminGate"));
import {
  request,
  acceptSession,
  clearPrivateSession,
  setSchoolScope,
  AdminSession,
} from "../services/managedCloudService";
import { clearPrivateState } from "../services/storageService";
import scriptCode from "../Code.gs?raw";
import { getAppParams, isGasStandalone, hasGasConnection } from '../services/gasRuntime';

const schoolId = (url: string) =>
  /^https:\/\/script\.google\.com\/macros\/s\/([A-Za-z0-9_-]{10,200})\/exec$/.exec(
    url.trim(),
  )?.[1];
const visitSchool = (id: string) => {
  clearPrivateSession();
  clearPrivateState();
  location.assign(`${location.pathname}?school=${encodeURIComponent(id)}`);
};

export default function SchoolGate() {
  const [runtime, setRuntime] = useState<{
    mode: string;
    ready: boolean;
  } | null>(null);
  const [error, setError] = useState("");
  useEffect(() => {
    let active = true;
    request<{ mode: string; ready: boolean }>("/api/runtime")
      .then((value) => {
        if (active) {
          const id = new URLSearchParams(location.search).get("school") || "";
          setSchoolScope(
            value.mode === "gas" && /^[A-Za-z0-9_-]{10,200}$/.test(id)
              ? id
              : "",
          );
          setRuntime(value);
        }
      })
      .catch(() => {
        if (active)
          setError(
            "서버에 연결하지 못했습니다. 새로고침한 뒤 다시 확인하세요.",
          );
      });
    return () => {
      active = false;
    };
  }, []);
  if (!runtime)
    return (
      <p role={error ? "alert" : "status"} className="p-12 text-center">
        {error || "서버 상태 확인 중…"}
      </p>
    );
  if (runtime.mode === "demo")
    return (
      <React.Suspense
        fallback={<p className="p-12 text-center">화면을 불러오는 중…</p>}
      >
        <AdminGate />
      </React.Suspense>
    );
  if (!runtime.ready)
    return (
      <main className="max-w-xl m-auto p-8 space-y-4">
        <h1 className="text-2xl font-bold">학교 연동 시험 준비</h1>
        <p>
          학교 로그인 서버 설정이 아직 완료되지 않았습니다. 배포 담당자가
          Vercel의 서버 환경변수를 설정한 뒤 다시 배포해야 합니다.
        </p>
        <p>가상 계정으로 실제 학교 자료에 로그인할 수 없습니다.</p>
      </main>
    );
  const id = new URLSearchParams(location.search).get("school");
  return (
    <React.Suspense
      fallback={<p className="p-12 text-center">학교 화면을 불러오는 중…</p>}
    >
      {id && /^[A-Za-z0-9_-]{10,200}$/.test(id) ? (
        <SchoolLogin school={id} />
      ) : (
        <SchoolInstallation />
      )}
    </React.Suspense>
  );
}
function SchoolInstallation() {
  const [install, setInstall] = useState(false);
  const [scriptUrl, setScriptUrl] = useState("");
  const [label, setLabel] = useState("");
  const [setupKey, setSetupKey] = useState("");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [repeat, setRepeat] = useState("");
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const lock = useRef(false);
  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (lock.current) return;
    setError("");
    const id = schoolId(scriptUrl);
    if (!id) return setError("배포한 GAS 웹앱의 /exec 주소를 입력하세요.");
    if (!install) return visitSchool(id);
    if (password !== repeat)
      return setError("새 암호 확인이 일치하지 않습니다.");
    lock.current = true;
    setBusy(true);
    try {
      const result = await request<{ school: string }>("/api/school/register", {
        scriptUrl: scriptUrl.trim(),
        label: label.trim(),
        setupKey,
        username: username.trim(),
        password,
      });
      setSetupKey("");
      setPassword("");
      setRepeat("");
      visitSchool(result.school);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      lock.current = false;
      setBusy(false);
    }
  };
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(scriptCode);
      setMessage(
        "v5 시험용 코드가 복사되었습니다. 새 GAS 프로젝트에 붙여넣으세요.",
      );
    } catch {
      setMessage("코드 복사를 사용할 수 없습니다. 코드 내려받기를 이용하세요.");
    }
  };
  const download = () => {
    const url = URL.createObjectURL(
      new Blob([scriptCode], { type: "text/plain;charset=utf-8" }),
    );
    const a = document.createElement("a");
    a.href = url;
    a.download = "TeacherSignV5.gs";
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };
  return (
    <main className="max-w-2xl mx-auto p-6 my-10 bg-white rounded-2xl shadow space-y-6">
      <h1 className="text-2xl font-bold">교직원 연수 등록부 · 학교 연결</h1>
      <p>
        학교마다 자신의 Google Drive를 사용합니다. 이미 설치했다면 학교 접속
        링크 또는 해당 GAS 주소로 로그인하세요.
      </p>
      <div className="flex gap-3">
        <button
          type="button"
          disabled={busy}
          onClick={() => {
            setInstall(false);
            setError("");
          }}
          className={`p-3 rounded ${!install ? "bg-indigo-700 text-white" : "border"}`}
        >
          설치한 학교 접속
        </button>
        <button
          type="button"
          disabled={busy}
          onClick={() => {
            setInstall(true);
            setError("");
          }}
          className={`p-3 rounded ${install ? "bg-indigo-700 text-white" : "border"}`}
        >
          새 학교 설치
        </button>
      </div>
      {install && (
        <section className="space-y-3 border rounded p-4 bg-blue-50 text-sm">
          <h2 className="font-bold text-lg">새 시험용 GAS 준비</h2>
          <ol className="list-decimal pl-5 space-y-2">
            <li>
              학교 담당자 계정으로{" "}
              <a
                className="underline"
                href="https://script.google.com/"
                target="_blank"
                rel="noreferrer"
              >
                Apps Script
              </a>
              의 새 프로젝트를 만듭니다.
            </li>
            <li>
              아래 v5 코드를 붙여넣고 저장합니다. 기존 운영 프로젝트의 코드를
              교체하지 마세요.
            </li>
            <li>
              <strong>setupTeacherSign</strong>을 실행하고 Drive·Sheets 권한을
              승인합니다. 실행 로그의 관리자 연결키를 보관합니다.
            </li>
            <li>
              웹앱으로 새 배포합니다. 실행 사용자는 설치 담당자, 접근 권한은
              무로그인 참여자와 서버가 접속할 수 있게 설정합니다. 조직에서 공개
              웹앱을 제한하면 조직 관리자에게 설치 가능 여부를 확인하세요.
            </li>
            <li>
              발급된 /exec 주소와 연결키를 아래에 입력하고 이 학교의 앱 관리자
              계정을 설정합니다.
            </li>
          </ol>
          <div className="flex gap-3">
            <button
              type="button"
              onClick={copy}
              className="bg-white border rounded p-2"
            >
              v5 GAS 코드 복사
            </button>
            <button
              type="button"
              onClick={download}
              className="bg-white border rounded p-2"
            >
              코드 내려받기
            </button>
          </div>
          {message && <p role="status">{message}</p>}
        </section>
      )}
      <form onSubmit={submit} className="space-y-4">
        <label className="block">
          학교 GAS 웹앱 주소
          <input
            required
            type="url"
            value={scriptUrl}
            onChange={(e) => setScriptUrl(e.target.value)}
            maxLength={300}
            placeholder="https://script.google.com/macros/s/…/exec"
            className="border p-3 rounded w-full mt-1"
          />
        </label>
        {install && (
          <>
            <label className="block">
              학교 이름
              <input
                required
                value={label}
                onChange={(e) => setLabel(e.target.value)}
                maxLength={80}
                className="border p-3 rounded w-full mt-1"
              />
            </label>
            <label className="block">
              학교 관리자 연결키
              <input
                required
                type="password"
                autoComplete="off"
                value={setupKey}
                onChange={(e) => setSetupKey(e.target.value)}
                minLength={32}
                maxLength={256}
                className="border p-3 rounded w-full mt-1"
              />
            </label>
            <label className="block">
              관리자 아이디
              <input
                required
                autoComplete="username"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                pattern="[A-Za-z0-9_.@\-]{3,64}"
                className="border p-3 rounded w-full mt-1"
              />
            </label>
            <p className="text-xs text-gray-600">
              아이디: 영문·숫자와 _ . @ - 사용, 3~64자
            </p>
            <label className="block">
              새 암호
              <input
                required
                type="password"
                autoComplete="new-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                minLength={12}
                maxLength={256}
                className="border p-3 rounded w-full mt-1"
              />
            </label>
            <label className="block">
              새 암호 확인
              <input
                required
                type="password"
                autoComplete="new-password"
                value={repeat}
                onChange={(e) => setRepeat(e.target.value)}
                minLength={12}
                maxLength={256}
                className="border p-3 rounded w-full mt-1"
              />
            </label>
            <p className="text-sm text-gray-600">
              연결키는 최초 계정 설정에 사용합니다. 아이디·암호는 해당
              학교에서만 사용하며 학교 자료와 계정 상태는 해당 GAS 저장소에
              보관합니다.
            </p>
          </>
        )}
        {error && (
          <p role="alert" className="text-red-700">
            {error}
          </p>
        )}
        <button
          disabled={busy}
          className="bg-indigo-700 text-white rounded p-3 disabled:opacity-50"
        >
          {busy
            ? "설정 중…"
            : install
              ? "학교 관리자 계정 만들기"
              : "이 학교로 접속"}
        </button>
      </form>
    </main>
  );
}
export function SchoolLogin({ school }: { school: string }) {
  const participant = Boolean(
    getAppParams().get("sessionId"),
  );
  const [session, setSession] = useState<AdminSession | null>(null);
  const [checking, setChecking] = useState(!participant);
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [label, setLabel] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [generation, setGeneration] = useState(0);
  const lock = useRef(false);
  const authenticated = useRef(false);
  const drop = () => {
    authenticated.current = false;
    clearPrivateSession();
    clearPrivateState();
    setSession(null);
    setPassword("");
    setGeneration((v) => v + 1);
  };
  useEffect(() => {
    let active = true;
    if (participant)
      return () => {
        active = false;
      };
    request<{ label: string }>("/api/school/info", {})
      .then((value) => {
        if (active) setLabel(value.label);
      })
      .catch((e) => {
        if (active) setError(e.message);
      });
    const verify = async () => {
      if (lock.current) return;
      try {
        const value = await request<AdminSession>("/api/auth/session");
        if (active) {
          acceptSession(value);
          authenticated.current = true;
          setSession(value);
        }
      } catch (e) {
        if (active && (e as Error).name !== "AbortError") {
          if (authenticated.current) drop();
          if (!(e as Error).message.startsWith("[ERR-AUTH]"))
            setError((e as Error).message);
        }
      } finally {
        if (active) setChecking(false);
      }
    };
    const expired = () => {
      drop();
      setError("학교 관리자 세션이 종료되었습니다. 다시 로그인하세요.");
    };
    const changed = () => {
      drop();
      setError(
        "관리자 계정을 변경했습니다. 새 아이디·암호로 다시 로그인하세요. 학교 연결과 기록은 유지됩니다.",
      );
    };
    const visible = () => {
      if (document.visibilityState === "visible") void verify();
    };
    void verify();
    const timer = setInterval(verify, 60_000);
    window.addEventListener("focus", verify);
    window.addEventListener("pageshow", verify);
    window.addEventListener("teachersign:unauthorized", expired);
    window.addEventListener("teachersign:account-changed", changed);
    document.addEventListener("visibilitychange", visible);
    return () => {
      active = false;
      clearInterval(timer);
      // Cleanup removes listeners only; StrictMode replay must not revoke shared CSRF state.
      window.removeEventListener("focus", verify);
      window.removeEventListener("pageshow", verify);
      window.removeEventListener("teachersign:unauthorized", expired);
      window.removeEventListener("teachersign:account-changed", changed);
      document.removeEventListener("visibilitychange", visible);
    };
  }, [school, participant]);
  const login = async (event: React.FormEvent) => {
    event.preventDefault();
    if (lock.current) return;
    lock.current = true;
    setBusy(true);
    setError("");
    try {
      const value = await request<AdminSession>("/api/auth/login", {
        username,
        password,
      });
      acceptSession(value);
      authenticated.current = true;
      setPassword("");
      setSession(value);
      setGeneration((v) => v + 1);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      lock.current = false;
      setBusy(false);
    }
  };
  const logout = async () => {
    if (lock.current) return;
    lock.current = true;
    setBusy(true);
    try {
      await request("/api/auth/logout", {});
      drop();
      setError("로그아웃했습니다. 학교 연결과 기록은 유지됩니다.");
    } catch {
      drop();
      setError(
        "서버의 세션 폐기를 확인하지 못했습니다. 네트워크를 확인한 후 다시 로그인하고 로그아웃하세요.",
      );
    } finally {
      lock.current = false;
      setBusy(false);
    }
  };
  return (
    <>
      <div className="bg-blue-100 text-blue-950 text-center p-2 no-print">
        {hasGasConnection() ? '교직원 연수 등록부' : '학교별 GAS 연동 시험판'}{label ? ` · ${label}` : ""}
      </div>
      {participant ? (
        <App key="participant" />
      ) : checking ? (
        <p className="p-12 text-center">학교 로그인 상태 확인 중…</p>
      ) : session ? (
        <>
          <div className="bg-slate-800 text-white p-3 flex justify-between items-center no-print">
            <span>
              {label} · {session.username}
            </span>
            <button
              type="button"
              disabled={busy}
              aria-busy={busy}
              onClick={logout}
              className="inline-flex min-w-36 items-center justify-center gap-2 bg-white text-slate-800 rounded px-4 py-2 transition duration-150 enabled:hover:bg-slate-100 enabled:active:scale-95 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-300 disabled:cursor-wait disabled:opacity-70"
            >
              {busy && (
                <span
                  aria-hidden="true"
                  className="h-4 w-4 rounded-full border-2 border-current border-t-transparent motion-safe:animate-spin"
                />
              )}
              <span aria-live="polite">
                {busy ? "로그아웃 중…" : "로그아웃"}
              </span>
            </button>
          </div>
          <App key={generation} />
        </>
      ) : (
        <main className="max-w-md mx-auto my-12 p-8 bg-white shadow rounded-2xl space-y-5">
          <h1 className="text-2xl font-bold">
            {label || "학교"} 관리자 로그인
          </h1>
          <p className="text-sm text-gray-600">
            이 페이지의 주소를 학교 접속 링크로 저장하세요. 해당 학교의 계정으로
            로그인합니다.
          </p>
          {hasGasConnection() && <p className="text-sm text-gray-600">새로고침하거나 창을 닫으면 다시 로그인합니다.</p>}
          <form onSubmit={login} className="space-y-4">
            <label className="block">
              아이디
              <input
                required
                autoComplete="username"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                maxLength={64}
                className="border rounded p-3 mt-1 w-full"
              />
            </label>
            <label className="block">
              암호
              <input
                required
                type="password"
                autoComplete="current-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                maxLength={256}
                className="border rounded p-3 mt-1 w-full"
              />
            </label>
            {error && (
              <p role="alert" className="text-red-700 text-sm">
                {error}
              </p>
            )}
            <button
              disabled={busy}
              className="bg-indigo-700 text-white p-3 rounded w-full"
            >
              {busy ? "확인 중…" : "로그인"}
            </button>
          </form>
          {!hasGasConnection() && <a className="text-indigo-700 underline" href={location.pathname}>
            다른 학교 접속·새 설치
          </a>}
        </main>
      )}
    </>
  );
}
