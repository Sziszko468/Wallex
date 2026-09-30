import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { describe, expect, it } from "vitest";
import { SegmentedControl, type SegmentedOption } from "./SegmentedControl";

type Value = "a" | "b" | "c";
const OPTIONS: readonly SegmentedOption<Value>[] = [
  { value: "a", label: "Alpha" },
  { value: "b", label: "Beta" },
  { value: "c", label: "Gamma" },
];

function Harness({ semantics }: { semantics?: "radio" | "pressed" }) {
  const [value, setValue] = useState<Value>("a");
  return <SegmentedControl options={OPTIONS} value={value} onChange={setValue} label="Pick one" semantics={semantics} />;
}

describe("SegmentedControl", () => {
  it("is a radio group with exactly one tab stop", () => {
    render(<Harness />);

    const group = screen.getByRole("radiogroup", { name: "Pick one" });
    expect(group).toBeInTheDocument();
    expect(screen.getByRole("radio", { name: "Alpha" })).toBeChecked();
    expect(screen.getByRole("radio", { name: "Alpha" })).not.toHaveAttribute("tabindex");
    expect(screen.getByRole("radio", { name: "Beta" })).toHaveAttribute("tabindex", "-1");
  });

  it("moves the selection with the arrow keys, wrapping at the ends", async () => {
    const user = userEvent.setup();
    render(<Harness />);

    screen.getByRole("radio", { name: "Alpha" }).focus();
    await user.keyboard("{ArrowRight}");
    expect(screen.getByRole("radio", { name: "Beta" })).toBeChecked();
    expect(screen.getByRole("radio", { name: "Beta" })).toHaveFocus();

    await user.keyboard("{ArrowLeft}{ArrowLeft}");
    expect(screen.getByRole("radio", { name: "Gamma" })).toBeChecked();
  });

  it("changes the selection on click", async () => {
    const user = userEvent.setup();
    render(<Harness />);

    await user.click(screen.getByRole("radio", { name: "Gamma" }));

    expect(screen.getByRole("radio", { name: "Gamma" })).toBeChecked();
  });

  it("can instead be a group of toggle buttons (aria-pressed)", async () => {
    const user = userEvent.setup();
    render(<Harness semantics="pressed" />);

    expect(screen.getByRole("group", { name: "Pick one" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Alpha" })).toHaveAttribute("aria-pressed", "true");

    await user.click(screen.getByRole("button", { name: "Beta" }));

    expect(screen.getByRole("button", { name: "Beta" })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByRole("button", { name: "Alpha" })).toHaveAttribute("aria-pressed", "false");
  });
});
