import type { ClientContext } from './fetch'
import * as comments from './comments'
import * as issues from './issues'
import * as files from './files'
import * as slopperPr from './slopper-pr'

export { getComment } from './comments'

export class GitHubClient implements ClientContext {
  constructor(
    readonly token: string,
    readonly owner: string,
    readonly repo: string
  ) {}

  listComments(issueNumber: number) {
    return comments.listComments(this, issueNumber)
  }

  upsertComment(issueNumber: number, marker: string, body: string) {
    return comments.upsertComment(this, issueNumber, marker, body)
  }

  createComment(issueNumber: number, body: string) {
    return comments.createComment(this, issueNumber, body)
  }

  closePr(prNumber: number) {
    return issues.closePr(this, prNumber)
  }

  approvePr(prNumber: number, body: string) {
    return issues.approvePr(this, prNumber, body)
  }

  requestReviewers(prNumber: number, reviewers: string[]) {
    return issues.requestReviewers(this, prNumber, reviewers)
  }

  ensureLabel(name: string, color: string) {
    return issues.ensureLabel(this, name, color)
  }

  addLabels(issueNumber: number, labels: string[]) {
    return issues.addLabels(this, issueNumber, labels)
  }

  removeSlopperLabels(issueNumber: number) {
    return issues.removeSlopperLabels(this, issueNumber)
  }

  getFileContent(path: string) {
    return files.getFileContent(this, path)
  }

  createOrUpdateFile(path: string, message: string, content: string) {
    return files.createOrUpdateFile(this, path, message, content)
  }

  getCollaboratorPermission(username: string) {
    return issues.getCollaboratorPermission(this, username)
  }

  addReaction(commentId: number, reaction: string) {
    return issues.addReaction(this, commentId, reaction)
  }

  createVouchPr(username: string, content: string) {
    return slopperPr.createVouchPr(this, username, content)
  }

  createBanPr(username: string, content: string) {
    return slopperPr.createBanPr(this, username, content)
  }

  createReportPr(username: string, content: string, sourceRepo: string, pr: number, reporter: string) {
    return slopperPr.createReportPr(this, username, content, sourceRepo, pr, reporter)
  }
}
