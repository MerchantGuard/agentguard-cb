# Legal Notes

`AgentGuard CB` is open-source software published by Dunecrest Ventures Inc. (a Wyoming C-Corporation) under the MIT License. This file contains non-binding legal context for users; it is not a license, not legal advice, and does not modify the MIT License in `LICENSE`. Companion files: `DISCLAIMER.md`, `PATENTS.md`, `EXPORT.md`, `DCO.md`, and `SECURITY.md`.

## Not legal advice

Nothing in this repository constitutes legal advice. The authors and contributors are not licensed legal practitioners. Consult counsel for guidance specific to your situation.

## AS IS, NO WARRANTY

The software is provided "AS IS" under the MIT License. The authors and contributors disclaim all warranties, express or implied. No outcome of any dispute submission is guaranteed.

## What this Software does

The Software assembles dispute-evidence payloads in the schema expected by the current Stripe Disputes API, stages submissions with `submit:false` for merchant review, and surfaces Stripe-reported eligibility statuses (`qualified`, `requires_action`, `not_qualified`). All references to Stripe APIs and to Visa Compelling Evidence 3.0 are descriptions of the API shape and the underlying card network rules with which the Software is designed to interoperate.

## What this Software does NOT do

It does not file disputes with Visa, is not a Visa Third Party Agent within the meaning of Visa Core Rules § 10.2.2, is not registered under the Visa TPA Registration Program, and has no contractual or technical relationship with Visa Inc., Stripe, Inc., or any acquirer. CE 3.0 qualification is determined by Visa Resolve Online (VROL) edits and the issuing bank under the Visa Core Rules; outcomes are not within this Software's control. The Software does not generate, fabricate, embellish, or modify evidence; it does not invoke any large language model or generative system to produce evidence; and it does not file evidence on behalf of the merchant without explicit human review.

## Merchant responsibility

The merchant deploying the Software is solely responsible for the accuracy of all evidence assembled and submitted, for compliance with applicable card network rules, acquirer agreements, federal and state law, and foreign law, and for its own representations to its cardholders, its acquirer, and any regulator.

Submitting falsified, fabricated, or knowingly inaccurate evidence may violate the Visa Rules, may result in fines, holds, reserve requirements, or termination of the merchant's processing relationship, and may give rise to civil or criminal liability under federal law (including 18 U.S.C. § 1343, the wire-fraud statute), state consumer-protection statutes (including Cal. Bus. & Prof. Code § 17200; N.Y. Gen. Bus. Law § 349 (prohibiting "deceptive acts and practices"); Fla. Stat. § 501.204; Tex. Bus. & Com. Code § 17.41 et seq.; 815 ILCS 505; Mass. Gen. Laws ch. 93A), and analogous foreign law. Merchants should consult counsel before submitting evidence about which they are uncertain.

## Privacy and data protection

### Product deployment

The Software is delivered as MIT-licensed source code that the merchant deploys on its own infrastructure. It runs in the merchant's environment, processes the merchant's data, and does not, by default, transmit personal data to the publisher. There is no telemetry on by default. The merchant is the controller for all processing of cardholder personal data carried out through the Software within the meaning of Article 4(7) of Regulation (EU) 2016/679 (GDPR), the analogous provision of the UK GDPR as supplemented by the Data Protection Act 2018, the California Consumer Privacy Act as amended by the CPRA, and Panama Law 81 of 26 March 2019.

### Support, security disclosure, and contributor channels

When users voluntarily submit information to the publisher through GitHub Issues, security disclosures, email, or pull request comments, the publisher may receive limited personal data (for example, names, email addresses, IP addresses associated with GitHub accounts). The publisher acts as an independent controller for that limited support- and security-administration purpose. **Users should not include personal data, dispute evidence, cardholder information, screenshots, or logs containing customer identifiers in public issues, pull requests, or comments.** A redacted-by-default issue template is provided at `.github/ISSUE_TEMPLATE/bug_report.md`. Personal data submitted in error will be redacted or deleted on request.

### GDPR Article 3(2)

Where the merchant is offering goods or services to data subjects in the European Union or the United Kingdom, the merchant is itself subject to the GDPR and UK GDPR, regardless of place of establishment. The merchant is responsible for documenting an Article 6(1) lawful basis (commonly Article 6(1)(f) — legitimate interests in fraud prevention and chargeback defense), conducting a Legitimate Interest Assessment, appointing an Article 27 representative if required, and complying with Chapter V on international transfers.

### Other jurisdictions

Where the merchant operates in jurisdictions including but not limited to mainland China (PIPL), India (DPDP Act 2023), Brazil (LGPD), Saudi Arabia (PDPL), Singapore (PDPA), Australia (Privacy Act), and Canada (PIPEDA / Quebec Law 25), the merchant is solely responsible for compliance.

## Patent notice

This Software is the subject of pending U.S. provisional patent applications. See `PATENTS.md`.

## Export control

This Software incorporates standard cryptography (Ed25519 digital signatures via `@noble/ed25519`). See `EXPORT.md`.

## Trademarks

MerchantGuard™ (USPTO Serial No. 99051215), GuardScore™ (USPTO Serial No. 99030125), and AgentGuard™ (USPTO Serial No. 99462472) are pending USPTO trademark applications of Dunecrest Ventures Inc. Third-party trademarks referenced in this Software are used nominatively under the Lanham Act and the doctrine articulated in *New Kids on the Block v. News America Publ'g, Inc.*, 971 F.2d 302 (9th Cir. 1992), and do not imply endorsement.

## Severability

If any provision of this notice is held unenforceable, the remaining provisions remain in full force and effect.
