export interface Env {
  APP_ID: string
  PRIVATE_KEY: string
  WEBHOOK_SECRET: string
  COMMUNITY_REPO: string
}

export interface ReportRequest {
  owner: string
  repo: string
  pr: number
  reportedUser: string
  commentId: number
}

export type WriteAction =
  | { type: 'upsertComment'; pr: number; marker: string; body: string }
  | { type: 'createComment'; pr: number; body: string }
  | { type: 'ensureLabel'; name: string; color: string }
  | { type: 'applyLabels'; pr: number; labels: string[] }
  | { type: 'removeSlopperLabels'; pr: number }
  | { type: 'closePr'; pr: number }
  | { type: 'approvePr'; pr: number; body: string }
  | { type: 'requestReviewers'; pr: number; reviewers: string[] }
  | { type: 'createOrUpdateFile'; path: string; message: string; content: string }
  | { type: 'createVouchPr'; username: string; content: string }

export interface WriteRequest {
  oidcToken: string
  owner: string
  repo: string
  action: WriteAction
}

export interface IssueCommentEvent {
  action: string
  comment: {
    id: number
    body: string
    user: {
      login: string
      type: string
    }
  }
  issue: {
    number: number
    pull_request?: unknown
    user: {
      login: string
    }
  }
  repository: {
    full_name: string
    owner: {
      login: string
    }
    name: string
  }
  installation?: {
    id: number
  }
}
