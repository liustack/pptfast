/**
 * Strip secrets from strings that might leak into errors, logs, sidecars, or
 * stdout. Pixabay puts the API key in the query string as `key=`, which a
 * typical `api_key=` regex does not catch — both that form and an exact
 * replace of every known secret (length ≥ 6) have to run.
 */

const KEY_QUERY = /([?&](?:api_)?key=)[^&\s"'<>]*/gi

export function redactSecrets(text: string, knownSecrets: string[] = []): string {
  let out = text
  const secrets = knownSecrets.filter((s) => s.length >= 6).sort((a, b) => b.length - a.length)
  for (const secret of secrets) {
    out = out.split(secret).join("[redacted]")
  }
  out = out.replace(KEY_QUERY, "$1[redacted]")
  return out
}
