export type BundleGrantKind = "localFolder" | "remoteCache";
export type LibraryGrantState = "available" | "missing" | "revoked" | "changed";

export interface BundleLibraryEntry {
  bundleId: string;
  title: string;
  kind: BundleGrantKind;
  conceptCount: number;
  types: string[];
  tags: string[];
  revisionFingerprint: string | null;
  grantState: LibraryGrantState;
  lastSeenEpochMs: number;
  active: boolean;
}

export interface FederatedBundleSelection {
  bundleId: string;
  revisionFingerprint: string;
}

export interface FederatedBundleStatus {
  bundleId: string;
  title: string;
  grantState: LibraryGrantState;
  revisionFingerprint: string | null;
  expectedFingerprint: string | null;
}

export interface FederatedConceptResult {
  bundleId: string;
  bundleTitle: string;
  conceptId: string;
  revisionFingerprint: string;
  grantState: LibraryGrantState;
  title: string;
  type: string;
  description: string;
  tags: string[];
  snippet: string;
}

export interface FederatedConceptPage {
  bundles: FederatedBundleStatus[];
  results: FederatedConceptResult[];
  truncated: boolean;
}

export interface FederatedSourceResult {
  bundleId: string;
  bundleTitle: string;
  conceptId: string;
  revisionFingerprint: string;
  grantState: LibraryGrantState;
  uri: string;
  kinds: string[];
}

export interface FederatedSourcePage {
  bundles: FederatedBundleStatus[];
  results: FederatedSourceResult[];
  truncated: boolean;
}

export interface FederatedConceptRef {
  bundleId: string;
  bundleTitle: string;
  conceptId: string;
  revisionFingerprint: string;
  grantState: LibraryGrantState;
  title: string;
}

export interface FederatedRelationshipCandidate {
  kind: "possible-duplicate" | "relationship-candidate";
  basis: "matching-title" | "shared-source";
  evidence: string;
  requiresReview: true;
  left: FederatedConceptRef;
  right: FederatedConceptRef;
}

export interface FederatedRelationshipPage {
  bundles: FederatedBundleStatus[];
  results: FederatedRelationshipCandidate[];
  truncated: boolean;
}
