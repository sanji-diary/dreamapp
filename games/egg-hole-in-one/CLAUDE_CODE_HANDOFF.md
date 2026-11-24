# 소년부 앱에 달걀 홀인원 연결하기

## Claude Code에 붙여넣을 요청문

```text
현재 열려 있는 소년부 앱에 부활절 1인 미니게임 〈달걀 홀인원〉을 추가해 줘.
GitHub에서 이 게임의 소스를 읽고, 이 문서와 같은 폴더의 integration/을 참고해 줘.
소년부 앱 저장소는 sanji-diary/dreamapp이야. 새 판에 rulesVersion: 2를 사용하고,
학생 계정이 접속할 수 있는 앱의 호스팅에서 게임 화면과 결과 검증 API를 제공해 줘.
앱의 기존 로그인, 미니게임 메뉴, WebView나 웹 게임 화면, 물방울 지갑과 적립 내역을 찾아 재사용해 줘.
이전 양떼 게임 연동이 있으면 같은 진입·복귀 흐름을 따르고 게임 ID는 egg-hole-in-one으로 구분해 줘.
로그인한 회원이 세 코스에서 2골, 2골, 1골을 넣으면 게임 서버가 검증한 결과로 물방울을 적립해 줘.
앱에 정해진 지급 규칙이 있으면 그 규칙을 적용하고, 없으면 완주 1판당 1개를 기본값으로 삼아 줘.
완주 메시지가 두 번 오거나 앱을 닫고 다시 열어도 같은 판은 한 번만 적립되어야 해.
독립 실행한 판과 미완주한 판에는 적립하지 말고, 돌아온 회원에게 실제 적립 결과와 잔액을 보여 줘.
코드를 실제로 수정하고 정상 완주, 미완주, 중복, 앱 복귀, 다른 회원으로 청구하는 경우를 검증해 줘.
```

## 연동 순서

1. 앱의 인증된 백엔드가 `POST /api/minigames/egg-hole-in-one/launch`를 처리합니다. 로그인 세션에서 회원 ID를 읽고 실행 전용 비밀값 32바이트를 생성합니다. 비밀값은 앱 서버에 보관합니다. 공개 실행 ID는 비밀값 **원본 바이트**의 SHA-256 소문자 16진수입니다.
2. 앱은 응답의 `gameUrl`을 WebView나 iframe에서 엽니다. 게임 주소의 fragment에는 공개 실행 ID와 웹 부모의 origin만 담깁니다. 기존 Sites 주소는 소유자용 미리보기입니다. 앱 서버 설정의 `gameOrigin`에는 게임 화면과 결과 검증 API를 제공하는 학생용 HTTPS 호스트를 지정합니다.
3. 게임은 `POST /api/rounds`에 `rulesVersion: 2`를 보내 티켓을 받고, 끝나면 샷들을 `POST /api/rounds/{roundId}/finish`로 제출합니다. 서버는 티켓에 저장된 규칙과 코스별 현재 득점으로 바구니 위치와 탄도를 다시 계산합니다. 새 판의 담 너머 코스는 직행과 쿠션 샷을 모두 인정합니다. 세 코스를 완주하면 결과 ID를 발급합니다. 두 번 빗나간 뒤에는 도움의 크기가 같아 검증 기록은 각 골당 처음 두 번의 실패와 성공 샷만 보관합니다. 자체 호스팅 중이라면 배포할 때 `drizzle/0001_course_rules.sql`까지 적용하세요. 업데이트 전에 시작한 판은 원래 규칙으로 이어집니다.
4. 게임이 앱으로 보내는 완료 메시지는 결과 조회를 시작하는 신호입니다. 형식은 아래와 같습니다. 웹에서는 `integration/web-host.mjs`가 origin과 iframe 창을 확인합니다. React Native는 받은 JSON 문자열을 파싱하고 iOS WKWebView는 `DreamForestGame` 메시지 핸들러로 받은 사전을 읽습니다. 진행 중인 launchId, gameId, version을 대조해 로그인된 앱의 `claim`을 호출합니다.
5. 앱 서버는 해당 회원에게 발급한 비밀값으로 게임 서버의 `POST /api/results/verify`에 `{launchSecret, roundId}`를 보냅니다. 응답의 gameId와 결과의 completedStages·goals를 확인하고, 고유한 완주 원장 기록과 기존 물방울 지갑 증가를 같은 DB 트랜잭션에서 처리합니다. 지급 수량은 앱 서버에서 정합니다.
6. 앱으로 복귀하거나 다음에 로그인하면 해당 회원의 `reconcile`을 호출합니다. 결과가 저장된 직후 앱을 닫아 완료 신호를 놓쳐도 다시 조회할 수 있습니다. 게임 서버의 결과 보관 기간은 완주 후 90일이며 시작한 판은 24시간 동안 유효합니다. 네트워크 재시도에는 원래의 launchId와 roundId를 사용합니다.

```json
{
  "type": "dreamforest.minigame.completed",
  "version": 1,
  "gameId": "egg-hole-in-one",
  "launchId": "<앱이 발급한 공개 실행 ID>",
  "roundId": "<게임 서버가 발급한 판 ID>"
}
```

## 참고 구현과 지급 정책

`integration/app-routes.mjs`의 `createEggRoutes`에 앱 세션 인증 함수를 연결합니다. 경로의 접두어는 `/api/minigames/egg-hole-in-one/`이며 `launch`, `claim`, `reconcile`은 모두 POST입니다. 앱의 기존 인증 및 CSRF 보호를 적용합니다. `integration/app-rewards.mjs`의 `createRewardAdapter`는 Node/SQLite용 실행 예제로, 기본 수량 `dropsPerWin`은 1입니다. `integration/web-host.mjs`의 `mountEggGame`은 웹 화면에 쓰는 예제입니다.

이 예제는 `egg_app_launches`와 `egg_app_reward_ledger`에 실행과 적립을 기록합니다. 지난 양떼 게임의 SQLite 예제와 같은 DB를 쓰면 두 게임이 같은 `shepherd_app_wallets` 잔액을 사용합니다. 실제 앱이 자체 지갑을 갖고 있으면 그 지갑의 기존 쓰기 경로와 적립 내역에 통합하세요. 통합 원장에서 `(game_id,result_id)`의 유니크 제약과 회원별 중복 방지를 유지하세요. 일일 횟수 제한 등 기존 정책도 같은 트랜잭션 안에서 적용합니다.

## 검수할 사용자 흐름

- 로그인한 회원이 앱에서 열고 완주하면 지급 내역 한 건과 새 잔액이 보입니다.
- 1·2코스만 마치고 나간 판과 일반 웹 링크에서 혼자 완주한 판은 앱 잔액이 그대로입니다.
- 같은 판으로 재요청하거나 두 번 연속 완료 메시지를 받아도 총 지급은 한 번입니다.
- 완주 결과를 저장한 뒤 앱을 닫았다가 다시 열면 미수령 내역이 반영됩니다.
- 다른 회원의 실행 ID로 청구하면 적립되지 않습니다. 다시하기로 완주한 새 판은 앱의 보상 정책을 따릅니다.

