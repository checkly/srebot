import { getDocumentBySlug } from "../knowledge-base/knowledgeBase";
import { log } from "../log";

// It's a document that where we can store extra context for the account setup
// Explain here what tags, components, and names mean in the account
const CHECKLY_ACCOUNT_SETUP_DOCUMENT_SLUG =
  process.env.CHECKLY_ACCOUNT_SETUP_DOCUMENT_SLUG;

export const getExtraAccountSetupContext = async (): Promise<string | null> => {
  if (!CHECKLY_ACCOUNT_SETUP_DOCUMENT_SLUG) {
    return null;
  }

  const document = await getDocumentBySlug(CHECKLY_ACCOUNT_SETUP_DOCUMENT_SLUG);
  if (!document) {
    log.warn(
      "Could not find document with slug",
      CHECKLY_ACCOUNT_SETUP_DOCUMENT_SLUG,
    );
    return null;
  }

  log.debug("Found extra context document");

  return document.content;
};
