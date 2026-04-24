import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { BrlCurrencyInput } from "./BrlCurrencyInput";

describe("BrlCurrencyInput", () => {
  it("displays R$ 130.000 when value is 130000", () => {
    render(<BrlCurrencyInput value={130000} onChange={() => {}} />);
    const input = screen.getByRole("textbox") as HTMLInputElement;
    expect(input.value).toBe("R$ 130.000");
  });

  it("displays empty when value is null", () => {
    render(<BrlCurrencyInput value={null} onChange={() => {}} />);
    const input = screen.getByRole("textbox") as HTMLInputElement;
    expect(input.value).toBe("");
  });

  it("emits integer reais on type — '130000' → 130000", () => {
    const onChange = vi.fn();
    render(<BrlCurrencyInput value={null} onChange={onChange} />);
    const input = screen.getByRole("textbox");
    fireEvent.change(input, { target: { value: "130000" } });
    expect(onChange).toHaveBeenCalledWith(130000);
  });

  it("strips non-digits on paste — '130.000' → 130000", () => {
    const onChange = vi.fn();
    render(<BrlCurrencyInput value={null} onChange={onChange} />);
    const input = screen.getByRole("textbox");
    fireEvent.change(input, { target: { value: "R$ 130.000" } });
    expect(onChange).toHaveBeenCalledWith(130000);
  });

  it("emits null when cleared", () => {
    const onChange = vi.fn();
    render(<BrlCurrencyInput value={130000} onChange={onChange} />);
    const input = screen.getByRole("textbox");
    fireEvent.change(input, { target: { value: "" } });
    expect(onChange).toHaveBeenCalledWith(null);
  });

  it("strips letters — 'abc130000' → 130000", () => {
    const onChange = vi.fn();
    render(<BrlCurrencyInput value={null} onChange={onChange} />);
    const input = screen.getByRole("textbox");
    fireEvent.change(input, { target: { value: "abc130000" } });
    expect(onChange).toHaveBeenCalledWith(130000);
  });

  it("is disabled when disabled prop is true", () => {
    render(<BrlCurrencyInput value={null} onChange={() => {}} disabled />);
    const input = screen.getByRole("textbox") as HTMLInputElement;
    expect(input.disabled).toBe(true);
  });
});
