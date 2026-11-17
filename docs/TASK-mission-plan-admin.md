# 작업 지시서: 미션 계획 관리자 화면

`docs/HANDOFF.md`의 "남은 일 1번"입니다. 서버 쪽 규칙과 함수는 이미 만들어져 올라가 있고,
관리자가 그것을 쓸 화면이 없습니다. 이 문서대로 화면을 만들면 됩니다.

관리자는 전도사님(개발자가 아님)이고, 교사 중에는 연세가 있는 분도 있습니다.
화면은 단순하고 짧고 한눈에 알 수 있어야 합니다. 문구는 해요체, 전문 용어 없이 씁니다.

## 배경: 미션의 세 가지 일정 (`missions.mode`)

- `fixed` 고정 미션: 매주 나옴. 기본 4개는 주일 예배 출석(물방울 2개·20P), 이번 주 말씀 쓰기(2개·15P, 말씀은 주마다 따로 넣음), 가정예배 드리기(3개·30P), 오늘의 말씀 읽기(매일, 물방울 없이 2P).
- `pool` 순환 미션: 보관함에 넣어 두면 매주 N개(설정 `rotating_per_week`, 기본 3)가 가장 오래 안 나온 것부터 자동으로 나옴. 관리자가 그 주 것을 바꿀 수 있음.
- `dated` 기간 미션: 시작일과 끝나는 날이 있는 예전 방식.

한 주 물방울 한도는 12개, 포인트는 한도가 없습니다.

## 먼저 읽을 것

- `AGENTS.md` (이 Next.js는 예전 버전과 다릅니다. 모르는 API는 `node_modules/next/dist/docs/`에서 확인)
- `src/lib/staff/admin-plan.ts`: 화면이 부를 함수 전부
  - `weekPlan(staff, week)` → `{ week, label, current, editable, perWeek, fixed, rotating, manual, stored, pool, dated }` (`stored: false`면 `rotating`은 다음 주 이후의 미리보기이거나 지난 주의 빈 목록, `pool`의 각 미션에는 `last_used`가 있음)
  - `setWeekRotation(staff, week, missionIds)`, `resetWeekRotation(staff, week)`, `setPoolOrder(staff, missionIds)`
  - `getWeekVerses(staff, missionId, week)`, `saveWeekVerses(staff, missionId, week, { ref, verses })`, `clearWeekVerses(staff, missionId, week)`, `verseWeeks(staff, missionId, { weeks })`
  - `createDefaultFixedMissions(staff)`, `setRotatingPerWeek(staff, n)`
- `src/lib/verse.ts` (클라이언트 컴포넌트에서도 쓸 수 있음): `splitVerses`, `validateVerses`, `parseVerses`, `VERSE_MAX_COUNT`(10), `VERSE_MAX_LENGTH`(300), `VERSE_REF_MAX`(40)
- `src/lib/staff/admin-missions.ts`: `MissionInput`에 선택 항목 `mode`, `pool_order`, `verses`가 있음. `weekMissions`, `missionWeeksFrom`, `missionStats`, `weekCopyPlan`, `copyWeek`, `weeklyDropCheck`
- `src/lib/staff/actions-admin.ts`: 액션, 되돌아가기, 안내·오류 문구를 다루는 방식
- 고칠 화면: `src/app/staff/(app)/admin/missions/page.tsx`, `new/page.tsx`, `[id]/page.tsx`, `[id]/qr/page.tsx`, `src/components/staff/MissionForm.tsx`, `src/app/staff/(app)/attendance/page.tsx`, `src/components/staff/attendance/*`, `src/app/staff/(app)/admin/settings/page.tsx`
- 반드시 쓸 화면 부품: `src/components/staff/kit.tsx`, `form-kit.tsx`, `admin-kit.tsx`, `admin-widgets.tsx` (머리말의 규칙을 읽을 것), 토큰은 `src/app/globals.css`. 이미 새로 만든 관리자 화면들과 `design-reference/admin-design.html`의 모습을 따르고, 새 스타일을 만들지 않습니다.

## 만들 것

### 1. 미션 관리 화면을 일정별로 정리 (`admin/missions/page.tsx`)

주차 칩은 그대로 두고, 보고 있는 주에 대해 세 묶음을 분명히 나눕니다.

- **고정 미션**: 고정 미션 목록. 고정 미션이 하나도 없으면 기본 4개가 무엇인지 알려 주는 상자와 **"고정 미션 4개 만들기"** 버튼(`createDefaultFixedMissions`). 만든 뒤에는 각 미션이 보통 줄로 나오고 누르면 상세가 열림.
- **순환 미션**: `weekPlan`의 이번 주 선택. "자동" 또는 "직접 고름" 표시. 이번 주나 이후 주의 선택을 바꾸는 방법(보관함에서 고르기, 보관함의 각 미션이 마지막으로 나온 주 표시), 직접 골랐을 때 **"자동으로 되돌리기"**. 아직 저장되지 않은 이후 주는 미리보기를 보여 주고 "이렇게 나올 예정"임을 알림. 한 주에 몇 개 나오는지 보여 주고 바꿀 수 있게(`setRotatingPerWeek`). 보관함 전체를 볼 수 있고, 보관함에 미션을 추가하는 링크(새 미션 화면에 `?mode=pool`).
- **기간 미션**: 그 주의 기간 미션. 지금처럼 동작하고, 주 복사 기능은 기간 미션에만.
- 한 주 합계와 한도 비교는 `weeklyDropCheck`를 씁니다(고정 + 순환 + 기간을 모두 셈). 물방울이 0개인 미션은 "포인트만"으로 읽히게.
- 고정·순환 미션에는 시작일·끝나는 날과 "다음 주에 복사"를 보여 주지 않습니다.

### 2. 고정 말씀 쓰기 미션의 주별 말씀

미션 관리 화면에서 들어갈 수 있어야 합니다. `verseWeeks`가 8주와 각 주에 말씀이 들어 있는지 알려 줍니다.

- 이번 주 말씀이 없으면 미션 관리 화면에 경고: **"이번 주 말씀이 아직 없어요. 넣기 전에는 아이들에게 말씀 쓰기가 보이지 않아요."** + 넣으러 가는 링크.
- 편집기는 다시 쓸 수 있는 클라이언트 컴포넌트로 만듭니다(예: `src/components/staff/plan/VerseEditor.tsx`).
  - 본문 위치 칸 (예: "요한복음 3:16-17")
  - **붙여넣기 도우미**: 어디서든 복사한 성경 본문을 붙여 넣는 큰 칸. **"절로 나누기"**를 누르면 `splitVerses`로 아래 목록(절 번호 + 본문)을 채움. 각 절은 고치기·지우기·직접 추가 가능. 개수와 한도 표시.
  - 한 줄 안내: 아이들은 띄어쓰기와 문장부호까지 똑같이 써야 하니 저장 전에 본문을 확인해 달라는 내용.
  - 저장은 `saveWeekVerses`, 한 주 비우기는 `clearWeekVerses`.

### 3. 미션 양식 (`MissionForm.tsx`)

- 일정 선택 **"매주 고정 / 순환 / 기간"** → `mode`. 새 미션 화면은 `?mode=fixed|pool|dated`로 미리 고름(기본은 기간).
- 시작일·끝나는 날은 기간일 때만.
- 말씀 쓰기 미션: 고정이면 말씀 칸 없이 "말씀은 미션 화면에서 주마다 넣어요" 안내. 순환·기간이면 2번의 편집기를 써서 `verses`에 저장.
- 물방울 0~12, 포인트 0~1000으로 범위를 넓힘(서버가 받는 범위). 물방울 0개는 "포인트만".

### 4. 미션 상세와 QR 포스터 화면

고정·순환 미션은 날짜 대신 "매주 나와요" / "순환 미션이에요"로 표시하고 "다음 주에 복사"를 내지 않습니다.

### 5. 출석 화면: 주일만 고르게

`saveAttendance`가 평일을 거절합니다("출석은 주일에만 기록할 수 있어요"). 휴대폰의 날짜 버튼과 컴퓨터의 "다른 날짜"가 주일만 고를 수 있게 바꿉니다(최근 주일 목록이나 주 단위 이동). 이미 있는 평일 기록은 지금처럼 보이고 지울 수 있어야 합니다.

### 6. 설정 화면

반가워 물방울 개수(`welcome_back_drops`, 0~5)와 한 주 순환 미션 개수(`rotating_per_week`, 0~10)를 추가하고 한 줄씩 설명을 붙입니다.
(반가워 물방울: 두 주일을 이어서 빠졌다가 다시 온 아이에게 주고, 주간 한도와 따로 셈.)
저장은 관리자 확인이 있는 라이브러리 함수로(`saveSettings` 확장 또는 `setRotatingPerWeek`), 테스트 포함.

### 7. 작은 수정 두 가지

- kit의 `Segmented` 탭 높이가 38px입니다. 컴퓨터 화면 모습은 그대로 두고 `lg` 미만에서 누르는 영역을 44px 이상으로.
- `/staff/children`의 `min-[840px]:grid-cols-4`가 적용되지 않습니다(`sm:grid-cols-3`에 짐). 펼친 폴드(884px)에서 카드가 네 장 나오게.

## 지킬 것

- 서버 액션은 라이브러리 함수를 거칩니다(관리자 확인이 그 안에 있음). 브라우저가 보낸 id를 그대로 믿지 않습니다.
- `src/lib/game.ts`, `src/lib/plan.ts`, `src/lib/verse.ts`, `src/lib/staff/admin-plan.ts`의 규칙은 바꾸지 않습니다. 틀려 보이면 고치지 말고 전도사님께 알립니다.
- 아이 화면(`src/app/(kid)`)은 바꾸지 않습니다.
- 기존 테스트를 약하게 하거나 건너뛰거나 지우지 않습니다. 새로 만든 로직에는 테스트를 붙입니다.
- 모든 화면은 폭 280, 344, 390, 768, 884, 1280에서 옆으로 잘리지 않아야 하고, `lg` 미만에서 누르는 영역은 44px 이상이어야 합니다. 직접 띄워서 사진으로 확인합니다(`tools/checks/staff-screens.cjs` 참고).
- "고정 미션이 아직 없는 상태"도 따로 확인합니다(새 시험용 데이터에는 고정 4개, 이번 주 말씀, 순환 미션이 들어 있으므로 지우고 확인).

## 올리기 전 검사

```bash
npx next typegen && npx tsc --noEmit && npm run lint && npx vitest run
```

```bash
PGLITE_DIR=memory DREAM_SEED=off npx next build
```

윈도우에서는 환경 변수를 다르게 줍니다. PowerShell 예:

```powershell
$env:PGLITE_DIR='memory'; $env:DREAM_SEED='off'; npx next build
```

`npm run db:reset`은 `rm -rf`를 쓰므로 윈도우에서는 `.data` 폴더를 직접 지웁니다.
화면 확인 스크립트는 Playwright가 필요합니다(`npx playwright install chromium`).

## 끝난 뒤

- 작업 가지 `claude/zealous-carson-axtlbt`에 올리면 실제 서비스에 배포됩니다. 마이그레이션은 새로 필요 없습니다.
- 전도사님께 알려 드릴 것: 고정 미션 만들기, 이번 주 말씀 넣기, 이번 주 순환 미션 바꾸기, 보관함에 미션 추가하기를 각각 어느 화면의 어떤 버튼으로 하는지.
- 이어서 `docs/HANDOFF.md`의 "남은 일 2번"(직접 따라 해 보는 확인표)을 이 화면 기준으로 만듭니다.
