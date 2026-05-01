# Legal disclaimer

`dispute-defender` is open-source software published by MerchantGuard / Dunecrest Ventures Inc. (a Wyoming C-Corporation) under the MIT License with an anti-fabrication rider (see `LICENSE`). This file expands on the cautions referenced in `README.md` and `LICENSE`. Companion files: `PATENTS.md` (35 U.S.C. § 287 virtual marking), `EXPORT.md` (15 C.F.R. § 742.15 publicly-available encryption), `DCO.md` (contributor sign-off), and `SECURITY.md` (vulnerability disclosure).

## Not legal advice

Nothing in this repository — the code, the documentation, the comments, or the README — constitutes legal advice. The authors and contributors are not licensed legal practitioners. Consult counsel for guidance specific to your situation.

## AS IS, NO WARRANTY

The software is provided "AS IS" without warranty of any kind. The authors and contributors disclaim all warranties, express or implied, including merchantability, fitness for a particular purpose, and non-infringement. No outcome of any dispute submission, including dispute wins, losses, or processor responses, is guaranteed.

## Card network rules

Visa Core Rules and Visa Product and Service Rules, as well as Mastercard Chargeback Guide rules, govern the form and content of evidence submitted in chargeback dispute representments. **CE 3.0 qualification is determined by Visa Resolve Online (VROL) edits and the issuing bank, not by this software.** Visa's *Compelling Evidence 3.0 Merchant Readiness* document (March 2023, Visa Public) is unambiguous: "Issuers will have the option to decline pre-arbitration and pursue arbitration if they have proper evidence to disprove the CE 3.0 qualification" and "Visa will run algorithms to review for anomalous data and issues." Submitting falsified, fabricated, or knowingly inaccurate evidence may violate the Visa Rules and may result in fines, holds, reserve requirements, or termination of the merchant's processing relationship by the merchant's acquirer.

The Licensor is **not a Visa Third Party Agent** within the meaning of Visa Core Rules § 10.2.2. The Software runs inside the Licensee's own infrastructure and never transmits cardholder data to the Licensor. Where the Software stores, processes, or transmits Visa cardholder data, that processing is performed by the Licensee under the Licensee's own acquirer relationship.

## Stripe Services Agreement

Section 8 of the Stripe Services Agreement governs how merchants respond to disputes. The merchant remains responsible for compliance with the SSA and Stripe's published Dispute documentation. See <https://stripe.com/legal/ssa>. The Licensor is not endorsed, certified, audited, or "approved" by Stripe, Inc. References to Stripe APIs and to the Stripe Disputes API documentation are nominative fair use under 15 U.S.C. § 1125 to identify the APIs with which the Software is designed to interoperate.

## Wire Fraud and Anti-Fabrication

The federal wire-fraud statute, 18 U.S.C. § 1343, criminalizes the use of interstate wire communications in furtherance of a scheme to defraud or to obtain money or property by false or fraudulent pretenses. Submitting CE 3.0 or other chargeback evidence to an acquirer, processor, or issuer that the submitter knows or has reason to know is false, fabricated, or materially misleading is, where the statutory elements are met, criminal conduct exposing the submitter to up to twenty (20) years' imprisonment per count (thirty (30) years where a financial institution is affected). See *United States v. Kousisis*, 145 S. Ct. 1382 (2025) (fraudulent-inducement theory). "Willful blindness" — deliberate avoidance of facts a defendant has reason to suspect — is treated as actual knowledge for purposes of intent. See *Global-Tech Appliances, Inc. v. SEB S.A.*, 563 U.S. 754 (2011).

The Software is designed, on its face, to make the construction of false or fabricated evidence materially harder than the construction of truthful evidence, by:

(a) requiring all evidence fields to conform to typed schemas declared in `lib/evidence/schemas.ts`, with no `narrative`, `freeform_text`, or `uncategorized_text` field accepted;
(b) refusing, by default, to invoke any large language model or other generative system in the construction of any evidence field;
(c) staging all Stripe Disputes API submissions with `submit:false`, behind a human-review gate the Licensee cannot bypass without code changes, so that no automated pipeline can submit evidence to Stripe without deliberate Licensee action; and
(d) writing every evidence-construction action to a hash-chained audit log (see `lib/audit/`) whose tamper-evidence properties are designed to survive subpoena and to be admissible as a business record under Fed. R. Evid. 803(6).

The Licensor disclaims any purpose, intent, or design to induce, encourage, or facilitate violations of 18 U.S.C. § 1343 or analogous foreign law. Pursuant to *MGM Studios, Inc. v. Grokster, Ltd.*, 545 U.S. 913 (2005), the Software is intended for the substantial non-infringing, non-criminal use of constructing truthful CE 3.0 evidence from data the Licensee has lawfully collected and retained. The Licensor will cooperate with lawful subpoenas, court orders, and regulator requests in the United States and in any other jurisdiction in which the Licensor or its officers reside.

## State Consumer-Protection Laws

The Licensor disclaims any guarantee or representation of dispute outcomes under state consumer-protection statutes, including but not limited to:

- California Unfair Competition Law, Cal. Bus. & Prof. Code § 17200 et seq.;
- California False Advertising Law, Cal. Bus. & Prof. Code § 17500 et seq.;
- New York Consumer Protection from Deceptive Acts and Practices statute, N.Y. Gen. Bus. Law § 349 (as amended by the Fostering Affordability and Integrity through Reasonable Business Practices Act, signed 19 December 2025);
- Florida Deceptive and Unfair Trade Practices Act, Fla. Stat. § 501.201 et seq. (operative prohibition at § 501.204);
- Texas Deceptive Trade Practices–Consumer Protection Act, Tex. Bus. & Com. Code § 17.41 et seq.;
- Illinois Consumer Fraud and Deceptive Business Practices Act, 815 ILCS 505; and
- Massachusetts Regulation of Business Practices for Consumer Protection, Mass. Gen. Laws ch. 93A.

The Licensor does not contract with cardholders, end consumers, or merchant end-users; the only license relationship is the MIT License above. The Licensee — the merchant deploying the Software — is solely responsible for its own representations to its cardholders, its acquirer, and any regulator, and the Licensor's anti-fabrication design is offered only as a technical safeguard and does not transfer any UDAP compliance obligation from the Licensee to the Licensor.

## Privacy and Data Protection

### Allocation of roles

The Software is delivered as MIT-licensed source code that the Licensee deploys on its own infrastructure. The Licensor is **neither a "controller" nor a "processor"** within the meaning of Article 4(7) and 4(8) of Regulation (EU) 2016/679 ("GDPR"), of the United Kingdom General Data Protection Regulation as supplemented by the Data Protection Act 2018, or of analogous concepts under Panama Law 81 of 26 March 2019 and Executive Decree 285 of 28 May 2021. The Licensor does not determine the purposes or means of any processing of personal data carried out by the Licensee using the Software, does not receive any personal data from the Licensee, and the Software contains no default-on telemetry that transmits personal data to the Licensor. The Licensee is the controller for all processing of cardholder personal data (including, without limitation, email, IP address, device fingerprint, device identifier, and shipping address) carried out through the Software.

### GDPR Article 3(2) reach to non-EU Licensees

Where the Licensee is offering goods or services to data subjects in the European Union, the Licensee is itself subject to the GDPR pursuant to Article 3(2)(a), regardless of the Licensee's place of establishment, per EDPB Guidelines 3/2018 on the territorial scope of the GDPR (final version adopted 12 November 2019). The same applies to the United Kingdom under section 207 of the Data Protection Act 2018 and Article 3 of the UK GDPR. The Licensee is solely responsible for documenting an Article 6(1) lawful basis (commonly Article 6(1)(f) — legitimate interests in fraud prevention and chargeback defense), conducting a Legitimate Interest Assessment, appointing an Article 27 representative if required, and complying with Chapter V on international transfers.

### CCPA / CPRA

Transmission of CE 3.0 evidence by the Licensee to its acquirer or to Stripe, Inc. for the purpose of defending a chargeback is not a "sale" within Cal. Civ. Code § 1798.140(ad) and not a "share" within § 1798.140(ah). The Licensor is neither a "business" within § 1798.140(d) nor a "service provider" within § 1798.140(ag) with respect to such processing.

### Panama Law 81 of 2019

The Licensor's principal officer is resident in the Republic of Panama. The Licensor does not operate any "base de datos … en el territorio de la República de Panamá" within the meaning of Article 2 of Law 81 of 26 March 2019, does not act as "responsable del tratamiento" or "encargado del tratamiento," and is not subject to the obligations of that law in respect of cardholder personal data processed by the Licensee using the Software. The Licensor will cooperate with lawful inquiries from the Autoridad Nacional de Transparencia y Acceso a la Información (ANTAI).

### Other jurisdictions

Where the Licensee operates in jurisdictions including but not limited to mainland China (PIPL), India (DPDP Act 2023), Brazil (LGPD), Saudi Arabia (PDPL), Singapore (PDPA), Australia (Privacy Act), and Canada (PIPEDA / Quebec Law 25), the Licensee is solely responsible for compliance.

## Patent Marking

This Software incorporates technology that is the subject of United States provisional patent applications filed by Dunecrest Ventures Inc. on or about February 17, 2026 (Application Nos. 63/983,615; 63/983,621; 63/983,843; 63/984,626). See `PATENTS.md` for the full virtual-marking notice published pursuant to 35 U.S.C. § 287(a) as amended by the Leahy-Smith America Invents Act. **Provisional applications do not, by themselves, give rise to constructive notice under § 287(a); this notice is published prospectively so the virtual-marking infrastructure is in place when non-provisionals issue.** Use of this Software does not grant any patent license except as expressly provided in `LICENSE`. The MerchantGuard®, GuardScore®, and AgentGuard™ trademarks remain the property of Dunecrest Ventures Inc.

## Export Control

This Software incorporates standard cryptography (Ed25519 digital signatures via `@noble/ed25519`). Encryption source code is, by default, classified under Export Control Classification Number (ECCN) 5D002 of the Commerce Control List, 15 C.F.R. Part 774, Supplement No. 1. The Software is published as encryption source code that is "publicly available" within the meaning of 15 C.F.R. § 734.3(b)(3) and is therefore **not subject to the EAR** following submission of the notification required by 15 C.F.R. § 742.15(b) to the U.S. Bureau of Industry and Security (BIS) and the U.S. National Security Agency (NSA). See `EXPORT.md`.

## Acquisition Optionality

The Licensor reserves the right to (a) assign this Software, the LICENSE, the NOTICE rider, and all related intellectual property to a successor or assign in connection with a merger, acquisition, asset sale, change of control, or reorganization, and (b) relicense future versions of this Software under a different open-source license (including, without limitation, the Apache License 2.0). Any such relicensing applies only to versions released after the change; versions released under the MIT License remain available under the MIT License indefinitely.

The defensive patent pledge in `PATENTS.md` is binding on Dunecrest Ventures Inc. and on any successor or assign of Dunecrest Ventures Inc., including any acquirer of this Software.

## No guarantees

We do not guarantee that any dispute will be won, that CE 3.0 will qualify, that a Stripe submission will be accepted, or that any specific evidence will be persuasive to any specific issuer. The decision to credit, deny, or escalate a dispute lies with the issuing bank.

## Severability

If any provision of this disclaimer is held unenforceable, the remaining provisions remain in full force and effect.
