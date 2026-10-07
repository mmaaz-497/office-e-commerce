import { describe, expect, it } from "vitest";
import { buttonClasses } from "@/components/ui/Button";
import { controlClasses } from "@/components/ui/Input";
import { badgeClasses } from "@/components/ui/Badge";
import { describedBy } from "@/components/ui/Field";

/**
 * 006 T017 — the primitives' class builders follow the Design System sizes,
 * tokens, disabled and focus rules (contracts/ui-components.md). Pages are not
 * mounted in tests, so the builders are what is asserted.
 */

const classes = (value: string) => value.split(/\s+/);

describe("buttonClasses", () => {
  it("sizes are 36 / 44 / 48 px", () => {
    expect(classes(buttonClasses("primary", "sm"))).toContain("h-9");
    expect(classes(buttonClasses("primary", "md"))).toContain("h-11");
    expect(classes(buttonClasses("primary", "lg"))).toContain("h-12");
  });

  it("primary uses the primary token with hover and active states", () => {
    expect(buttonClasses("primary", "md")).toContain(
      "bg-primary text-white hover:bg-primary-hover active:bg-primary-active",
    );
  });

  it("disabled uses the disabled tokens through disabled: variants", () => {
    const value = classes(buttonClasses("primary", "md"));
    expect(value).toContain("disabled:bg-disabled-bg");
    expect(value).toContain("disabled:text-disabled-fg");
    expect(value).toContain("disabled:cursor-not-allowed");
  });

  it("no variant is a pill", () => {
    for (const variant of ["primary", "secondary", "ghost", "danger", "link"] as const) {
      expect(classes(buttonClasses(variant, "md"))).not.toContain("rounded-full");
    }
  });

  it("a standalone link still meets the 44 px target", () => {
    expect(classes(buttonClasses("link", "md"))).toContain("min-h-11");
  });

  it("fullWidthMobile is full width below sm only", () => {
    const value = classes(buttonClasses("primary", "lg", { fullWidthMobile: true }));
    expect(value).toContain("w-full");
    expect(value).toContain("sm:w-auto");
    expect(classes(buttonClasses("primary", "lg"))).not.toContain("w-full");
  });
});

describe("controlClasses", () => {
  it("is 44 px high with 16 px text, the strong border and the primary focus border", () => {
    const value = classes(controlClasses({}));
    expect(value).toContain("h-11");
    expect(value).toContain("text-base");
    expect(value).toContain("border-border-strong");
    expect(value).toContain("focus-visible:border-primary");
    expect(value).not.toContain("border-danger");
  });

  it("invalid adds the danger border", () => {
    expect(classes(controlClasses({ invalid: true }))).toContain("border-danger");
  });

  it("size lg is 48 px high", () => {
    const value = classes(controlClasses({ size: "lg" }));
    expect(value).toContain("h-12");
    expect(value).not.toContain("h-11");
  });
});

describe("badgeClasses", () => {
  it.each([
    ["sale", "bg-sale", "text-white"],
    ["neutral", "bg-neutral-badge-bg", "text-neutral-badge"],
    ["success", "bg-success-soft", "text-success"],
    ["warning", "bg-warning-soft", "text-warning"],
    ["info", "bg-info-soft", "text-info"],
  ] as const)("%s maps to %s / %s, 22 px high, radius sm", (variant, bg, fg) => {
    const value = classes(badgeClasses(variant));
    expect(value).toContain(bg);
    expect(value).toContain(fg);
    expect(value).toContain("h-[22px]");
    expect(value).toContain("rounded-sm");
  });
});

describe("describedBy", () => {
  it("lists only the parts that exist", () => {
    expect(describedBy("x", { help: "h" })).toBe("x-help");
    expect(describedBy("x", { error: "e" })).toBe("x-error");
    expect(describedBy("x", { help: "h", error: "e" })).toBe("x-help x-error");
    expect(describedBy("x", {})).toBeUndefined();
  });
});
