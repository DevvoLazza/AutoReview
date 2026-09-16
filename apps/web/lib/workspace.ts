import type { RequestPrincipal } from "@reviewguard/contracts";
export type Workspace = {
  principal: RequestPrincipal;
  locations: Array<{
    id: string;
    displayName: string;
    googleAccountName: string;
    googleLocationName: string;
    active: boolean;
    defaultLanguage: string;
    tone: string;
    manualApprovalCount: number;
  }>;
  settings: { killSwitch: boolean; defaultLanguage: string; tone: string };
  metrics: { pending: number; attention: number; published: number; approvedSources: number };
  integration: {
    googleMode: string;
    googleConnected: boolean;
    aiMode: string;
    model: string;
    storageMode: string;
    automationReleased: boolean;
  };
};
