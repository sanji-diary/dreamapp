# 소년부 앱에 미니게임과 물방울 연결하기

## 클로드 코드에 붙여 넣을 요청

> 이 앱에 `shepherd-coop/`의 〈한 마리 어디 갔어?〉를 미니게임으로 추가해 줘. 이 문서와 `integration/`부터 읽고 앱의 로그인, 게임 진입 화면, 물방울 지갑과 서버 트랜잭션 코드를 찾아 재사용해 줘. 각 참가자가 자기 계정으로 열고, 게임 서버에서 양 여섯 마리 완주를 확인하면 두 참가자 각각에게 물방울을 한 번씩 지급해 줘. 예제는 1개이고 실제 지급량은 앱 서버 설정에서 관리해 줘. 결과 메시지가 중복되거나 사용자가 바로 게임을 닫아도 지급이 누락되거나 중복되지 않는지 테스트해 줘. 공개 게임을 우선 연결하고 게임 자체를 수정할 때는 동봉한 소스를 사용해 줘.

## 연결 흐름

1. **각 참가자가 앱에서 게임을 열 때** 앱 서버가 로그인 세션에서 회원 ID를 읽고 `createLaunch(memberId, parentOrigin)`을 실행합니다. 앱은 응답으로 받은 `gameUrl`을 WebView 또는 iframe에 엽니다. 두 번째 친구도 자기 앱의 미니게임 화면에서 열고 방 코드를 입력합니다.
2. **게임 서버가 완주를 판정할 때** 방의 해당 라운드에서 양 여섯 마리가 모두 도착하면 각 참가자의 실행 ID에 결과가 기록됩니다. 독립 웹 플레이도 가능하지만, 회원별 지급에는 각자의 앱 실행 ID가 필요합니다.
3. **앱이 완주 메시지를 받을 때** 자기 앱 서버의 `claim`에 `launchId`와 `roundId`를 전달합니다. 앱 서버가 게임 서버에 검증을 요청하고, 원장 행 추가와 물방울 잔액 증가를 같은 DB 트랜잭션에서 수행합니다. 앱 화면에는 앱 서버가 돌려준 잔액을 표시합니다.
4. **WebView를 닫거나 앱에 다시 들어올 때** `reconcile`로 해당 회원의 실행 기록에서 최근 7일 내 완주를 다시 확인합니다. 알림을 놓치거나 응답이 끊겨도 재시도할 수 있습니다. 같은 방에서 다시 해서 완주한 경우 새 라운드로 구분됩니다.

## 가져다 쓸 코드

| 파일 | 용도 |
|---|---|
| `integration/app-rewards.mjs` | Node 앱 서버용 실행권 발행, 완주 검증, 중복 방지 원장과 예제 지갑 |
| `integration/app-routes.mjs` | 기존 앱의 로그인·CSRF 미들웨어 뒤에 연결할 Fetch 형식의 `launch`, `claim`, `reconcile` 라우트 |
| `integration/web-host.mjs` | 웹 앱용 iframe 열기와 정확한 출처·게임 창·실행 ID를 확인하는 이벤트 리스너 |

앱에 이미 물방울 지갑이 있으면 예제의 SQLite 지갑 갱신을 기존 함수로 옮깁니다. **지급 원장의 결과 ID와 (회원 ID, 라운드 ID)에 고유 제약을 두고**, 신규 원장 행이 추가된 경우에만 같은 트랜잭션에서 잔액을 올리세요. 게임 방 코드는 재사용될 수 있으므로 지급 키로 쓰지 않습니다.

### 앱 서버에 장착

```js
import { DatabaseSync } from 'node:sqlite';
import { createRewardAdapter } from './integration/app-rewards.mjs';
import { createShepherdRoutes } from './integration/app-routes.mjs';

const rewards = createRewardAdapter({
  database: new DatabaseSync('church-game-wallet.sqlite'),
  gameOrigin: 'https://dreamforest-shepherd-trail.sanji574633.chatgpt.site',
  dropsPerWin: 1
});
const handleGameRequest = createShepherdRoutes({
  rewards,
  appOrigin: APP_WEB_ORIGIN,
  authenticate: getMemberIdFromVerifiedSession
});
```

`APP_WEB_ORIGIN`은 웹 앱의 실제 출처로, `getMemberIdFromVerifiedSession`은 현재 앱의 인증 함수로 교체합니다. 자체 호스팅 시 `gameOrigin`도 새 게임 서버의 HTTPS 출처로 지정합니다. 게임 시작과 결과 확인에는 같은 게임 서버를 사용합니다.

| 앱 API | 로그인한 회원에게 하는 일 |
|---|---|
| `POST /api/minigames/shepherd/launch` | `{launchId, gameUrl}` 반환 |
| `POST /api/minigames/shepherd/claim` | 본문 `{launchId, roundId}`. 검증 후 `{status, awardedDrops, balance}` 반환 |
| `POST /api/minigames/shepherd/reconcile` | 누락된 결과 처리 후 `{awardedDrops, balance}` 반환 |

### 웹과 네이티브 화면에 장착

웹에서는 위 `launch` 응답과 iframe을 `mountShepherdGame({iframe, launch, gameOrigin, collect, onError})`에 전달합니다. `collect`는 앱 서버의 `claim`을 호출하고 잔액을 갱신하는 함수입니다. 화면을 닫을 때 반환된 정리 함수를 호출하고 `reconcile`을 진행합니다.

React Native WebView는 `onMessage`에 전달된 `nativeEvent.data`를 JSON으로 읽습니다. iOS WKWebView에서는 `DreamForestGame` 메시지 핸들러를 등록합니다. 게임 출처와 현재 실행 ID가 일치하는 메시지를 받은 뒤 앱 서버에서 확인하세요. 외부 링크 이동은 앱의 기존 WebView 정책을 적용합니다. 브리지가 없는 플랫폼도 앱으로 돌아올 때 `reconcile`로 지급할 수 있습니다.

```json
{"type":"dreamforest.minigame.completed","version":1,"gameId":"shepherd-coop","launchId":"<현재 실행 ID>","roundId":"<게임 서버의 라운드 ID>"}
```

### 다른 서버 언어로 옮길 때

- 앱 서버가 실행마다 무작위 32바이트를 만들고 64자리 소문자 hex인 `launchSecret`을 회원과 연결해 보관합니다. **원본 32바이트**를 SHA-256 해시한 소문자 hex가 `launchId`입니다.
- 게임 URL은 `/#launch=<launchId>&parentOrigin=<URL 인코딩한 웹 앱 출처>`입니다. 브라우저에는 실행 ID만 전달합니다. 회원 ID와 `launchSecret`은 앱 서버에 남습니다.
- 앱 서버는 고정된 게임 출처의 `POST /api/results/verify`에 JSON `{launchSecret, roundId}`를 보냅니다. `roundId` 생략 시 해당 실행의 결과를 조회합니다. 결과가 여러 페이지면 반환된 `nextCursor`를 다음 요청의 `after`에 넣습니다.
- 검증 응답의 `gameId`와 `results[]` 안의 `resultId`, `roundId`, `completedAt`(epoch 밀리초), `savedCount`(6)를 확인합니다. 빈 배열은 지급할 완주가 없다는 뜻입니다. 네트워크 장애는 재시도 대상으로 남깁니다.

## 적용 확인

두 계정에서 각각 미니게임을 열어 같은 방 완주 → 두 회원 잔액 각각 1 증가. 같은 결과 재요청 → 추가 지급 0. 같은 방 재도전 후 새 라운드 완주 → 다시 각 1 증가. 시간 초과 → 지급 0. 완주 직후 앱 화면을 닫고 다시 열기 → 누락분 한 번 지급. 회원 A의 실행 ID를 회원 B로 요청 → 지급 거부. 소스의 자동 테스트는 `npm test`로 실행합니다.
