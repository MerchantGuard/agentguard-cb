# Export Control Notice

## Classification

The Software incorporates standard cryptography (Ed25519 digital signatures
via `@noble/ed25519`). Encryption source code is, by default, classified
under Export Control Classification Number (ECCN) 5D002 of the Commerce
Control List, 15 C.F.R. Part 774, Supplement No. 1.

## Publicly-available carve-out under 15 C.F.R. § 742.15(b)

This Software is published as encryption source code that is "publicly
available" within the meaning of 15 C.F.R. § 734.3(b)(3) and is therefore
**not subject to the EAR** following submission of the notification
required by 15 C.F.R. § 742.15(b) to the U.S. Bureau of Industry and
Security (BIS) and the U.S. National Security Agency (NSA).

The required notification was submitted on **[YYYY-MM-DD — DATE OF EMAIL,
TO BE FILLED IN BEFORE FIRST `npm publish`]**, addressed to
`crypt@bis.doc.gov` and `enc@nsa.gov`, identifying:

  - the name of the package (`@merchantguard/dispute-defender`);
  - the URL of the public source repository
    (`https://github.com/MerchantGuard/dispute-defender`); and
  - the URL of the npm registry listing
    (`https://www.npmjs.com/package/@merchantguard/dispute-defender`).

A copy of the submitted notification is retained at
`./compliance/eart-notification-2026.eml` in this repository.

## Object-code corollary

Object code (the npm tarball produced by `npm pack` and published to the
npm registry) is also not subject to the EAR pursuant to 15 C.F.R.
§ 740.13(e), because the corresponding source code has been notified under
§ 742.15(b) above.

## OFAC sanctions

The U.S. Office of Foreign Assets Control (OFAC) sanctions regime,
31 C.F.R. Parts 500–599, is independent of the EAR. Use of, contribution
to, or distribution of this Software in violation of OFAC sanctions,
including without limitation transactions involving any party identified
on OFAC's Specially Designated Nationals (SDN) List or any party located
in a comprehensively sanctioned jurisdiction (currently Cuba, Iran, North
Korea, Syria, the Crimea / DNR / LNR regions of Ukraine, and certain other
regions), is prohibited. The Licensor does not authorize any such use.

## Re-export

Once received in a destination country, the Software remains "not subject
to the EAR" under § 742.15(b) / § 740.13(e), but downstream re-export by
a non-U.S. recipient may be subject to that recipient's local export
controls (e.g., UK Export Control Order 2008, EU Dual-Use Regulation
2021/821).

## Action items before first `npm publish`

1. **Send the § 742.15(b) email** to `crypt@bis.doc.gov` and
   `enc@nsa.gov`. Subject: `TSU notification — @merchantguard/dispute-defender`.
   Body must include package name, repo URL, and npm URL above.
2. **Save the sent email** as `./compliance/eart-notification-2026.eml`.
3. **Fill in the date** in the "publicly-available carve-out" section
   above with the exact send date.
4. **Then** run `npm publish --provenance --access public`.

## Contact

Export-compliance questions: `legal@merchantguard.ai`.
