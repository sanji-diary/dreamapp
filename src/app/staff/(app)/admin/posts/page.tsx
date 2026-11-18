import Link from "next/link";
import { AdminHeader, AdminPage, ConfirmPill, rowClass, tableClass, tdClass, thClass } from "@/components/staff/admin-kit";
import { ContentTabs } from "@/components/staff/AdminMenu";
import { BarLink, Card, EmptyNote, FlashNote, LineIcon, PillLink, RoundLink, Tag } from "@/components/staff/kit";
import { requireAdmin } from "@/lib/auth";
import { postAction } from "@/lib/staff/actions-admin";
import { listPosts, type PostRow } from "@/lib/staff/admin-misc";
import { shortDate } from "@/lib/staff/util";

export const metadata = { title: "숲 소식 · 꿈의숲키우기" };

/** The first line of a post stands in for a title in lists; the rest is the gray preview. */
function split(body: string): { head: string; rest: string } {
  const lines = body.split("\n").map((l) => l.trim()).filter(Boolean);
  return { head: lines[0] ?? "", rest: lines.slice(1).join(" ") };
}

function Thumb({ p, size }: { p: PostRow; size: number }) {
  return p.image_url ? (
    // eslint-disable-next-line @next/next/no-img-element
    <img alt="" src={p.image_url} className="shrink-0 rounded-xl object-cover" style={{ width: size, height: size }} />
  ) : (
    <span aria-hidden="true" className="grid shrink-0 place-items-center rounded-xl bg-[#f2f4f6] text-mute" style={{ width: size, height: size }}>
      <LineIcon name="list" size={Math.round(size * 0.4)} stroke={1.7} />
    </span>
  );
}

const reactions = (p: PostRow) => `좋아요 ${p.likes} · ${p.comments_open ? `댓글 ${p.comments.filter((c) => !c.hidden).length}` : "댓글 받지 않음"}`;

/** 숲 소식, a board of posts (design-reference/admin2/Posts.dc.html). Writing and changing a post happen on their own page. */
export default async function PostsAdminPage({ searchParams }: PageProps<"/staff/admin/posts">) {
  const staff = await requireAdmin();
  const sp = await searchParams;
  const posts = (await listPosts(staff)) ?? [];
  return (
    <AdminPage>
      <AdminHeader
        title="소식 글"
        count={`${posts.length}개`}
        phoneRight={<RoundLink href="/staff/admin/posts/new" label="글쓰기" icon="pen" />}
        wideRight={
          <BarLink href="/staff/admin/posts/new" tone="solid">
            <LineIcon name="pen" size={18} />
            글쓰기
          </BarLink>
        }
      />
      <ContentTabs active="posts" />
      <FlashNote ok={sp.ok} error={sp.error} />

      {posts.length === 0 ? (
        <Card>
          <EmptyNote>아직 올린 소식이 없어요. 오른쪽 위의 글쓰기로 첫 소식을 올려 보세요.</EmptyNote>
        </Card>
      ) : null}

      {/* Phones and tablets: one card per post. */}
      {posts.length > 0 ? (
        <ul className="m-0 flex list-none flex-col p-0 lg:hidden">
          {posts.map((p) => {
            const { head, rest } = split(p.body);
            return (
              <li key={p.id} className="flex items-start gap-3 border-b border-line py-3.5 last:border-b-0">
                <Thumb p={p} size={56} />
                <div className="flex min-w-0 grow flex-col gap-1">
                  <b className="line-clamp-2 text-[15px] tracking-[-0.02em]">{head}</b>
                  {rest ? <span className="line-clamp-1 text-[13px] text-mute">{rest}</span> : null}
                  <span className="text-[13px] text-sub">
                    {shortDate(p.created_on)} · {reactions(p)}
                  </span>
                </div>
                <PillLink href={`/staff/admin/posts/${p.id}`} tone="gray" label={`${head} 고치기`}>
                  고치기
                </PillLink>
              </li>
            );
          })}
        </ul>
      ) : null}

      {/* Wide screens: a table. */}
      {posts.length > 0 ? (
        <div className="hidden lg:block">
          <Card>
            <table className={tableClass}>
              <thead>
                <tr>
                  <th scope="col" className={thClass()}>
                    글
                  </th>
                  <th scope="col" className={thClass()}>
                    좋아요 · 댓글
                  </th>
                  <th scope="col" className={thClass()}>
                    올린 날
                  </th>
                  <th scope="col" className={thClass()}>
                    상태
                  </th>
                  <th scope="col" className={`${thClass()} text-right`}>
                    고치기 · 지우기
                  </th>
                </tr>
              </thead>
              <tbody>
                {posts.map((p) => {
                  const { head, rest } = split(p.body);
                  const reported = p.comments.some((c) => c.hidden);
                  return (
                    <tr key={p.id} className={rowClass}>
                      <td className={tdClass()}>
                        <Link href={`/staff/admin/posts/${p.id}`} className="flex max-w-[560px] items-center gap-3.5 text-ink no-underline hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-staff">
                          <Thumb p={p} size={56} />
                          <span className="flex min-w-0 flex-col gap-0.5">
                            <b className="truncate font-semibold">{head}</b>
                            {rest ? <span className="truncate text-[13.5px] text-mute">{rest}</span> : null}
                          </span>
                        </Link>
                      </td>
                      <td className={`${tdClass({ nowrap: true })} text-ink2`}>{reactions(p)}</td>
                      <td className={`${tdClass({ nowrap: true })} text-ink2`}>{shortDate(p.created_on)}</td>
                      <td className={tdClass()}>
                        <span className="flex flex-wrap gap-1">
                          <Tag tone="navy">올림</Tag>
                          {p.comments_open ? null : <Tag>댓글 닫힘</Tag>}
                          {reported ? <Tag tone="warn">지운 댓글 있음</Tag> : null}
                        </span>
                      </td>
                      <td className={tdClass({ tight: true })}>
                        <span className="flex items-center justify-end gap-1.5">
                          <PillLink href={`/staff/admin/posts/${p.id}`} tone="gray" label={`${head} 고치기`}>
                            고치기
                          </PillLink>
                          <form action={postAction} className="flex">
                            <input type="hidden" name="id" value={p.id} />
                            <input type="hidden" name="op" value="delete" />
                            <ConfirmPill message="이 소식을 지울까요? 댓글도 함께 지워져요." label={`${head} 지우기`}>
                              지우기
                            </ConfirmPill>
                          </form>
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </Card>
        </div>
      ) : null}
    </AdminPage>
  );
}
