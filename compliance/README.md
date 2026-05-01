# compliance/

This directory holds machine-readable artifacts that document the project's
regulatory posture for acquisition-due-diligence purposes.

## Required artifacts before first `npm publish`

- `eart-notification-2026.eml` — saved copy of the EAR § 742.15(b) email
  sent to `crypt@bis.doc.gov` and `enc@nsa.gov`. See `EXPORT.md` for what
  the email must contain. Once sent, save the sent message and any delivery
  receipts here.

## Optional but recommended

- `cna-application.md` — track CVE Numbering Authority application progress.
- `dco-roster.md` — list of contributors who have ever signed off on a
  commit, with their declared affiliation. Useful for IP diligence.
- `tpa-non-applicability-memo.md` — short memo explaining why this Software
  is not a Visa Third Party Agent under Visa Core Rules § 10.2.2.
