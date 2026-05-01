# Developer Certificate of Origin

This project requires every commit to be signed off in accordance with the
Developer Certificate of Origin v1.1 (the "DCO"), reproduced verbatim
below. Signing off is accomplished by appending the line

    Signed-off-by: Your Real Name <your-email@example.com>

to each commit message. The `-s` flag of `git commit` does this
automatically. This requirement is enforced in CI by `.github/workflows/ci.yml`.
Pull requests with unsigned commits will be blocked.

## Why DCO

The DCO is a lightweight alternative to a Contributor License Agreement.
It does not transfer copyright; you, the contributor, retain copyright in
your contribution. By signing off, you certify that you have the right to
contribute the code under the project's MIT License.

## Developer Certificate of Origin

```
Developer Certificate of Origin
Version 1.1

Copyright (C) 2004, 2006 The Linux Foundation and its contributors.

Everyone is permitted to copy and distribute verbatim copies of this
license document, but changing it is not allowed.


Developer's Certificate of Origin 1.1

By making a contribution to this project, I certify that:

(a) The contribution was created in whole or in part by me and I
    have the right to submit it under the open source license
    indicated in the file; or

(b) The contribution is based upon previous work that, to the best
    of my knowledge, is covered under an appropriate open source
    license and I have the right under that license to submit that
    work with modifications, whether created in whole or in part
    by me, under the same open source license (unless I am
    permitted to submit under a different license), as indicated
    in the file; or

(c) The contribution was provided directly to me by some other
    person who certified (a), (b) or (c) and I have not modified
    it.

(d) I understand and agree that this project and the contribution
    are public and that a record of the contribution (including all
    personal information I submit with it, including my sign-off) is
    maintained indefinitely and may be redistributed consistent with
    this project or the open source license(s) involved.
```

## Employer-IP

If your employer has rights to intellectual property you create that
includes your contributions, you represent by signing off that you have
received permission from your employer to make the contribution under the
project's MIT License, or that your employer has waived such rights.

## How to fix unsigned commits

If you've already pushed unsigned commits to a pull request:

```bash
# Sign the last N commits in your branch
git rebase HEAD~N --signoff
git push --force-with-lease
```

Or for a single commit:

```bash
git commit --amend --signoff --no-edit
git push --force-with-lease
```
