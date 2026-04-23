import { zxcvbn, zxcvbnOptions } from "@zxcvbn-ts/core";
import * as zxcvbnCommonPackage from "@zxcvbn-ts/language-common";
import * as zxcvbnPtBrPackage from "@zxcvbn-ts/language-pt-br";

/**
 * Configure zxcvbn once at module load with PT-BR dictionary + common
 * password blocklists. Subsequent calls to `estimatePasswordStrength` are
 * synchronous and fast (<10ms for typical passwords).
 */
zxcvbnOptions.setOptions({
  translations: zxcvbnPtBrPackage.translations,
  graphs: zxcvbnCommonPackage.adjacencyGraphs,
  dictionary: {
    ...zxcvbnCommonPackage.dictionary,
    ...zxcvbnPtBrPackage.dictionary,
  },
});

export type StrengthLevel = 0 | 1 | 2 | 3 | 4;

export interface PasswordStrength {
  score: StrengthLevel;
  label: string;
  warning: string | null;
  suggestions: string[];
}

const LABELS: Record<StrengthLevel, string> = {
  0: "Muito fraca",
  1: "Fraca",
  2: "Razoável",
  3: "Boa",
  4: "Excelente",
};

export function estimatePasswordStrength(
  password: string,
  userInputs: string[] = [],
): PasswordStrength {
  if (!password) {
    return { score: 0, label: LABELS[0], warning: null, suggestions: [] };
  }
  const result = zxcvbn(password, userInputs);
  const score = Math.min(4, Math.max(0, result.score)) as StrengthLevel;
  return {
    score,
    label: LABELS[score],
    warning: result.feedback.warning || null,
    suggestions: result.feedback.suggestions ?? [],
  };
}
