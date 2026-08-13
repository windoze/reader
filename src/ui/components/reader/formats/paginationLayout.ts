import type { ReaderSettings } from "../../../domain/types";

export interface PaginationStageSize {
  width: number;
  height: number;
}

export interface PaginationLayout {
  pageMode: 1 | 2;
  pageGap: number;
  pagePaddingX: number;
  pagePaddingY: number;
  sheetWidth: number;
  sheetHeight: number;
}

interface PaginationLayoutOptions {
  minSheetHeight: number;
  pagePaddingY?: number;
}

const PAGE_GAP = 24;
const DESKTOP_SHEET_WIDTH_TARGET = 860;

export function buildPaginationLayout(
  stageSize: PaginationStageSize,
  settings: Pick<ReaderSettings, "contentWidth">,
  options: PaginationLayoutOptions
): PaginationLayout {
  const width = stageSize.width || 900;
  const height = stageSize.height || 700;
  const pageMode = width >= 900 && height >= 560 ? 2 : 1;
  const pagePaddingX = width < 620 ? 24 : 38;
  const pagePaddingY = options.pagePaddingY ?? (height < 620 ? 24 : 34);
  const outerPadding = width < 620 ? 12 : 16;
  const maxSheetWidth = settings.contentWidth + pagePaddingX * 2;
  const availableWidth = Math.max(320, width - outerPadding);
  const expandedSheetWidth = Math.max(
    maxSheetWidth,
    Math.min(DESKTOP_SHEET_WIDTH_TARGET, availableWidth)
  );
  const sheetWidth = pageMode === 2
    ? Math.min(expandedSheetWidth, Math.floor((availableWidth - PAGE_GAP) / 2))
    : Math.min(maxSheetWidth, availableWidth);

  return {
    pageMode,
    pageGap: PAGE_GAP,
    pagePaddingX,
    pagePaddingY,
    sheetWidth: Math.floor(sheetWidth),
    sheetHeight: Math.max(options.minSheetHeight, Math.floor(height - 52))
  };
}

export function paginationCssVariables(
  layout: PaginationLayout,
  settings: Pick<ReaderSettings, "paragraphSpacing">
): Record<string, string> {
  return {
    "--page-width": `${layout.sheetWidth}px`,
    "--page-height": `${layout.sheetHeight}px`,
    "--page-gap": `${layout.pageGap}px`,
    "--page-padding-x": `${layout.pagePaddingX}px`,
    "--page-padding-y": `${layout.pagePaddingY}px`,
    "--paragraph-spacing": `${settings.paragraphSpacing}em`
  };
}

export function paginationFingerprint(settings: ReaderSettings, layout: PaginationLayout): string {
  return [
    layout.pageMode,
    layout.sheetWidth,
    layout.sheetHeight,
    layout.pagePaddingX,
    layout.pagePaddingY,
    settings.contentWidth,
    settings.fontFamily,
    settings.fontSize,
    settings.lineHeight,
    settings.paragraphSpacing
  ].join(":");
}
