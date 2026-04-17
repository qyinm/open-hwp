# GUI Interface Workspace

GUI는 직접 문서 포맷을 처리하지 않고 `engine-interface-v1` 계약으로 Zig engine을 호출한다.

## 책임

1. 파일 선택/미리보기/편집 UX
2. `workbench export/apply` 기반 편집 세션 관리
3. 변환 (`convert`)과 저장 파이프라인 orchestration

## 호출 기준

- 계약 문서: [engine-interface-v1.md](/Users/hippoo/Desktop/01_projects/05_zero2one/openhwp/contracts/engine-interface-v1.md)
- engine 루트: `/Users/hippoo/Desktop/01_projects/05_zero2one/openhwp/engines/openhwp-zig`

## 다음 작업

- GUI 프레임워크 선택 (예: Tauri/Electron/Native)
- engine 호출 어댑터 구현 (process spawn + stdout/stderr handling)
- workbench session 에디터 UI 구현
