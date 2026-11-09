import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { IconGallery } from "./icon-gallery";

describe("IconGallery", () => {
  it("renders all condition labels", () => {
    render(<IconGallery />);
    expect(screen.getByRole("heading", { name: /icon library/i })).toBeInTheDocument();
    for (const label of ["Warm", "Moderate", "Cold", "Rainy", "Unknown"]) {
      expect(screen.getByText(label)).toBeInTheDocument();
    }
  });
});
