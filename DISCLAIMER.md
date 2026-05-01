# Disclaimer and Use Guidelines

This document is non-binding positioning, not a license. The license is the standard MIT License in `LICENSE`. The statements below describe how the publisher intends for this Software to be used and should not be read as imposing additional license restrictions.

## No legal advice

Nothing in this repository constitutes legal advice. Consult licensed counsel for guidance specific to your situation.

## No outcome guarantees

The Software does not guarantee that any chargeback dispute will be qualified for Visa Compelling Evidence 3.0 liability shift, accepted by Stripe or any acquirer, accepted by any issuing bank, or resolved in favor of the user. Eligibility statuses (`qualified`, `requires_action`, `not_qualified`) are determined and surfaced by Stripe and the underlying card networks, not by this Software.

## Anti-fabrication intent

The Software is intended to assemble chargeback-evidence payloads from data the merchant has independently collected, retained, and verified as truthful. The publisher does not intend the Software to construct, stage, or transmit evidence that is false, fabricated, or materially misleading. The architectural choices reflect that intent: typed evidence schemas, no LLM-generated fields, default `submit:false` staging, and a hash-chained audit log.

## Merchant responsibility

The merchant deploying the Software is solely responsible for the accuracy of all evidence assembled and submitted, for compliance with applicable card network rules, acquirer agreements, federal and state law, and foreign law, and for its own representations to its cardholders, its acquirer, and any regulator.

## Trademarks

MerchantGuard® and GuardScore® are registered trademarks of Dunecrest Ventures Inc. AgentGuard™ is a trademark of Dunecrest Ventures Inc. (USPTO Serial No. 99462472). References in the Software to "Visa," "Mastercard," "Stripe," "Coinbase," and other third-party trademarks are nominative use under the Lanham Act and the doctrine articulated in *New Kids on the Block v. News America Publ'g, Inc.*, 971 F.2d 302 (9th Cir. 1992), to identify the rules and APIs with which the Software is designed to interoperate, and do not imply endorsement.
