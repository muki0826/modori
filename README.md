# 모도리

사회초년생의 저축 습관을 만드는 앱. 서버 없이 GitHub Pages와 GitHub Actions만으로 동작해요.

- `site/index.html` — 앱 (한 파일)
- `site/data/live.json` — 매일 아침 자동으로 갱신되는 금리·영상·소식
- `scripts/update.mjs` — 데이터 수집 스크립트 (의존성 없음, Node 20)
- `scripts/sources.json` — 영상 검색어, 소식 피드, 키워드 설정
- `.github/workflows/update.yml` — 매일 수집 후 배포

## 처음 한 번 설정

1. 저장소 **Settings → Pages → Source**를 **GitHub Actions**로 바꿔요.
2. **Settings → Secrets and variables → Actions → New repository secret**에 키를 넣어요. 둘 다 무료예요.
   - `FSS_KEY` — 금융감독원 금융상품 한눈에 오픈 API 인증키 (https://finlife.fss.or.kr → 오픈 API → 인증키 신청)
   - `YT_KEY` — YouTube Data API v3 키 (Google Cloud Console → API 및 서비스 → YouTube Data API v3 사용 설정 → 사용자 인증 정보 → API 키)
3. **Actions → 데이터 갱신과 배포 → Run workflow**로 첫 실행을 해요.

키가 없어도 앱은 열려요. 해당 탭이 "아직 가져온 데이터가 없어요"로 보일 뿐이에요.

## 데이터 출처

- 예금·적금 금리: 금융감독원 금융상품 한눈에
- 영상: YouTube 주제별 검색 결과 (내용을 검증한 것은 아니에요)
- 소식: 대한민국 정책브리핑 부처별 RSS
