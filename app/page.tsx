import { Suspense } from "react";
import { FolioApp } from "@/components/folio-app";

export default function Home() {
  return (
    <Suspense
      fallback={
        <div className="folio-desk">
          <div className="folio-lamp" aria-hidden />
          <p className="reader-status">Looking through the desk…</p>
        </div>
      }
    >
      <FolioApp />
    </Suspense>
  );
}
