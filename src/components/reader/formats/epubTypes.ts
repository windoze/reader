export interface EpubBookLike {
  ready: Promise<unknown>;
  loaded?: {
    navigation?: Promise<{ toc?: EpubNavItem[] }>;
  };
  locations: {
    generate(chars: number): Promise<unknown>;
    percentageFromCfi(cfi: string): number;
    cfiFromPercentage(percentage: number): string;
  };
  getRange(cfiRange: string): Promise<Range>;
  load(path: string): Promise<object>;
  renderTo(element: HTMLElement, options: Record<string, unknown>): EpubRenditionLike;
  section(target: string): EpubSectionLike | undefined;
  destroy(): void;
}

export interface EpubSectionLike {
  document?: Document;
  load(request: Function): Promise<unknown>;
  cfiFromRange(range: Range): string;
}

export interface EpubRenditionLike {
  display(target?: string): Promise<void>;
  next(): Promise<void>;
  prev(): Promise<void>;
  on(event: string, callback: (...args: unknown[]) => void): void;
  destroy(): void;
  getContents?(): EpubContents[];
  themes: {
    register(name: string, rules: Record<string, unknown>): void;
    select(name: string): void;
    fontSize(value: string): void;
  };
  annotations: {
    highlight(cfiRange: string, data: unknown, callback: () => void, className: string, styles: unknown): void;
  };
}

export interface EpubLocation {
  start?: {
    cfi?: string;
    displayed?: {
      page?: number;
      total?: number;
    };
    href?: string;
  };
}

export interface EpubContents {
  document?: Document;
  window?: Window;
  cfiFromRange?(range: Range, ignoreClass?: string): string;
}

export interface EpubNavItem {
  id?: string;
  label: string;
  href: string;
  subitems?: EpubNavItem[];
}
