import * as core from "@actions/core"

import { CoverageMapData, createCoverageMap } from "istanbul-lib-coverage"
import { GitHub, context } from "@actions/github"
import { join, resolve, sep } from "path"

import type { FormattedTestResults } from "@jest/test-result/build/types"
import type { Octokit } from "@octokit/rest"
import { exec } from "@actions/exec"
import filter from "lodash/filter"
import flatMap from "lodash/flatMap"
import map from "lodash/map"
import { readFileSync, mkdirSync } from "fs"
import strip from "strip-ansi"
import table from "markdown-table"

const ACTION_NAME = "jest-github-action"
const COVERAGE_HEADER = ":loop: **Code coverage**\n\n"

export async function run() {
  let workingDirectory = core.getInput("working-directory", { required: false })
  let cwd = workingDirectory ? resolve(workingDirectory) : process.cwd()
  const CWD = cwd + sep
  const outputType = core.getInput("output-type", { required: false })
  const RESULTS_FILE = join(CWD, 'coverage',`coverage-final.json`)

  try {
    const token = process.env.GITHUB_TOKEN
    if (token === undefined) {
      core.error("GITHUB_TOKEN not set.")
      core.setFailed("GITHUB_TOKEN not set.")
      return
    }

    const cmd = getJestCommand(RESULTS_FILE)

    // Run jest
    const JestOutput = await execJest(cmd, CWD)

    const lsCMDOutput = await exec("ls", ["-lR"], { silent: false, cwd: join(CWD, 'coverage') })
    console.debug("List files in ./coverage: %j", lsCMDOutput)

    // octokit
    const octokit = new GitHub(token)
    
    if(outputType == 'json'){
      // Parse results
      const results = parseResults(RESULTS_FILE)

      // Checks
      const checkPayload = getCheckPayload(results, CWD)
      await octokit.checks.create(checkPayload)

      // Coverage comments
      if (getPullId() && shouldCommentCoverage()) {
        const comment = getCoverageTable(results, CWD)
        if (comment) {
          try {
            await deletePreviousComments(octokit)
          } catch (error) {
            console.warn("Fail to remove some comment. skip to next stage.", error);
          }
          const commentPayload = getCommentPayload(comment)
          await octokit.issues.createComment(commentPayload)
        }
      }

      if (!results.success) {
        core.setFailed("Some jest tests failed.")
      }
    } else if(outputType == 'lcov'){
      console.debug("lcov output")
    } else if (outputType == 'clover'){      
      console.debug("clover output")
    } else if(outputType == 'text'){
      console.debug("text output")
      console.debug("Jest output: %j", JestOutput)
    } else{
      core.setFailed("Invalid output type.")
    }
  } catch (error) {
    console.error(error)
    core.setFailed(error.message)
  }
}

async function deletePreviousComments(octokit: GitHub) {
  const { data } = await octokit.issues.listComments({
    ...context.repo,
    per_page: 100,
    issue_number: getPullId(),
  })
  return Promise.all(
    data
      .filter(
        (c) =>
          c.user.login === "github-actions[bot]" && c.body.startsWith(COVERAGE_HEADER),
      )
      .map((c) => octokit.issues.deleteComment({ ...context.repo, comment_id: c.id })),
  )
}

function shouldCommentCoverage(): boolean {
  return Boolean(JSON.parse(core.getInput("coverage-comment", { required: false })))
}

function shouldRunOnlyChangedFiles(): boolean {
  return Boolean(JSON.parse(core.getInput("changes-only", { required: false })))
}

function shouldWriteCoverageArtifact(): boolean {
  return Boolean(JSON.parse(core.getInput("coverage-artifact-save", { required: false })))
}

export function getCoverageTable(
  results: FormattedTestResults,
  cwd: string,
): string | false {
  if (!results.coverageMap) {
    return ""
  }
  const covMap = createCoverageMap((results.coverageMap as unknown) as CoverageMapData)
  const rows = [["Filename", "Statements", "Branches", "Functions", "Lines"]]

  if (!Object.keys(covMap.data).length) {
    console.error("No entries found in coverage data")
    return false
  }

  for (const [filename, data] of Object.entries(covMap.data || {})) {
    const { data: summary } = data.toSummary()
    rows.push([
      filename.replace(cwd, ""),
      summary.statements.pct + "%",
      summary.branches.pct + "%",
      summary.functions.pct + "%",
      summary.lines.pct + "%",
    ])
  }

  return COVERAGE_HEADER + table(rows, { align: ["l", "r", "r", "r", "r"] })
}

function getCommentPayload(body: string) {
  const payload: Octokit.IssuesCreateCommentParams = {
    ...context.repo,
    body,
    issue_number: getPullId(),
  }
  return payload
}

function getCheckPayload(results: FormattedTestResults, cwd: string) {
  const payload: Octokit.ChecksCreateParams = {
    ...context.repo,
    head_sha: getSha(),
    name: core.getInput("check-name", { required: false }) || ACTION_NAME,
    status: "completed",
    conclusion: results.success ? "success" : "failure",
    output: {
      title: results.success ? "Jest tests passed" : "Jest tests failed",
      text: getOutputText(results),
      summary: results.success
        ? `${results.numPassedTests} tests passing in ${
            results.numPassedTestSuites
          } suite${results.numPassedTestSuites > 1 ? "s" : ""}.`
        : `Failed tests: ${results.numFailedTests}/${results.numTotalTests}. Failed suites: ${results.numFailedTests}/${results.numTotalTestSuites}.`,

      annotations: getAnnotations(results, cwd),
    },
  }
  console.debug("Check payload: %j", payload)
  return payload
}

function getJestCommand(resultsFile: string) {
  let cmd = core.getInput("test-command", { required: false })
  let outputType = core.getInput("output-type", { required: false })
  const jestOptions = `${outputType=='json'?'--testLocationInResults --json '
  :'--coverageReporters="'+outputType+'" '
  } ${
    shouldCommentCoverage() || shouldWriteCoverageArtifact() ? "--coverage" : ""
  } ${
    shouldRunOnlyChangedFiles() && context.payload.pull_request?.base.ref
      ? "--changedSince=" + context.payload.pull_request?.base.ref
      : ""
  } ${outputType == 'json'?"--outputFile=" + resultsFile:""}`
  const shouldAddHyphen =
    cmd.startsWith("npm") ||
    cmd.startsWith("npx") ||
    cmd.startsWith("pnpm") ||
    cmd.startsWith("pnpx")
  cmd += (shouldAddHyphen ? " -- " : " ") + jestOptions
  core.debug("Final test command: " + cmd)
  return cmd
}

function parseResults(resultsFile: string): FormattedTestResults {
  const results = JSON.parse(readFileSync(resultsFile, "utf-8"))
  console.debug("Jest results: %j", results)
  return results
}

async function execJest(cmd: string, cwd?: string) {
  try {
    const output = await exec(cmd, [], { silent: true, cwd })
    console.debug("Jest command executed")
    return output
  } catch (e) {
    console.error("Jest execution failed. Tests have likely failed.", e)
  }
}

function getPullId(): number {
  return context.payload.pull_request?.number ?? 0
}

function getSha(): string {
  return context.payload.pull_request?.head.sha ?? context.sha
}

const getAnnotations = (
  results: FormattedTestResults,
  cwd: string,
): Octokit.ChecksCreateParamsOutputAnnotations[] => {
  if (results.success) {
    return []
  }
  return flatMap(results.testResults, (result) => {
    return filter(result.assertionResults, ["status", "failed"]).map((assertion) => ({
      path: result.name.replace(cwd, ""),
      start_line: assertion.location?.line ?? 0,
      end_line: assertion.location?.line ?? 0,
      annotation_level: "failure",
      title: assertion.ancestorTitles.concat(assertion.title).join(" > "),
      message: strip(assertion.failureMessages?.join("\n\n") ?? ""),
    }))
  })
}

const getOutputText = (results: FormattedTestResults) => {
  if (results.success) {
    return
  }
  const entries = filter(map(results.testResults, (r) => strip(r.message)))
  return asMarkdownCode(entries.join("\n"))
}

export function asMarkdownCode(str: string) {
  return "```\n" + str.trimRight() + "\n```"
}
