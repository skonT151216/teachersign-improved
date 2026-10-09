import React, { useEffect, useRef, useState } from "react";
import {
  Connection,
  DemoCheck,
  getConnection,
  updateConnection,
  disconnect,
  testDemoGoogle,
} from "../services/managedCloudService";
import { DEMO_GOOGLE } from "../server/demo-fixtures.mjs";
import DemoAccountSettings from "./DemoAccountSettings";
import SetupGuide from "./SetupGuide";
import SchoolAccountSettings from "./SchoolAccountSettings";
import ProgramUpdates from "./ProgramUpdates";
import { getSchoolScope } from "../services/managedCloudService";

export default function ServerConnection({
  onSave,
  onCancel,
  initialSection = "connection",
}: {
  onSave: () => void;
  onCancel: () => void;
  initialSection?: "connection" | "account";
}) {
  const [section, setSection] = useState<"connection" | "account" | "updates">(initialSection);
  const [connection, setConnection] = useState<Connection | null>(null);
  const [label, setLabel] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [confirmDisconnect, setConfirmDisconnect] = useState(false);
  const [setupMode, setSetupMode] = useState<"basic" | "google-demo">("basic");
  const [checks, setChecks] = useState<DemoCheck[]>([]);
  const lock = useRef(false);
  useEffect(() => {
    let active = true;
    getConnection()
      .then((value) => {
        if (active) {
          setConnection(value);
          setLabel(value.label);
          setSetupMode(value.setupMode || "basic");
        }
      })
      .catch((error) => {
        if (active) setError(error.message);
      });
    return () => {
      active = false;
    };
  }, []);
  const test = async () => {
    if (lock.current) return;
    lock.current = true;
    setBusy(true);
    setError("");
    setChecks([]);
    try {
      const result = await testDemoGoogle();
      setChecks(result.checks);
    } catch (error) {
      setError((error as Error).message);
    } finally {
      lock.current = false;
      setBusy(false);
    }
  };
  const change = async (remove: boolean) => {
    if (!connection || lock.current) return;
    lock.current = true;
    setBusy(true);
    setError("");
    try {
      const value = remove
        ? await disconnect(connection.revision)
        : await updateConnection({
            provider: "mock",
            label,
            revision: connection.revision,
            setupMode,
          });
      setConnection(value);
      setConfirmDisconnect(false);
      onSave();
    } catch (error) {
      setError((error as Error).message);
    } finally {
      lock.current = false;
      setBusy(false);
    }
  };
  if (!connection)
    return (
      <main className="max-w-xl mx-auto p-6 mt-8 bg-white rounded-xl shadow space-y-5">
        <h1 className="text-2xl font-bold">서버 연결 설정</h1>
        <p role={error ? "alert" : "status"}>
          {error || "서버 연결 설정을 불러오는 중…"}
        </p>
        <button onClick={onCancel} className="border p-3 rounded">
          돌아가기
        </button>
      </main>
    );
  if (connection.provider === "gas")
    return (
      <main className="max-w-3xl mx-auto p-6 my-8 bg-white rounded-xl shadow space-y-5">
        <div className="flex justify-between items-center">
          <h1 className="text-2xl font-bold">학교 설정</h1>
          <button onClick={onCancel} className="border rounded p-3">
            돌아가기
          </button>
        </div>
        <div className="flex flex-wrap gap-3">
          <button
            onClick={() => setSection("connection")}
            aria-pressed={section === "connection"}
            className="border rounded p-3"
          >
            Google Drive 연동
          </button>
          <button
            onClick={() => setSection("account")}
            aria-pressed={section === "account"}
            className="border rounded p-3"
          >
            관리자 계정
          </button>
          <button onClick={() => setSection("updates")} className="border rounded p-3" aria-pressed={section === "updates"}>
            프로그램 업데이트
          </button>
        </div>
        {section === "updates" ? <ProgramUpdates /> : section === "account" ? (
          <SchoolAccountSettings />
        ) : (
          <section className="space-y-4">
            <h2 className="text-xl font-bold">
              {connection.label} · Google Drive 연결
            </h2>
            <p>
              해당 학교의 GAS 저장소에 연결되어 있습니다. 로그아웃해도 연결과
              기록은 유지됩니다.
            </p>
            <label className="block">
              학교 접속 링크
              <input
                readOnly
                value={`${location.origin}${location.pathname}?school=${encodeURIComponent(getSchoolScope())}`}
                className="w-full border rounded p-3 mt-2 text-sm"
              />
            </label>
            <p className="text-sm text-gray-600">
              다른 학교는 첫 화면에서 자신의 GAS 주소로 접속합니다. 이 화면에서
              학교 저장소를 바꾸지 않습니다.
            </p>
          </section>
        )}
      </main>
    );
  return (
    <main className="max-w-3xl mx-auto p-6 my-8 bg-white rounded-xl shadow space-y-5">
      <div className="flex flex-wrap justify-between gap-3 items-center">
        <h1 className="text-2xl font-bold">초기 설정 및 관리</h1>
        <button
          disabled={busy}
          onClick={onCancel}
          className="border px-3 py-2 rounded"
        >
          돌아가기
        </button>
      </div>
      <div
        role="tablist"
        aria-label="설정 종류"
        className="flex gap-2 border-b pb-3"
      >
        <button
          role="tab"
          aria-selected={section === "connection"}
          disabled={busy}
          onClick={() => setSection("connection")}
          className={`p-3 rounded ${section === "connection" ? "bg-indigo-700 text-white" : "bg-gray-100"}`}
        >
          Google Drive 연동
        </button>
        <button
          role="tab"
          aria-selected={section === "account"}
          disabled={busy}
          onClick={() => setSection("account")}
          className={`p-3 rounded ${section === "account" ? "bg-indigo-700 text-white" : "bg-gray-100"}`}
        >
          관리자 계정
        </button>
      </div>
      {section === "account" ? (
        <DemoAccountSettings />
      ) : (
        <section className="space-y-5">
          <h2 className="text-xl font-bold">서버 연결 설정</h2>
          <p className="text-gray-600">
            연결 설정은 서버에서 관리하며 로그아웃해도 유지됩니다.
          </p>
          <p>
            저장소:{" "}
            {connection.setupMode === "google-demo"
              ? "Google Drive 연동 예시 (모의 저장소)"
              : "모의 저장소"}{" "}
            · {connection.configured ? "연결됨" : "연결 해제됨"}
          </p>
          <label className="block">
            설정 방식
            <select
              value={setupMode}
              disabled={busy}
              onChange={(event) => {
                setSetupMode(event.target.value as "basic" | "google-demo");
                setChecks([]);
              }}
              className="border rounded p-3 block mt-2 w-full"
            >
              <option value="basic">기본 모의 저장소</option>
              <option value="google-demo">Google Drive 연동 미리보기</option>
            </select>
          </label>
          <label className="block">
            저장소 이름
            <input
              value={label}
              onChange={(event) => setLabel(event.target.value)}
              maxLength={80}
              className="border p-3 rounded block mt-2 w-full"
            />
          </label>
          {setupMode === "google-demo" && (
            <div className="space-y-4 border rounded-xl bg-blue-50/40 p-4">
              <h3 className="font-bold">Google Drive 연동 과정</h3>
              <SetupGuide />
              <label className="block text-sm">
                웹앱 URL 예시
                <input
                  readOnly
                  value={DEMO_GOOGLE.scriptUrl}
                  className="border rounded p-3 block mt-2 w-full bg-gray-50 font-mono text-xs"
                />
              </label>
              <label className="block text-sm">
                관리자 연결키 예시
                <input
                  readOnly
                  type="password"
                  value={DEMO_GOOGLE.connectionKey}
                  className="border rounded p-3 block mt-2 w-full bg-gray-50"
                />
              </label>
              <p className="text-xs text-gray-600">
                이 값은 고정된 가상 예시입니다. 실제 주소·연결키는 입력할 수
                없으며, 테스트 버튼도 Google에 접속하지 않습니다.
              </p>
              <button
                disabled={busy}
                onClick={test}
                className="rounded bg-green-700 text-white p-3 disabled:opacity-50"
              >
                {busy ? "검사 중…" : "모의 연동 테스트"}
              </button>
              {checks.length > 0 && (
                <div role="status" className="space-y-2">
                  <p className="font-bold text-green-800">
                    모의 연동 검사 완료 · 실제 Google 연결 없음
                  </p>
                  <div className="grid sm:grid-cols-2 gap-2">
                    {checks.map((check) => (
                      <div
                        key={check.id}
                        className="bg-green-50 border border-green-200 rounded p-3 text-sm"
                      >
                        <strong>✓ {check.label}</strong>
                        <p className="mt-1 text-xs">{check.message}</p>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
          <p className="text-sm text-gray-600">
            운영 Google 연결 설정은 아직 활성화되지 않았습니다. 교직원 명단
            업로드는 현재 로그인 화면에서만 유지되며, 저장된 연수의 명단은
            서버에 보관됩니다.
          </p>
          {error && (
            <p role="alert" className="text-red-700">
              {error}
            </p>
          )}
          <div className="flex gap-3">
            <button
              disabled={
                busy ||
                !label.trim() ||
                (setupMode === "google-demo" && checks.length !== 4)
              }
              onClick={() => change(false)}
              className="bg-indigo-700 text-white p-3 rounded disabled:opacity-50"
            >
              저장 및 완료
            </button>
          </div>
          {connection?.configured && (
            <button
              disabled={busy}
              onClick={() => setConfirmDisconnect(true)}
              className="text-red-700 underline"
            >
              저장소 연결 해제
            </button>
          )}
          {confirmDisconnect && (
            <div
              role="alertdialog"
              aria-label="연결 해제 확인"
              className="border border-red-300 bg-red-50 p-4 rounded space-y-3"
            >
              <p>
                연결을 해제하면 참여자의 서명도 중단됩니다. 저장된 연수는
                유지됩니다.
              </p>
              <button
                disabled={busy}
                onClick={() => change(true)}
                className="bg-red-700 text-white p-2 rounded"
              >
                연결 해제 확인
              </button>
              <button
                disabled={busy}
                onClick={() => setConfirmDisconnect(false)}
                className="ml-4"
              >
                취소
              </button>
            </div>
          )}
        </section>
      )}
    </main>
  );
}
