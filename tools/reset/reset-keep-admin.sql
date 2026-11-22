-- 꿈의숲키우기: 관리자 계정만 남기고 시험 데이터를 모두 지웁니다.
--
-- 남는 것: 관리자 계정(role = 'admin', 카카오 연결 그대로), 기본 설정(settings, 가입 QR 코드 포함),
--          마이그레이션 기록(_migrations).
-- 지우는 것: 그 밖의 모든 표. 아이와 아이 기록, 다른 선생님 계정, 반, 미션, 소식 글, 공지, 예배 순서,
--          달란트, 사진, 기록(audit_log) 전부.
--
-- 되돌릴 수 없습니다. 실행 방법과 주의할 점은 같은 폴더의 README.md를 보세요.
--
-- 번호(id)는 처음부터 다시 매기지 않습니다. 아이와 선생님의 로그인 쿠키에는 번호만 들어 있어서,
-- 번호를 다시 쓰면 예전에 시험하던 휴대폰이 새로 가입한 다른 사람으로 들어갈 수 있기 때문입니다.
--
-- 표를 새로 만들면 아래 truncate 목록에 넣어 주세요. 빠뜨리면 맨 끝의 검사가 멈추고 아무것도 지우지 않습니다.

begin;

-- 1. 로그인할 수 있는 관리자가 없으면 멈춥니다(아무것도 지우지 않음).
do $$
begin
  if not exists (select 1 from staff where role = 'admin' and active and (kakao_id is not null or invite_code is not null)) then
    raise exception '로그인할 수 있는 관리자 계정이 없어서 멈췄어요. 아무것도 지우지 않았어요.';
  end if;
end $$;

-- 2. 관리자와 설정을 뺀 모든 표를 비웁니다. 서로 이어진 표를 한 번에 비우므로 순서는 상관없습니다.
--    cascade를 쓰지 않아서, 목록에 없는 표가 이 표들을 가리키면 오류로 멈춥니다.
truncate table
  children, trees, badges, uploads,
  attendance, visits,
  worries, worry_replies, worry_reads,
  drop_ledger, point_ledger,
  missions, mission_completions, mission_weeks, rotation_weeks, verse_progress, quiz_attempts,
  posts, post_likes, comments, comment_reports,
  notices, worship,
  talent_events, talent_grants, talent_ledger,
  staff_classes, classes,
  audit_log
  continue identity;

-- 3. 관리자가 아닌 선생님 계정을 지웁니다.
delete from staff where role <> 'admin';

-- 4. 남은 데이터 검사: 관리자 계정, 설정, 마이그레이션 기록 말고 남은 것이 있으면 모두 되돌립니다.
do $$
declare
  t record;
  n bigint;
begin
  for t in select tablename from pg_tables where schemaname = 'public' and tablename not in ('staff', 'settings', '_migrations') loop
    execute format('select count(*) from %I', t.tablename) into n;
    if n > 0 then
      raise exception '아직 비지 않은 표가 있어서 되돌렸어요: % (%건). 이 표를 truncate 목록에 넣어 주세요.', t.tablename, n;
    end if;
  end loop;
  if exists (select 1 from staff where role <> 'admin') then
    raise exception '관리자가 아닌 계정이 남아 있어서 되돌렸어요.';
  end if;
end $$;

commit;

-- 5. 남은 관리자 계정을 보여 줍니다.
select id, name, role, active, (kakao_id is not null) as kakao_linked from staff order by id;
