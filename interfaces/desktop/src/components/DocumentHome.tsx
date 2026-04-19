import type { EngineStatus, RecentDocument } from "../types/document";

type DocumentHomeProps = {
  busy: boolean;
  engineStatus: EngineStatus | null;
  recentDocuments: RecentDocument[];
  onOpen: () => void;
  onOpenRecent: (path: string) => void;
};

function formatTimestamp(value: string) {
  return new Date(value).toLocaleString("ko-KR", {
    dateStyle: "medium",
    timeStyle: "short"
  });
}

export function DocumentHome({
  busy,
  engineStatus,
  recentDocuments,
  onOpen,
  onOpenRecent
}: DocumentHomeProps) {
  const statusText = !engineStatus
    ? "엔진 상태를 확인 중입니다."
    : engineStatus.engineAvailable
      ? engineStatus.converterAvailable
        ? "HWPX 편집과 HWP 가져오기를 모두 사용할 수 있습니다."
        : "HWPX 편집은 가능하지만 HWP 가져오기는 변환기 연결이 필요합니다."
      : "엔진을 찾지 못했습니다. 데스크톱 빌드 구성을 확인하세요.";

  return (
    <main className="home-shell">
      <section className="home-hero surface">
        <div>
          <p className="eyebrow">OpenHWP Desktop</p>
          <h1>문서를 열고 바로 편집하는 워크플로우</h1>
          <p className="hero-copy">
            변환/내보내기 과정을 내부로 숨기고 문서 자체를 중심에 둡니다.
          </p>
        </div>
        <div className="hero-actions">
          <button className="primary-button" onClick={onOpen} disabled={busy}>
            {busy ? "열기 중..." : "문서 열기"}
          </button>
          <p className="muted-note">지원 형식: `.hwpx` 직접 편집, `.hwp` 가져오기 후 `.hwpx`로 저장</p>
        </div>
      </section>

      <section className="home-grid">
        <article className="surface stack-gap-lg">
          <div className="section-heading">
            <div>
              <p className="eyebrow">최근 파일</p>
              <h2>최근 문서</h2>
            </div>
          </div>
          {recentDocuments.length === 0 ? (
            <p className="empty-state">아직 최근 문서가 없습니다. 첫 문서를 열어 편집을 시작하세요.</p>
          ) : (
            <div className="recent-list">
              {recentDocuments.map((entry) => (
                <button
                  key={`${entry.path}:${entry.lastOpenedAt}`}
                  className="recent-card"
                  onClick={() => onOpenRecent(entry.path)}
                  disabled={busy}
                >
                  <span className="recent-card__label">{entry.label}</span>
                  <span className="recent-card__meta">{entry.sourceFormat.toUpperCase()}</span>
                  <code className="path-code">{entry.path}</code>
                  <span className="recent-card__time">{formatTimestamp(entry.lastOpenedAt)}</span>
                </button>
              ))}
            </div>
          )}
        </article>

        <article className="surface stack-gap-md">
          <div>
            <p className="eyebrow">런타임</p>
            <h2>편집 준비 상태</h2>
          </div>
          <p className="status-copy">{statusText}</p>
          <dl className="status-list">
            <div>
              <dt>엔진</dt>
              <dd>{engineStatus?.engineAvailable ? "사용 가능" : "누락"}</dd>
            </div>
            <div>
              <dt>HWP 가져오기</dt>
              <dd>{engineStatus?.converterAvailable ? "사용 가능" : "변환기 필요"}</dd>
            </div>
          </dl>
          <details className="details-panel">
            <summary>진단</summary>
            <div className="details-panel__body">
              <p>
                <strong>엔진 경로</strong>
              </p>
              <code className="path-code">{engineStatus?.enginePath ?? "-"}</code>
              <p>
                <strong>변환기 경로</strong>
              </p>
              <code className="path-code">{engineStatus?.converterPath ?? "설정되지 않음"}</code>
            </div>
          </details>
        </article>
      </section>
    </main>
  );
}
