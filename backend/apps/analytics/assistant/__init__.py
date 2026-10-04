"""AI finance assistant: answers questions about the signed-in user's own finances.

    user question ─▶ engine.py ─▶ AI provider ─▶ tool call ─▶ tools.py ─▶ existing analytics /
                                  (Gemini, Claude)  ▲                      budget / subscription /
                                                    └── aggregated figures ◀ savings services

The model never touches the database. Everything it knows comes from the seven read-only
tools in tools.py, which run the same services the dashboard uses, always for `request.user`,
and return aggregated figures only (no ids, e-mail, name or individual transactions). The
numbers are calculated by Python/PostgreSQL; the model only explains them.

- providers/        AIProvider and its implementations (Gemini, Claude): one model call, error handling
- prompts.py        the system prompt
- tools.py          the tools: definitions, argument validation, what they return
- engine.py         one answer: the model ↔ tools loop (knows no vendor SDK)
- cards.py          insight cards and follow-up questions, built from the tool results (no model call)
- conversations.py  asking within a stored conversation (history, limits, saving)
- suggestions.py    suggested first questions, based on what data the user has
"""
