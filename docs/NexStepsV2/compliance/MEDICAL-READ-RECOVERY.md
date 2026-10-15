# Medical encrypted-value read correction

The live Medical Information view can display an allergy ciphertext because the
shared PII reader deliberately returns an encrypted value when authentication or
key-based decryption fails, and the medical serializer currently treats every
nonempty string as recorded clinical information. Known current-key ciphertext
reads pass the existing tests; the live affected value has not been decrypted or
retrieved for diagnosis. Production key metadata exists, and the expected medical
revision is deployed. The Supabase connector denied read-only aggregate access.

## Correctness and preservation

Return an explicit UNAVAILABLE medical read state with null details if an encrypted
envelope remains after the normal decryption layer. Keep UNKNOWN and NONE distinct.
Read results must never expose ciphertext as medical text. Do not modify encryption
keys or stored medical values. Prevent any whole-record save while existing medical
values are unavailable, including server-side protection against old or malicious
clients overwriting them. Ordinary permissions and site boundaries stay enforced.

The UI shows an actionable unavailable message and a retry action. It blocks saving
unreadable records and preserves pending drafts during refresh/conflict handling.
Handle old-server responses defensively so ciphertext cannot appear in the view or
editor. Tracker medical signals must count unreadable clinical fields as unavailable
information rather than confirmed completeness.

## Verification and live recovery

Regression tests cover valid encrypted, legacy plaintext, wrong-key/malformed or
still-encrypted values, list/detail/export safety, rejected overwrite and unchanged
stored ciphertext. Verify read/manage and cross-tenant boundaries. Inspect actual
components at desktop/mobile/enlarged text and by keyboard. Run affected types, lint,
formatting, units, integration and builds, then independent review and the PR gate.

This correction makes failure truthful; it does not establish the live key mismatch
or recover unreadable clinical data. Recovery requires a read-only operator check
using the deployed key and aggregate-only output, and, if necessary, retrieval of
the original key through the approved secret store. Do not replace the current key
or run a plaintext backfill. Any production deployment or data repair remains a
separately authorized action with a concrete reviewed procedure.
