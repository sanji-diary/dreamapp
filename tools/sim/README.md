# 한 주 진행해 보기

가짜 사람 41명(아이 30명, 교사 10명, 관리자 1명)으로 앱을 한 주 동안 써 보는 스크립트입니다.
결과 정리는 `docs/SIM-WEEK.md`에 있습니다.

실제 서비스와는 상관없습니다. 이 컴퓨터의 `.data/sim-week` 폴더에만 데이터가 생깁니다.

## 다시 돌리기

로컬 서버가 `.data/sim-week`를 쓰고 있으면 먼저 끕니다. 돌릴 때마다 처음부터 새로 만듭니다(6초쯤).

```bash
npx vitest run --config tools/sim/vitest.config.mts
```

- 무엇을 했는지와 검산 결과: `tools/sim/out/week.json` (저장소에는 올리지 않음)
- 시나리오: `tools/sim/week.sim.ts` (사람, 성격, 요일별로 하는 일)

## 화면으로 보기

보통의 `npm run dev`를 끈 다음 실행합니다. 같은 3000번 포트를 씁니다.

```bash
node tools/sim/dev.cjs
```

- 교사 화면: http://localhost:3000/staff/login 에서 이름을 누르면 그 선생님으로 들어갑니다(김인성이 관리자).
- 아이 화면: http://localhost:3000/login 의 "시험용 입구". 비밀번호는 1234입니다(류현우만 4321).
- 화면에서 누른 것은 이 데이터에 그대로 저장됩니다. 처음 상태로 돌리려면 위의 "다시 돌리기"를 하면 됩니다.
