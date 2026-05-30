# Preamble

We, the members and stewards of TRF, establish this constitution as the shared source of law, lore, and civic procedure. It exists to keep play fair, preserve the story of the community, and make future updates clear to every citizen.

This bundled markdown is the offline fallback for the constitution page. In production, editors should update the configured Google Docs source; the page fetches that document first and only renders this file when the external source is unavailable.

:::lore
The first draft was sealed in the archive so future senators could amend the law without rebuilding the hall that displays it.
:::

# Article I — Citizenship

Citizenship belongs to members who act in good faith, respect community rulings, and keep their accounts in standing with the alliance.

## Rights of Citizens

Every citizen may:

- Read the constitution and cite specific sections by deep link.
- Request clarification from officers or senators.
- Propose amendments through the process defined in Article V.

## Duties of Citizens

Citizens shall keep the community secure, avoid harassment, and follow battle procedures during coordinated operations.

:::law severity="high"
Combat logging, deliberate evasion of sanctions, and impersonation of officers are prohibited.
:::

# Article II — Governance

The Senate is responsible for interpreting the constitution, recording amendments, and keeping the public codex current.

## Officers

Officers may issue temporary rulings when immediate action is required. Temporary rulings must be reviewed by the Senate at the next regular session.

:::amendment version="1.2"
Updated on 2026-05-30 to clarify that emergency officer rulings are temporary until reviewed.
:::

## Records

Official records should be written in durable markdown-compatible language so the document can later be sourced from a repository, CMS, or Google Doc without redesigning the page.

# Article III — Conduct

Members are expected to maintain a competitive but welcoming environment.

## Fair Play

No citizen may exploit bugs, automate prohibited actions, or knowingly spread false operational orders.

:::law severity="standard"
Disputes should be escalated through the chain of command before they become public conflicts.
:::

## Lore and Roleplay

Lore may embellish the history of an event, but it may not override binding law.

:::lore
The First Senate established the maxim: “The story makes the law memorable; the law keeps the story playable.”
:::

# Article IV — Enforcement

Enforcement should be consistent, documented, and proportional to the severity of the violation.

## Sanctions

Available sanctions include warnings, temporary restrictions, restitution requirements, and removal from privileged roles.

## Appeals

A sanctioned citizen may appeal by citing the relevant article, describing the disputed facts, and proposing a remedy.

# Article V — Amendments

The constitution is a living document. Amendments should be easy to review, easy to merge, and easy to render.

## Proposal Format

Each proposal should include:

1. The article or section affected.
2. The exact replacement language.
3. The reason for the change.
4. The requested effective date.

:::amendment version="future-docs"
Google Docs is the production source of truth for this constitution. The loader in `src/services/constitutionSource.ts` fetches the configured document through the backend, converts it to markdown, and leaves this file as a safe fallback.
:::

## Ratification

A ratified amendment becomes binding when the Senate records it in the source document and publishes the updated constitution page.
