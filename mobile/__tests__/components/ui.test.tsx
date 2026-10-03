import { useState } from "react";
import { render, screen, userEvent } from "@testing-library/react-native";
import { Text as NativeText } from "react-native";
import { AmountInput } from "../../components/ui/AmountInput";
import { Badge } from "../../components/ui/Badge";
import { BottomSheet } from "../../components/ui/BottomSheet";
import { Button } from "../../components/ui/Button";
import { Chip } from "../../components/ui/Chip";
import { IconButton } from "../../components/ui/IconButton";
import { Notice } from "../../components/ui/Notice";
import { ProgressBar } from "../../components/ui/ProgressBar";
import { SegmentedControl } from "../../components/ui/SegmentedControl";
import { initialsOf } from "../../components/ui/Avatar";
import { TextField } from "../../components/ui/TextField";

describe("Button", () => {
  it("is a button with its title as the name, and presses", async () => {
    const onPress = jest.fn();
    await render(<Button title="Save" onPress={onPress} />);

    await userEvent.setup().press(screen.getByRole("button", { name: "Save" }));

    expect(onPress).toHaveBeenCalledTimes(1);
  });

  it("does nothing while loading, and says it is busy", async () => {
    const onPress = jest.fn();
    await render(<Button title="Save" isLoading onPress={onPress} />);

    await userEvent.setup().press(screen.getByRole("button", { name: "Save" }));

    expect(onPress).not.toHaveBeenCalled();
    expect(screen.getByRole("button", { name: "Save" })).toBeBusy();
    expect(screen.getByRole("button", { name: "Save" })).toBeDisabled();
  });

  it("can be named differently from what it shows", async () => {
    await render(<Button title="Pause" accessibilityLabel="Pause Netflix" onPress={() => undefined} />);

    expect(screen.getByRole("button", { name: "Pause Netflix" })).toBeTruthy();
  });
});

describe("IconButton", () => {
  it("is named by its label, since an icon alone says nothing", async () => {
    const onPress = jest.fn();
    await render(<IconButton icon="search" accessibilityLabel="Search" onPress={onPress} />);

    await userEvent.setup().press(screen.getByRole("button", { name: "Search" }));

    expect(onPress).toHaveBeenCalled();
  });

  it("shows a count in the corner when given one", async () => {
    await render(<IconButton icon="filter" accessibilityLabel="Filters" badge={2} onPress={() => undefined} />);

    // The tiny number is decorative; screen readers get it as the button's value ("Filters, 2").
    expect(screen.getByText("2", { hidden: true })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Filters" })).toHaveProp("accessibilityValue", { text: "2" });
  });
});

describe("SegmentedControl", () => {
  function Example() {
    const [value, setValue] = useState<"a" | "b">("a");
    return (
      <SegmentedControl
        accessibilityLabel="Choice"
        value={value}
        onChange={setValue}
        options={[
          { value: "a", label: "First" },
          { value: "b", label: "Second", icon: "moon" },
        ]}
      />
    );
  }

  it("is one radio group; the chosen option is checked", async () => {
    await render(<Example />);

    expect(screen.getByLabelText("Choice")).toHaveProp("accessibilityRole", "radiogroup");
    expect(screen.getByRole("radio", { name: "First" })).toBeChecked();
    expect(screen.getByRole("radio", { name: "Second" })).not.toBeChecked();
  });

  it("moves the choice on press", async () => {
    await render(<Example />);

    await userEvent.setup().press(screen.getByRole("radio", { name: "Second" }));

    expect(screen.getByRole("radio", { name: "Second" })).toBeChecked();
    expect(screen.getByRole("radio", { name: "First" })).not.toBeChecked();
  });
});

describe("Chip", () => {
  it("is a selectable button", async () => {
    const onPress = jest.fn();
    await render(<Chip label="Food" isSelected onPress={onPress} />);

    expect(screen.getByRole("button", { name: "Food" })).toBeSelected();
    await userEvent.setup().press(screen.getByRole("button", { name: "Food" }));
    expect(onPress).toHaveBeenCalled();
  });

  it("with a remove affordance, pressing it removes the filter", async () => {
    const onRemove = jest.fn();
    const onPress = jest.fn();
    await render(<Chip label="Food" isSelected accessibilityLabel="Remove filter Food" onPress={onPress} onRemove={onRemove} />);

    await userEvent.setup().press(screen.getByRole("button", { name: "Remove filter Food" }));

    expect(onRemove).toHaveBeenCalled();
    expect(onPress).not.toHaveBeenCalled();
  });
});

describe("ProgressBar", () => {
  it("reports its value to assistive technology, clamped to 0–100", async () => {
    await render(
      <>
        <ProgressBar percentage={42.4} accessibilityLabel="Food" />
        <ProgressBar percentage={142.6} accessibilityLabel="Transport" />
        <ProgressBar percentage={-5} accessibilityLabel="Bills" />
      </>
    );

    expect(screen.getByRole("progressbar", { name: "Food" })).toHaveProp("accessibilityValue", { min: 0, max: 100, now: 42 });
    expect(screen.getByRole("progressbar", { name: "Transport" })).toHaveProp("accessibilityValue", { min: 0, max: 100, now: 100 });
    expect(screen.getByRole("progressbar", { name: "Bills" })).toHaveProp("accessibilityValue", { min: 0, max: 100, now: 0 });
  });
});

describe("Notice", () => {
  it("shows nothing without a message", async () => {
    await render(<Notice message={null} />);

    expect(screen.toJSON()).toBeNull();
  });

  it("announces an error as an alert", async () => {
    await render(<Notice message="Couldn't save" />);

    expect(screen.getByRole("alert")).toBeTruthy();
    expect(screen.getByText("Couldn't save")).toBeTruthy();
  });
});

describe("Badge", () => {
  it("is a short label", async () => {
    await render(<Badge label="Near limit" tone="warning" icon="alert-triangle" />);

    expect(screen.getByText("Near limit")).toBeTruthy();
  });
});

describe("TextField", () => {
  it("is named by its label and says what is wrong", async () => {
    await render(<TextField label="Email" error="Enter a valid email." value="" onChangeText={() => undefined} />);

    expect(screen.getByLabelText("Email")).toBeTruthy();
    expect(screen.getByText("Enter a valid email.")).toBeTruthy();
    expect(screen.getByRole("alert")).toBeTruthy();
  });
});

describe("AmountInput", () => {
  it("is a decimal number field named for its currency, with the currency's sign beside it", async () => {
    function Example() {
      const [amount, setAmount] = useState("");
      return <AmountInput label="Amount (EUR)" currency="EUR" value={amount} onChangeText={setAmount} />;
    }
    await render(<Example />);

    const field = screen.getByLabelText("Amount (EUR)");
    expect(field).toHaveProp("keyboardType", "decimal-pad");
    await userEvent.setup().type(field, "42.5");
    expect(screen.getByLabelText("Amount (EUR)")).toHaveProp("value", "42.5");
  });

  it("explains a problem under the amount", async () => {
    await render(<AmountInput label="Amount (EUR)" currency="EUR" value="" onChangeText={() => undefined} error="Amount is required." />);

    expect(screen.getByText("Amount is required.")).toBeTruthy();
  });
});

describe("BottomSheet", () => {
  it("shows its title and content, and closes with the close button", async () => {
    const onClose = jest.fn();
    await render(
      <BottomSheet visible onClose={onClose} title="Filters">
        <NativeText>Sheet content</NativeText>
      </BottomSheet>
    );

    expect(screen.getByText("Filters")).toBeTruthy();
    expect(screen.getByText("Sheet content")).toBeTruthy();

    await userEvent.setup().press(screen.getAllByRole("button", { name: "Close" })[0] as never);

    expect(onClose).toHaveBeenCalled();
  });

  it("draws nothing while closed", async () => {
    await render(
      <BottomSheet visible={false} onClose={() => undefined} title="Filters">
        <NativeText>Sheet content</NativeText>
      </BottomSheet>
    );

    expect(screen.queryByText("Sheet content")).toBeNull();
  });
});

describe("initialsOf", () => {
  it.each([
    [{ firstName: "Anna", lastName: "Kovács" }, "AK"],
    [{ firstName: "anna" }, "A"],
    [{ email: "zoltan@example.com" }, "Z"],
    [{}, "·"],
  ])("%j → %s", (person, initials) => {
    expect(initialsOf(person)).toBe(initials);
  });
});
