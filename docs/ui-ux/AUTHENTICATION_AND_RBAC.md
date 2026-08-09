# Authentication and RBAC

## Current implementation

The frontend uses the existing Firebase/session bridge. Authentication is user initiated; an automatic login modal is disabled unless explicitly enabled by deployment configuration. Guest users can reach read-only surfaces and APIs enforce access independently.

## Safety rules

- UI visibility is never treated as authorisation.
- No credentials, one-time passwords or service secrets are compiled into the browser bundle.
- PAPER is the displayed safe environment in the new workspace.
- Any future live-trading control must require server-side permission plus explicit operator acknowledgement.

## Current authentication and authorisation

- Normal users sign in and sign up through Firebase email/password authentication.
- The literal username `admin` is routed to the server-side local administrator login. Its password is supplied only through the untracked runtime environment and is never embedded in the browser bundle or repository.
- Administrator status is carried in the signed server session. `/v1/workspace/control-plane` independently verifies both the admin role and trusted local-admin identity; hiding the navigation item is not the security boundary.
- Firebase users receive no administrator role and cannot call the control-plane endpoint.
- Microsoft Clarity remains enabled through the existing environment-controlled provider. Authentication fields remain masked.

The browser Firebase configuration is intentionally public client configuration. Service credentials, database credentials and the local administrator password must remain server-side.
