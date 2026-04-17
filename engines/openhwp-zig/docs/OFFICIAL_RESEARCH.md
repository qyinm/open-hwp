# HWP/HWPX 공식문서 조사 (2026-04-17)

## 목적

`openhwp` 구현 범위를 한글과컴퓨터 공식문서 기준으로 고정한다.

## 공식 근거 링크

- 한컴 지원센터: HWP/OWPML 형식 공개  
  https://www.hancom.com/support/downloadCenter/hwpOwpml
- 한컴 도움말: 다른 이름으로 저장하기 (`hwpx` 소개, OWPML/KS X 6101)  
  https://help.hancom.com/hoffice130/ko-KR/Hwp/file/save_as/save_as.htm
- 한컴 FAQ: HWPX는 OWPML 기반 국가표준(KS X 6101) 개방형 포맷  
  https://www.hancom.com/support/faqCenter/faq/detail/2784
- 한컴 FAQ: HWP는 바이너리 포맷, HWPX는 개방형 포맷  
  https://www.hancom.com/support/faqCenter/faq/detail/3135
- 한컴 FAQ: HWP -> HWPX 변환기 제공  
  https://www2.hancom.com/support/faqCenter/faq/detail/3128

## 조사 결론

- `HWPX`는 XML 기반 개방형 포맷이며, 프로그램으로 처리하기에 공식적으로 적합하다.
- `HWP`는 레거시 바이너리(OLE) 포맷이라 직접 편집 안정성을 확보하기 어렵다.
- 실무적으로 `HWP`는 먼저 `HWPX`로 변환하고, 이후 `HWPX`를 편집하는 경로가 안전하다.

## OpenHWP v1 설계 반영

- `text`/`replace`의 주 대상은 `HWPX`.
- `replace`는 `Contents/section*.xml`만 수정해 문서 메타/설정 파손 리스크를 줄인다.
- `HWP` 직접 편집은 미지원으로 고정하고, 변환 후 편집만 안내한다.
- `HWP -> HWPX`는 한컴 계열 변환기(외부 실행파일) 호출 방식으로 연결한다.

## 향후 확장

- OWPML 스키마 기반 정식 XML 파서 도입
- run 단위 치환(현재는 단순 문자열 치환)
- `HWP` 파서가 필요하다면 별도 모듈로 분리하고 포맷 테스트셋 구축 후 단계적 지원
