import { describe, expect, it } from "vitest";
import { firstDifference, normalizeVerse, parseVerses, sameVerse, splitVerses, validateVerses, verseLabel } from "@/lib/verse";

/** Copying a verse: what counts as "written exactly", and how pasted Bible text is cut into verses. No database here. */

const V16 = "하나님이 세상을 이처럼 사랑하사 독생자를 주셨으니";

describe("comparing what a child wrote with the verse", () => {
  it("spacing must match: a missing space or a space in the wrong place is a difference", () => {
    expect(sameVerse(V16, V16)).toBe(true);
    expect(sameVerse("하나님이세상을 이처럼 사랑하사 독생자를 주셨으니", V16)).toBe(false);
    expect(sameVerse("하나님이 세상을 이처럼 사랑 하사 독생자를 주셨으니", V16)).toBe(false);
    expect(sameVerse("하나님이 세상을 이처럼 사랑하사 독생자를 주셨으니 ", V16)).toBe(true); // a space at the very end is not visible
  });

  it("punctuation must match: a missing, extra or different mark is a difference", () => {
    const verse = "이르시되, 빛이 있으라 하시니 빛이 있었고.";
    expect(sameVerse("이르시되, 빛이 있으라 하시니 빛이 있었고.", verse)).toBe(true);
    expect(sameVerse("이르시되 빛이 있으라 하시니 빛이 있었고.", verse)).toBe(false);
    expect(sameVerse("이르시되, 빛이 있으라 하시니 빛이 있었고", verse)).toBe(false);
    expect(sameVerse("이르시되. 빛이 있으라 하시니 빛이 있었고.", verse)).toBe(false);
    expect(sameVerse("이르시되, 빛이 있으라 하시니 빛이 있었고!", verse)).toBe(false);
    expect(sameVerse("이르시되,빛이 있으라 하시니 빛이 있었고.", verse)).toBe(false);
  });

  it("a wrong or missing letter is a difference", () => {
    expect(sameVerse("하나님이 세상을 이처럼 사랑하사 독생자를 주셨으나", V16)).toBe(false);
    expect(sameVerse("하나님이 세상을 이처럼 사랑하사 독생자를", V16)).toBe(false);
    expect(sameVerse("", V16)).toBe(false);
  });

  it("forgives how a Korean syllable is stored: composed and decomposed forms are the same writing", () => {
    const decomposed = V16.normalize("NFD");
    expect(decomposed).not.toBe(V16);
    expect(decomposed.length).toBeGreaterThan(V16.length);
    expect(sameVerse(decomposed, V16)).toBe(true);
    expect(sameVerse(V16, decomposed)).toBe(true);
    expect(normalizeVerse(decomposed)).toBe(V16);
  });

  it("forgives runs of spaces, line breaks, tabs and spaces nobody can tell apart", () => {
    expect(sameVerse("  하나님이   세상을\n이처럼\t사랑하사 \r\n 독생자를 주셨으니  ", V16)).toBe(true);
    expect(sameVerse("하나님이 세상을　이처럼 사랑하사 독생자를 주셨으니", V16)).toBe(true); // no-break and full-width spaces
    expect(sameVerse("하나님이​ 세상을 이처럼 사랑하사 독생자를﻿ 주셨으니", V16)).toBe(true); // characters with no width
    expect(normalizeVerse(" a \n\n b\t\tc ")).toBe("a b c");
    // A line break where the verse has no space is still a space.
    expect(sameVerse("하나님이 세상을 이처럼 사랑\n하사 독생자를 주셨으니", V16)).toBe(false);
  });

  it("forgives curly quotes against straight ones", () => {
    const verse = "예수께서 이르시되 \"내가 곧 길이요\" 하시니 '아멘'";
    expect(sameVerse("예수께서 이르시되 “내가 곧 길이요” 하시니 ‘아멘’", verse)).toBe(true);
    expect(sameVerse("예수께서 이르시되 „내가 곧 길이요‟ 하시니 ‚아멘‛", verse)).toBe(true);
    expect(normalizeVerse("“말씀” ‘빛’")).toBe("\"말씀\" '빛'");
    // A quote left out is still a difference, and a single quote is not a double one.
    expect(sameVerse("예수께서 이르시되 내가 곧 길이요 하시니 '아멘'", verse)).toBe(false);
    expect(sameVerse("예수께서 이르시되 '내가 곧 길이요' 하시니 '아멘'", verse)).toBe(false);
  });

  it("forgives full-width punctuation against the ordinary kind, but not full-width letters or digits", () => {
    expect(sameVerse("이르시되， 빛이 있으라！ 그러자 빛이 있었고．", "이르시되, 빛이 있으라! 그러자 빛이 있었고.")).toBe(true);
    expect(sameVerse("（요 ３：１６）", "(요 ３:１６)")).toBe(true);
    expect(normalizeVerse("？：；＂＇（）")).toBe("?:;\"'()");
    expect(sameVerse("３장", "3장")).toBe(false);
    expect(sameVerse("Ａ", "A")).toBe(false);
  });

  it("the verse itself is read the same way, so an admin's pasted quotes or line breaks cost the child nothing", () => {
    expect(sameVerse("주께서 \"두려워하지 말라\" 하시니라", "주께서 “두려워하지\n말라” 하시니라")).toBe(true);
  });
});

describe("where the writing first differs", () => {
  it("is null when the writing is right", () => {
    expect(firstDifference(V16, V16)).toBeNull();
    expect(firstDifference(`  ${V16}\n`, V16)).toBeNull();
  });

  it("points at the first wrong character of the verse", () => {
    // "세상을" written as "새상을": the 6th character (index 5).
    expect(firstDifference("하나님이 새상을 이처럼", V16)).toBe(5);
    expect(V16[5]).toBe("세");
    // A missing space: the place where the space should be.
    expect(firstDifference("하나님이세상을", V16)).toBe(4);
    expect(V16[4]).toBe(" ");
    // Wrong from the very first letter.
    expect(firstDifference("아버지가", V16)).toBe(0);
  });

  it("when the child stopped early it is where they stopped; when they wrote too much it is the end of the verse", () => {
    expect(firstDifference("하나님이 세상을", V16)).toBe(8);
    expect(firstDifference("", V16)).toBe(0);
    expect(firstDifference(`${V16} 아멘`, V16)).toBe(V16.length);
  });

  it("counts in the tidied verse, so extra spaces before the mistake do not move the mark", () => {
    expect(firstDifference("하나님이    새상을", V16)).toBe(5);
    expect(firstDifference("하나님이 세상을".normalize("NFD") + " 이처렴", V16)).toBe(11);
    expect(V16[11]).toBe("럼");
  });
});

describe("cutting pasted Bible text into verses", () => {
  it("numbers at the start of a line, with or without a full stop", () => {
    expect(splitVerses("16 하나님이 세상을 이처럼 사랑하사\n17 하나님이 그 아들을 세상에 보내신 것은")).toEqual([
      { n: "16", text: "하나님이 세상을 이처럼 사랑하사" },
      { n: "17", text: "하나님이 그 아들을 세상에 보내신 것은" },
    ]);
    expect(splitVerses("16. 하나님이 세상을\n17. 하나님이 그 아들을\n18. 그를 믿는 자는")).toEqual([
      { n: "16", text: "하나님이 세상을" },
      { n: "17", text: "하나님이 그 아들을" },
      { n: "18", text: "그를 믿는 자는" },
    ]);
  });

  it("numbers after a space inside one paragraph, and numbers stuck to the first word", () => {
    expect(splitVerses("1 여호와는 나의 목자시니 내게 부족함이 없으리로다 2 그가 나를 푸른 풀밭에 누이시며 3 내 영혼을 소생시키시고")).toEqual([
      { n: "1", text: "여호와는 나의 목자시니 내게 부족함이 없으리로다" },
      { n: "2", text: "그가 나를 푸른 풀밭에 누이시며" },
      { n: "3", text: "내 영혼을 소생시키시고" },
    ]);
    expect(splitVerses("16하나님이 세상을 사랑하사 17하나님이 그 아들을")).toEqual([
      { n: "16", text: "하나님이 세상을 사랑하사" },
      { n: "17", text: "하나님이 그 아들을" },
    ]);
    expect(splitVerses("16절 하나님이 세상을\n17절 하나님이 그 아들을")).toEqual([
      { n: "16", text: "하나님이 세상을" },
      { n: "17", text: "하나님이 그 아들을" },
    ]);
  });

  it("a number inside the text is not a verse number unless it carries on the count", () => {
    // "40 일" and "12 제자" do not continue 1, 2, 3.
    expect(splitVerses("1 예수께서 40 일을 금식하시고 2 그 후에 12 제자를 부르시니 3 그들이 따르니라")).toEqual([
      { n: "1", text: "예수께서 40 일을 금식하시고" },
      { n: "2", text: "그 후에 12 제자를 부르시니" },
      { n: "3", text: "그들이 따르니라" },
    ]);
    // The count starts at the first number of the longest run, wherever the chapter begins.
    expect(splitVerses("28 수고하고 무거운 짐 진 자들아 다 내게로 오라 29 나는 마음이 온유하고 겸손하니").map((v) => v.n)).toEqual(["28", "29"]);
  });

  it("references are not verse numbers, and a title before the first verse is left out", () => {
    expect(splitVerses("요한복음 3:16-17\n16 하나님이 세상을 이처럼 사랑하사\n17 하나님이 그 아들을")).toEqual([
      { n: "16", text: "하나님이 세상을 이처럼 사랑하사" },
      { n: "17", text: "하나님이 그 아들을" },
    ]);
    expect(splitVerses("요한복음 3장\n16 하나님이 세상을\n17 하나님이 그 아들을").map((v) => v.n)).toEqual(["16", "17"]);
    // One verse with a chapter title above it: the number at the start of a line wins.
    expect(splitVerses("시편 23편\n1 여호와는 나의 목자시니")).toEqual([{ n: "1", text: "여호와는 나의 목자시니" }]);
    // Decimals and long numbers are not verse numbers.
    expect(splitVerses("값은 3.5 데나리온이요 2026 년이라")).toEqual([{ n: null, text: "값은 3.5 데나리온이요 2026 년이라" }]);
  });

  it("a verse may run over several lines; line breaks inside it become spaces", () => {
    expect(splitVerses("1 여호와는 나의 목자시니\n  내게 부족함이 없으리로다\n\n2 그가 나를 푸른 풀밭에 누이시며\r\n쉴 만한 물 가로 인도하시는도다")).toEqual([
      { n: "1", text: "여호와는 나의 목자시니 내게 부족함이 없으리로다" },
      { n: "2", text: "그가 나를 푸른 풀밭에 누이시며 쉴 만한 물 가로 인도하시는도다" },
    ]);
  });

  it("with no verse numbers every line that has text is one verse without a number", () => {
    expect(splitVerses("여호와는 나의 목자시니\n\n   \n내게 부족함이 없으리로다\n")).toEqual([
      { n: null, text: "여호와는 나의 목자시니" },
      { n: null, text: "내게 부족함이 없으리로다" },
    ]);
    expect(splitVerses("한 줄만 있는 말씀")).toEqual([{ n: null, text: "한 줄만 있는 말씀" }]);
    expect(splitVerses("")).toEqual([]);
    expect(splitVerses("  \n \n")).toEqual([]);
  });

  it("a number with no text after it makes no verse", () => {
    // At the very end it is just part of the text; on a line of its own it is an empty verse, which is dropped.
    expect(splitVerses("1 여호와는 나의 목자시니 2")).toEqual([{ n: "1", text: "여호와는 나의 목자시니 2" }]);
    expect(splitVerses("1 여호와는 나의 목자시니\n2 \n")).toEqual([{ n: "1", text: "여호와는 나의 목자시니" }]);
  });
});

describe("verses as stored", () => {
  it("reads a list or its JSON text, tidies spaces, and leaves out anything that is not a verse", () => {
    const stored = [{ n: "16", text: " 하나님이  세상을 " }, { n: 17, text: "하나님이 그 아들을" }, { n: null, text: "번호 없는 절" }, { text: "" }, { n: "x" }, "글", null];
    const want = [
      { n: "16", text: "하나님이 세상을" },
      { n: "17", text: "하나님이 그 아들을" },
      { n: null, text: "번호 없는 절" },
    ];
    expect(parseVerses(stored)).toEqual(want);
    expect(parseVerses(JSON.stringify(stored))).toEqual(want);
    expect(parseVerses(null)).toEqual([]);
    expect(parseVerses("{bad")).toEqual([]);
    expect(parseVerses({ n: "1", text: "목록이 아님" })).toEqual([]);
  });

  it("saving needs 1 to 10 verses, each with text of at most 300 characters", () => {
    expect(validateVerses([{ n: "1", text: "여호와는 나의 목자시니" }])).toEqual({ ok: true, verses: [{ n: "1", text: "여호와는 나의 목자시니" }] });
    expect(validateVerses([]).ok).toBe(false);
    expect(validateVerses(null).ok).toBe(false);
    expect(validateVerses([{ n: "1", text: "  " }]).ok).toBe(false);
    expect(validateVerses([{ n: "1", text: "가" }, { n: "2", text: "" }]).ok).toBe(false);
    expect(validateVerses(Array.from({ length: 10 }, (_, i) => ({ n: String(i + 1), text: "말씀" }))).ok).toBe(true);
    expect(validateVerses(Array.from({ length: 11 }, (_, i) => ({ n: String(i + 1), text: "말씀" }))).ok).toBe(false);
    expect(validateVerses([{ n: null, text: "가".repeat(300) }]).ok).toBe(true);
    expect(validateVerses([{ n: null, text: "가".repeat(301) }]).ok).toBe(false);
  });

  it("labels a numbered verse and leaves an unnumbered one bare", () => {
    expect(verseLabel({ n: "16" })).toBe("16절");
    expect(verseLabel({ n: null })).toBe("");
  });
});
