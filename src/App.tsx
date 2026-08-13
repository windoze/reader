import { useCallback, useEffect, useMemo, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import type { BookRecord, LibrarySnapshot } from "./domain/types";
import { LibraryView } from "./components/library/LibraryView";
import { ReaderView } from "./components/reader/ReaderView";
import { buildImportedBook } from "./services/importBook";
import { libraryRepository } from "./services/repository";
import {
  parseAppRoute,
  routeForBook,
  routeForGroup,
  routeForLocator
} from "./lib/routes";

const EMPTY_LIBRARY: LibrarySnapshot = {
  books: [],
  groups: []
};

export default function App() {
  const location = useLocation();
  const navigate = useNavigate();
  const route = useMemo(
    () => parseHashRoute(window.location.hash) ?? parseAppRoute(location.pathname, location.search),
    [location.key, location.pathname, location.search]
  );
  const [library, setLibrary] = useState<LibrarySnapshot>(EMPTY_LIBRARY);
  const [isBusy, setIsBusy] = useState(true);
  const [message, setMessage] = useState<string>();
  const selectedGroupId = route.view === "library" ? route.groupId : "all";
  const activeBookId = route.view === "reader" ? route.bookId : undefined;

  const reloadLibrary = useCallback(async () => {
    setLibrary(await libraryRepository.listLibrary());
  }, []);

  useEffect(() => {
    reloadLibrary()
      .catch((error: unknown) => setMessage(errorMessage(error)))
      .finally(() => setIsBusy(false));
  }, [reloadLibrary]);

  const activeBook = useMemo(
    () => library.books.find((book) => book.id === activeBookId),
    [activeBookId, library.books]
  );
  const currentRoute = `${location.pathname}${location.search}`;

  useEffect(() => {
    if (!isBusy && route.view === "reader" && !activeBook) {
      navigate(routeForGroup("all"), { replace: true });
    }
  }, [activeBook, isBusy, navigate, route.view]);

  const handleImport = useCallback(
    async (files: File[], groupId?: string) => {
      setIsBusy(true);
      setMessage(undefined);

      try {
        for (const file of files) {
          const imported = await buildImportedBook(file, groupId);
          await libraryRepository.addBook(imported);
        }

        await reloadLibrary();
        setMessage(`已导入 ${files.length} 本书`);
      } catch (error) {
        setMessage(errorMessage(error));
      } finally {
        setIsBusy(false);
      }
    },
    [reloadLibrary]
  );

  const handleCreateGroup = useCallback(
    async (name: string) => {
      if (!name.trim()) {
        return;
      }

      const group = await libraryRepository.createGroup(name);
      await reloadLibrary();
      navigate(routeForGroup(group.id));
    },
    [navigate, reloadLibrary]
  );

  const handleDeleteGroup = useCallback(
    async (groupId: string) => {
      await libraryRepository.deleteGroup(groupId);
      await reloadLibrary();
      navigate(routeForGroup("all"));
    },
    [navigate, reloadLibrary]
  );

  const handleUpdateBook = useCallback(
    async (book: BookRecord) => {
      await libraryRepository.updateBook(book);
      await reloadLibrary();
    },
    [reloadLibrary]
  );

  const handleDeleteBook = useCallback(
    async (bookId: string) => {
      await libraryRepository.deleteBook(bookId);
      await reloadLibrary();
    },
    [reloadLibrary]
  );

  const handleReaderLocatorUrlChange = useCallback(
    (nextLocator: Parameters<typeof routeForLocator>[1]) => {
      if (!activeBook) {
        return;
      }

      const nextRoute = routeForLocator(activeBook.id, nextLocator);

      if (nextRoute !== currentRoute) {
        navigate(nextRoute, { replace: true });
      }
    },
    [activeBook, currentRoute, navigate]
  );

  if (activeBook) {
    return (
      <ReaderView
        book={activeBook}
        repository={libraryRepository}
        routeLocator={route.view === "reader" ? route.locator : undefined}
        onLocatorUrlChange={handleReaderLocatorUrlChange}
        onClose={() => {
          navigate(routeForGroup(activeBook.groupId ?? "all"));
          void reloadLibrary();
        }}
      />
    );
  }

  return (
    <LibraryView
      library={library}
      selectedGroupId={selectedGroupId}
      isBusy={isBusy}
      message={message}
      onSelectGroup={(groupId) => navigate(routeForGroup(groupId))}
      onCreateGroup={handleCreateGroup}
      onDeleteGroup={handleDeleteGroup}
      onImport={handleImport}
      onOpenBook={(bookId) => navigate(routeForBook(bookId))}
      onUpdateBook={handleUpdateBook}
      onDeleteBook={handleDeleteBook}
    />
  );
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : "操作失败";
}

function parseHashRoute(hash: string) {
  if (!hash.startsWith("#/")) {
    return undefined;
  }

  return parseAppRoute(hash.slice(1));
}
