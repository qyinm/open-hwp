import { FormEvent, useEffect, useMemo, useState } from "react";
import {
  engineConvert,
  engineInfo,
  engineText,
  engineWorkbenchApply,
  engineWorkbenchExport,
  getEngineStatus,
  type EngineStatus,
  pickDocumentPath,
  pickOutputHwpxPath,
  pickSessionJsonPath
} from "./engine";

type BusyAction =
  | "status"
  | "open"
  | "info"
  | "text"
  | "convert"
  | "export"
  | "apply"
  | "pick-output"
  | "pick-session"
  | null;

export function App() {
  const [docPath, setDocPath] = useState("");
  const [docInfo, setDocInfo] = useState("");
  const [outputHwpx, setOutputHwpx] = useState("");
  const [sessionJson, setSessionJson] = useState("");
  const [outputText, setOutputText] = useState("");
  const [logs, setLogs] = useState<string[]>([]);
  const [busy, setBusy] = useState<BusyAction>(null);
  const [engineStatus, setEngineStatus] = useState<EngineStatus | null>(null);

  const appendLog = (line: string) => {
    setLogs((prev) => [line, ...prev].slice(0, 120));
  };

  const withBusy = async (action: BusyAction, fn: () => Promise<void>) => {
    setBusy(action);
    try {
      await fn();
    } catch (err) {
      appendLog(`ERROR: ${String(err)}`);
    } finally {
      setBusy(null);
    }
  };

  const refreshEngineStatus = async () => {
    await withBusy("status", async () => {
      const status = await getEngineStatus();
      setEngineStatus(status);
      appendLog(
        status.engineAvailable
          ? `ENGINE READY: ${status.enginePath}`
          : `ENGINE MISSING: ${status.enginePath}`
      );
    });
  };

  useEffect(() => {
    void refreshEngineStatus();
  }, []);

  const loadDocumentPreview = async (path: string) => {
    const [info, text] = await Promise.all([engineInfo(path), engineText(path)]);
    setDocInfo(info.trim());
    setOutputText(text);
    appendLog(`OPENED: ${path}`);
  };

  const openDocument = async () => {
    await withBusy("open", async () => {
      const selected = await pickDocumentPath();
      if (!selected) {
        appendLog("OPEN: cancelled");
        return;
      }
      setDocPath(selected);
      await loadDocumentPreview(selected);
    });
  };

  const pickOutputPath = async () => {
    await withBusy("pick-output", async () => {
      const selected = await pickOutputHwpxPath(docPath || undefined);
      if (!selected) {
        appendLog("OUTPUT PATH: cancelled");
        return;
      }
      setOutputHwpx(selected);
      appendLog(`OUTPUT PATH: ${selected}`);
    });
  };

  const pickSessionPath = async () => {
    await withBusy("pick-session", async () => {
      const selected = await pickSessionJsonPath(docPath || undefined);
      if (!selected) {
        appendLog("SESSION PATH: cancelled");
        return;
      }
      setSessionJson(selected);
      appendLog(`SESSION PATH: ${selected}`);
    });
  };

  const onInfo = async (e: FormEvent) => {
    e.preventDefault();
    if (!docPath) return;
    await withBusy("info", async () => {
      const result = await engineInfo(docPath);
      setDocInfo(result.trim());
      appendLog(result.trim());
    });
  };

  const onText = async (e: FormEvent) => {
    e.preventDefault();
    if (!docPath) return;
    await withBusy("text", async () => {
      const result = await engineText(docPath);
      setOutputText(result);
      appendLog(`TEXT: ${docPath}`);
    });
  };

  const onConvert = async (e: FormEvent) => {
    e.preventDefault();
    if (!docPath || !outputHwpx) return;
    await withBusy("convert", async () => {
      const result = await engineConvert(docPath, outputHwpx);
      appendLog(result.trim());
    });
  };

  const onExport = async (e: FormEvent) => {
    e.preventDefault();
    if (!docPath || !sessionJson) return;
    await withBusy("export", async () => {
      const result = await engineWorkbenchExport(docPath, sessionJson);
      appendLog(result.trim());
    });
  };

  const onApply = async (e: FormEvent) => {
    e.preventDefault();
    if (!docPath || !sessionJson || !outputHwpx) return;
    await withBusy("apply", async () => {
      const result = await engineWorkbenchApply(docPath, sessionJson, outputHwpx);
      appendLog(result.trim());
    });
  };

  const readySummary = useMemo(() => {
    if (!engineStatus) return "상태 확인 중...";
    if (!engineStatus.engineAvailable) return "엔진 바이너리를 찾지 못했습니다.";
    if (!engineStatus.converterAvailable) return "HWP 변환기는 아직 연결되지 않았습니다.";
    return "엔진과 HWP 변환기 모두 준비되었습니다.";
  }, [engineStatus]);

  return (
    <main className="page">
      <header className="hero">
        <h1>OpenHWP Desktop</h1>
        <p>Zig engine 기반 문서 처리 앱 — 열기, 미리보기, 변환, workbench 흐름을 한 곳에서 수행합니다.</p>
      </header>

      <section className="panel">
        <div className="panel-header">
          <h2>Runtime Status</h2>
          <button onClick={() => void refreshEngineStatus()} disabled={busy !== null}>
            {busy === "status" ? "Checking..." : "Refresh Status"}
          </button>
        </div>
        <p className="status-summary">{readySummary}</p>
        <div className="status-grid">
          <div className="status-card">
            <strong>Engine</strong>
            <span className={engineStatus?.engineAvailable ? "ok" : "warn"}>
              {engineStatus?.engineAvailable ? "Ready" : "Missing"}
            </span>
            <code>{engineStatus?.enginePath ?? "-"}</code>
            <small>{engineStatus?.usingBundledEngine ? "Bundled app resource" : "Dev / override path"}</small>
          </div>
          <div className="status-card">
            <strong>HWP Converter</strong>
            <span className={engineStatus?.converterAvailable ? "ok" : "warn"}>
              {engineStatus?.converterAvailable ? "Ready" : "Not Found"}
            </span>
            <code>{engineStatus?.converterPath ?? "PATH 또는 OPENHWP_HWPX_CONVERTER 필요"}</code>
            <small>HWP 입력은 외부 hwpx-converter가 있어야 변환 가능합니다.</small>
          </div>
        </div>
      </section>

      <section className="panel">
        <div className="panel-header">
          <h2>Document</h2>
          <button onClick={() => void openDocument()} disabled={busy !== null}>
            {busy === "open" ? "Opening..." : "Open Document"}
          </button>
        </div>
        <label htmlFor="docPath">입력 문서 경로</label>
        <input
          id="docPath"
          value={docPath}
          onChange={(e) => setDocPath(e.target.value)}
          placeholder="/absolute/path/document.hwp or .hwpx"
        />
        <div className="row">
          <button onClick={onInfo} disabled={busy !== null || !docPath}>
            {busy === "info" ? "Running..." : "Info"}
          </button>
          <button onClick={onText} disabled={busy !== null || !docPath}>
            {busy === "text" ? "Running..." : "Text Preview"}
          </button>
        </div>
        <label htmlFor="docInfo">문서 상태</label>
        <textarea id="docInfo" value={docInfo} readOnly />
      </section>

      <section className="panel">
        <div className="panel-header">
          <h2>Convert / Workbench</h2>
          <div className="row">
            <button onClick={() => void pickOutputPath()} disabled={busy !== null}>
              {busy === "pick-output" ? "Choosing..." : "Choose Output"}
            </button>
            <button onClick={() => void pickSessionPath()} disabled={busy !== null}>
              {busy === "pick-session" ? "Choosing..." : "Choose Session JSON"}
            </button>
          </div>
        </div>
        <label htmlFor="outputHwpx">출력 HWPX 경로</label>
        <input
          id="outputHwpx"
          value={outputHwpx}
          onChange={(e) => setOutputHwpx(e.target.value)}
          placeholder="/absolute/path/output.hwpx"
        />
        <label htmlFor="sessionJson">세션 JSON 경로</label>
        <input
          id="sessionJson"
          value={sessionJson}
          onChange={(e) => setSessionJson(e.target.value)}
          placeholder="/absolute/path/session.json"
        />
        <div className="row">
          <button onClick={onConvert} disabled={busy !== null || !docPath || !outputHwpx}>
            {busy === "convert" ? "Running..." : "Convert to HWPX"}
          </button>
          <button onClick={onExport} disabled={busy !== null || !docPath || !sessionJson}>
            {busy === "export" ? "Running..." : "Workbench Export"}
          </button>
          <button onClick={onApply} disabled={busy !== null || !docPath || !sessionJson || !outputHwpx}>
            {busy === "apply" ? "Running..." : "Workbench Apply"}
          </button>
        </div>
      </section>

      <section className="panel">
        <h2>Output Preview</h2>
        <textarea value={outputText} onChange={(e) => setOutputText(e.target.value)} />
      </section>

      <section className="panel">
        <h2>Logs</h2>
        <pre>{logs.join("\n")}</pre>
      </section>
    </main>
  );
}
