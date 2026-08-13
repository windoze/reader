import { describe, expect, it } from "vitest";
import type { ReaderSettings } from "../../../domain/types";
import {
  buildPaginationLayout,
  paginationCssVariables,
  paginationFingerprint
} from "./paginationLayout";

const settings: ReaderSettings = {
  theme: "light",
  fontFamily: "system",
  fontSize: 18,
  lineHeight: 1.75,
  paragraphSpacing: 1,
  contentWidth: 720,
  replaceEpubCss: true
};

describe("pagination layout", () => {
  it("switches to double-page mode only when the stage is wide and tall enough", () => {
    expect(buildPaginationLayout({ width: 1180, height: 720 }, settings, { minSheetHeight: 360 }).pageMode)
      .toBe(2);
    expect(buildPaginationLayout({ width: 760, height: 720 }, settings, { minSheetHeight: 360 }).pageMode)
      .toBe(1);
    expect(buildPaginationLayout({ width: 1180, height: 520 }, settings, { minSheetHeight: 360 }).pageMode)
      .toBe(1);
  });

  it("keeps paragraph spacing in css variables and pagination fingerprints", () => {
    const layout = buildPaginationLayout({ width: 760, height: 430 }, settings, { minSheetHeight: 360 });
    const roomierSettings = {
      ...settings,
      paragraphSpacing: 1.6
    };

    expect(paginationCssVariables(layout, roomierSettings)["--paragraph-spacing"]).toBe("1.6em");
    expect(paginationFingerprint(settings, layout)).not.toBe(
      paginationFingerprint(roomierSettings, layout)
    );
  });
});
