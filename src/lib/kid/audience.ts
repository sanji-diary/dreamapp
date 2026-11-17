import "server-only";
import { pastorLabel, teacherLabel, worryReaders } from "./worries";

export interface AudienceChoice {
  id: "teacher" | "pastor" | "both";
  title: string;
  sub: string;
  disabled?: boolean;
}

/** The three "who should read this" choices, with the real names of the people who would read it. */
export async function audienceChoices(childId: number): Promise<AudienceChoice[]> {
  const r = await worryReaders(childId);
  const noTeacher = r.teachers.length === 0;
  const noPastor = r.pastors.length === 0;
  return [
    { id: "teacher", title: `${teacherLabel(r)}만`, sub: noTeacher ? "아직 담임 선생님이 정해지지 않았어요" : "우리 반 담임 선생님", disabled: noTeacher },
    { id: "pastor", title: `${pastorLabel(r)}만`, sub: noPastor ? "지금은 보낼 수 없어요" : "소년부 전도사님", disabled: noPastor },
    { id: "both", title: "선생님과 전도사님 모두", sub: noTeacher || noPastor ? "지금은 보낼 수 없어요" : "두 분이 함께 읽어요", disabled: noTeacher || noPastor },
  ];
}
