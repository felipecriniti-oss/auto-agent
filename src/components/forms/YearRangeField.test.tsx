import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { YearRangeField } from "./YearRangeField";

describe("YearRangeField", () => {
  it("renders two number inputs in grid layout", () => {
    const { container } = render(
      <YearRangeField
        valueMin={null}
        valueMax={null}
        onChangeMin={() => {}}
        onChangeMax={() => {}}
      />,
    );
    const inputs = container.querySelectorAll("input[type='number']");
    expect(inputs.length).toBe(2);
    const grid = container.querySelector(".grid.grid-cols-2");
    expect(grid).not.toBeNull();
  });

  it("displays values when provided", () => {
    render(
      <YearRangeField
        valueMin={2018}
        valueMax={2023}
        onChangeMin={() => {}}
        onChangeMax={() => {}}
      />,
    );
    const inputs = screen.getAllByRole("spinbutton") as HTMLInputElement[];
    expect(inputs[0].value).toBe("2018");
    expect(inputs[1].value).toBe("2023");
  });

  it("emits number on type", () => {
    const onMin = vi.fn();
    render(
      <YearRangeField valueMin={null} valueMax={null} onChangeMin={onMin} onChangeMax={() => {}} />,
    );
    const inputs = screen.getAllByRole("spinbutton");
    fireEvent.change(inputs[0], { target: { value: "2018" } });
    expect(onMin).toHaveBeenCalledWith(2018);
  });

  it("emits null on clear", () => {
    const onMin = vi.fn();
    render(
      <YearRangeField valueMin={2018} valueMax={null} onChangeMin={onMin} onChangeMax={() => {}} />,
    );
    const inputs = screen.getAllByRole("spinbutton");
    fireEvent.change(inputs[0], { target: { value: "" } });
    expect(onMin).toHaveBeenCalledWith(null);
  });

  it("renders hint text when no error", () => {
    render(
      <YearRangeField
        valueMin={null}
        valueMax={null}
        onChangeMin={() => {}}
        onChangeMax={() => {}}
      />,
    );
    expect(screen.getByText("Deixe vazio para qualquer ano")).toBeInTheDocument();
  });

  it("renders error text when errorText provided (overrides hint)", () => {
    render(
      <YearRangeField
        valueMin={2023}
        valueMax={2018}
        onChangeMin={() => {}}
        onChangeMax={() => {}}
        errorText="Ano mínimo não pode ser maior que o máximo"
      />,
    );
    expect(screen.getByText("Ano mínimo não pode ser maior que o máximo")).toBeInTheDocument();
    expect(screen.queryByText("Deixe vazio para qualquer ano")).toBeNull();
  });
});
