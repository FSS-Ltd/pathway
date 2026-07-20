# Nexsteps One-Page Team Tracker

Status: Implemented, awaiting deployment configuration review

Created: 2026-07-20

## Problem

Schools, youth groups, clubs and charities often run people, sessions and follow-ups from disconnected notes, chats and spreadsheets. The free tracker provides an immediate operational result while introducing teams to Nexsteps.

## Delivered

- A focused landing page at `/team-tracker` with four required download fields and two optional qualification fields.
- Token-validated delivery of `Nexsteps_One_Page_Team_Tracker.xlsx` immediately after form submission and in the delivery email.
- A separate, unchecked marketing opt-in. The workbook is delivered whether or not the visitor opts in.
- Branded, image-led emails: immediate delivery, day 3 reply prompt, day 7 weekly-review tip, and a day 12 operational-readiness invitation for high-fit opted-in leads only.
- An unsubscribe page that records the opt-out and asks Resend to cancel unsent scheduled follow-ups.

## Decisions

- Reused the existing `Lead` and `DownloadToken` domain rather than introducing a parallel lead system. Team-tracker qualification, consent and Resend schedule identifiers are recorded in `Lead.metadataJson` under explicit `teamTracker*` keys.
- Used Resend’s scheduled-email API for the 3, 7 and 12 day sequence. The sequence fits inside Resend’s 30-day scheduling limit, avoiding a new worker or cron dependency.
- Uses workbook-rendered previews in the page and email rather than generic stock visuals. The preview contains only the workbook’s example content.
- Download links expire under the existing `TOOLKIT_TOKEN_TTL_HOURS` policy (48 hours by default). The workbook itself is not publicly served.

## High-fit routing

A lead receives the day 12 invitation when they have an operational/decision role and indicate either a 26+ person team or several disconnected tools. This is intentionally conservative to avoid generic demo pressure.

## Deployment checklist

- Configure a verified `RESEND_FROM` address and `RESEND_API_KEY`.
- Set `SITE_URL` to the production Nexsteps web URL so download, image and unsubscribe links resolve correctly.
- Confirm the Resend webhook continues to receive delivery, bounce and complaint events.
- Verify one opted-in and one opt-out form submission in production before promotion.

## Known limitation

The current webhook logs delivery and complaint events but does not yet write them back to the lead record. The scheduled emails remain cancellable through the unsubscribe flow.
