"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import {
  canTransitionSlot,
  deriveAttentionFlags,
  deriveCoverageState
} from "@/lib/coverage-state";
import { createCoverageRequestWithStubSend } from "@/lib/coverage-requests/create";
import { encodeManualCoverageRequestLinkFlash } from "@/lib/coverage-requests/manual-link-flash";
import {
  disconnectGoogleCalendarConnection,
  exportCoverageCardToGoogleCalendar as exportCardToGoogle
} from "@/lib/google-calendar/server";
import type { CoverageRequestChannel } from "@/lib/coverage-requests/senders/types";
import { processSourceInputExtractionNow } from "@/lib/extraction/process-source-input";
import { analyticsEvents } from "@/lib/posthog/events";
import { captureServerEvent } from "@/lib/posthog/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import type {
  CardType,
  CoverageSlotKind,
  CoverageSlotState,
  ReadinessStatus
} from "@/lib/types";

type HouseholdContext = {
  householdId: string;
  memberId: string;
  role: string;
  timezone: string;
};

type RecurrenceFrequency = "none" | "daily" | "weekly" | "biweekly" | "monthly";
type RecurrenceCount = "4" | "8";

export async function addHouseholdMember(formData: FormData) {
  const ctx = await getHouseholdContext();
  requireHouseholdAdmin(ctx);

  const displayName = requiredString(formData, "displayName");
  const role = String(formData.get("role") ?? "helper");
  const email = normalizeEmail(optionalString(formData, "email"));
  const phone = optionalString(formData, "phone");

  if (role !== "parent" && role !== "helper") {
    throw new Error("Member role must be parent or helper.");
  }

  if (email && !isLikelyEmail(email)) {
    throw new Error("Enter a valid email address.");
  }

  const supabase = await createSupabaseServerClient();
  const { data: member, error } = await supabase
    .from("household_members")
    .insert({
      household_id: ctx.householdId,
      display_name: displayName,
      role,
      email,
      phone,
      active: true
    })
    .select("id")
    .single<{ id: string }>();

  if (error) throw new Error(error.message);

  const inviteStatus = email
    ? await sendMagicLinkInvite(email).then(
        () => "member_invited",
        () => "member_added_invite_failed"
      )
    : "member_added";

  await captureServerEvent(
    analyticsEvents.householdMemberAdded,
    {
      household_id: ctx.householdId,
      role,
      has_email: Boolean(email),
      has_phone: Boolean(phone),
      invite_status: inviteStatus
    },
    ctx.memberId
  ).catch(() => undefined);

  revalidatePath("/app");
  redirect(
    `/app?setup=${inviteStatus}&savedName=${encodeURIComponent(displayName)}&memberId=${member.id}#household-setup`
  );
}

export async function addChild(formData: FormData) {
  const ctx = await getHouseholdContext();
  requireHouseholdAdmin(ctx);

  const displayName = requiredString(formData, "displayName");
  const grade = optionalString(formData, "grade");

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.from("children").insert({
    household_id: ctx.householdId,
    display_name: displayName,
    grade,
    status: "active"
  });

  if (error) throw new Error(error.message);

  await captureServerEvent(
    analyticsEvents.childProfileAdded,
    {
      household_id: ctx.householdId,
      has_grade: Boolean(grade)
    },
    ctx.memberId
  ).catch(() => undefined);

  revalidatePath("/app");
  redirect(`/app?setup=child_added&savedName=${encodeURIComponent(displayName)}#household-setup`);
}

export async function sendHouseholdMemberInvite(formData: FormData) {
  const ctx = await getHouseholdContext();
  requireHouseholdAdmin(ctx);

  const memberId = requiredString(formData, "memberId");
  const supabase = await createSupabaseServerClient();
  const { data: member, error } = await supabase
    .from("household_members")
    .select("id, display_name, email, user_id")
    .eq("id", memberId)
    .eq("household_id", ctx.householdId)
    .eq("active", true)
    .maybeSingle<{
      id: string;
      display_name: string;
      email: string | null;
      user_id: string | null;
    }>();

  if (error) throw new Error(error.message);
  if (!member) throw new Error("Member must belong to this household.");
  if (member.user_id) {
    redirect(
      `/app?setup=member_already_joined&savedName=${encodeURIComponent(member.display_name)}#household-setup`
    );
  }

  const email = normalizeEmail(member.email);
  if (!email) {
    throw new Error("Add an email before sending an invite.");
  }

  const inviteStatus = await sendMagicLinkInvite(email).then(
    () => "invite_sent",
    () => "invite_failed"
  );

  await captureServerEvent(
    analyticsEvents.householdMemberInviteSent,
    {
      household_id: ctx.householdId,
      member_id: member.id,
      status: inviteStatus
    },
    ctx.memberId
  ).catch(() => undefined);

  revalidatePath("/app");
  redirect(
    `/app?setup=${inviteStatus}&savedName=${encodeURIComponent(member.display_name)}&memberId=${member.id}#household-setup`
  );
}

export async function createManualCard(formData: FormData) {
  const ctx = await getHouseholdContext();
  requireHouseholdAdmin(ctx);

  const supabase = await createSupabaseServerClient();
  const title = requiredString(formData, "title");
  const cardType = enumValue<CardType>(formData, "cardType", [
    "event",
    "deadline",
    "decision",
    "change_standalone"
  ]);
  const slotKind = enumValue<CoverageSlotKind>(formData, "slotKind", [
    "dropoff",
    "pickup",
    "stay_attend",
    "bring_prep",
    "general_owner"
  ]);
  const startsAt = optionalDateTime(formData, "startsAt", ctx.timezone);
  const location = optionalString(formData, "location");
  const sourceSummary = optionalString(formData, "sourceSummary") ?? "Manual entry";
  const reviewReason = optionalString(formData, "reviewReason");
  const confidence = optionalNumber(formData, "confidence");
  const childId = optionalString(formData, "childId");
  const readinessLabel = optionalString(formData, "readinessLabel");
  const readinessDueAt = optionalDateTime(formData, "readinessDueAt", ctx.timezone);
  const recurrenceFrequency = optionalEnumValue<RecurrenceFrequency>(formData, "recurrenceFrequency", [
    "none",
    "daily",
    "weekly",
    "biweekly",
    "monthly"
  ], "none");
  const recurrenceCount = optionalEnumValue<RecurrenceCount>(formData, "recurrenceCount", [
    "4",
    "8"
  ], "4");
  const occurrences = recurrenceOccurrences({
    startsAt,
    frequency: cardType === "event" ? recurrenceFrequency : "none",
    count: Number(recurrenceCount),
    timezone: ctx.timezone
  });

  const derivedInput = {
    confidence,
    reviewReason,
    hasUnconfirmedChange: cardType === "change_standalone",
    slots: [{ state: "needs_coverage" as CoverageSlotState }],
    readinessItems: readinessLabel
      ? [{ status: "open" as ReadinessStatus, dueAt: readinessDueAt }]
      : []
  };

  const recurrenceGroupId = occurrences.length > 1 ? crypto.randomUUID() : null;
  let firstCardId: string | null = null;

  for (const [index, occurrenceStartsAt] of occurrences.entries()) {
    const occurrenceTitle =
      index === 0 ? title : `${title} (${index + 1} of ${occurrences.length})`;
    const occurrenceSourceSummary =
      occurrences.length > 1
        ? `${sourceSummary} · Repeats ${recurrenceFrequencyLabel(recurrenceFrequency)}`
        : sourceSummary;

    const { data: card, error: cardError } = await supabase
      .from("coverage_cards")
      .insert({
        household_id: ctx.householdId,
        card_type: cardType,
        title: occurrenceTitle,
        starts_at: occurrenceStartsAt,
        location,
        source_summary: occurrenceSourceSummary,
        review_reason: reviewReason,
        confidence,
        attention_flags: deriveAttentionFlags(derivedInput),
        computed_coverage_state: deriveCoverageState(derivedInput),
        created_by: ctx.memberId,
        manually_edited: true,
        recurrence_group_id: recurrenceGroupId,
        recurrence_index: recurrenceGroupId ? index : null,
        recurrence_label: recurrenceGroupId ? recurrenceFrequencyLabel(recurrenceFrequency) : null
      })
      .select("id")
      .single<{ id: string }>();

    if (cardError) throw new Error(cardError.message);
    firstCardId ??= card.id;

    const { error: slotError } = await supabase.from("coverage_slots").insert({
      card_id: card.id,
      kind: slotKind,
      state: "needs_coverage"
    });
    if (slotError) throw new Error(slotError.message);

    if (childId) {
      const { error } = await supabase.from("card_children").insert({
        card_id: card.id,
        child_id: childId
      });
      if (error) throw new Error(error.message);
    }

    if (readinessLabel) {
      const { error } = await supabase.from("readiness_items").insert({
        card_id: card.id,
        label: readinessLabel,
        due_at: readinessDueAt,
        status: "open"
      });
      if (error) throw new Error(error.message);
    }

    await logCardEvent(ctx, card.id, "manual_card_created", {
      cardType,
      slotKind,
      recurrenceFrequency,
      recurrenceIndex: index,
      recurrenceCount: occurrences.length
    });
    await refreshCardState(card.id);
  }

  await captureServerEvent(
    analyticsEvents.coverageCardCreated,
    {
      household_id: ctx.householdId,
      card_id: firstCardId,
      card_type: cardType,
      slot_kind: slotKind,
      has_child: Boolean(childId),
      has_readiness: Boolean(readinessLabel),
      source: "manual",
      recurrence_frequency: recurrenceFrequency,
      recurrence_count: occurrences.length
    },
    ctx.memberId
  ).catch(() => undefined);

  revalidatePath("/app");
  const status = occurrences.length > 1 ? "recurring_card_created" : "manual_card_created";
  redirect(
    `/app?cardSaved=${status}&cardCount=${occurrences.length}&cardId=${firstCardId ?? ""}#${firstCardId ?? "new-card"}`
  );
}

export async function createPasteSourceInput(formData: FormData) {
  const ctx = await getHouseholdContext();
  requireHouseholdAdmin(ctx);

  const supabase = await createSupabaseServerClient();
  const pastedText = requiredString(formData, "pastedText");
  const rawSubject = optionalString(formData, "rawSubject") ?? "Pasted logistics";
  const { data, error } = await supabase
    .rpc("create_paste_source_input", {
      p_pasted_text: pastedText,
      p_raw_subject: rawSubject
    })
    .single<{ source_input_id: string }>();

  if (error) throw new Error(error.message);

  await captureServerEvent(
    analyticsEvents.sourceInputSubmitted,
    {
      household_id: ctx.householdId,
      source_input_id: data.source_input_id,
      source_type: "paste",
      source_size_bucket: sourceSizeBucket(pastedText)
    },
    ctx.memberId
  ).catch(() => undefined);

  await processSourceInputExtractionNow(data.source_input_id).catch((error) =>
    captureServerEvent(
      analyticsEvents.sourceInputImmediateExtractionFailed,
      {
        household_id: ctx.householdId,
        source_input_id: data.source_input_id,
        error: error instanceof Error ? error.message : "Unknown immediate extraction failure"
      },
      ctx.memberId
    ).catch(() => undefined)
  );

  revalidatePath("/app");
  redirect(`/app/sources/${data.source_input_id}`);
}

export async function updateCoverageCard(formData: FormData) {
  const ctx = await getHouseholdContext();
  requireParentOrHouseholdAdmin(ctx);

  const cardId = requiredString(formData, "cardId");
  await assertCardBelongsToHousehold(cardId, ctx.householdId);

  const title = requiredString(formData, "title");
  const cardType = enumValue<CardType>(formData, "cardType", [
    "event",
    "deadline",
    "decision",
    "change_standalone"
  ]);
  const childIds = stringList(formData, "childIds");
  const startsAt = optionalDateTime(formData, "startsAt", ctx.timezone);
  const location = optionalString(formData, "location");

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.rpc("correct_coverage_card", {
    p_card_id: cardId,
    p_card_type: cardType,
    p_title: title,
    p_starts_at: startsAt,
    p_location: location,
    p_child_ids: childIds
  });

  if (error) throw new Error(error.message);

  await logCardEvent(ctx, cardId, "coverage_card_corrected", { cardType });
  revalidatePath("/app");
  redirect(`/app?cardSaved=updated&cardId=${cardId}#${cardId}`);
}

export async function updateSlotKind(formData: FormData) {
  const ctx = await getHouseholdContext();
  requireHouseholdAdmin(ctx);

  const slotId = requiredString(formData, "slotId");
  const kind = enumValue<CoverageSlotKind>(formData, "slotKind", [
    "dropoff",
    "pickup",
    "stay_attend",
    "bring_prep",
    "general_owner"
  ]);

  const supabase = await createSupabaseServerClient();
  const slot = await getSlotContext(slotId);
  const { error } = await supabase
    .from("coverage_slots")
    .update({ kind, updated_at: new Date().toISOString() })
    .eq("id", slotId);

  if (error) throw new Error(error.message);
  await logCardEvent(ctx, slot.cardId, "coverage_slot_kind_updated", { kind });
  await refreshCardState(slot.cardId);
  revalidatePath("/app");
}

export async function coverSlotAsCurrentMember(formData: FormData) {
  const ctx = await getHouseholdContext();
  const slotId = requiredString(formData, "slotId");

  await transitionSlot({
    ctx,
    slotId,
    nextState: "accepted",
    ownerMemberId: ctx.memberId,
    eventType: "coverage_slot_self_accepted"
  });

  await captureServerEvent(
    analyticsEvents.coverageSlotSelfAccepted,
    { household_id: ctx.householdId },
    ctx.memberId
  ).catch(() => undefined);
}

export async function markSlotAlreadyCovered(formData: FormData) {
  const ctx = await getHouseholdContext();
  requireHouseholdAdmin(ctx);

  const slotId = requiredString(formData, "slotId");
  const ownerMemberId = optionalString(formData, "ownerMemberId");
  const externalOwnerText = optionalString(formData, "externalOwnerText");

  if (!ownerMemberId && !externalOwnerText) {
    throw new Error("Choose a household member/helper or enter who already has it covered.");
  }

  if (ownerMemberId) {
    await transitionSlot({
      ctx,
      slotId,
      nextState: "accepted",
      ownerMemberId,
      eventType: "coverage_slot_marked_member_covered"
    });
    await captureServerEvent(
      analyticsEvents.coverageSlotMarkedCovered,
      { household_id: ctx.householdId, owner_type: "household_member" },
      ctx.memberId
    ).catch(() => undefined);
    return;
  }

  const supabase = await createSupabaseServerClient();
  const { data: contact, error: contactError } = await supabase
    .from("external_contacts")
    .insert({
      household_id: ctx.householdId,
      display_name: externalOwnerText,
      created_by: ctx.memberId
    })
    .select("id")
    .single<{ id: string }>();

  if (contactError) throw new Error(contactError.message);

  await transitionSlot({
    ctx,
    slotId,
    nextState: "covered_external",
    externalContactId: contact.id,
    externalOwnerText: externalOwnerText ?? undefined,
    eventType: "coverage_slot_marked_external_covered"
  });

  await captureServerEvent(
    analyticsEvents.coverageSlotMarkedCovered,
    { household_id: ctx.householdId, owner_type: "external_contact" },
    ctx.memberId
  ).catch(() => undefined);
}

export async function setSlotState(formData: FormData) {
  const ctx = await getHouseholdContext();
  requireHouseholdAdmin(ctx);

  const slotId = requiredString(formData, "slotId");
  const nextState = enumValue<CoverageSlotState>(formData, "state", [
    "needs_coverage",
    "requested",
    "accepted",
    "declined",
    "cancelled",
    "covered_external"
  ]);

  await transitionSlot({
    ctx,
    slotId,
    nextState,
    eventType: "coverage_slot_state_updated"
  });
}

export async function createCoverageRequest(formData: FormData) {
  const ctx = await getHouseholdContext();
  requireHouseholdAdmin(ctx);

  const cardId = requiredString(formData, "cardId");
  const slotId = requiredString(formData, "slotId");
  const requestedMemberId = optionalString(formData, "requestedMemberId");
  const externalDisplayName = optionalString(formData, "externalDisplayName");
  const externalEmail = normalizeEmail(optionalString(formData, "externalEmail"));
  const externalPhone = optionalString(formData, "externalPhone");
  const note = optionalString(formData, "note");
  const channel = enumValue<CoverageRequestChannel>(formData, "channel", [
    "sms",
    "email",
    "manual_link"
  ]);

  if (!requestedMemberId && !externalDisplayName) {
    throw new Error("Choose a household member/helper or enter who to ask.");
  }

  const supabase = await createSupabaseServerClient();
  const requestedMember = requestedMemberId
    ? await getCoverageRequestMember(requestedMemberId, ctx.householdId)
    : null;
  const recipientLabel =
    optionalString(formData, "recipientLabel") ??
    requestedMember?.display_name ??
    externalDisplayName ??
    "Coverage helper";
  const memberEmail = normalizeEmail(requestedMember?.email ?? null);
  const emailDestination = requestedMember ? memberEmail : externalEmail;

  if (channel === "email" && !emailDestination) {
    throw new Error("Add an email for this member/helper or use the manual response link.");
  }

  if (channel === "email" && emailDestination && !isLikelyEmail(emailDestination)) {
    throw new Error("Enter a valid email address or use the manual response link.");
  }

  const result = await createCoverageRequestWithStubSend({
    supabase,
    cardId,
    slotIds: [slotId],
    channel,
    requestedMemberId,
    externalDisplayName,
    externalEmail,
    externalPhone,
    note,
    recipientLabel,
    recipientDestination: channel === "email" ? emailDestination : channel === "sms" ? externalPhone : null
  });

  await captureServerEvent(
    analyticsEvents.coverageRequestCreated,
    {
      household_id: ctx.householdId,
      card_id: cardId,
      request_token_id: result.requestTokenId,
      request_count: result.requestIds.length,
      slot_count: 1,
      channel,
      recipient_type: requestedMemberId ? "household_member" : "external_contact",
      provider: result.sendResult.provider
    },
    ctx.memberId
  ).catch(() => undefined);

  await captureServerEvent(
    analyticsEvents.coverageRequestSendAttempted,
    {
      household_id: ctx.householdId,
      card_id: cardId,
      request_token_id: result.requestTokenId,
      channel,
      provider: result.sendResult.provider,
      status: result.sendResult.status
    },
    ctx.memberId
  ).catch(() => undefined);

  revalidatePath("/app");
  const flash = encodeManualCoverageRequestLinkFlash({
    householdId: ctx.householdId,
    memberId: ctx.memberId,
    requestTokenId: result.requestTokenId,
    responseUrl: result.responseUrl
  });
  redirect(`/app?coverageRequest=created&coverageRequestFlash=${encodeURIComponent(flash)}`);
}

export async function exportCoverageCardToGoogleCalendar(formData: FormData) {
  const ctx = await getHouseholdContext();
  requireParentOrHouseholdAdmin(ctx);

  const cardId = requiredString(formData, "cardId");
  let status = "failed";
  try {
    const result = await exportCardToGoogle({
      householdId: ctx.householdId,
      memberId: ctx.memberId,
      cardId,
      timezone: ctx.timezone
    });
    status = result.status;
  } catch {
    status = "failed";
  }

  await captureServerEvent(
    analyticsEvents.googleCalendarExportCompleted,
    { household_id: ctx.householdId, card_id: cardId, status },
    ctx.memberId
  ).catch(() => undefined);

  revalidatePath("/app");
  redirect(`/app?calendarExport=${status}#${cardId}`);
}

export async function disconnectGoogleCalendar() {
  const ctx = await getHouseholdContext();
  requireParentOrHouseholdAdmin(ctx);

  await disconnectGoogleCalendarConnection({
    householdId: ctx.householdId,
    memberId: ctx.memberId
  });

  revalidatePath("/app");
  redirect("/app?calendar=disconnected");
}

export async function updateReadinessItem(formData: FormData) {
  const ctx = await getHouseholdContext();
  requireParentOrHouseholdAdmin(ctx);

  const itemId = requiredString(formData, "itemId");
  const label = requiredString(formData, "label");
  const status = enumValue<ReadinessStatus>(formData, "status", [
    "open",
    "done",
    "not_needed"
  ]);
  const ownerMemberId = optionalString(formData, "ownerMemberId");
  const externalOwnerText = optionalString(formData, "externalOwnerText");
  const dueAt = optionalDateTime(formData, "dueAt", ctx.timezone);

  const supabase = await createSupabaseServerClient();
  const readiness = await getReadinessItemContext(itemId);
  await assertCardBelongsToHousehold(readiness.cardId, ctx.householdId);
  if (ownerMemberId) {
    await assertMemberBelongsToHousehold(ownerMemberId, ctx.householdId);
  }

  const { error } = await supabase
    .rpc("correct_readiness_item", {
      p_item_id: itemId,
      p_label: label,
      p_status: status,
      p_due_at: dueAt,
      p_owner_member_id: ownerMemberId,
      p_external_owner_text: externalOwnerText
    });

  if (error) throw new Error(error.message);
  await logCardEvent(ctx, readiness.cardId, "readiness_item_updated", { status });
  revalidatePath("/app");
}

export async function addReadinessItemToCard(formData: FormData) {
  const ctx = await getHouseholdContext();
  requireParentOrHouseholdAdmin(ctx);

  const cardId = requiredString(formData, "cardId");
  const label = requiredString(formData, "label");
  const dueAt = optionalDateTime(formData, "dueAt", ctx.timezone);
  const ownerMemberId = optionalString(formData, "ownerMemberId");

  await assertCardBelongsToHousehold(cardId, ctx.householdId);
  if (ownerMemberId) {
    await assertMemberBelongsToHousehold(ownerMemberId, ctx.householdId);
  }

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.rpc("add_readiness_item_to_card", {
    p_card_id: cardId,
    p_label: label,
    p_due_at: dueAt,
    p_owner_member_id: ownerMemberId
  });

  if (error) throw new Error(error.message);

  await logCardEvent(ctx, cardId, "readiness_item_created", {
    hasDueAt: Boolean(dueAt),
    hasOwner: Boolean(ownerMemberId)
  });
  revalidatePath("/app");
}

export async function retryFailedExtractionRun(formData: FormData) {
  const sourceInputId = requiredString(formData, "sourceInputId");
  const extractionRunId = requiredString(formData, "extractionRunId");
  const supabase = await createSupabaseServerClient();

  const { error } = await supabase.rpc("retry_failed_extraction_run", {
    p_run_id: extractionRunId
  });

  if (error) throw new Error(error.message);

  revalidatePath(`/app/sources/${sourceInputId}`);
}

export async function approveUploadExtractedText(formData: FormData) {
  const ctx = await getHouseholdContext();
  requireParentOrHouseholdAdmin(ctx);

  const sourceInputId = requiredString(formData, "sourceInputId");
  const sourceArtifactId = requiredString(formData, "sourceArtifactId");
  const approvedText = requiredString(formData, "approvedText");
  const supabase = await createSupabaseServerClient();

  const { error } = await supabase.rpc("approve_upload_extracted_text", {
    p_source_input_id: sourceInputId,
    p_source_artifact_id: sourceArtifactId,
    p_approved_text: approvedText
  });

  if (error) throw new Error(error.message);

  await captureServerEvent(
    analyticsEvents.uploadExtractedTextApproved,
    {
      household_id: ctx.householdId,
      source_input_id: sourceInputId,
      source_artifact_id: sourceArtifactId,
      text_size_bucket: sourceSizeBucket(approvedText)
    },
    ctx.memberId
  ).catch(() => undefined);

  revalidatePath(`/app/sources/${sourceInputId}`);
  revalidatePath("/app");
}

async function transitionSlot({
  ctx,
  slotId,
  nextState,
  ownerMemberId,
  externalContactId,
  externalOwnerText,
  eventType
}: {
  ctx: HouseholdContext;
  slotId: string;
  nextState: CoverageSlotState;
  ownerMemberId?: string;
  externalContactId?: string;
  externalOwnerText?: string;
  eventType: string;
}) {
  const supabase = await createSupabaseServerClient();
  const slot = await getSlotContext(slotId);
  if (ownerMemberId) {
    await assertMemberBelongsToHousehold(ownerMemberId, ctx.householdId);
  }

  const hasOwner = Boolean(ownerMemberId || externalContactId || externalOwnerText);
  if (!canTransitionSlot(slot.state, nextState, hasOwner)) {
    throw new Error(`Cannot move coverage from ${slot.state} to ${nextState}.`);
  }

  const clearOwner =
    nextState === "needs_coverage" || nextState === "requested" || nextState === "declined";

  const { error } = await supabase
    .from("coverage_slots")
    .update({
      state: nextState,
      owner_member_id: clearOwner ? null : ownerMemberId ?? null,
      external_contact_id: clearOwner ? null : externalContactId ?? null,
      external_owner_text: clearOwner ? null : externalOwnerText ?? null,
      updated_at: new Date().toISOString()
    })
    .eq("id", slotId);

  if (error) throw new Error(error.message);

  await logCardEvent(ctx, slot.cardId, eventType, { slotId, nextState });
  await refreshCardState(slot.cardId);
  revalidatePath("/app");
}

async function getSlotContext(slotId: string) {
  const supabase = await createSupabaseServerClient();
  const { data: slot, error } = await supabase
    .from("coverage_slots")
    .select("state, card_id")
    .eq("id", slotId)
    .single<{ state: CoverageSlotState; card_id: string }>();

  if (error) throw new Error(error.message);

  return {
    cardId: slot.card_id,
    state: slot.state
  };
}

async function getReadinessItemContext(itemId: string) {
  const supabase = await createSupabaseServerClient();
  const { data: item, error } = await supabase
    .from("readiness_items")
    .select("card_id")
    .eq("id", itemId)
    .single<{ card_id: string }>();

  if (error) throw new Error(error.message);

  return {
    cardId: item.card_id
  };
}

async function assertCardBelongsToHousehold(cardId: string, householdId: string) {
  const supabase = await createSupabaseServerClient();
  const { data: card, error } = await supabase
    .from("coverage_cards")
    .select("id")
    .eq("id", cardId)
    .eq("household_id", householdId)
    .maybeSingle<{ id: string }>();

  if (error) throw new Error(error.message);
  if (!card) {
    throw new Error("Coverage card must belong to this household.");
  }
}

async function assertMemberBelongsToHousehold(memberId: string, householdId: string) {
  const supabase = await createSupabaseServerClient();
  const { data: member, error } = await supabase
    .from("household_members")
    .select("id")
    .eq("id", memberId)
    .eq("household_id", householdId)
    .eq("active", true)
    .maybeSingle<{ id: string }>();

  if (error) throw new Error(error.message);
  if (!member) {
    throw new Error("Coverage owner must be an active member of this household.");
  }
}

async function getCoverageRequestMember(memberId: string, householdId: string) {
  const supabase = await createSupabaseServerClient();
  const { data: member, error } = await supabase
    .from("household_members")
    .select("id, display_name, email")
    .eq("id", memberId)
    .eq("household_id", householdId)
    .eq("active", true)
    .maybeSingle<{ id: string; display_name: string; email: string | null }>();

  if (error) throw new Error(error.message);
  if (!member) {
    throw new Error("Coverage recipient must be an active member of this household.");
  }

  return member;
}

async function refreshCardState(cardId: string) {
  const supabase = await createSupabaseServerClient();
  const { data: card, error } = await supabase
    .from("coverage_cards")
    .select(
      "id, card_type, confidence, review_reason, coverage_slots(state), readiness_items(status, due_at), card_changes(confirmation_status)"
    )
    .eq("id", cardId)
    .single<{
      id: string;
      card_type: CardType;
      confidence: number | null;
      review_reason: string | null;
      coverage_slots: { state: CoverageSlotState }[];
      readiness_items: { status: ReadinessStatus; due_at: string | null }[];
      card_changes: { confirmation_status: string }[];
    }>();

  if (error) throw new Error(error.message);

  const derivedInput = {
    confidence: card.confidence ?? undefined,
    reviewReason: card.review_reason ?? undefined,
    hasUnconfirmedChange:
      card.card_type === "change_standalone" ||
      card.card_changes.some((change) => change.confirmation_status === "pending"),
    slots: card.coverage_slots,
    readinessItems: card.readiness_items.map((item) => ({
      status: item.status,
      dueAt: item.due_at
    }))
  };

  const { error: updateError } = await supabase
    .from("coverage_cards")
    .update({
      attention_flags: deriveAttentionFlags(derivedInput),
      computed_coverage_state: deriveCoverageState(derivedInput),
      updated_at: new Date().toISOString()
    })
    .eq("id", cardId);

  if (updateError) throw new Error(updateError.message);
}

async function logCardEvent(
  ctx: HouseholdContext,
  cardId: string,
  eventType: string,
  metadata: Record<string, unknown>
) {
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.from("card_events").insert({
    household_id: ctx.householdId,
    card_id: cardId,
    actor_member_id: ctx.memberId,
    event_type: eventType,
    metadata
  });

  if (error) throw new Error(error.message);
}

async function getHouseholdContext(): Promise<HouseholdContext> {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
    error: userError
  } = await supabase.auth.getUser();

  if (userError || !user) {
    redirect("/login");
  }

  const { data: membership, error } = await supabase
    .from("household_members")
    .select("id, household_id, role, households(timezone)")
    .eq("user_id", user.id)
    .eq("active", true)
    .limit(1)
    .single<{
      id: string;
      household_id: string;
      role: string;
      households: { timezone: string } | { timezone: string }[] | null;
    }>();

  if (error || !membership) {
    redirect("/household/new");
  }

  const household = Array.isArray(membership.households)
    ? membership.households[0]
    : membership.households;

  return {
    householdId: membership.household_id,
    memberId: membership.id,
    role: membership.role,
    timezone: household?.timezone ?? "America/Chicago"
  };
}

function requireHouseholdAdmin(ctx: HouseholdContext) {
  if (ctx.role !== "household_admin") {
    throw new Error("Only household admins can change household setup and manual cards.");
  }
}

function requireParentOrHouseholdAdmin(ctx: HouseholdContext) {
  if (ctx.role !== "household_admin" && ctx.role !== "parent") {
    throw new Error("Only parents and household admins can correct coverage cards.");
  }
}

function requiredString(formData: FormData, key: string) {
  const value = optionalString(formData, key);
  if (!value) throw new Error(`${key} is required.`);
  return value;
}

function optionalString(formData: FormData, key: string) {
  const value = String(formData.get(key) ?? "").trim();
  return value.length > 0 ? value : null;
}

function normalizeEmail(value: string | null) {
  return value ? value.toLowerCase() : null;
}

async function sendMagicLinkInvite(email: string) {
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.auth.signInWithOtp({
    email,
    options: {
      emailRedirectTo: `${process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000"}/auth/callback?next=/app`
    }
  });

  if (error) throw new Error(error.message);
}

function recurrenceOccurrences({
  startsAt,
  frequency,
  count,
  timezone
}: {
  startsAt: string | null;
  frequency: RecurrenceFrequency;
  count: number;
  timezone: string;
}) {
  if (!startsAt || frequency === "none") return [startsAt];

  const safeCount = count === 8 ? 8 : 4;
  return Array.from({ length: safeCount }, (_, index) =>
    addLocalOccurrence(startsAt, frequency, index, timezone)
  );
}

function addLocalOccurrence(
  startsAt: string,
  frequency: Exclude<RecurrenceFrequency, "none">,
  index: number,
  timezone: string
) {
  if (index === 0) return startsAt;

  const parts = zonedDateTimeParts(new Date(startsAt), timezone);
  const date = new Date(Date.UTC(parts.year, parts.month - 1, parts.day, parts.hour, parts.minute));

  if (frequency === "daily") date.setUTCDate(date.getUTCDate() + index);
  if (frequency === "weekly") date.setUTCDate(date.getUTCDate() + index * 7);
  if (frequency === "biweekly") date.setUTCDate(date.getUTCDate() + index * 14);
  if (frequency === "monthly") date.setUTCMonth(date.getUTCMonth() + index);

  const localValue = `${date.getUTCFullYear()}-${pad2(date.getUTCMonth() + 1)}-${pad2(
    date.getUTCDate()
  )}T${pad2(parts.hour)}:${pad2(parts.minute)}`;

  return parseDateTimeLocal(localValue, timezone).toISOString();
}

function recurrenceFrequencyLabel(frequency: RecurrenceFrequency) {
  if (frequency === "daily") return "daily";
  if (frequency === "weekly") return "weekly";
  if (frequency === "biweekly") return "every 2 weeks";
  if (frequency === "monthly") return "monthly";
  return "once";
}

function pad2(value: number) {
  return String(value).padStart(2, "0");
}

function stringList(formData: FormData, key: string) {
  return formData
    .getAll(key)
    .map((value) => String(value).trim())
    .filter((value) => value.length > 0);
}

function optionalDateTime(formData: FormData, key: string, timezone = "America/Chicago") {
  const value = optionalString(formData, key);
  if (!value) return null;

  const date = parseDateTimeLocal(value, timezone);
  if (Number.isNaN(date.getTime())) {
    throw new Error(`${key} must be a valid date and time.`);
  }

  return date.toISOString();
}

function parseDateTimeLocal(value: string, timezone: string) {
  const match = value.match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/);
  if (!match) return new Date(value);

  const [, year, month, day, hour, minute] = match;
  const desiredUtc = Date.UTC(
    Number(year),
    Number(month) - 1,
    Number(day),
    Number(hour),
    Number(minute)
  );
  let utcMs = desiredUtc;

  for (let attempt = 0; attempt < 3; attempt += 1) {
    const parts = zonedDateTimeParts(new Date(utcMs), timezone);
    const renderedUtc = Date.UTC(
      parts.year,
      parts.month - 1,
      parts.day,
      parts.hour,
      parts.minute
    );
    utcMs -= renderedUtc - desiredUtc;
  }

  return new Date(utcMs);
}

function zonedDateTimeParts(date: Date, timezone: string) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false
  }).formatToParts(date);

  const value = (type: string, fallback: number) => {
    const part = parts.find((entry) => entry.type === type)?.value;
    return part ? Number(part) : fallback;
  };
  const hour = value("hour", 0);

  return {
    year: value("year", 1970),
    month: value("month", 1),
    day: value("day", 1),
    hour: hour === 24 ? 0 : hour,
    minute: value("minute", 0)
  };
}

function optionalNumber(formData: FormData, key: string) {
  const value = optionalString(formData, key);
  if (!value) return null;

  const number = Number(value);
  if (Number.isNaN(number)) {
    throw new Error(`${key} must be a number.`);
  }

  return number;
}

function enumValue<T extends string>(formData: FormData, key: string, allowed: T[]) {
  const value = requiredString(formData, key);
  if (!allowed.includes(value as T)) {
    throw new Error(`${key} must be one of ${allowed.join(", ")}.`);
  }

  return value as T;
}

function optionalEnumValue<T extends string>(
  formData: FormData,
  key: string,
  allowed: T[],
  fallback: T
) {
  const value = optionalString(formData, key);
  if (!value) return fallback;
  if (!allowed.includes(value as T)) {
    throw new Error(`${key} must be one of ${allowed.join(", ")}.`);
  }

  return value as T;
}

function isLikelyEmail(value: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

function sourceSizeBucket(text: string) {
  if (text.length < 500) return "lt_500";
  if (text.length < 2_000) return "500_1999";
  if (text.length < 10_000) return "2000_9999";
  return "gte_10000";
}
