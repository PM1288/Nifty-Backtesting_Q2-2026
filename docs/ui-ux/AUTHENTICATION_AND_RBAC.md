# Authentication and RBAC

## Current implementation

The frontend uses the existing Firebase/session bridge. Authentication is user initiated; an automatic login modal is disabled unless explicitly enabled by deployment configuration. Guest users can reach read-only surfaces and APIs enforce access independently.

## Safety rules

- UI visibility is never treated as authorisation.
- No credentials, one-time passwords or service secrets are compiled into the browser bundle.
- PAPER is the displayed safe environment in the new workspace.
- Any future live-trading control must require server-side permission plus explicit operator acknowledgement.

## Target model

The product specification calls for Google-first identity, a separately governed break-glass administrator and server-enforced roles for viewer, researcher, operator and administrator. That migration is not part of the visual refactor because it requires backend identity and audit contracts. The new components and navigation do not claim those roles are implemented.
