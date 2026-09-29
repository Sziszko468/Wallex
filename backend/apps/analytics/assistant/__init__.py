"""AI finance assistant: answers questions about the signed-in user's own finances.

    user question ─▶ engine.py ─▶ Claude ─▶ tool call ─▶ tools.py ─▶ existing analytics /
                                   ▲                                  budget / subscription /
                                   └──────── aggregated figures ◀──── savings services

The model never touches the database. Everything it knows comes from the seven read-only
tools in tools.py, which run the same services the dashboard uses, always for `request.user`,
and return aggregated figures only (no ids, e-mail, name or individual transactions).

- client.py         the Anthropic SDK: building the client, one request, error handling
- prompts.py        the system prompt
- tools.py          the tools: definitions, argument validation, what they return
- engine.py         one answer: the model ↔ tools loop
- conversations.py  asking within a stored conversation (history, limits, saving)
- suggestions.py    suggested questions, based on what data the user has
"""
