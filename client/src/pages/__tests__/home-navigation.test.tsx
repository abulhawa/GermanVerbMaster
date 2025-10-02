// @vitest-environment jsdom
import type { ReactNode } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, vi, beforeEach, it } from "vitest";

import Home from "../home";
import type { GermanVerb } from "@shared";
import { getRandomVerb, getVerbByInfinitive } from "@/lib/verbs";
import { peekReviewVerb, shiftReviewVerb } from "@/lib/review-queue";

vi.mock("wouter", () => ({
  Link: ({ children }: { children: ReactNode }) => <>{children}</>,
  useLocation: () => ["/", () => {}],
}));

vi.mock("@/components/layout/app-shell", () => ({
  AppShell: ({ children }: { children: ReactNode }) => <div>{children}</div>,
}));

vi.mock("@/components/practice-card", () => ({
  PracticeCard: ({ verb }: { verb: GermanVerb }) => (
    <div data-testid="practice-card">{verb.infinitive}</div>
  ),
}));

vi.mock("@/components/progress-display", () => ({
  ProgressDisplay: () => null,
}));

vi.mock("@/components/settings-dialog", () => ({
  SettingsDialog: () => null,
}));

vi.mock("@/components/theme-toggle", () => ({
  ThemeToggle: () => null,
}));

vi.mock("@/components/ui/avatar", () => ({
  Avatar: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  AvatarFallback: ({ children }: { children: ReactNode }) => <div>{children}</div>,
}));

vi.mock("@/lib/answer-history", async () => {
  const actual = await vi.importActual<typeof import("@/lib/answer-history")>("@/lib/answer-history");
  return {
    ...actual,
    loadAnswerHistory: () => [],
    saveAnswerHistory: () => undefined,
  };
});

vi.mock("@/lib/dev-attributes", async () => {
  const actual = await vi.importActual<typeof import("@/lib/dev-attributes")>("@/lib/dev-attributes");
  return {
    ...actual,
    getDevAttributes: () => ({}),
  };
});

vi.mock("@/lib/review-queue", () => ({
  peekReviewVerb: vi.fn(),
  shiftReviewVerb: vi.fn(),
}));

vi.mock("@/lib/verbs", async () => {
  const actual = await vi.importActual<typeof import("@/lib/verbs")>("@/lib/verbs");
  return {
    ...actual,
    getRandomVerb: vi.fn(),
    getVerbByInfinitive: vi.fn(),
  };
});

const mockGetRandomVerb = getRandomVerb as unknown as vi.Mock;
const mockGetVerbByInfinitive = getVerbByInfinitive as unknown as vi.Mock;
const mockPeekReviewVerb = peekReviewVerb as unknown as vi.Mock;
const mockShiftReviewVerb = shiftReviewVerb as unknown as vi.Mock;

function renderHome() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });

  return render(
    <QueryClientProvider client={client}>
      <Home />
    </QueryClientProvider>,
  );
}

describe("Home navigation controls", () => {
  const sampleVerb = (infinitive: string): GermanVerb => ({
    infinitive,
    english: `${infinitive} english`,
    präteritum: `${infinitive}-pret`,
    partizipII: `${infinitive}-pp`,
    auxiliary: "haben",
    level: "A1",
    präteritumExample: `${infinitive} example pret`,
    partizipIIExample: `${infinitive} example pp`,
    source: { name: "test", levelReference: "A1" },
    pattern: null,
    praesensIch: null,
    praesensEr: null,
    perfekt: null,
    separable: null,
  });

  beforeEach(() => {
    mockGetRandomVerb.mockReset();
    mockGetVerbByInfinitive.mockReset();
    mockPeekReviewVerb.mockReset();
    mockShiftReviewVerb.mockReset();
    mockPeekReviewVerb.mockReturnValue(null);
    mockShiftReviewVerb.mockReturnValue(undefined);
    mockGetVerbByInfinitive.mockResolvedValue(undefined);
  });

  it("returns to the previously seen verb when using the previous button", async () => {
    const verbs = [sampleVerb("gehen"), sampleVerb("kommen"), sampleVerb("sehen"), sampleVerb("bleiben")];
    mockGetRandomVerb.mockImplementation(async () => {
      const next = verbs.shift();
      if (!next) {
        throw new Error("No mock verbs left");
      }
      return next;
    });

    renderHome();

    const initialCard = await screen.findByTestId("practice-card");
    const firstVerb = initialCard.textContent;
    expect(firstVerb).toBeTruthy();

    const skipButton = await screen.findByRole("button", { name: /skip to next/i });
    await userEvent.click(skipButton);

    await waitFor(() => {
      expect(screen.getByTestId("practice-card").textContent).not.toBe(firstVerb);
    });

    const previousCalls = mockGetRandomVerb.mock.calls.length;

    const previousButton = await screen.findByRole("button", { name: /previous verb/i });
    await userEvent.click(previousButton);

    await waitFor(() => {
      expect(screen.getByTestId("practice-card").textContent).toBe(firstVerb);
    });

    expect(mockGetRandomVerb.mock.calls.length).toBe(previousCalls);
  });
});
