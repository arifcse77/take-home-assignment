import { Link, Route, Routes } from "react-router-dom";
import { DocumentListPage } from "./pages/DocumentListPage";
import { DocumentDetailPage } from "./pages/DocumentDetailPage";

export function App() {
  return (
    <div className="layout">
      <header className="header">
        <Link to="/" className="logo">
          Lomi — Document Review
        </Link>
      </header>
      <main className="main">
        <Routes>
          <Route path="/" element={<DocumentListPage />} />
          <Route path="/documents/:id" element={<DocumentDetailPage />} />
        </Routes>
      </main>
    </div>
  );
}