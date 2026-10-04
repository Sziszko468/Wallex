import { screen, waitFor, within } from "@testing-library/react";
import { http, HttpResponse } from "msw";
import { beforeEach, describe, expect, it } from "vitest";
import { renderApp, signIn } from "../test/render";
import { API, server } from "../test/server";
import type {
  AssistantConversation,
  AssistantConversationSummary,
  AssistantExchange,
  AssistantMessage,
  AssistantStatus,
} from "../types/assistant";

const STATUS: AssistantStatus = {
  available: true,
  suggested_questions: ["What did I spend the most on this month?", "How am I doing with my Japan trip savings goal?"],
  max_question_length: 1000,
};

const SUMMARY: AssistantConversationSummary = {
  id: 7,
  title: "What did I spend the most on this month?",
  created_at: "2026-09-29T10:00:00Z",
  updated_at: "2026-09-29T10:00:00Z",
};

function question(id: number, content: string): AssistantMessage {
  return { id, role: "user", content, sources: [], insights: [], suggested_questions: [], created_at: "2026-09-29T10:00:00Z" };
}

function answer(id: number, content: string, extras: Partial<AssistantMessage> = {}): AssistantMessage {
  return {
    id,
    role: "assistant",
    content,
    sources: [{ tool: "get_monthly_spending", label: "Monthly spending", detail: "September 2026" }],
    insights: [],
    suggested_questions: [],
    created_at: "2026-09-29T10:00:05Z",
    ...extras,
  };
}

function exchange(
  summary: AssistantConversationSummary,
  asked: string,
  answered: string,
  firstId = 1,
  extras: Partial<AssistantMessage> = {}
): AssistantExchange {
  return {
    conversation: summary,
    messages: [question(firstId, asked), answer(firstId + 1, answered, extras)],
    usage: { input_tokens: 1200, output_tokens: 85 },
  };
}

function serveAssistant({
  status = STATUS,
  conversations = [] as AssistantConversationSummary[],
  details = {} as Record<number, AssistantConversation>,
} = {}) {
  const asked: { url: string; body: unknown }[] = [];
  const deleted: number[] = [];
  server.use(
    http.get(`${API}/assistant/`, () => HttpResponse.json(status)),
    http.get(`${API}/assistant/conversations/`, () =>
      HttpResponse.json({ count: conversations.length, next: null, previous: null, results: conversations })
    ),
    http.get(`${API}/assistant/conversations/:id/`, ({ params }) => {
      const detail = details[Number(params.id)];
      return detail
        ? HttpResponse.json(detail)
        : HttpResponse.json({ detail: "No AssistantConversation matches the given query." }, { status: 404 });
    }),
    http.delete(`${API}/assistant/conversations/:id/`, ({ params }) => {
      deleted.push(Number(params.id));
      return new HttpResponse(null, { status: 204 });
    })
  );
  return { asked, deleted };
}

/** POST handlers that record the request and answer with `reply` (after `gate`, if given). */
function answerWith(reply: AssistantExchange | (() => Response), gate?: Promise<void>) {
  const asked: { url: string; body: unknown }[] = [];
  const handle = async ({ request }: { request: Request }) => {
    asked.push({ url: new URL(request.url).pathname, body: await request.json() });
    if (gate) await gate;
    return typeof reply === "function" ? reply() : HttpResponse.json(reply, { status: 201 });
  };
  server.use(
    http.post(`${API}/assistant/conversations/`, handle),
    http.post(`${API}/assistant/conversations/:id/messages/`, handle)
  );
  return asked;
}

describe("AI assistant page", () => {
  beforeEach(() => signIn());

  it("suggests questions from the server; picking one asks it and shows the answer with its sources", async () => {
    serveAssistant();
    let release!: () => void;
    const gate = new Promise<void>((resolve) => (release = resolve));
    const asked = answerWith(exchange(SUMMARY, STATUS.suggested_questions[0]!, "You spent the most on **Food**: €412.30."), gate);
    const { user } = renderApp("/assistant");

    await user.click(await screen.findByRole("button", { name: "What did I spend the most on this month?" }));

    // Shown right away, with a progress indicator, while the server answers.
    const log = await screen.findByRole("log", { name: "Conversation" });
    expect(within(log).getByText("What did I spend the most on this month?")).toBeInTheDocument();
    expect(within(log).getByRole("status")).toHaveTextContent("Checking your data");
    expect(screen.getByRole("textbox", { name: "Ask about your finances" })).toBeDisabled();

    release();
    const bold = await within(log).findByText("Food");
    expect(bold.tagName).toBe("STRONG");
    expect(within(log).queryByRole("status")).not.toBeInTheDocument();
    expect(within(screen.getByRole("list", { name: "Based on" })).getByText("Monthly spending")).toBeInTheDocument();
    expect(asked).toEqual([{ url: "/api/assistant/conversations/", body: { message: "What did I spend the most on this month?" } }]);

    // The new conversation is in the history and open.
    const history = screen.getByRole("navigation", { name: "Conversation history" });
    await waitFor(() =>
      expect(within(history).getByRole("link", { name: /What did I spend the most/ })).toHaveAttribute("aria-current", "page")
    );
  });

  it("sends a typed question with Enter; Shift+Enter adds a line", async () => {
    serveAssistant();
    const asked = answerWith(exchange(SUMMARY, "Line one\nLine two", "Noted."));
    const { user } = renderApp("/assistant");
    const box = await screen.findByRole("textbox", { name: "Ask about your finances" });

    await user.type(box, "Line one{Shift>}{Enter}{/Shift}Line two");
    expect(asked).toEqual([]);
    await user.keyboard("{Enter}");

    expect(await screen.findByText("Noted.")).toBeInTheDocument();
    expect(asked[0]?.body).toEqual({ message: "Line one\nLine two" });
    expect(box).toHaveValue("");
  });

  it("when no answer comes back, says why and puts the question back to send again", async () => {
    serveAssistant();
    answerWith(() =>
      HttpResponse.json(
        { detail: "The assistant is temporarily unavailable. Please try again in a moment.", code: "assistant_unavailable" },
        { status: 503 }
      )
    );
    const { user } = renderApp("/assistant");
    const box = await screen.findByRole("textbox", { name: "Ask about your finances" });

    await user.type(box, "How much on food?{Enter}");

    expect(await screen.findByRole("alert")).toHaveTextContent("The assistant is temporarily unavailable.");
    expect(box).toHaveValue("How much on food?");
    expect(box).toBeEnabled();
  });

  it("explains a rate limit in plain words", async () => {
    serveAssistant();
    answerWith(() => HttpResponse.json({ detail: "Request was throttled. Expected available in 42 seconds." }, { status: 429 }));
    const { user } = renderApp("/assistant");

    await user.type(await screen.findByRole("textbox", { name: "Ask about your finances" }), "Hi{Enter}");

    expect(await screen.findByRole("alert")).toHaveTextContent("You've asked a lot of questions in a short time.");
  });

  it("opens a conversation from the history and asks a follow-up in it", async () => {
    serveAssistant({
      conversations: [SUMMARY],
      details: { 7: { ...SUMMARY, messages: [question(1, SUMMARY.title), answer(2, "Food: **€412.30**.")] } },
    });
    const asked = answerWith(exchange({ ...SUMMARY, updated_at: "2026-09-29T11:00:00Z" }, "And last month?", "€380.00.", 3));
    const { user } = renderApp("/assistant");

    await user.click(await screen.findByRole("link", { name: /What did I spend the most/ }));
    const log = await screen.findByRole("log", { name: "Conversation" });
    expect(await within(log).findByText("€412.30")).toBeInTheDocument();

    await user.type(screen.getByRole("textbox", { name: "Ask about your finances" }), "And last month?{Enter}");

    expect(await within(log).findByText("€380.00.")).toBeInTheDocument();
    expect(within(log).getAllByRole("listitem", { name: /You|Assistant/ })).toHaveLength(4);
    // Only the new question is sent: the server keeps the history.
    expect(asked).toEqual([{ url: "/api/assistant/conversations/7/messages/", body: { message: "And last month?" } }]);
  });

  it("deletes a conversation after confirmation", async () => {
    const { deleted } = serveAssistant({
      conversations: [SUMMARY],
      details: { 7: { ...SUMMARY, messages: [question(1, SUMMARY.title), answer(2, "Food.")] } },
    });
    const { user } = renderApp("/assistant/7");
    expect(await screen.findByText("Food.")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: `Delete conversation: ${SUMMARY.title}` }));
    await user.click(within(await screen.findByRole("dialog")).getByRole("button", { name: "Delete" }));

    await waitFor(() => expect(deleted).toEqual([7]));
    expect(await screen.findByText("Your conversations will appear here.")).toBeInTheDocument();
    expect(await screen.findByText("What would you like to know about your money?")).toBeInTheDocument();
  });

  it("shows the key figures of an answer as cards, with an icon and text for the tone — not only colour", async () => {
    serveAssistant();
    answerWith(
      exchange(SUMMARY, "Why did my spending change?", "Spending is up.", 1, {
        insights: [
          {
            type: "spending_change",
            label: "Spending vs previous month",
            detail: "August 2026",
            amount: "165.20",
            currency: "EUR",
            percentage: 18,
            tone: "warning",
          },
          {
            type: "largest_category",
            label: "Largest category",
            detail: "Shopping",
            amount: "121.00",
            currency: "EUR",
            percentage: 19.8,
            tone: "neutral",
          },
        ],
      })
    );
    const { user } = renderApp("/assistant");

    await user.type(await screen.findByRole("textbox", { name: "Ask about your finances" }), "Why did my spending change?{Enter}");

    const cards = await screen.findByRole("list", { name: "Key figures" });
    const [change, largest] = within(cards).getAllByRole("listitem");
    expect(change).toHaveTextContent("Needs attention: Spending vs previous month");
    expect(change).toHaveTextContent("August 2026");
    expect(change).toHaveTextContent(/\+€165\.20/);
    expect(change).toHaveTextContent(/\+18(\.0)?%/);
    expect(largest).toHaveTextContent("Largest category");
    expect(largest).toHaveTextContent("Shopping");
    expect(largest).toHaveTextContent(/19\.8%\s*of expenses/);
    expect(largest).not.toHaveTextContent("Needs attention");
  });

  it("offers follow-up questions under the latest answer only; one tap asks it", async () => {
    serveAssistant({
      conversations: [SUMMARY],
      details: {
        7: {
          ...SUMMARY,
          messages: [
            question(1, SUMMARY.title),
            answer(2, "First answer.", { suggested_questions: ["An old follow-up?"] }),
            question(3, "And last month?"),
            answer(4, "Latest answer.", {
              suggested_questions: ["How much did I spend on Food last month?", "Where could I reduce my spending?"],
            }),
          ],
        },
      },
    });
    const asked = answerWith(exchange(SUMMARY, "Where could I reduce my spending?", "Look at Shopping.", 5));
    const { user } = renderApp("/assistant/7");

    const chips = await screen.findByRole("list", { name: "You could also ask" });
    expect(within(chips).getAllByRole("button").map((button) => button.textContent)).toEqual([
      "How much did I spend on Food last month?",
      "Where could I reduce my spending?",
    ]);
    expect(screen.queryByRole("button", { name: "An old follow-up?" })).not.toBeInTheDocument();

    await user.click(within(chips).getByRole("button", { name: "Where could I reduce my spending?" }));

    expect(await screen.findByText("Look at Shopping.")).toBeInTheDocument();
    expect(asked).toEqual([{ url: "/api/assistant/conversations/7/messages/", body: { message: "Where could I reduce my spending?" } }]);
  });

  it("hides the follow-ups while the next answer is on its way", async () => {
    serveAssistant({
      conversations: [SUMMARY],
      details: {
        7: { ...SUMMARY, messages: [question(1, SUMMARY.title), answer(2, "Food.", { suggested_questions: ["Next?"] })] },
      },
    });
    let release!: () => void;
    answerWith(exchange(SUMMARY, "Typed question", "Done.", 3), new Promise<void>((resolve) => (release = resolve)));
    const { user } = renderApp("/assistant/7");
    expect(await screen.findByRole("button", { name: "Next?" })).toBeInTheDocument();

    await user.type(screen.getByRole("textbox", { name: "Ask about your finances" }), "Typed question{Enter}");

    await waitFor(() => expect(screen.queryByRole("button", { name: "Next?" })).not.toBeInTheDocument());
    release();
    expect(await screen.findByText("Done.")).toBeInTheDocument();
  });

  it("says so when a conversation no longer exists", async () => {
    serveAssistant();
    renderApp("/assistant/99");

    expect(await screen.findByText(/This conversation no longer exists/)).toBeInTheDocument();
    expect(screen.getByRole("textbox", { name: "Ask about your finances" })).toBeDisabled();
  });

  it("shows that the assistant isn't set up, without suggestions", async () => {
    serveAssistant({ status: { available: false, suggested_questions: [], max_question_length: 1000 } });
    renderApp("/assistant");

    expect(await screen.findByRole("note")).toHaveTextContent("isn't set up on this server");
    expect(screen.getByRole("textbox", { name: "Ask about your finances" })).toBeDisabled();
    expect(screen.queryByRole("region", { name: "Suggested questions" })).not.toBeInTheDocument();
  });

  it("renders an answer as text, never as HTML", async () => {
    serveAssistant({
      details: { 7: { ...SUMMARY, messages: [question(1, "Hi"), answer(2, '<img src=x onerror="alert(1)"> **ok**')] } },
    });
    renderApp("/assistant/7");

    expect(await screen.findByText(/<img src=x/)).toBeInTheDocument();
    expect(document.querySelector("img")).toBeNull();
  });
});
