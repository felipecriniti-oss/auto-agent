import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { KmInput } from "./KmInput";

describe("KmInput", () => {
  it("displays '80.000' when value is 80000 (no R$ prefix)", () => {
    render(<KmInput value={80000} onChange={() => {}} />);
    const input = screen.getByRole("textbox") as HTMLInputElement;
    expect(input.value).toBe("80.000");
    expect(input.value).not.toContain("R$");
  });

  it("renders 'km' suffix", () => {
    render(<KmInput value={80000} onChange={() => {}} />);
    expect(screen.getByText("km")).toBeInTheDocument();
  });

  it("displays empty when value is null", () => {
    render(<KmInput value={null} onChange={() => {}} />);
    const input = screen.getByRole("textbox") as HTMLInputElement;
    expect(input.value).toBe("");
  });

  it("emits integer km on type — '80000' → 80000", () => {
    const onChange = vi.fn();
    render(<KmInput value={null} onChange={onChange} />);
    const input = screen.getByRole("textbox");
    fireEvent.change(input, { target: { value: "80000" } });
    expect(onChange).toHaveBeenCalledWith(80000);
  });

  it("strips non-digits — '80.000' → 80000", () => {
    const onChange = vi.fn();
    render(<KmInput value={null} onChange={onChange} />);
    const input = screen.getByRole("textbox");
    fireEvent.change(input, { target: { value: "80.000" } });
    expect(onChange).toHaveBeenCalledWith(80000);
  });

  it("emits null when cleared", () => {
    const onChange = vi.fn();
    render(<KmInput value={80000} onChange={onChange} />);
    const input = screen.getByRole("textbox");
    fireEvent.change(input, { target: { value: "" } });
    expect(onChange).toHaveBeenCalledWith(null);
  });
});
