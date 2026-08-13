import { Folder, LibraryBig, Plus, Trash2 } from "lucide-react";
import { useState } from "react";
import type { BookGroup, BookRecord } from "../../domain/types";

interface ShelfSidebarProps {
  groups: BookGroup[];
  books: BookRecord[];
  selectedGroupId: string | "all";
  onSelectGroup(groupId: string | "all"): void;
  onCreateGroup(name: string): Promise<void>;
  onDeleteGroup(groupId: string): Promise<void>;
}

export function ShelfSidebar({
  groups,
  books,
  selectedGroupId,
  onSelectGroup,
  onCreateGroup,
  onDeleteGroup
}: ShelfSidebarProps) {
  const [newGroupName, setNewGroupName] = useState("");

  return (
    <aside className="shelf-sidebar">
      <div className="brand-row">
        <LibraryBig size={24} aria-hidden />
        <span>Reader</span>
      </div>

      <nav className="group-list" aria-label="书架分组">
        <button
          className={selectedGroupId === "all" ? "active" : ""}
          type="button"
          onClick={() => onSelectGroup("all")}
        >
          <LibraryBig size={18} aria-hidden />
          <span>全部图书</span>
          <b>{books.length}</b>
        </button>

        {groups.map((group) => {
          const count = books.filter((book) => book.groupId === group.id).length;

          return (
            <div className="group-row" key={group.id}>
              <button
                className={selectedGroupId === group.id ? "active" : ""}
                type="button"
                onClick={() => onSelectGroup(group.id)}
              >
                <Folder size={18} aria-hidden />
                <span>{group.name}</span>
                <b>{count}</b>
              </button>
              <button
                className="icon-button subtle"
                title="删除分组"
                type="button"
                onClick={() => void onDeleteGroup(group.id)}
              >
                <Trash2 size={16} aria-hidden />
              </button>
            </div>
          );
        })}
      </nav>

      <form
        className="new-group-form"
        onSubmit={(event) => {
          event.preventDefault();
          void onCreateGroup(newGroupName).then(() => setNewGroupName(""));
        }}
      >
        <input
          aria-label="新分组名称"
          placeholder="新建分组"
          value={newGroupName}
          onChange={(event) => setNewGroupName(event.target.value)}
        />
        <button className="icon-button" title="添加分组" type="submit">
          <Plus size={18} aria-hidden />
        </button>
      </form>
    </aside>
  );
}
