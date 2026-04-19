import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import Page from "./page";

describe("homepage smoke", () => {
  it("renders the playground heading", () => {
    render(<Page />);
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent(
      "AutoAgent Negotiation Playground",
    );
  });
});
