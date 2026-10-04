/**
 * The AI assistant tab: suggestions, asking, answers with their sources, history, and the
 * states in between (thinking, failed, offline, not set up). The server does all the work;
 * the screen must only never lose a question and never pretend to answer.
 */
import { act, render, screen, userEvent } from "@testing-library/react-native";
import { AssistantScreen } from "../../screens/AssistantScreen";
import {
  askInConversation,
  getAssistantStatus,
  getConversation,
  listConversations,
  startConversation,
} from "../../services/assistantService";
import type { AssistantConversationSummary, AssistantExchange, AssistantMessage } from "../../types/assistant";

let mockIsOffline = false;
jest.mock("../../hooks/useOffline", () => ({ useOffline: () => ({ isOffline: mockIsOffline }) }));
jest.mock("../../hooks/useRefetchOnFocus", () => ({ useRefetchOnFocus: jest.fn() }));
jest.mock("../../services/assistantService", () => ({
  getAssistantStatus: jest.fn(),
  listConversations: jest.fn(),
  getConversation: jest.fn(),
  startConversation: jest.fn(),
  askInConversation: jest.fn(),
  deleteConversation: jest.fn(),
}));

const mocked = {
  status: getAssistantStatus as jest.MockedFunction<typeof getAssistantStatus>,
  list: listConversations as jest.MockedFunction<typeof listConversations>,
  get: getConversation as jest.MockedFunction<typeof getConversation>,
  start: startConversation as jest.MockedFunction<typeof startConversation>,
  ask: askInConversation as jest.MockedFunction<typeof askInConversation>,
};

const SUMMARY: AssistantConversationSummary = {
  id: 7,
  title: "What did I spend the most on this month?",
  created_at: "2026-09-29T10:00:00Z",
  updated_at: "2026-09-29T10:00:00Z",
};

function message(id: number, role: "user" | "assistant", content: string, extras: Partial<AssistantMessage> = {}): AssistantMessage {
  return {
    id,
    role,
    content,
    sources: role === "assistant" ? [{ tool: "get_monthly_spending", label: "Monthly spending", detail: "September 2026" }] : [],
    insights: [],
    suggested_questions: [],
    created_at: "2026-09-29T10:00:00Z",
    ...extras,
  };
}

function exchange(asked: string, answered: string, firstId = 1, extras: Partial<AssistantMessage> = {}): AssistantExchange {
  return {
    conversation: SUMMARY,
    messages: [message(firstId, "user", asked), message(firstId + 1, "assistant", answered, extras)],
    usage: { input_tokens: 1200, output_tokens: 85 },
  };
}

function httpError(status: number, data: unknown) {
  return Object.assign(new Error("Request failed"), { isAxiosError: true, response: { status, data } });
}

beforeEach(() => {
  jest.clearAllMocks();
  mockIsOffline = false;
  mocked.status.mockResolvedValue({
    available: true,
    suggested_questions: ["What did I spend the most on this month?", "Which of my subscriptions costs the most?"],
    max_question_length: 1000,
  });
  mocked.list.mockResolvedValue({ count: 0, next: null, previous: null, results: [] });
});

describe("AssistantScreen", () => {
  it("asks a suggested question and shows the answer with what it is based on", async () => {
    let resolve!: (value: AssistantExchange) => void;
    mocked.start.mockReturnValue(new Promise((done) => (resolve = done)));
    const user = userEvent.setup();
    await render(<AssistantScreen />);

    await user.press(await screen.findByRole("button", { name: "What did I spend the most on this month?" }));

    expect(mocked.start).toHaveBeenCalledWith("What did I spend the most on this month?");
    expect(screen.getByLabelText("Checking your data")).toBeTruthy();
    expect(screen.getByLabelText("Ask about your finances").props.editable).toBe(false);

    await act(async () => resolve(exchange("What did I spend the most on this month?", "Most on **Food**: €412.30.")));

    expect(await screen.findByText("Food")).toBeTruthy();
    expect(screen.getByText("€412.30.", { exact: false })).toBeTruthy();
    expect(screen.getByText("Monthly spending", { exact: false })).toBeTruthy();
    expect(screen.queryByLabelText("Checking your data")).toBeNull();
  });

  it("keeps a question that got no answer, ready to send again", async () => {
    mocked.start.mockRejectedValue(
      httpError(503, { detail: "The assistant is temporarily unavailable. Please try again in a moment.", code: "assistant_unavailable" })
    );
    const user = userEvent.setup();
    await render(<AssistantScreen />);
    const box = await screen.findByLabelText("Ask about your finances");

    await user.type(box, "How much on food?");
    await user.press(screen.getByRole("button", { name: "Send" }));

    expect(await screen.findByText("The assistant is temporarily unavailable. Please try again in a moment.")).toBeTruthy();
    expect(screen.getByLabelText("Ask about your finances").props.value).toBe("How much on food?");
  });

  it("offline, nothing can be asked", async () => {
    mockIsOffline = true;
    await render(<AssistantScreen />);

    expect(await screen.findByText("You're offline — the assistant needs a connection.")).toBeTruthy();
    expect(screen.getByLabelText("Ask about your finances").props.editable).toBe(false);
    expect(screen.getByRole("button", { name: "Send" })).toBeDisabled();
  });

  it("opens a conversation from the history and asks a follow-up in it", async () => {
    mocked.list.mockResolvedValue({ count: 1, next: null, previous: null, results: [SUMMARY] });
    mocked.get.mockResolvedValue({ ...SUMMARY, messages: [message(1, "user", SUMMARY.title), message(2, "assistant", "Food: €412.30.")] });
    mocked.ask.mockResolvedValue(exchange("And last month?", "€380.00 in August.", 3));
    const user = userEvent.setup();
    await render(<AssistantScreen />);

    await user.press(screen.getByRole("button", { name: "Conversation history" }));
    await user.press(await screen.findByRole("button", { name: `Open conversation: ${SUMMARY.title}` }));

    expect(await screen.findByText("Food: €412.30.")).toBeTruthy();
    expect(mocked.get).toHaveBeenCalledWith(7);

    await user.type(screen.getByLabelText("Ask about your finances"), "And last month?");
    await user.press(screen.getByRole("button", { name: "Send" }));

    expect(await screen.findByText("€380.00 in August.")).toBeTruthy();
    expect(mocked.ask).toHaveBeenCalledWith(7, "And last month?");
    expect(mocked.start).not.toHaveBeenCalled();
  });

  it("shows the key figures of an answer as cards that don't rely on colour alone", async () => {
    mocked.start.mockResolvedValue(
      exchange("Why did my spending change?", "Spending is up.", 1, {
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
    const user = userEvent.setup();
    await render(<AssistantScreen />);

    await user.type(await screen.findByLabelText("Ask about your finances"), "Why did my spending change?");
    await user.press(screen.getByRole("button", { name: "Send" }));

    expect(await screen.findByLabelText(/^Needs attention, Spending vs previous month, August 2026, \+€165\.20, \+18/)).toBeTruthy();
    expect(screen.getByLabelText(/^Largest category, Shopping, €121\.00, 19\.8%\s*of expenses/)).toBeTruthy();
    expect(screen.queryByLabelText(/^Needs attention, Largest category/)).toBeNull();
  });

  it("offers follow-up questions under the latest answer only; one tap asks it", async () => {
    mocked.list.mockResolvedValue({ count: 1, next: null, previous: null, results: [SUMMARY] });
    mocked.get.mockResolvedValue({
      ...SUMMARY,
      messages: [
        message(1, "user", SUMMARY.title),
        message(2, "assistant", "First answer.", { suggested_questions: ["An old follow-up?"] }),
        message(3, "user", "And last month?"),
        message(4, "assistant", "Latest answer.", { suggested_questions: ["Where could I reduce my spending?"] }),
      ],
    });
    mocked.ask.mockResolvedValue(exchange("Where could I reduce my spending?", "Look at Shopping.", 5));
    const user = userEvent.setup();
    await render(<AssistantScreen />);

    await user.press(screen.getByRole("button", { name: "Conversation history" }));
    await user.press(await screen.findByRole("button", { name: `Open conversation: ${SUMMARY.title}` }));

    expect(await screen.findByText("Latest answer.")).toBeTruthy();
    expect(screen.queryByRole("button", { name: "An old follow-up?" })).toBeNull();

    await user.press(screen.getByRole("button", { name: "Where could I reduce my spending?" }));

    expect(await screen.findByText("Look at Shopping.")).toBeTruthy();
    expect(mocked.ask).toHaveBeenCalledWith(7, "Where could I reduce my spending?");
  });

  it("can't send a follow-up while offline", async () => {
    mocked.list.mockResolvedValue({ count: 1, next: null, previous: null, results: [SUMMARY] });
    mocked.get.mockResolvedValue({
      ...SUMMARY,
      messages: [message(1, "user", SUMMARY.title), message(2, "assistant", "Food.", { suggested_questions: ["Next?"] })],
    });
    mockIsOffline = true;
    await render(<AssistantScreen />);
    const user = userEvent.setup();

    await user.press(screen.getByRole("button", { name: "Conversation history" }));
    await user.press(await screen.findByRole("button", { name: `Open conversation: ${SUMMARY.title}` }));

    expect(await screen.findByRole("button", { name: "Next?" })).toBeDisabled();
  });

  it("says when the assistant isn't set up on the server", async () => {
    mocked.status.mockResolvedValue({ available: false, suggested_questions: [], max_question_length: 1000 });
    await render(<AssistantScreen />);

    expect(await screen.findByText("The AI assistant isn't set up on this server yet.")).toBeTruthy();
    expect(screen.getByLabelText("Ask about your finances").props.editable).toBe(false);
  });
});
