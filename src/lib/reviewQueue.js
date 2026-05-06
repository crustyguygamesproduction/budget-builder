import { readCoachGeneratedChecks } from "./coachGeneratedChecks";
import { normalizeText } from "./finance";
import { readDismissedReviewCheckKeys } from "./reviewDismissals";

export function buildVisibleReviewChecks({
  moneyUnderstanding,
  appMoneyModel,
  transactionRules = [],
  dismissedCheckKeys = readDismissedReviewCheckKeys(),
  coachChecks = null,
} = {}) {
  const dismissed = new Set((dismissedCheckKeys || []).filter(Boolean).map(String));
  const sourceCoachChecks = Array.isArray(coachChecks) ? coachChecks : readCoachGeneratedChecks();
  const modelChecks = appMoneyModel?.checksWaiting || moneyUnderstanding?.checks || [];

  return [...sourceCoachChecks, ...modelChecks]
    .filter(Boolean)
    .filter((candidate) => !dismissed.has(String(candidate?.key || "")))
    .filter((candidate) => !hasAnsweredReviewRule(candidate, transactionRules))
    .filter((candidate, index, all) => {
      const key = String(candidate?.key || "");
      if (!key) return true;
      return all.findIndex((item) => String(item?.key || "") === key) === index;
    });
}

export function hasAnsweredReviewRule(candidate, transactionRules = []) {
  const match = normalizeText(getCandidateMatchText(candidate));
  if (!match) return false;

  return (transactionRules || []).some((rule) => {
    const ruleText = normalizeText(rule?.match_text || "");
    if (!ruleText) return false;
    return ruleText.includes(match) || match.includes(ruleText);
  });
}

export function getCandidateMatchText(candidate) {
  return candidate?.matchText || candidate?.label || candidate?.question || "review check";
}
