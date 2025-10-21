import { describe, expect, it } from "vitest";

import { detectExampleLanguage, normalizeWordExamples } from "@shared/examples";

describe("detectExampleLanguage", () => {
  it("identifies German text", () => {
    expect(detectExampleLanguage("Sie hat eine E-Mail geschrieben.")).toBe("de");
  });

  it("identifies English text", () => {
    expect(detectExampleLanguage("She wrote an email.")).toBe("en");
  });
});

describe("normalizeWordExamples", () => {
  it("reclassifies German translations stored in the English slot", () => {
    const normalized = normalizeWordExamples([
      {
        sentence: "Sie arbeitete in einer Bank.",
        translations: { en: "Er hat als Koch gearbeitet." },
      },
    ]);

    expect(normalized).toEqual([
      { sentence: "Sie arbeitete in einer Bank.", translations: null },
      { sentence: "Er hat als Koch gearbeitet.", translations: null },
    ]);
  });

  it("reclassifies German exampleEn fields as additional sentences", () => {
    const normalized = normalizeWordExamples([
      {
        sentence: "Wir haben uns gestern gesehen.",
        exampleEn: "Sie hat eine E-Mail geschrieben.",
      },
    ]);

    expect(normalized).toEqual([
      { sentence: "Wir haben uns gestern gesehen.", translations: null },
      { sentence: "Sie hat eine E-Mail geschrieben.", translations: null },
    ]);
  });

  it("retains valid English translations", () => {
    const normalized = normalizeWordExamples([
      {
        sentence: "Sie arbeitete in einer Bank.",
        translations: { en: "She worked in a bank." },
      },
    ]);

    expect(normalized).toEqual([
      {
        sentence: "Sie arbeitete in einer Bank.",
        translations: { en: "She worked in a bank." },
      },
    ]);
  });
});
