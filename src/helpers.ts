export function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json' }
  })
}

export function buildReportEntry(reporter: string, repo: string, pr: number): string {
  return [
    `reporter: ${reporter}`,
    `repo: ${repo}`,
    `pr: #${pr}`,
    `reason: /slopper report`,
    `date: ${new Date().toISOString()}`
  ].join('\n')
}
