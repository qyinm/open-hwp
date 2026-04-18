# OpenHWP Monorepo

`OpenHWP`를 모노레포로 운영합니다.

- `engine`: Zig 기반 문서 처리 코어
- `interfaces`: Desktop/TUI 같은 사용자 인터페이스 레이어
- `contracts`: engine-interface 간 안정 계약

## 구조

- `engines/openhwp-zig`: 현재 동작하는 Zig engine
- `interfaces/desktop`: Electron + React 기반 Desktop 인터페이스
- `interfaces/tui`: TUI 인터페이스 워크스페이스(스켈레톤)
- `contracts/engine-interface-v1.md`: engine 호출 계약

## 빠른 시작 (Engine)

```bash
cd engines/openhwp-zig
zig build
./zig-out/bin/openhwp info sample.hwpx
```

## 설계 원칙

1. 인터페이스는 `contracts/engine-interface-v1.md`만 의존한다.
2. Zig engine 내부 구현 변경은 인터페이스 계약을 깨지 않는 범위에서 자유롭게 한다.
3. GUI/TUI는 동일한 계약을 공유해 교체 가능성을 유지한다.
