export type InboxCaseStatus = 'suggested' | 'open' | 'waiting' | 'done';
export type InboxPriority = 'low' | 'normal' | 'high' | 'urgent';

export type InboxMember = { id: string; name: string; role: string };

export type InboxCase = {
  id: string;
  title: string;
  summary: string;
  status: InboxCaseStatus;
  priority: InboxPriority;
  /** Calendar date (YYYY-MM-DD) or null when the case has no deadline. */
  dueAt: string | null;
  assigneeId: string | null;
  documentId: number | null;
  /** Calendar date (YYYY-MM-DD) on which a finished case was last updated. */
  doneAt: string | null;
};

export type InboxApproval = {
  id: string;
  title: string;
  meta: string;
  detail: string;
  requestedById: string | null;
  requestedByName: string | null;
};

export type InboxData = {
  /** Server calendar date (YYYY-MM-DD); all relative due labels are derived from it. */
  today: string;
  householdName: string;
  me: InboxMember;
  members: InboxMember[];
  cases: InboxCase[];
  approvals: InboxApproval[];
  reviewCount: number;
  canMutate: boolean;
  canDecide: boolean;
};
