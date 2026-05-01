# compliance/

This directory holds machine-readable artifacts that document the project's
regulatory posture for acquisition-due-diligence purposes.

The Software uses Ed25519 (standard cryptography) and is publicly available
source code under 15 C.F.R. § 734.3(b)(3), so it is not subject to the EAR.
The non-standard-cryptography email notification under § 742.15(b)(2) is
not required for this Software. See `EXPORT.md` for the determination.

## Optional artifacts (not required to publish)

- `cna-application.md` — track CVE Numbering Authority application progress.
- `dco-roster.md` — list of contributors who have ever signed off on a
  commit, with their declared affiliation. Useful for IP diligence.
- `tpa-non-applicability-memo.md` — short memo explaining why this Software
  is not a Visa Third Party Agent under Visa Core Rules § 10.2.2.
