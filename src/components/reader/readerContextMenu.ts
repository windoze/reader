import { isTauri } from "@tauri-apps/api/core";
import { LogicalPosition } from "@tauri-apps/api/dpi";
import { Menu } from "@tauri-apps/api/menu";

interface ReaderContextMenuOptions {
  position: {
    x: number;
    y: number;
  };
  onAddNote(): void;
}

let readerContextMenu: Promise<Menu> | undefined;
let activeAddNoteHandler: (() => void) | undefined;

export async function showReaderContextMenu({
  position,
  onAddNote
}: ReaderContextMenuOptions): Promise<void> {
  activeAddNoteHandler = onAddNote;

  if (!isTauri()) {
    activeAddNoteHandler();
    return;
  }

  const menu = await getReaderContextMenu();
  await menu.popup(new LogicalPosition(position.x, position.y));
}

function getReaderContextMenu(): Promise<Menu> {
  readerContextMenu ??= Menu.new({
    items: [
      {
        id: "reader-context-add-note",
        text: "添加笔记",
        action: () => activeAddNoteHandler?.()
      },
      {
        item: "Separator"
      },
      {
        item: "Copy",
        text: "复制"
      }
    ]
  });

  return readerContextMenu;
}
