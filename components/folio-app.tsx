"use client";

import { useSearchParams } from "next/navigation";
import { DeskView } from "@/components/desk/desk-view";
import { ReaderView } from "@/components/reader/reader-view";

export function FolioApp() {
  const bookId = useSearchParams().get("book");
  if (bookId) return <ReaderView bookId={bookId} />;
  return <DeskView />;
}
