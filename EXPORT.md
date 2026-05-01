# Export Control Notice

## Cryptography used

This Software uses Ed25519 digital signatures via `@noble/ed25519` to sign a hash-chained audit log. Ed25519 is a published, standards-based digital signature algorithm specified in IETF RFC 8032 and listed in NIST SP 800-186. The Software does not implement non-standard cryptography, key escrow, proprietary modes, or cryptographic algorithms outside the published standards.

## "Standard cryptography" determination

For purposes of the Export Administration Regulations (EAR), 15 C.F.R. Parts 730–774, the cryptography incorporated in this Software is "standard cryptography" as that term is used in 15 C.F.R. § 742.15. The Software does not perform "non-standard cryptography" within the meaning of § 742.15(b)(2), and the email-notification procedure described in § 742.15(b)(2) is not required for this Software.

## Publicly available source code

This Software is distributed as publicly available source code at https://github.com/MerchantGuard/dispute-defender and at https://www.npmjs.com/package/@merchantguard/dispute-defender, free of charge to any party that wishes to obtain it, with no end-user agreement, no charge, and no restriction other than the MIT License in `LICENSE`. Pursuant to 15 C.F.R. § 734.3(b)(3) and Note to § 734.3(b)(3), publicly available encryption source code that is not subject to an express agreement for the payment of a licensing fee or royalty for commercial production or sale of any product developed using the source code is **not subject to the EAR**.

## Object code

Object code (the npm tarball produced by `npm pack` and published to the npm registry) compiled from the publicly available source code above is also not subject to the EAR pursuant to 15 C.F.R. § 740.13(e).

## OFAC sanctions

The U.S. Office of Foreign Assets Control (OFAC) sanctions regime, 31 C.F.R. Parts 500–599, is independent of the EAR. Use of, contribution to, or distribution of this Software in violation of OFAC sanctions, including without limitation transactions involving any party identified on OFAC's Specially Designated Nationals (SDN) List or any party located in a comprehensively sanctioned jurisdiction, is prohibited. The publisher does not authorize any such use.

## Re-export

Once received in a destination country, the Software remains "not subject to the EAR" under § 734.3(b)(3) / § 740.13(e). Downstream re-export by a non-U.S. recipient may be subject to that recipient's local export controls (for example, UK Export Control Order 2008, EU Dual-Use Regulation 2021/821).

## Contact

Export-compliance questions: `legal@merchantguard.ai`.
