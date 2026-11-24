import type { DomainSymbolId } from "./types";

export const symbolCatalog: Array<{ id: DomainSymbolId; name: string }> = [
  { id: "language", name: "Language" }, { id: "life", name: "Life science" },
  { id: "nordic", name: "Nordic languages" },
  { id: "chemistry", name: "Chemistry" }, { id: "physics", name: "Physics" },
  { id: "mathematics", name: "Mathematics" }, { id: "astronomy", name: "Astronomy" },
  { id: "medicine", name: "Medicine" }, { id: "computing", name: "Computing" },
  { id: "engineering", name: "Engineering" }, { id: "history", name: "History" },
  { id: "philosophy", name: "Philosophy" }, { id: "arts", name: "Arts" },
];

function SymbolPaths({ id }: { id: DomainSymbolId }) {
  switch (id) {
    case "language": return <><path d="M10 13c6-2 10 0 14 4v21c-4-4-8-6-14-4zM38 13c-6-2-10 0-14 4v21c4-4 8-6 14-4z"/><path d="M24 17v21M18 11l2-4 2 4M20 7v8"/></>;
    case "nordic": return <><circle cx="24" cy="24" r="17"/><path d="M16 9v30M9 24h30M16 17h23M16 31h23"/><path d="m33 7 1.4 3.6L38 12l-3.6 1.4L33 17l-1.4-3.6L28 12l3.6-1.4Z"/></>;
    case "life": return <><circle cx="24" cy="24" r="15"/><path d="M16 30c10 0 16-7 17-17-10 1-17 7-17 17Zm1 0 12-12M14 16l-4-2M36 31l4 3M31 10l2-4"/></>;
    case "chemistry": return <><path d="M18 8h12M20 8v11L11 37c-1 2 1 4 3 4h20c2 0 4-2 3-4l-9-18V8"/><path d="M15 31h18M19 35h2M27 28h2"/></>;
    case "physics": return <><circle cx="24" cy="24" r="3"/><ellipse cx="24" cy="24" rx="18" ry="8"/><ellipse cx="24" cy="24" rx="18" ry="8" transform="rotate(60 24 24)"/><ellipse cx="24" cy="24" rx="18" ry="8" transform="rotate(120 24 24)"/></>;
    case "mathematics": return <><circle cx="24" cy="24" r="17"/><path d="m24 8 15 26H9Zm-9 26 9-18 9 18M15 24h18"/></>;
    case "astronomy": return <><path d="M29 8a16 16 0 1 0 11 25A14 14 0 1 1 29 8Z"/><path d="m35 9 1.5 3.5L40 14l-3.5 1.5L35 19l-1.5-3.5L30 14l3.5-1.5Z"/></>;
    case "medicine": return <><path d="M24 6v35M17 11c-5 0-6 7-1 9l16 8c5 3 2 9-2 9M31 14c5 0 5 6 1 8l-16 8c-5 2-2 8 2 8"/><path d="m20 9 4-4 4 4"/></>;
    case "computing": return <><rect x="10" y="10" width="28" height="28" rx="3"/><path d="M17 4v6M24 4v6M31 4v6M17 38v6M24 38v6M31 38v6M4 17h6M4 24h6M4 31h6M38 17h6M38 24h6M38 31h6M17 30V18h7v6h7"/></>;
    case "engineering": return <><circle cx="24" cy="24" r="7"/><path d="M24 5v6M24 37v6M5 24h6M37 24h6M10.5 10.5l4.2 4.2M33.3 33.3l4.2 4.2M37.5 10.5l-4.2 4.2M14.7 33.3l-4.2 4.2"/><circle cx="24" cy="24" r="14"/></>;
    case "history": return <><path d="M14 7h20M14 41h20M17 7c0 9 3 12 7 17-4 5-7 8-7 17M31 7c0 9-3 12-7 17 4 5 7 8 7 17"/><path d="m19 34 5-4 5 4M20 14h8"/></>;
    case "philosophy": return <><path d="M5 24s7-11 19-11 19 11 19 11-7 11-19 11S5 24 5 24Z"/><circle cx="24" cy="24" r="6"/><path d="M24 5v5M24 38v5M7 11l4 4M37 11l-4 4"/></>;
    case "arts": return <><path d="M24 7c10 0 17 7 17 15 0 5-3 8-8 8h-4c-3 0-4 4-2 6 2 3-1 6-5 5C12 39 7 32 7 24 7 14 14 7 24 7Z"/><circle cx="16" cy="21" r="2"/><circle cx="22" cy="15" r="2"/><circle cx="30" cy="17" r="2"/><circle cx="34" cy="24" r="2"/></>;
  }
}

export function Sigil({ symbol, large = false }: { symbol: DomainSymbolId; large?: boolean }) {
  const name = symbolCatalog.find((entry) => entry.id === symbol)?.name ?? symbol;
  return <div className={`sigil ${large ? "large" : ""}`} title={name}><svg viewBox="0 0 48 48" role="img" aria-label={`${name} sigil`}><SymbolPaths id={symbol} /></svg></div>;
}
