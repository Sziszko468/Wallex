import { formatDayHeading, groupByDay } from "../../utils/transactionGroups";

const NOW = new Date(2026, 8, 30, 14, 5); // 30 September 2026

const tx = (id: number, date: string) => ({ id, date });

describe("formatDayHeading", () => {
  it("says Today and Yesterday", () => {
    expect(formatDayHeading("2026-09-30", NOW)).toBe("Today");
    expect(formatDayHeading("2026-09-29", NOW)).toBe("Yesterday");
  });

  it("names any other day with its weekday and date", () => {
    expect(formatDayHeading("2026-09-25", NOW)).toMatch(/Friday/);
    expect(formatDayHeading("2026-09-25", NOW)).toMatch(/September/);
    expect(formatDayHeading("2026-09-25", NOW)).toMatch(/25/);
  });

  it("counts yesterday correctly across a month boundary", () => {
    expect(formatDayHeading("2026-08-31", new Date(2026, 8, 1))).toBe("Yesterday");
  });
});

describe("groupByDay", () => {
  it("makes one section per day, in the order the list came", () => {
    const sections = groupByDay([tx(1, "2026-09-30"), tx(2, "2026-09-30"), tx(3, "2026-09-29"), tx(4, "2026-09-20")], NOW);

    expect(sections.map((section) => [section.title.slice(0, 5), section.data.map((item) => item.id)])).toEqual([
      ["Today", [1, 2]],
      ["Yeste", [3]],
      [expect.stringMatching(/^Sunda/), [4]],
    ]);
  });

  it("keeps every item exactly as it was", () => {
    const first = { id: 1, date: "2026-09-30", description: "Coffee" };
    expect(groupByDay([first], NOW)[0]?.data[0]).toBe(first);
  });

  it("is empty for an empty list", () => {
    expect(groupByDay([], NOW)).toEqual([]);
  });
});
