import type { Queryable } from "./db";
import { hashPin } from "./pin";
import { addDays, todayKst, weekStart } from "./time";

/**
 * Sample data for local development only. It runs when there is no DATABASE_URL and the
 * database is empty. Every name here is made up. Sample children use PIN 1234.
 */
export async function seedIfEmpty(q: Queryable) {
  const n = await q.query<{ n: number }>("select count(*)::int as n from staff");
  if ((n[0]?.n ?? 0) > 0) return;
  const today = todayKst();
  const ws = weekStart(today);
  const we = addDays(ws, 6);

  const classes = await q.query<{ id: number; name: string }>(
    "insert into classes (name, grade, sort) values ('4학년 1반',4,1),('5학년 1반',5,2),('5학년 2반',5,3),('6학년 1반',6,4) returning id, name",
  );
  const cid = (name: string) => classes.find((c) => c.name === name)!.id;

  const staff = await q.query<{ id: number; name: string }>(
    `insert into staff (name, role, can_attendance, can_visits, can_approve, can_view_all, can_read_pastor_worries, invite_code) values
      ('김인성', 'admin', true, true, true, true, true, null),
      ('박지현', 'homeroom', true, true, true, false, false, null),
      ('이부장', 'head', true, true, true, true, false, null),
      ('최기본', 'basic', false, false, false, false, false, null)
     returning id, name`,
  );
  const sid = (name: string) => staff.find((s) => s.name === name)!.id;
  await q.query("insert into staff_classes (staff_id, class_id) values ($1,$2)", [sid("박지현"), cid("5학년 2반")]);

  const pin = await hashPin("1234");
  const kids: [string, string, string, "M" | "F", boolean][] = [
    ["김하준", "5학년 2반", "2015-03-14", "M", true],
    ["이서윤", "5학년 2반", "2015-07-02", "F", true],
    ["박도윤", "5학년 2반", "2015-11-21", "M", true],
    ["최지우", "5학년 2반", "2015-01-30", "F", true],
    ["정시우", "5학년 2반", "2015-05-09", "M", false],
    ["강하은", "5학년 2반", "2015-09-17", "F", true],
    ["윤예준", "5학년 1반", "2015-04-25", "M", true],
    ["임수아", "5학년 1반", "2015-12-03", "F", true],
    ["한지호", "4학년 1반", "2016-06-11", "M", true],
    ["오유나", "4학년 1반", "2016-02-19", "F", true],
    ["서준우", "6학년 1반", "2014-08-08", "M", true],
    ["신채원", "6학년 1반", "2014-10-27", "F", true],
  ];
  const ids: Record<string, number> = {};
  for (let i = 0; i < kids.length; i++) {
    const [name, cls, birth, gender, onboarded] = kids[i];
    const rows = await q.query<{ id: number }>(
      `insert into children (name, class_id, birth_date, gender, qr_token, pin_hash, onboarded_at, consent_on, photo_consent, has_phone)
       values ($1,$2,$3,$4,$5,$6,$7,$8,true,$9) returning id`,
      [name, cid(cls), onboarded ? birth : null, onboarded ? gender : null, `demo-${i + 1}`, onboarded ? pin : null, onboarded ? new Date().toISOString() : null, today, name !== "한지호"],
    );
    ids[name] = rows[0].id;
    await q.query("insert into trees (child_id, seq, level, given) values ($1, 1, $2, $3)", [rows[0].id, onboarded ? Math.min(5, 1 + (i % 5)) : 1, onboarded ? i % 2 : 0]);
  }

  // The mission plan: four fixed missions on every week, a pool of rotating missions of which
  // three are on this week, and one dated mission. A child can earn exactly 12 drops this week
  // (fixed 2 + 2 + 3, rotating 1 + 1 + 2, dated 1); the daily reading gives points only.
  const fixed: [string, string, string, string, number, number, string][] = [
    ["주일 예배 출석", "선생님이 출석을 확인해요", "attendance", "stamp", 20, 2, "weekly"],
    ["이번 주 말씀 쓰기", "이번 주 말씀을 따라 써요", "verse", "bible", 15, 2, "weekly"],
    ["가정예배 드리기", "예배 사진 한 장 올리기", "photo", "house", 30, 3, "weekly"],
    ["오늘의 말씀 읽기", "오늘 말씀을 읽고 눌러요", "self", "bible", 2, 0, "daily"],
  ];
  const fixedIds: Record<string, number> = {};
  for (const [title, description, kind, icon, points, drops, repeat] of fixed) {
    const rows = await q.query<{ id: number }>(
      "insert into missions (title, description, kind, icon, points, drops, repeat, starts_on, ends_on, mode, created_by) values ($1,$2,$3,$4,$5,$6,$7,$8,$9,'fixed',$10) returning id",
      [title, description, kind, icon, points, drops, repeat, ws, we, sid("김인성")],
    );
    fixedIds[title] = rows[0].id;
  }
  // This week's verses for "이번 주 말씀 쓰기": two verses, written one at a time.
  await q.query("insert into mission_weeks (mission_id, week_start, verse_ref, verses, updated_by) values ($1,$2,$3,$4::jsonb,$5)", [
    fixedIds["이번 주 말씀 쓰기"],
    ws,
    "시편 23:1-2",
    JSON.stringify([
      { n: "1", text: "여호와는 나의 목자시니 내게 부족함이 없으리로다" },
      { n: "2", text: "그가 나를 푸른 풀밭에 누이시며 쉴 만한 물 가로 인도하시는도다" },
    ]),
    sid("김인성"),
  ]);

  const pool: [string, string, string, string, number, number][] = [
    ["내 고민 적기", "읽을 사람은 내가 골라요", "worry", "bubble", 10, 1],
    ["숲 소식에 댓글 달기", "이번 주 소식에 한마디", "comment", "badge", 5, 1],
    ["성경 암송 확인받기", "선생님 앞에서 외워 봐요", "teacher", "pray", 20, 2],
    ["가족을 위해 기도하기", "가족 한 사람을 위해 기도해요", "self", "pray", 5, 1],
  ];
  const poolIds: number[] = [];
  for (let i = 0; i < pool.length; i++) {
    const [title, description, kind, icon, points, drops] = pool[i];
    const rows = await q.query<{ id: number }>(
      "insert into missions (title, description, kind, icon, points, drops, repeat, starts_on, ends_on, mode, pool_order, created_by) values ($1,$2,$3,$4,$5,$6,'weekly',$7,$8,'pool',$9,$10) returning id",
      [title, description, kind, icon, points, drops, ws, we, i + 1, sid("김인성")],
    );
    poolIds.push(rows[0].id);
  }
  // This week's rotation, as the automatic pick would have made it: the first three of the pool.
  await q.query("insert into rotation_weeks (week_start, mission_ids, manual) values ($1, $2::int[], false)", [ws, poolIds.slice(0, 3)]);

  await q.query(
    `insert into missions (title, description, kind, icon, points, drops, repeat, starts_on, ends_on, is_challenge, created_by)
     values ('감사한 일 한 가지 적기', '이번 주에 감사했던 일을 적어요', 'text', 'persimmon', 10, 1, 'weekly', $1, $2, true, $3)`,
    [ws, we, sid("김인성")],
  );

  // The children have been coming for a while (the welcome-back drops only look at Sundays since a child was registered).
  await q.query("update children set created_at = now() - interval '56 days'");
  for (const name of ["김하준", "이서윤", "최지우"]) {
    await q.query("insert into attendance (child_id, date, status, staff_id) values ($1,$2,'present',$3),($1,$4,'present',$3),($1,$5,'present',$3)", [ids[name], ws, sid("박지현"), addDays(ws, -7), addDays(ws, -14)]);
  }
  // 정시우 missed the last two Sundays; 강하은 has no mark for three (marking her present this Sunday gives the welcome-back drops).
  await q.query("insert into attendance (child_id, date, status, staff_id) values ($1,$2,'absent',$3),($1,$4,'absent',$3)", [ids["정시우"], ws, sid("박지현"), addDays(ws, -7)]);
  await q.query("insert into drop_ledger (child_id, delta, reason, ref_type, week_start) values ($1, 4, '시작 물방울 (예시)', 'seed', $2)", [ids["김하준"], addDays(ws, -7)]);
  await q.query("insert into point_ledger (child_id, delta, reason, ref_type) values ($1, 120, '지난 활동 (예시)', 'seed')", [ids["김하준"]]);

  await q.query("insert into visits (child_id, visited_on, method, content, staff_id) values ($1,$2,'phone','[예시] 어머니와 통화. 지난주 결석 사유 확인.',$3)", [
    ids["정시우"],
    addDays(today, -3),
    sid("박지현"),
  ]);
  await q.query("insert into worries (child_id, content, audience, class_id_at_write) values ($1,'[예시] 요즘 친구랑 사이가 안 좋아요.','both',$2),($3,'[예시] 시험이 걱정돼요.','pastor',$2)", [
    ids["이서윤"],
    cid("5학년 2반"),
    ids["박도윤"],
  ]);

  const post = await q.query<{ id: number }>("insert into posts (body, staff_id) values ('추수감사절 예배를 함께 드렸어요. 한 해 동안 감사했던 일을 댓글로 한 가지씩 적어 볼까요?', $1) returning id", [sid("김인성")]);
  await q.query("insert into comments (post_id, child_id, body) values ($1,$2,'동생이 건강해져서 감사해요'),($1,$3,'새 친구가 생겨서 감사해요')", [post[0].id, ids["이서윤"], ids["박도윤"]]);
  await q.query("insert into notices (title, body, important, event_date, staff_id) values ('달란트 잔치', '[예시] 일정과 준비물 안내가 들어갑니다.', true, $1, $2), ('성탄절 발표 연습 일정', '[예시] 연습 일정 안내가 들어갑니다.', false, null, $2)", [
    addDays(today, 28),
    sid("김인성"),
  ]);
  await q.query(
    `insert into worship (date, time_place, sermon_title, scripture, preacher, memory_verse, items) values ($1, '오전 11시 · 소년부실', '감사하는 마음', '시편 100편 1-5절', '김인성 전도사', '시편 100편 4절', $2)`,
    [
      ws,
      JSON.stringify([
        { title: "찬양", detail: "[찬양 제목]" },
        { title: "기도", detail: "[기도 담당]" },
        { title: "말씀", detail: "감사하는 마음" },
        { title: "헌금", detail: "[헌금 찬양]" },
        { title: "광고", detail: "달란트 잔치 안내" },
        { title: "반별 모임", detail: "이번 주 암송" },
      ]),
    ],
  );
}
