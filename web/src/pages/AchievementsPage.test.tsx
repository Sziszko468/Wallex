import { screen, waitFor, within } from "@testing-library/react";
import { http, HttpResponse } from "msw";
import { beforeEach, describe, expect, it } from "vitest";
import { achievementList, makeAchievement } from "../test/fixtures";
import { renderApp, signIn } from "../test/render";
import { API, server } from "../test/server";
import type { Achievement } from "../types/achievement";

function serveAchievements(list: Achievement[]) {
  let markSeenCalls = 0;
  server.use(
    http.get(`${API}/achievements/`, () => HttpResponse.json(list)),
    http.post(`${API}/achievements/mark-seen/`, () => {
      markSeenCalls += 1;
      return HttpResponse.json({ marked: 1 });
    })
  );
  return { markSeenCalls: () => markSeenCalls };
}

function section(name: string) {
  return screen.getByRole("region", { name });
}

describe("Achievements page", () => {
  beforeEach(() => signIn());

  it("groups achievements into unlocked, in progress and not started", async () => {
    serveAchievements(achievementList);
    renderApp("/achievements");

    expect(await screen.findByText(/2 of 4 unlocked/)).toBeInTheDocument();
    expect(within(section("Unlocked")).getAllByRole("article").map((card) => card.getAttribute("aria-label"))).toEqual([
      "7 Day Tracking Streak",
      "Stayed Under Food Budget",
    ]);
    expect(within(section("In progress")).getByRole("article", { name: "€1,000 Saved" })).toBeInTheDocument();
    expect(within(section("Not started")).getByRole("article", { name: "30 Day Tracking Streak" })).toBeInTheDocument();
  });

  it("shows how an unlocked achievement was earned, and when", async () => {
    serveAchievements(achievementList);
    renderApp("/achievements");

    const budget = await screen.findByRole("article", { name: "Stayed Under Food Budget" });
    expect(within(budget).getByText(/August 2026 · Unlocked/)).toBeInTheDocument();
    expect(within(budget).queryByText("New")).not.toBeInTheDocument();
    const streak = screen.getByRole("article", { name: "7 Day Tracking Streak" });
    expect(within(streak).getByText("New")).toBeInTheDocument();
  });

  it("shows progress in the achievement's unit, exactly as the API reported it", async () => {
    serveAchievements([
      achievementList[2]!, // €1,000 Saved: 412.50 of 1000.00 EUR
      makeAchievement({
        code: "streak_7",
        title: "7 Day Tracking Streak",
        unit: "days",
        target: "7.00",
        progress: "3.00",
        progress_percentage: 42.86,
      }),
    ]);
    renderApp("/achievements");

    const saved = await screen.findByRole("article", { name: "€1,000 Saved" });
    expect(within(saved).getByText(/412[.,]50.*\/.*1[\s.,]?000[.,]00/)).toHaveTextContent(/€|EUR/);
    expect(within(saved).getByRole("progressbar")).toHaveAttribute("aria-valuenow", "41");
    expect(screen.getByText("3 / 7 days")).toBeInTheDocument();
  });

  it("locked achievements without progress show how to earn them, without a bar", async () => {
    serveAchievements(achievementList);
    renderApp("/achievements");

    const locked = await screen.findByRole("article", { name: "30 Day Tracking Streak" });
    expect(within(locked).getByText("Record transactions on 30 days in a row.")).toBeInTheDocument();
    expect(within(locked).queryByRole("progressbar")).not.toBeInTheDocument();
  });

  it("marks new achievements as seen once they were shown", async () => {
    const backend = serveAchievements(achievementList);
    renderApp("/achievements");

    await screen.findByRole("article", { name: "7 Day Tracking Streak" });
    await waitFor(() => expect(backend.markSeenCalls()).toBeGreaterThanOrEqual(1));
  });

  it("doesn't call mark-seen when nothing is new", async () => {
    const backend = serveAchievements(achievementList.map((achievement) => ({ ...achievement, is_new: false })));
    renderApp("/achievements");

    await screen.findByRole("article", { name: "7 Day Tracking Streak" });
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(backend.markSeenCalls()).toBe(0);
  });

  it("shows an error with a retry", async () => {
    server.use(http.get(`${API}/achievements/`, () => HttpResponse.json({ detail: "Server error." }, { status: 500 })));
    renderApp("/achievements");

    expect(await screen.findByRole("button", { name: "Retry" })).toBeInTheDocument();
  });
});
