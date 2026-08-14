# Privacy Policy

**Last updated:** 14.8.2026

This Privacy Policy explains how Bar3 / TRF Tech ("**the Service**", "**we**", "**us**") collects,
uses, stores, and protects personal data when you use the Service, in accordance with:

- the Swiss Federal Act on Data Protection (**FADP**, revised version in force since 1 September 2023), and
- the EU General Data Protection Regulation (**GDPR**, Regulation (EU) 2016/679), for users located in the
  European Union / European Economic Area.



---

## 1. Who is responsible for your data (the "controller")

Bar3 / TRF Tech is an independent, non-commercial community project for the Politics & War game,
operated by an individual rather than a registered company.

**Controller:** the operator of Bar3 / TRF Tech
**Contact:** **[glaernisch.gaming@gmail.com]**

We do not publish the operator's legal name or home address, as this is a small, free, non-commercial
community tool rather than a registered business. Data protection law does not require a controller to
be a company — an individual can act as controller — and the contact email above is the channel for
all privacy requests, security reports, and legal correspondence. If a regulator or court requires
further identification in connection with a specific complaint, that will be provided through the
proper legal channel rather than published here.

We do not currently appoint a separate EU or Swiss representative under Art. 27 GDPR / the FADP. If the
Service's EU/EEA user base grows to a point where this becomes required, this section will be updated
accordingly.

---

## 2. What data we collect

We only collect data that the Service needs to function. Based on how the Service is built today, this is:

| Category | Examples | Where it comes from |
|---|---|---|
| **Account credentials** | Password (never stored in plain text — see §5), self-issued API tokens | You, when you register a native account or request an API token |
| **Politics & War (PnW) data** | Your PnW nation ID, in-game username, and your PnW API key | You, when you link a PnW account |
| **Discord data** | Discord user ID, Discord username, server roles relevant to the Service (e.g. verified/member status) | Discord, via OAuth login, only with your authorization |
| **Messages & templates** | Alliance message templates (subject/body/HTML/CSS) you create, and chat messages sent inside the Service | You |
| **Delivery & engagement data** | Whether a message link was clicked or a message was viewed, and when (aggregate counters and timestamps, not message content) | Generated automatically when recipients interact with links/messages you send |
| **Push notification data** | Web Push subscription endpoint and keys, linked to your username | Your browser, only if you opt in to notifications |
| **Technical/security data** | IP address and request metadata (processed transiently for rate-limiting and abuse prevention; not persisted in application data unless noted) | Automatically, from your device |

We do **not** intentionally collect special categories of data (Art. 9 GDPR / Art. 5 FADP "sensitive
personal data") such as health, religion, or political opinions. Please do not include such data in
free-text fields (e.g. chat messages or message templates).

---

## 3. Why we process your data (purposes & legal basis)

| Purpose | Legal basis (GDPR) | Swiss FADP basis |
|---|---|---|
| Creating and authenticating your account | Performance of a contract (Art. 6(1)(b)) | Necessary for the purpose of the relationship (Art. 6 FADP – good faith/proportionality) |
| Linking and calling the PnW API on your behalf (automation, messaging, banking tools) | Performance of a contract (Art. 6(1)(b)) | Same |
| Security, fraud/abuse prevention, rate-limiting | Legitimate interest (Art. 6(1)(f)) | Legitimate interest |
| Sending you Web Push notifications | Consent (Art. 6(1)(a)) — you opt in | Consent |
| Chat and collaboration features | Performance of a contract / legitimate interest | Same |
| Legal compliance (e.g. responding to lawful requests) | Legal obligation (Art. 6(1)(c)) | Legal obligation |

We do not use your data for automated decision-making or profiling that produces legal or similarly
significant effects (Art. 22 GDPR).

---

## 4. Who we share data with

We do not sell personal data. We share data only with the following categories of recipients, strictly
as needed to run the Service:

- **Hosting / infrastructure provider(s)** — e.g. Render (application hosting) and MongoDB Atlas
  (database hosting). render is hosting in Frankfurt (EU Central), mongodb is in GCP Belgium (europe-west1)
- **Discord Inc.** — if you sign in with Discord, Discord processes your authentication under its own
  privacy policy.
- **Politics & War (politicsandwar.com)** — your PnW API key is used to call the official PnW API on
  your behalf, strictly for the features you use (e.g. sending in-game messages, reading nation data).
  We do not control PnW's own processing of that data.
- **Law enforcement or regulators**, only where legally required.

**International transfers:** if any of the above providers process or store data outside Switzerland or
the EU/EEA (for example, on servers located in the United States), such transfers are only made
subject to an adequate safeguard, such as the EU Standard Contractual Clauses, the Swiss Federal Data
Protection and Information Commissioner (FDPIC)'s approved SCC addendum, or an applicable adequacy
decision. **[List the specific countries/providers and the safeguard used, once confirmed — this is a
mandatory disclosure, not optional boilerplate.]**

---

## 5. How we protect your data

- **Passwords** for native accounts are never stored in plain text. They are hashed with **bcrypt**
  (a salted, adaptive hashing algorithm — a unique random salt is generated for every password
  automatically), so even we cannot see or recover your password.
- **PnW API keys** and other third-party secrets that the Service must be able to use on your behalf
  are encrypted at rest with **AES-256-GCM** before being stored, using a server-side key that is never
  exposed to clients. A separate one-way hash is stored only as a lookup index — it cannot be reversed
  to recover the key.
- **Self-issued API tokens** (bearer tokens the Service generates for you) are high-entropy random
  values (256 bits) and are stored only as a **SHA-256** hash; the plain token is shown to you once,
  at creation time, and cannot be retrieved again from our systems.
- Verification codes and similar one-time secrets are compared using constant-time comparison to
  reduce timing-attack risk, and expire automatically.
- Access to production data is restricted to what is operationally necessary, and admin-only
  functionality requires separate authentication.

No system is 100% secure, and we cannot guarantee absolute security. If you believe your account or
data has been compromised, contact us immediately at the address in §1.

---

## 6. How long we keep your data

| Data | Retention |
|---|---|
| Account records (native or PnW-linked) | Until you delete your account, or every 3-4 months, whichever is sooner |
| Chat messages | Automatically deleted after 14 days |
| Web Push subscriptions | Automatically deleted after 90 days of inactivity |
| Message templates, delivery/engagement counters | Until you delete them or your account is deleted |
| Security/rate-limiting logs |  |



---

## 7. Your rights

Subject to the conditions set out in the GDPR and/or the Swiss FADP, you have the right to:

- **Access** the personal data we hold about you;
- **Rectify** inaccurate or incomplete data;
- **Erase** your data ("right to be forgotten"), e.g. by deleting your account;
- **Restrict** or **object** to certain processing, in particular processing based on legitimate interest;
- **Data portability**, for data you provided to us and that we process by automated means under
  contract or consent;
- **Withdraw consent** at any time (e.g. by disabling push notifications), without affecting the
  lawfulness of processing before withdrawal;
- **Lodge a complaint** with a supervisory authority — in Switzerland, the **Federal Data Protection
  and Information Commissioner (FDPIC / EDÖB)**, or in the EU, the data protection authority of your
  country of residence or the authority competent for [Operator country/lead authority, if applicable].

To exercise any of these rights, contact us at the address in §1. We will respond within the timeframe
required by applicable law.

---

## 8. Cookies and local storage

The Service's web client stores a session/API token in your browser's local storage to keep you signed
in. This is strictly necessary for the Service to function and is not used for advertising or
cross-site tracking. We do not currently use third-party advertising or analytics cookies.
**[Update this section if that changes.]**

---

## 9. Children

The Service is not directed at children, and we do not knowingly collect personal data from children
under 16. If you believe a child has provided us with personal data, contact us so we can delete it.

---

## 10. Changes to this policy

We may update this Privacy Policy from time to time, for example to reflect new features or legal
requirements. We will post the updated version here with a new "Last updated" date, and, where changes
are material, provide additional notice (e.g. via the Service or Discord).

---

## 11. Governing law, jurisdiction, and misuse of the Service

This Privacy Policy, and your use of the Service, is governed by Swiss law, without regard to its
conflict-of-law provisions. To the extent permitted by law, the exclusive place of jurisdiction for any
dispute arising out of or in connection with this Privacy Policy or the Service is **Zurich,
Switzerland**. This does not deprive EU/EEA consumers of any mandatory protections, including the right
to bring proceedings before the courts of their own place of residence where applicable law grants
that right, or to lodge a complaint with their local supervisory authority (see §7).

Any attempt to gain unauthorized access to the Service or its data, to abuse, circumvent, or attack its
authentication and security measures, or to otherwise act with malicious intent toward the Service or
its users, may be pursued through civil and/or criminal legal action, in addition to immediate
suspension or termination of access.

---

## 12. Contact

Questions about this policy or your data can be sent to: **[glaernisch.gaming@gmail.com]**


This document was drafted to match Swiss FADP and EU GDPR structure based on your stated preferences
(individual, non-corporate operator; email-only contact; Zurich jurisdiction), but it was not reviewed
by a lawyer. That's a reasonable trade-off for a free community tool, but keep in mind it means there's
some residual risk that a specific clause doesn't hold up if it's ever contested — worth a cheap
one-off legal review later if the project grows.
