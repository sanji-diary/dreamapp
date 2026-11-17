# 꿈의숲키우기

꿈의 숲 교회 소년부(초등 4-6학년) 통합 웹앱입니다. 아이들은 미션을 하고 물방울로 나무를 키우며,
교사는 출석·교적부·심방일지·고민함을 관리합니다.

## 실행

```bash
npm install
```

```bash
npm run dev
```

`DATABASE_URL`이 없으면 `.data/` 폴더에 시험용 데이터베이스가 만들어지고 예시 데이터가 들어갑니다.
예시 아이는 `/join/demo-1` … `/join/demo-12`로 들어가며, 가입을 마친 아이의 비밀번호는 `1234`입니다.
처음부터 다시 시작하려면 다음을 실행합니다.

```bash
npm run db:reset
```

## 검사

```bash
npm test
```

```bash
npx tsc --noEmit
```

## 구조

| 위치 | 내용 |
| --- | --- |
| `migrations/` | 데이터베이스 구조 (번호 순서대로 한 번씩 적용) |
| `src/lib/db.ts` | 데이터베이스 연결. 로컬은 PGlite, 운영은 Postgres |
| `src/lib/auth.ts`, `session.ts`, `pin.ts` | 아이(QR 카드 + 비밀번호)와 교사 로그인 |
| `src/lib/authz.ts` | 교사 등급별로 볼 수 있는 범위. 모든 교사용 조회가 여기를 거칩니다 |
| `src/lib/game.ts` | 미션 완료, 주간 물방울 상한, 나무 성장, 수확 규칙 |
| `src/lib/talents.ts` | 달란트 잔치 규칙: 포인트를 달란트로 바꾸기, 결제, 취소, 조정 |
| `src/app/(kid)/` | 아이 화면 |
| `src/app/staff/` | 교사·관리자 화면 |
| `design-reference/` | 확정된 화면 시안 |

브라우저는 데이터베이스에 직접 접근하지 않고, 모든 조회와 변경이 서버를 거치며 그 안에서 권한을 검사합니다.

## 운영 환경 변수

| 이름 | 설명 |
| --- | --- |
| `DATABASE_URL` | Postgres 연결 주소 (Supabase의 Connection pooling 주소) |
| `SESSION_SECRET` | 로그인 쿠키 서명용 임의의 긴 문자열 |
| `APP_URL` | 앱 주소 (QR 카드와 카카오 로그인 돌아오는 주소에 사용) |
| `KAKAO_REST_API_KEY` | 카카오 로그인 REST API 키 |
| `KAKAO_CLIENT_SECRET` | 카카오 로그인 Client Secret (사용 설정한 경우) |
| `ADMIN_INVITE_CODE` | 새 데이터베이스에서 첫 관리자가 들어올 때 한 번 쓰는 초대 코드 |

카카오 개발자 사이트에는 Redirect URI로 `${APP_URL}/api/auth/kakao/callback`을 등록합니다.

`.env.example`을 `.env.local`로 복사해 채웁니다. 비밀 값은 저장소에 올리지 않습니다.
