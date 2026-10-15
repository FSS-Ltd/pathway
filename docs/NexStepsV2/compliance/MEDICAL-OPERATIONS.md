# Medical Information operations

Step 1.4 adapts Oasis's MedTab to the existing Nexsteps child records. It displays
all children currently visible at the active site, including those whose medical
information is unknown. Expired guest records are excluded using the existing
child visibility rule. This is an information register, not a diagnosis, care plan,
medication administration log or statement that the site meets its legal duties.

## Information and editing

The register separates allergies, medical conditions and medication at the site.
Each field is unknown, explicitly none, or recorded with details. Existing
additional-needs notes remain separate; they are not silently reclassified as
medical conditions.

Historical allergy data sometimes contains `none` because an older form supplied
that value automatically. The new `allergiesConfirmedAt` timestamp distinguishes
an explicit confirmation from that historical default. Meaningful existing allergy
text remains visible. An unconfirmed legacy `none` is shown as unknown until an
administrator confirms it. No migration infers confirmations or changes existing
allergy text. The timestamp records a portal confirmation, not medical verification.

The nullable `medicalConditions` and `medicationAtSite` fields start unknown.
An explicit none is saved only through the restricted medical editor. Free text
uses the existing child PII encryption extension. Names and year groups retain
their existing storage behavior. No separate copy of a child's health record is
created.

The medical editor uses `/children/:id/edit?section=medical`; the existing child
profile editing route without that section continues to work. Medical saves use
the record's expected update timestamp and reject conflicting changes with 409.
The interface preserves a failed draft so the administrator can review newer
information before retrying. A successful save updates the record and writes its
audit event atomically. A legacy allergy edit clears its confirmation when the
actual value changes; an unchanged value on an unrelated profile save retains it.

## Access and auditing

`compliance.medical.read` and `compliance.medical.manage` are institutional
permissions. Organisation heads and site leads receive both defaults;
safeguarding leads receive read only. Ordinary staff, parents and adult accounts
do not receive access through their account category. Existing guardian access
to the established child profile remains unchanged.

The server resolves effective permissions and the authenticated active site and
organisation. Every medical query is tenant scoped and runs in the existing RLS
context. New clinical fields are excluded from the legacy general child response.
Read, update and export audit metadata records identifiers and actions without
copying clinical text. Responses use `Cache-Control: private, no-store`.

## Data requests, retention and rollback

`GET /compliance/medical/:id/export` requires management permission and records an
EXPORTED audit event. It returns the scoped medical record and export timestamp.
Use this supplement when an authorized institutional data request requires the
new medical fields. The existing legacy child DSAR and household export formats
remain unchanged and must not be described as including this supplement. Review
identity, scope and disclosure restrictions through the existing request process
before sharing any export.

These fields belong to the existing child record and follow its retention and
deletion lifecycle, including guest expiry and cleanup. A request for deletion
still requires the existing human review; this feature does not introduce a new
retention duration or background purge. Review exports, audit metadata and backups
as part of an approved erasure operation. Medical updates retain audit events but
do not introduce a separate clinical snapshot history or prescription workflow.

Apply the additive migration and the established protected permission-definition
and system-role synchronization before rollout. Migration alone does not grant
existing roles the new permissions. Rollback the UI/API if necessary while keeping
the new columns and recorded information intact. Production rollout is a separate
authorized action and is not performed by this delivery step.
