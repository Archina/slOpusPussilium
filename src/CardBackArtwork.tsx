import templateSvg from "./assets/card-back-template.svg?raw";
import { Sigil } from "./Sigil";
import type { DomainSymbolId } from "./types";

export const CARD_BACK_TEMPLATE_SVG = templateSvg;
export const CARD_BACK_TEMPLATE_URL = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(templateSvg)}`;

export function CardBackArtwork({ symbol }: { symbol: DomainSymbolId }) {
  return <span className="card-back-artwork" aria-hidden="true"><img src={CARD_BACK_TEMPLATE_URL} alt="" /><span className="card-back-artwork-sigil"><Sigil symbol={symbol} /></span></span>;
}
