import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { InlineValue } from "../src/components/InlineValue";
import { InlineKey } from "../src/components/InlineKey";

afterEach(cleanup);
for (const kind of ["value", "key"] as const) {
  describe(`${kind} inline edit focus`, () => {
    function setup() {
      const commit = vi.fn();
      render(
        <>
          <div>
            {kind === "value" ? (
              <InlineValue
                revision="initial"
                locale="en"
                value="old"
                query=""
                disabled={false}
                onCommit={commit}
                onEdit={vi.fn()}
              />
            ) : (
              <InlineKey
                revision="initial"
                locale="en"
                name="old"
                query=""
                disabled={false}
                onCommit={commit}
              />
            )}
          </div>
          <span data-testid="blank">non-focusable blank</span>
          <input aria-label="other input" />
        </>,
      );
      fireEvent.doubleClick(
        screen.getByText(kind === "value" ? '"old"' : "old"),
      );
      const input = screen.getByRole("textbox", {
        name: kind === "value" ? "Edit value" : "Edit field name old",
      });
      fireEvent.change(input, { target: { value: "uncommitted draft" } });
      return { commit, input };
    }
    it("cancels on an outside click even when the target cannot take focus", () => {
      const { commit } = setup();
      fireEvent.click(screen.getByTestId("blank"));
      expect(screen.queryByDisplayValue("uncommitted draft")).toBeNull();
      expect(screen.getByText(kind === "value" ? '"old"' : "old")).toBeTruthy();
      expect(commit).not.toHaveBeenCalled();
    });
    it("keeps drafts through window blur, focus restoration and clicks inside the editor", () => {
      const { commit, input } = setup();
      fireEvent.blur(window);
      fireEvent.focus(window);
      fireEvent.focusIn(document.body);
      fireEvent.click(input);
      expect(input).toHaveValue("uncommitted draft");
      fireEvent.keyDown(input, { key: "Enter" });
      expect(commit).toHaveBeenCalledWith("uncommitted draft");
    });
  });
}
