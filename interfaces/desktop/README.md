# Desktop Interface Workspace

Desktop 인터페이스는 `Tauri + React`로 구성하며, 문서 처리는 전부 Zig engine에 위임한다.

## 책임

1. 파일 선택/미리보기/편집 UX
2. `workbench export/apply` 기반 편집 세션 관리
3. 변환 (`convert`)과 저장 파이프라인 orchestration

## 호출 기준

- 계약 문서: [engine-interface-v1.md](/Users/hippoo/Desktop/01_projects/05_zero2one/openhwp/contracts/engine-interface-v1.md)
- engine 루트: `/Users/hippoo/Desktop/01_projects/05_zero2one/openhwp/engines/openhwp-zig`

## 개발 명령

```bash
cd /Users/hippoo/Desktop/01_projects/05_zero2one/openhwp/interfaces/desktop
npm install
npm run tauri:dev
```
