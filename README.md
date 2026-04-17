# OpenHWP (Zig)

`openhwp`는 한글 오피스 없이 `hwp`/`hwpx` 문서를 다루기 위한 Zig CLI입니다.

이 프로젝트는 한컴 공식 문서 기준으로 `v1` 범위를 `hwpx` 편집에 집중합니다.
- `hwpx`: OWPML(KS X 6101) 기반 개방형 포맷으로 텍스트 추출/치환 지원
- `hwp`: 레거시 바이너리(OLE) 포맷으로 직접 편집 미지원

공식 근거는 [docs/OFFICIAL_RESEARCH.md](/Users/hippoo/Desktop/01_projects/05_zero2one/openhwp/docs/OFFICIAL_RESEARCH.md)에 정리했습니다.

## 지원 범위

- `info <파일>`: 파일 형식 판별
- `text <파일>`: 텍스트 추출
- `replace <파일> "<찾을문자열>" "<대체문자열>" --output <출력.hwpx>`: 텍스트 치환
- `convert <입력.hwp|hwpx> --output <출력.hwpx>`: HWPX 변환
- `workbench export <문서.hwpx> --output <세션.json>`: 사용자/agent 편집용 세션 추출
- `workbench apply <문서.hwpx> <세션.json> --output <출력.hwpx>`: 편집 세션 반영

`replace`는 `Contents/section*.xml`만 수정합니다.  
문서 메타/스타일/설정 XML은 건드리지 않아 문서 손상 위험을 줄입니다.
또한 `hp:run` 내부 `hp:t` 텍스트에서만 치환하며, run 경계를 넘는 문자열은 치환하지 않습니다.

## 제약

- `hwp` 직접 편집은 지원하지 않습니다. 먼저 `hwpx`로 변환해야 합니다.
- `.hwp -> .hwpx`는 내장 파서가 아니라 외부 변환기를 호출합니다.
  - 기본 실행명: `hwpx-converter`
  - 또는 환경변수 `OPENHWP_HWPX_CONVERTER=/절대/경로/변환기`
- 텍스트 추출은 `hp:run/hp:t` 중심이므로 표/도형/수식의 완전한 의미 보존은 아직 보장하지 않습니다.
- `unzip`, `zip`, `mktemp` 명령이 시스템에 있어야 합니다.

## 빌드 / 실행

```bash
zig build
./zig-out/bin/openhwp info sample.hwpx
./zig-out/bin/openhwp text sample.hwpx
./zig-out/bin/openhwp convert sample.hwp --output sample.hwpx
./zig-out/bin/openhwp replace sample.hwpx "기존문자" "새문자" --output sample.fixed.hwpx
./zig-out/bin/openhwp workbench export sample.hwpx --output sample.session.json
# sample.session.json 을 사용자/agent가 직접 수정
./zig-out/bin/openhwp workbench apply sample.hwpx sample.session.json --output sample.worked.hwpx
```

## 사용자/Agent 직접 편집 흐름

1. `workbench export`로 문서의 편집 가능한 텍스트 노드(`hp:run/hp:t`)를 JSON으로 추출합니다.
2. 사용자 또는 agent가 `세션.json`의 `nodes[].text`를 직접 수정합니다.
3. `workbench apply`로 수정 내용을 원본 HWPX 구조에 안전하게 반영합니다.

## 프로젝트 구조

- `src/main.zig`: CLI 진입점
- `src/formats.zig`: 포맷 감지
- `src/hwpx.zig`: HWPX 처리(압축 해제 후 섹션 XML 치환)
- `src/workbench.zig`: 사용자/agent 편집 세션 export/apply
- `src/xml_tools.zig`: XML 텍스트 추출/치환 도우미
- `src/utils.zig`: 외부 명령 실행 유틸 (`unzip`, `zip`, `mktemp`)
- `src/hwp.zig`: HWP 레거시 동작 스텁
