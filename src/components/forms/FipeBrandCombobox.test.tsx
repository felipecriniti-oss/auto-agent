import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { FipeBrandCombobox } from "./FipeBrandCombobox";

describe("FipeBrandCombobox", () => {
  it("renders trigger with placeholder when no value", () => {
    render(<FipeBrandCombobox value="" onChange={() => {}} />);
    expect(screen.getByRole("combobox")).toHaveTextContent("Selecione a marca");
  });

  it("renders trigger with value when selected", () => {
    render(<FipeBrandCombobox value="Honda" onChange={() => {}} />);
    expect(screen.getByRole("combobox")).toHaveTextContent("Honda");
  });

  it("opens popover on trigger click and lists brands from snapshot", () => {
    render(<FipeBrandCombobox value="" onChange={() => {}} />);
    const trigger = screen.getByRole("combobox");
    fireEvent.click(trigger);
    // At least Honda should be rendered after click (present in snapshot)
    expect(screen.getAllByText(/Honda/i).length).toBeGreaterThanOrEqual(1);
  });

  it("renders free-text Input when fallbackToText is true", () => {
    const onChange = vi.fn();
    render(<FipeBrandCombobox value="" onChange={onChange} fallbackToText />);
    const input = screen.getByPlaceholderText("Digite a marca");
    fireEvent.change(input, { target: { value: "MinhaMarca" } });
    expect(onChange).toHaveBeenCalledWith("MinhaMarca");
  });

  it("trigger is disabled when disabled prop is true", () => {
    render(<FipeBrandCombobox value="" onChange={() => {}} disabled />);
    const trigger = screen.getByRole("combobox") as HTMLButtonElement;
    expect(trigger.disabled).toBe(true);
  });
});
