# 한 마리 어디 갔어?

초등부 친구 두 명이 각자 폰에서 강아지를 움직여, 5분 안에 양 여섯 마리를 꿈의숲교회로 모는 협동 게임입니다. [공개 게임](https://dreamforest-shepherd-trail.sanji574633.chatgpt.site)

**꿈의숲키우기 앱에는 이미 연결되어 있습니다.** 앱은 이 폴더의 `integration/` 예제를 쓰지 않고, 같은 약속을 앱의 미션·물방울 규칙에 맞게 다시 쓴 `src/lib/kid/hosted-game.ts`를 씁니다(앱의 `docs/HANDOFF.md` "미션게임" 참고). 이 폴더는 게임을 고칠 때 쓰는 소스이고, 앱을 빌드할 때는 들어가지 않습니다. 앱의 `test/hosted-game.test.ts`가 이 폴더의 게임 서버 코드를 그대로 돌려서 연결을 확인하므로, 게임 서버를 고치면 앱 테스트도 함께 돌려 주세요.

**다른 앱에 넣으려면** [클로드 코드 인수인계](CLAUDE_CODE_HANDOFF.md)부터 여세요. 공개 게임을 WebView로 열어 연결할 수도 있고, 이 폴더의 게임 소스를 직접 수정해 운영할 수도 있습니다.

## 내 컴퓨터에서 실행

Node.js 22.13 이상과 터미널이 필요합니다. 외부 npm 패키지 설치 없이 실행됩니다.

```sh
npm start
```

윈도우에서는 `게임 실행.cmd`를 열어도 됩니다. 같은 와이파이에 연결한 두 폰에서 터미널의 Phone 주소를 엽니다. 한 사람이 방을 만들고 다른 사람이 다섯 자리 코드로 들어갑니다. Windows 방화벽에서 접근을 물으면 두 폰이 사용하는 개인 네트워크 범위를 선택하세요.

```sh
npm test
npm run build
```

## 수정할 곳

| 바꿀 내용 | 파일 |
|---|---|
| 맵, 양의 성향, 짖기 범위, 이동 속도, 제한 시간 | `engine.mjs` · 제한 시간을 바꿀 때 `rooms.mjs`의 서버 마감과 `index.html`의 초기 표시도 함께 확인 |
| 양과 강아지 그림, 걷기와 짖기 연출 | `renderer.mjs` |
| 시작 쪽지와 조작, 결과 화면, 앱으로 보내는 완료 알림 | `client.mjs`, `index.html`, `styles.css` |
| 두 폰 사이의 이동 보간 | `motion.mjs` |
| 방과 라운드, 참가자별 완주 검증 | `rooms.mjs`, `drizzle/` |
| 앱 회원 계정과 물방울 지급 예제 | `integration/` |

로컬 서버는 `server.mjs`, 배포용 Worker 서버는 `worker.mjs`입니다. 로컬 저장 위치는 `SHEPHERD_DATA_DIR`로 지정할 수 있습니다. `npm run build`는 Worker용 결과를 `dist/server/index.js`로 만듭니다. 서버와 SQLite 호환 데이터베이스가 두 기기의 방과 결과를 공유합니다. 새 저장소로 가져간 뒤에는 해당 배포 환경의 도메인과 DB를 연결하세요.
