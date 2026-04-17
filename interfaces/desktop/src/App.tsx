import { FormEvent, useState } from "react";
import {
  engineConvert,
  engineInfo,
  engineText,
  engineWorkbenchApply,
  engineWorkbenchExport
} from "./engine";

type BusyAction = "info" | "text" | "convert" | "export" | "apply" | null;

export function App() {
  const [docPath, setDocPath] = useState("");
  const [outputHwpx, setOutputHwpx] = useState("");
  const [sessionJson, setSessionJson] = useState("");
  const [outputText, setOutputText] = useState("");
  const [logs, setLogs] = useState<string[]>([]);
  const [busy, setBusy] = useState<BusyAction>(null);

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

  const onInfo = async (e: FormEvent) => {
    e.preventDefault();
    if (!docPath) return;
    await withBusy("info", async () => {
      const result = await engineInfo(docPath);
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

  return (
    <main className="page">
      <header className="hero">
        <h1>OpenHWP Desktop</h1>
        <p>Zig engine를 호출해 HWP/HWPX 작업을 수행하는 Desktop 인터페이스</p>
      </header>

      <section className="panel">
        <h2>Document</h2>
        <label htmlFor="docPath">입력 문서 경로</label>
        <input
          id="docPath"
          value={docPath}
          onChange={(e) => setDocPath(e.target.value)}
          placeholder="/absolute/path/document.hwp or .hwpx"
        />
        <div className="row">
          <button onClick={onInfo} disabled={busy !== null}>
            {busy === "info" ? "Running..." : "Info"}
          </button>
          <button onClick={onText} disabled={busy !== null}>
            {busy === "text" ? "Running..." : "Text"}
          </button>
        </div>
      </section>

      <section className="panel">
        <h2>Convert / Workbench</h2>
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
          <button onClick={onConvert} disabled={busy !== null}>
            {busy === "convert" ? "Running..." : "Convert"}
          </button>
          <button onClick={onExport} disabled={busy !== null}>
            {busy === "export" ? "Running..." : "Workbench Export"}
          </button>
          <button onClick={onApply} disabled={busy !== null}>
            {busy === "apply" ? "Running..." : "Workbench Apply"}
          </button>
        </div>
      </section>

      <section className="panel">
        <h2>Output</h2>
        <textarea value={outputText} onChange={(e) => setOutputText(e.target.value)} />
      </section>

      <section className="panel">
        <h2>Logs</h2>
        <pre>{logs.join("\n")}</pre>
      </section>
    </main>
  );
}
