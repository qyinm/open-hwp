# Engine Interface v1

`interfaces/*`는 아래 CLI 계약으로 `engines/openhwp-zig`를 호출한다.

## 바이너리

- 실행 파일: `engines/openhwp-zig/zig-out/bin/openhwp`

## 명령 계약

### 1) 포맷/텍스트 조회

- `openhwp info <file>`
- `openhwp text <file>`

### 2) 변환

- `openhwp convert <input.hwp|hwpx> --output <output.hwpx>`
- `.hwp` 변환은 외부 변환기 사용:
  - 기본: `hwpx-converter`
  - override: `OPENHWP_HWPX_CONVERTER=/abs/path/converter`

### 3) 직접 치환

- `openhwp replace <file.hwpx> "<find>" "<replace>" --output <output.hwpx>`
- 범위: `Contents/section*.xml`의 `hp:run/hp:t`

### 4) 워크벤치 기반 편집

- `openhwp workbench export <file.hwpx> --output <session.json>`
- `openhwp workbench apply <file.hwpx> <session.json> --output <output.hwpx>`

## Workbench Session 스키마

```json
{
  "schema": "openhwp-workbench-v1",
  "source_document": "input.hwpx",
  "sections": [
    {
      "path": "Contents/section0.xml",
      "nodes": [
        { "text": "..." }
      ]
    }
  ]
}
```

## 오류 정책

- 인터페이스는 종료코드 non-zero를 실패로 처리한다.
- stderr 문자열은 사용자 메시지로 노출하되, 파싱 로직의 hard dependency로 사용하지 않는다.
