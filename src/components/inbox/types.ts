export type InboxCaseStatus = 'suggested' | 'open' | 'waiting' | 'done' | 'dismissed';
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
  /** Amount quoted in the case text, for example "CHF 214.35"; null when the text names none. */
  amount: string | null;
  stepCount: number;
  doneStepCount: number;
  /** Calendar date (YYYY-MM-DD, Europe/Zurich) on which a finished case was last updated. */
  doneAt: string | null;
};

export type InboxApproval = {
  id: string;
  title: string;
  meta: string;
  detail: string;
  /** Where the proposed change lands: an action case, a Paperless document or the tag list. */
  href: string | null;
  hrefLabel: string | null;
  dueAt: string | null;
  priority: InboxPriority | null;
  amount: string | null;
  requestedById: string | null;
  requestedByName: string | null;
  /** Calendar date (YYYY-MM-DD, Europe/Zurich) on which the change was proposed. */
  requestedOn: string | null;
};

export type InboxReview = {
  id: number;
  documentId: number;
  title: string;
  /** Human labels of the metadata fields the suggestion would change. */
  changes: string[];
  stagedOn: string | null;
};

export type InboxData = {
  /** Calendar date (YYYY-MM-DD) in Europe/Zurich; all relative due labels and groups derive from it. */
  today: string;
  householdName: string;
  me: InboxMember;
  members: InboxMember[];
  cases: InboxCase[];
  approvals: InboxApproval[];
  reviews: InboxReview[];
  /** Pending review suggestions in total (the list above is capped). */
  reviewTotal: number;
  /** Every role except viewer may change cases. */
  canMutate: boolean;
  /** Only owners and adults decide approvals and review suggestions. */
  canDecide: boolean;
  /** Filter requested through the URL: all, mine, done or a member id. */
  initialFilter: string;
};
