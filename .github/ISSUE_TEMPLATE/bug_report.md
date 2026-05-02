---
name: Bug report
about: Report a bug in AgentGuard CB
labels: bug
---

## DO NOT include personal data in this issue

Before submitting, please confirm that this issue **does not** contain any of the following:

- [ ] Customer email addresses, names, phone numbers, or other personally identifying information
- [ ] Credit card numbers, BIN ranges, last-four digits, or expiry dates
- [ ] IP addresses or device fingerprints associated with real customers
- [ ] Real shipping or billing addresses
- [ ] Real Stripe charge IDs, payment method IDs, customer IDs, or webhook payloads from production
- [ ] Real dispute IDs, dispute evidence, or screenshots showing customer-identifying data
- [ ] API keys, signing secrets, database URLs, or other credentials

If you need to share data to demonstrate the bug, **redact it first**. Replace identifiers with placeholders such as `cus_REDACTED`, `cu_REDACTED`, `192.0.2.1`, `customer@example.com`. Issues containing personal data will be edited or deleted by maintainers and the personal data may be reported to the user under our handling-on-receipt policy described in `LEGAL.md` § "Privacy and data protection."

## Describe the bug

A clear and concise description of what the bug is.

## Reproduction steps

1. Run `...`
2. Configure `...`
3. Observe `...`

## Expected behavior

What you expected to happen.

## Actual behavior

What actually happened. **Redact any logs, payloads, or screenshots before pasting.**

## Environment

- `AgentGuard CB` version:
- Stripe SDK version (run `npm run stripe:version`):
- Node version:
- Adapter being used:
- Operating system:

## Additional context

Anything else relevant. **Redact before pasting.**
