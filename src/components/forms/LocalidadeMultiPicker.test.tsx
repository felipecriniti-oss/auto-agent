import { fireEvent, render, screen } from "@testing-library/react";
import type { ReactNode } from "react";
import { FormProvider, useForm } from "react-hook-form";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { LocalidadeMultiPicker } from "./LocalidadeMultiPicker";

type FormShape = {
  region_uf: string[];
  region_cities: string[];
};

function Harness({
  initialUfs = [],
  initialCities = [],
  children,
}: {
  initialUfs?: string[];
  initialCities?: string[];
  children: ReactNode;
}) {
  const form = useForm<FormShape>({
    defaultValues: { region_uf: initialUfs, region_cities: initialCities },
  });
  return <FormProvider {...form}>{children}</FormProvider>;
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("LocalidadeMultiPicker", () => {
  it("renders empty state when no regions are set", () => {
    render(
      <Harness>
        <LocalidadeMultiPicker />
      </Harness>,
    );
    expect(screen.getByText("Nenhuma região — aceita qualquer")).toBeInTheDocument();
  });

  it("renders one chip per pre-seeded tuple", () => {
    render(
      <Harness initialUfs={["SP", "RJ"]} initialCities={["São Paulo", "Rio de Janeiro"]}>
        <LocalidadeMultiPicker />
      </Harness>,
    );
    expect(screen.getByText(/São Paulo\/SP/)).toBeInTheDocument();
    expect(screen.getByText(/Rio de Janeiro\/RJ/)).toBeInTheDocument();
  });

  it("removes a chip when its X button is clicked", () => {
    render(
      <Harness initialUfs={["SP"]} initialCities={["São Paulo"]}>
        <LocalidadeMultiPicker />
      </Harness>,
    );
    const removeBtn = screen.getByLabelText("Remover São Paulo/SP");
    fireEvent.click(removeBtn);
    expect(screen.queryByText(/São Paulo\/SP/)).toBeNull();
    // Empty state returns
    expect(screen.getByText("Nenhuma região — aceita qualquer")).toBeInTheDocument();
  });

  it("Adicionar button is disabled when draft is incomplete", () => {
    render(
      <Harness>
        <LocalidadeMultiPicker />
      </Harness>,
    );
    const addBtn = screen.getByRole("button", { name: "Adicionar" }) as HTMLButtonElement;
    expect(addBtn.disabled).toBe(true);
  });

  it("passes disabled prop down to inner LocalidadePicker and button", () => {
    render(
      <Harness>
        <LocalidadeMultiPicker disabled />
      </Harness>,
    );
    const addBtn = screen.getByRole("button", { name: "Adicionar" }) as HTMLButtonElement;
    expect(addBtn.disabled).toBe(true);
  });
});
