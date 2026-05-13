export type CrmTab = "CONTACT_DIRECTORY" | "PROFILE_DETAIL" | "BILLING" | "ACTIVITY";

export type CrmRole = "TRADER" | "PLATFORM_USER";

export type CrmRoleFilter = "ALL" | "TRADER" | "PLATFORM_USER";

export type CrmSegmentFilter =
  | "ALL"
  | "FUNDED"
  | "EVALUATION"
  | "AT_RISK"
  | "OPERATIONS"
  | "RISK";

export type CrmContactStatus = "ACTIVE" | "AT_RISK";

export type CrmContact = {
  id: string;
  name: string;
  email: string;
  role: CrmRole;
  segment: string;
  status: CrmContactStatus;
  team: string;
  accountIds: string[];
  assignedTraders: string[];
  subscription: string;
  lastActivityAt: string;
  tags: string[];
};

export type CrmNoteItem = {
  id: string;
  authorName: string;
  note: string;
  createdAt: string;
};
