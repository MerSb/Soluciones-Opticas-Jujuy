import { siteContent } from "../site-content";

// Shared shape of the legal documents. Each document lives in its own
// module so a production build only bundles the ones that are approved
// (see ./status.ts and app/routes.tsx).

export interface LegalSection {
  id: string;
  title: string;
  paragraphs: string[];
  items?: string[];
}

export interface LegalDocument {
  slug: string;
  title: string;
  description: string;
  /** Last edit of the draft (not an approval date). */
  updated: string;
  /** Approved by the business and its legal advisor (./status.ts). */
  approved: boolean;
  sections: LegalSection[];
}

const { address, phone } = siteContent;
export const LEGAL_CONTACT = `WhatsApp o teléfono ${phone}, o en el local de ${address}`;
