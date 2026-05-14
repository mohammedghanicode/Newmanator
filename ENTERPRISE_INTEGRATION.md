# 🏢 Newmanator Enterprise Integration & Team Collaboration Guide

_Share this guide on Microsoft Loop, Teams, or your knowledge management system for team-wide adoption._

---

## 📌 Overview

This guide covers how to integrate **Newmanator** into your team's testing workflow, automate report generation in CI/CD pipelines, and collaborate on API test results using Microsoft Teams and Loop.

---

## 🎓 What is Newmanator?

| Aspect         | Details                                                                                        |
| -------------- | ---------------------------------------------------------------------------------------------- |
| **Purpose**    | Automatically collate multiple Newman API test reports into a single interactive HTML summary  |
| **Best For**   | Teams testing multiple API collections, environments, or running distributed test suites       |
| **Input**      | Newman `.json` / `.html` reports or `.zip` archives                                            |
| **Output**     | Interactive `summary.html` with aggregate statistics, failed requests, and performance metrics |
| **Time Saved** | 30-60 min per week consolidating and analyzing reports manually                                |

---

## 🔄 Workflow Integration Scenarios

### Scenario 1: Daily Test Report Consolidation

**Team:** QA Team with 4 testers
**Challenge:** Each tester runs their assigned collections; manually combining results takes 30 minutes

**Solution with Newmanator:**

```
Day Start
  ↓
Each tester runs Newman locally
  ↓
Reports auto-upload to shared OneDrive folder
  ↓
Scheduled PowerShell script zips all reports
  ↓
Newmanator processes the zip automatically
  ↓
summary.html posted to Teams channel
  ↓
Team reviews results in 2 minutes
```

**Setup Time:** 15 minutes
**Time Saved:** 25 minutes daily = 2 hours/week

---

### Scenario 2: CI/CD Pipeline Integration

**Team:** DevOps + QA Team
**Challenge:** Newman runs in CI/CD but reports are scattered across build logs; hard to track trends

**Solution with Newmanator:**

```
Code Push to Main
  ↓
CI/CD Pipeline (GitHub Actions / Azure Pipelines)
  ├─ Run Newman tests (5 collections × 3 environments = 15 reports)
  ├─ Newmanator processes all reports → summary.html
  ├─ Upload summary as build artifact
  └─ Post link to Teams notification
  ↓
Test Results Dashboard Ready
```

**GitHub Actions Example:**

```yaml
name: API Tests + Newmanator Summary

on: [push, pull_request]

jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3

      - uses: actions/setup-node@v3
        with:
          node-version: "18"

      # Run Newman tests across multiple collections
      - name: Run API Tests
        run: |
          npm install -g newman
          mkdir -p reports
          newman run collections/user-api.json --reporters json,html --reporter-html-export reports/user-api.html
          newman run collections/auth-api.json --reporters json,html --reporter-html-export reports/auth-api.html
          newman run collections/payment-api.json --reporters json,html --reporter-html-export reports/payment-api.html

      # Install and run Newmanator
      - name: Install Newmanator
        run: |
          git clone https://github.com/mohammedghanicode/Newmanator.git newmanator
          cd newmanator
          npm install

      - name: Generate Summary Report
        run: |
          cd newmanator
          node index.js --input ../reports --output ../summary.html

      # Upload summary as artifact
      - name: Upload Test Summary
        uses: actions/upload-artifact@v3
        with:
          name: newmanator-summary
          path: summary.html

      # Post to Teams (if configured)
      - name: Notify Teams
        if: always()
        run: |
          curl -X POST ${{ secrets.TEAMS_WEBHOOK }} \
            -H 'Content-Type: application/json' \
            -d '{"text":"API tests completed. Summary: ${{ github.server_url }}/${{ github.repository }}/actions/runs/${{ github.run_id }}"}'
```

---

### Scenario 3: Release Validation Testing

**Team:** QA Team doing pre-release validation
**Challenge:** Testing against 5 environments × 10 test collections = 50 reports to manually review

**Solution with Newmanator:**

```
Release Candidate Ready
  ↓
QA Downloads test collections + environment configs
  ↓
Runs: for env in prod-staging prod-test prod-uat; do
      newman run collections/* --environment $env.json --reporters html
    done
  ↓
Zips all 50 reports → one-click into Newmanator
  ↓
Summary generated in 30 seconds
  ↓
QA Lead reviews one consolidated report
  ↓
Sign-off decision in minutes (not hours)
```

**Time Impact:** 2 hours → 15 minutes review cycle

---

## 💼 Team Adoption Playbook

### Week 1: Introduction

**Friday Team Standup (10 minutes)**

- Demo: Show how Newmanator works (drag-and-drop files → instant summary)
- Pain Point: "How much time do we spend manually consolidating reports?"
- Call to Action: "Try Newmanator on your next batch of tests"

**Create Teams Channel:** `#api-test-reports`

---

### Week 2: Pilot

**Who:** 1-2 volunteers
**Task:** Run 5+ test reports through Newmanator and collect feedback

**Feedback Questions:**

- Did it save time?
- Was the summary clear and useful?
- Any issues with file formats?

---

### Week 3: Rollout

**Setup:**

- Install on team machines: `npm install && npm start`
- Share shortcut to installer on shared drive

**Documentation:**

- Post USER_GUIDE.md to Teams wiki
- Link to troubleshooting section

**Process Update:**

- Add "Run tests through Newmanator" to QA checklist
- Update test documentation

---

### Week 4: Automation

**Setup CI/CD integration** (as shown in Scenario 2)

**Results:**

- Automatic report generation
- Zero manual steps
- Historical trend tracking

---

## 📊 Sharing Results on Microsoft Loop

### Create a Loop Report Template

**Loop Component 1: Test Summary Card**

```
╔════════════════════════════════════════╗
║ 📊 API Test Summary — May 13, 2025     ║
╠════════════════════════════════════════╣
║ Total Tests:     2,847                 ║
║ ✅ Passed:       2,798 (98.3%)         ║
║ ❌ Failed:       49 (1.7%)             ║
║ ⏱️  Avg Response: 234ms                ║
║ 🔍 Slowest:      /api/reports (1.2s)  ║
╚════════════════════════════════════════╝
```

**Loop Component 2: Failed Requests Table**

```
| Request Name | URL | Status | Assertion |
|---|---|---|---|
| Create User | POST /api/users | 500 | Expected 200 |
| List Payments | GET /api/payments | 429 | Rate limit exceeded |
| Delete Report | DELETE /api/reports/123 | 401 | Unauthorized |
```

**Loop Component 3: Trend Chart**

```
Embed screenshot of summary.html showing pass/fail trend
```

### Workflow: Update Loop Daily

1. Run Newmanator → `summary.html` generated
2. Copy key metrics into Loop template
3. Loop syncs automatically to Teams
4. Team sees results without opening external files

---

## 🔐 Data Security & Privacy

### Best Practices

✅ **DO:**

- Store reports on encrypted network drives
- Use Teams' SharePoint backend for files
- Redact credentials before sharing (Newmanator does this automatically)
- Archive summaries in version control (git) for history

❌ **DON'T:**

- Email raw JSON reports with credentials
- Store on personal cloud drives without encryption
- Share summary.html with external partners if it contains internal URLs
- Commit raw Newman reports to public repositories

---

## 📈 Measuring Success

### Metrics to Track

| Metric                         | Before Newmanator | After Newmanator | Impact           |
| ------------------------------ | ----------------- | ---------------- | ---------------- |
| Time to Consolidate 50 Reports | 2 hours           | 5 minutes        | 94% time savings |
| Reports Reviewed Daily         | 10                | 100+             | 10x faster       |
| Test Suite Automation          | Manual            | CI/CD Integrated | 100% uptime      |
| Defect Detection Time          | 30 min            | < 5 min          | 6x faster        |

---

## 🚀 Advanced Integration

### Integration with Azure DevOps

```yaml
# azure-pipelines.yml
trigger:
  - main

pool:
  vmImage: "windows-latest"

steps:
  - task: NodeTool@0
    inputs:
      versionSpec: "18.x"

  - script: |
      npm install -g newman
      mkdir $(Build.ArtifactStagingDirectory)/reports
      newman run collections/api-tests.json --reporters json,html --reporter-html-export $(Build.ArtifactStagingDirectory)/reports/report.html
    displayName: "Run Newman Tests"

  - script: |
      git clone https://github.com/mohammedghanicode/Newmanator.git
      cd Newmanator
      npm install
      node index.js --input $(Build.ArtifactStagingDirectory)/reports --output $(Build.ArtifactStagingDirectory)/summary.html
    displayName: "Generate Summary with Newmanator"

  - task: PublishBuildArtifacts@1
    inputs:
      pathToPublish: "$(Build.ArtifactStagingDirectory)/summary.html"
      artifactName: "test-summary"
```

### Slack Notification with Summary Link

```python
import requests
import json

def notify_slack(summary_path, build_url):
    webhook = "https://hooks.slack.com/services/YOUR/WEBHOOK/URL"

    with open(summary_path, 'r') as f:
        html = f.read()

    # Extract stats from HTML or pass as args
    payload = {
        "text": "✅ API Tests Complete",
        "blocks": [
            {
                "type": "section",
                "text": {
                    "type": "mrkdwn",
                    "text": f"*API Test Summary*\n<{build_url}|View Full Report>"
                }
            }
        ]
    }

    requests.post(webhook, json=payload)

if __name__ == "__main__":
    notify_slack("summary.html", "https://build-url")
```

---

## 🎯 Training Checklist

- [ ] Team watches 5-minute demo
- [ ] Each member installs app locally
- [ ] Everyone runs at least 1 test through Newmanator
- [ ] Document team's specific file format/naming convention
- [ ] Set up shared folder for report archives
- [ ] Create Teams wiki page with links to guides
- [ ] Configure CI/CD pipeline integration
- [ ] Schedule weekly "test report review" meeting

---

## ❓ FAQ for Teams

**Q: What file formats does Newmanator support?**
A: `.zip` archives, `.html` reports, and `.json` files. Zip multiple reports for batch processing.

**Q: Can I schedule Newmanator to run automatically?**
A: Yes! Use Windows Task Scheduler (local) or CI/CD pipelines (Azure/GitHub/Jenkins).

**Q: How long does it take to process 100 reports?**
A: Typically 5-30 seconds depending on report size and system resources.

**Q: Is my data secure? Are credentials exposed?**
A: Yes, it's secure. Newmanator automatically redacts API keys, bearer tokens, and sensitive data from the HTML output.

**Q: Can I customize the summary report?**
A: Yes, edit `summarise.js` to modify styling, metrics, or filtering logic.

---

## 📚 Resources

| Resource         | Link                                                   |
| ---------------- | ------------------------------------------------------ |
| GitHub Repo      | https://github.com/mohammedghanicode/Newmanator        |
| Main README      | [README.md](README.md)                                 |
| User Guide       | [USER_GUIDE.md](USER_GUIDE.md)                         |
| Getting Started  | [GETTING_STARTED.md](GETTING_STARTED.md)               |
| Issues & Support | https://github.com/mohammedghanicode/Newmanator/issues |

---

## 🤝 Share This Guide

**On Microsoft Loop:**

1. Create new Loop component
2. Paste this entire guide
3. Share with team
4. Pin in Teams channel

**On Teams Wiki:**

1. Go to Wiki tab in your channel
2. Create new page: "Newmanator Integration"
3. Paste content (or link to Loop component)

**On Notion/Confluence:**

- Export this as markdown
- Import to your knowledge base

---

## 💡 Next Steps

1. **Install** — `npm install && npm start`
2. **Try It** — Process your first report batch
3. **Automate** — Set up CI/CD integration
4. **Share** — Invite team members
5. **Optimize** — Gather feedback and improve workflow

---

**Questions? 💬**

- Open a GitHub issue
- Ask in the Teams channel
- Review USER_GUIDE.md troubleshooting section

---

_Made with ⚡ for teams that value automated API testing._

**Newmanator — Report Collation Done Right.**
