export type Repository = {
  owner: string
  repo: string
  key: string
}

export type GitHubActionsRoute = {
  repository: Repository
  url: URL
}

function decodePathSegment(segment: string): string | null {
  try {
    const decoded = decodeURIComponent(segment)
    return decoded.length > 0 && !decoded.includes("/") ? decoded : null
  } catch {
    return null
  }
}

export function parseGitHubActionsRoute(
  input: string | URL,
): GitHubActionsRoute | null {
  let url: URL

  try {
    url = input instanceof URL ? input : new URL(input)
  } catch {
    return null
  }

  if (
    url.protocol !== "https:" ||
    url.hostname.toLowerCase() !== "github.com"
  ) {
    return null
  }

  const match = /^\/([^/]+)\/([^/]+)\/actions(?:\/|$)/u.exec(url.pathname)
  if (match === null) {
    return null
  }

  const ownerSegment = match[1]
  const repoSegment = match[2]
  if (ownerSegment === undefined || repoSegment === undefined) {
    return null
  }

  const owner = decodePathSegment(ownerSegment)
  const repo = decodePathSegment(repoSegment)
  if (owner === null || repo === null) {
    return null
  }

  return {
    repository: {
      owner,
      repo,
      key: `${owner}/${repo}`.toLocaleLowerCase("en-US"),
    },
    url,
  }
}
