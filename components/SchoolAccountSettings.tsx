import React, { useEffect, useRef, useState } from "react";
import { request } from "../services/managedCloudService";
export default function SchoolAccountSettings() {
  const [account, setAccount] = useState<{
    username: string;
    revision: number;
  } | null>(null);
  const [username, setUsername] = useState("");
  const [currentPassword, setCurrent] = useState("");
  const [password, setPassword] = useState("");
  const [repeat, setRepeat] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [confirm, setConfirm] = useState(false);
  const lock = useRef(false);
  useEffect(() => {
    let active = true;
    request<{ username: string; revision: number }>("/api/admin/account", {})
      .then((value) => {
        if (active) {
          setAccount(value);
          setUsername(value.username);
        }
      })
      .catch((e) => {
        if (active) setError(e.message);
      });
    return () => {
      active = false;
    };
  }, []);
  const apply = async () => {
    if (!account || lock.current) return;
    if (password !== repeat)
      return setError("새 암호 확인이 일치하지 않습니다.");
    lock.current = true;
    setBusy(true);
    setError("");
    try {
      const value = await request("/api/admin/account/update", {
        username,
        password,
        currentPassword,
        revision: account.revision,
      });
      setCurrent("");
      setPassword("");
      setRepeat("");
      window.dispatchEvent(
        new CustomEvent("teachersign:account-changed", { detail: value }),
      );
    } catch (e) {
      setError((e as Error).message);
    } finally {
      lock.current = false;
      setBusy(false);
    }
  };
  return (
    <section className="space-y-4">
      <h2 className="text-xl font-bold">학교 관리자 계정</h2>
      <p>
        변경하면 이 학교의 모든 관리자 로그인 세션이 종료됩니다. 학교 연결과
        연수·서명 기록은 유지됩니다.
      </p>
      {!account ? (
        <p>{error || "계정 확인 중…"}</p>
      ) : (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            if (password !== repeat)
              setError("새 암호 확인이 일치하지 않습니다.");
            else setConfirm(true);
          }}
          className="space-y-4"
        >
          <label className="block">
            관리자 아이디
            <input
              required
              pattern="[A-Za-z0-9_.@\-]{3,64}"
              value={username}
              onChange={(e) => {
                setUsername(e.target.value);
                setConfirm(false);
              }}
              autoComplete="username"
              className="border p-3 rounded mt-1 w-full"
            />
          </label>
          <label className="block">
            현재 암호
            <input
              required
              type="password"
              autoComplete="current-password"
              value={currentPassword}
              onChange={(e) => {
                setCurrent(e.target.value);
                setConfirm(false);
              }}
              maxLength={256}
              className="border p-3 rounded mt-1 w-full"
            />
          </label>
          <label className="block">
            새 암호
            <input
              required
              type="password"
              autoComplete="new-password"
              value={password}
              onChange={(e) => {
                setPassword(e.target.value);
                setConfirm(false);
              }}
              minLength={12}
              maxLength={256}
              className="border p-3 rounded mt-1 w-full"
            />
          </label>
          <label className="block">
            새 암호 확인
            <input
              required
              type="password"
              autoComplete="new-password"
              value={repeat}
              onChange={(e) => {
                setRepeat(e.target.value);
                setConfirm(false);
              }}
              minLength={12}
              maxLength={256}
              className="border p-3 rounded mt-1 w-full"
            />
          </label>
          {error && (
            <p role="alert" className="text-red-700">
              {error}
            </p>
          )}
          <button
            disabled={busy}
            className="bg-indigo-700 text-white rounded p-3"
          >
            계정 변경
          </button>
          {confirm && (
            <div
              role="alertdialog"
              className="bg-amber-50 border rounded p-4 space-y-3"
            >
              <p>이 학교의 모든 관리자 세션을 종료하고 계정을 변경합니다.</p>
              <button
                type="button"
                disabled={busy}
                onClick={apply}
                className="bg-indigo-700 text-white rounded p-3"
              >
                {busy ? "변경 중…" : "변경하고 다시 로그인"}
              </button>
              <button
                type="button"
                disabled={busy}
                onClick={() => setConfirm(false)}
                className="ml-4"
              >
                취소
              </button>
            </div>
          )}
        </form>
      )}
    </section>
  );
}
