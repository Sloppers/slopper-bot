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
