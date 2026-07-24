# TLS Certificate Operations

`aethermoore.com` is served by GitHub Pages. GitHub, not repository code, owns
the ACME account, certificate private key, issuance, and renewal.

## Timetable

- GitHub says HTTPS can take up to one hour after a custom domain is configured.
- GitHub says the **Enforce HTTPS** control can take up to 24 hours to become
  available.
- As of July 2026, Let's Encrypt's default certificate lifetime is 90 days.
  Let's Encrypt recommends renewing a 90-day certificate around day 60, when
  one third of its lifetime (30 days) remains.
- Let's Encrypt is shortening default lifetimes over time. The guard calculates
  its renewal window from the live certificate instead of hard-coding 30 days.
  A 45-day certificate therefore enters its renewal window with 15 days left.

The workflow runs at 07:17 and 19:47 UTC every day. The off-minute schedule
reduces GitHub Actions queue delays.

## Automated path

`.github/workflows/tls-certificate-guard.yml`:

1. Reads the certificate served on port 443, even when it has expired.
2. Calculates the renewal window as the final third of the certificate lifetime.
3. Reads GitHub Pages' certificate state.
4. Confirms that GitHub Pages enforces HTTPS.
5. Confirms that plain HTTP redirects to HTTPS.
6. Requests one diagnostic Pages rebuild per day while unhealthy.
7. Creates or updates a `tls-certificate` issue while unhealthy and closes it
   after recovery.

## Administration boundary

The built-in `GITHUB_TOKEN` can read Pages state, request a Pages build, and
manage the tracking issue. GitHub does not grant that token the separate
repository-administration permission required to change a custom domain or
enable HTTPS enforcement.

If GitHub Pages reports `bad_authz` after DNS has been verified:

1. Open **Settings → Pages**.
2. Remove the custom domain and save.
3. Re-add `aethermoore.com` and save.
4. Wait for the certificate state to become `approved`.
5. Enable **Enforce HTTPS**.

Do not place a personal access token in the workflow to bypass this boundary.
