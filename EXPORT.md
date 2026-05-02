# Export Control Notice

## Cryptography used

This Software uses Ed25519 digital signatures via `@noble/ed25519` to sign a hash-chained audit log. Ed25519 is a published, standards-based digital signature algorithm specified in IETF RFC 8032 and listed in NIST SP 800-186. The Software does not implement non-standard cryptography, key escrow, proprietary modes, or cryptographic algorithms outside the published standards.

## "Standard cryptography" determination

For purposes of the Export Administration Regulations (EAR), 15 C.F.R. Parts 730–774, the cryptography incorporated in this Software uses published, standards-based algorithms (Ed25519 per IETF RFC 8032 and NIST SP 800-186). The Software does not implement non-standard cryptography, key escrow, proprietary modes, or cryptographic algorithms outside the published standards.

## Publicly available source code

This Software is distributed as publicly available source code at https://github.com/MerchantGuard/agentguard-cb and at https://www.npmjs.com/package/@merchantguard/agentguard-cb, free of charge to any party that wishes to obtain it, with no end-user agreement, no charge, and no restriction other than the MIT License in `LICENSE`. The publicly-available encryption source code framework under 15 C.F.R. § 734.3(b)(3) requires that the controlling Bureau of Industry and Security (BIS) and ENC Encryption Request Coordinator notification described in 15 C.F.R. § 742.15(b) be sent before the source code can be treated as "not subject to the EAR." The publisher's compliance with that notification requirement is a question for export counsel; users of this Software should not rely on this file as legal advice and should consult their own counsel regarding their specific export-control obligations, including any obligations under the EAR, the OFAC sanctions regime, or applicable foreign law.

## Object code

The current EAR framework treats object code corresponding to publicly available encryption source code that has been notified pursuant to § 742.15(b) as also not subject to the EAR. Users distributing or re-exporting either the source code or the npm tarball should confirm the current status of any required notifications with export counsel before doing so.

## OFAC sanctions

The U.S. Office of Foreign Assets Control (OFAC) sanctions regime, 31 C.F.R. Parts 500–599, is independent of the EAR. Use of, contribution to, or distribution of this Software in violation of OFAC sanctions, including without limitation transactions involving any party identified on OFAC's Specially Designated Nationals (SDN) List or any party located in a comprehensively sanctioned jurisdiction, is prohibited. The publisher does not authorize any such use.

## Re-export

Once received in a destination country, the Software remains "not subject to the EAR" under § 734.3(b)(3) / § 740.13(e). Downstream re-export by a non-U.S. recipient may be subject to that recipient's local export controls (for example, UK Export Control Order 2008, EU Dual-Use Regulation 2021/821).

## Contact

Export-compliance questions: `legal@merchantguard.ai`.
