export function buildUploadGuidance({ statementImports = [], existingTransactions = [] }) {
  const importCount = Array.isArray(statementImports) ? statementImports.length : 0;
  const transactionCount = Array.isArray(existingTransactions) ? existingTransactions.length : 0;

  if (transactionCount === 0 && importCount === 0) {
    return {
      status: "First setup",
      headline: "Start with one current account CSV",
      body: "Upload the account you actually spend from first. One clean month is enough to unlock categories, the calendar, and a useful AI read.",
      nextBestUpload: "Your main current account, latest full month",
      aiPrompt: "I am setting up Money Hub for the first time. Tell me exactly which statements to upload first and why.",
      checklist: [
        "Use CSV rather than PDF where possible",
        "Start with your main current account",
        "Add three months when you can",
      ],
    };
  }

  if (importCount < 3) {
    return {
      status: "Learning",
      headline: "Add two more months for smarter patterns",
      body: "The app can read what you have, but recurring bills, salary rhythm, subscriptions, and trend advice get much sharper around three months.",
      nextBestUpload: "Same account, previous two full months",
      aiPrompt: "Look at my current upload history and tell me what statement month or account I should add next.",
      checklist: [
        "Keep each CSV tied to the right account",
        "Avoid uploading the same file twice",
        "Add savings or credit cards after the main account",
      ],
    };
  }

  return {
    status: "Good base",
    headline: "Keep it fresh each month",
    body: "You have enough history for useful pattern reads. The main job now is keeping the newest statement loaded so Today and AI advice stay current.",
    nextBestUpload: "Newest statement for any active account",
    aiPrompt: "Use my statement history and tell me which account or month looks stale.",
    checklist: [
      "Upload the newest month after each statement closes",
      "Use the overlap warnings before importing",
      "Add missing accounts only if they change the money picture",
    ],
  };
}
