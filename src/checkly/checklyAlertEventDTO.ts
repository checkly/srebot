export type ChecklyAlertSummary = {
  checkName: string;
  checkId: string;
  checkType: string;
  groupName: string;
  alertTitle: string;
  alertType: string;
  checkResultId: string;
  apiCheckResponseStatusCode?: number;
  apiCheckResponseStatusText?: string;
  runLocation: string;
  aiSummary: AnalysisResult;
};

export type AnalysisResult = {
  logSummary: string;
  scriptAnalysis: string;
  rootCause: string;
  suggestedFix: string;
};
