export const analyticsEvents = {
  cronJobsProcessed: "cron_jobs_processed",
  householdCreated: "household_created",
  cohortConsentAccepted: "cohort_consent_accepted",
  sampleBoardViewed: "sample_board_viewed",
  loginMagicLinkSent: "login_magic_link_sent",
  userSignedIn: "user_signed_in",
  sourceInputSubmitted: "source_input_submitted",
  sourceInputImmediateExtractionFailed: "source_input_immediate_extraction_failed",
  coverageCardCreated: "coverage_card_created",
  coverageSlotSelfAccepted: "coverage_slot_self_accepted",
  coverageSlotMarkedCovered: "coverage_slot_marked_covered",
  householdMemberAdded: "household_member_added",
  householdMemberInviteSent: "household_member_invite_sent",
  childProfileAdded: "child_profile_added",
  coverageRequestCreated: "coverage_request_created",
  coverageRequestSendAttempted: "coverage_request_send_attempted",
  coverageRequestLinkOpened: "coverage_request_link_opened",
  coverageRequestAccepted: "coverage_request_accepted",
  coverageRequestDeclined: "coverage_request_declined",
  coverageRequestExpired: "coverage_request_expired",
  uploadExtractedTextApproved: "upload_extracted_text_approved",
  googleCalendarConnected: "google_calendar_connected",
  googleCalendarExportCompleted: "google_calendar_export_completed"
} as const;

export type AnalyticsEventName =
  (typeof analyticsEvents)[keyof typeof analyticsEvents];

export type AnalyticsProperties = Record<
  string,
  string | number | boolean | null | undefined
>;
