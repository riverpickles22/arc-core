# Contributing to arc

Patches are welcome — on the engine. arc-core is the part worth
standardizing on: `conventions.md`, the schemas, the validator, the graph
module. `arc-backend` and `arc-frontend` are one implementation of that
spec, and take contributions on the same terms.

## The license your patch lands under

Everything here is [Apache 2.0](LICENSE), and so is anything you send.
Apache 2.0 §5 already says so — a contribution intentionally submitted for
inclusion is under the terms of the License unless you explicitly say
otherwise — so there is no separate agreement to sign and no CLA.

**No CLA, deliberately.** A CLA exists to keep the option of relicensing
contributed code under different terms later. arc is not planning that, and
the barrier would fall on exactly the person this project wants: the second
author who reads `conventions.md`, disagrees with something in it, and sends
a patch. Signing paperwork to fix a schema is the wrong first experience.

## Sign your commits (DCO)

What we do ask for is a sign-off: a line saying you have the right to submit
the code you are submitting. Git writes it for you:

```sh
git commit -s -m "your message"
```

which appends

```
Signed-off-by: Your Name <your.email@example.com>
```

Use your real name and a real address — the sign-off is an attestation, and
an anonymous one attests nothing. Forgot on the last commit?
`git commit --amend -s`. On several? `git rebase --signoff <base>`.

That line means you agree to the [Developer Certificate of
Origin](https://developercertificate.org/) 1.1, reproduced in full below.
It is the light-weight mechanism the Linux kernel and git use: no account,
no signature, no third-party service — one flag, and a record that travels
with the commit.

```
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

## What not to send

**Stories.** This repo holds none and wants none. `examples/example-story`
is a deliberately tiny invented story that exists to be validated against,
not a place to add chapters. Your canon is yours, under whatever terms you
like — see the note on the arc name in the [README](README.md#license).

## Before you open a pull request

Canon changes and schema changes both have to survive the validator, because
that is the promise the whole system rests on:

```sh
python3 tools/validate.py examples/example-story     # schemas + canon discipline
cd graph && npm test                                 # the graph module's vectors
```

A change to `conventions.md` is a change to the constitution — say in the
pull request what rule you are adding or loosening and what breaks if
nobody follows it. Those get read slowly.
