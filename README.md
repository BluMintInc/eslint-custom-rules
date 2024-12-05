<!-- Project shields -->

[![Setup Automated][gitpod-shield]][gitpod-url]

<!-- Header -->
<br />
<p align="center">
  <!---TODO: Update below with repository URL -->
  <a href="https://github.com/BluMintInc/eslint-custom-rules">
    <img src="assets/logo.svg" alt="Logo" height=100>
  </a>
  <p align="center">
    <!---TODO: Update below with repository name -->
    eslint-custom-rules
    <br />
    <!---TODO: Update below with repository URL -->
    <a href="https://github.com/BluMintInc/eslint-custom-rules/issues">Report Bug</a>
    ·
    <!---TODO: Update below with repository URL -->
    <a href="https://github.com/BluMintInc/eslint-custom-rules/issues">Request Feature</a>
  </p>
</p>
<br />

## Table of Contents

- [About this Project](#about-this-project)
  - [Built With](#built-with)
  - [Environment Dependencies](#environment-dependencies)
  - [Recommended Browser Extensions](#recommended-browser-extensions)
- [Getting Started](#getting-started)
  - [Zero-Installation Development](#zero-installation-development)
  - [Docker Installation](#docker-installation)
- [Contributing](#contributing)
  - [Agile Development](#agile-development)
  - [Testing](#testing)
  - [Gitflow](#gitflow)
  - [Commitizen](#commitizen)
  - [Diagramming](#diagramming)
- [Workflow Automation](#workflow-automation)
  - [CI](#ci)
  - [CD](#cd)
  - [Dependency Management](#dependency-management)
  - [Static Code Analysis](#static-code-analysis)
- [License](#license)

<br />

## About this Project

This repository is a template repository for Gitpod-based development of a service.

### Built with

- [Typescript](https://www.typescriptlang.org/)
- [Jest](https://mochajs.org/)

### Environment Dependencies

- [NodeJS](https://nodejs.org) (16 with npm ^8.16.0)

### Recommended Browser Extensions

It is recommended that you install the following browser extensions for the best experience
interacting with this repository:

1. [Gitpod Browser Extension](https://www.gitpod.io/docs/browser-extension/)

<br />

## Getting Started

### Zero-Installation Development

<!---TODO: Update below with repository URL -->

[![Gitpod ready-to-code](https://img.shields.io/badge/Gitpod-ready--to--code-blue?logo=gitpod)](https://gitpod.io/#https://github.com/BluMintInc/eslint-custom-rules)

It is highly recommended to conduct development of this repository
via [Gitpod's online IDE](https://www.gitpod.io/docs/ide/). Click the following to
get started with zero installation requirements:

<p>
  <!---TODO: Update below with repository URL -->
  <a href="https://gitpod.io/#https://github.com/BluMintInc/eslint-custom-rules" target="_blank" rel="nofollow noopener noreferrer">
    <img src="https://gitpod.io/button/open-in-gitpod.svg" alt="Open in Gitpod">
  </a>
</p>

Gitpod is a one-click online IDE for Cloud-based development. The following video
provides a very effective introduction to Gitpod: [https://www.youtube.com/watch?v=qLv6-Uop0yc](https://www.youtube.com/watch?v=qLv6-Uop0yc).

<br />

### Docker Installation

Alternatively, this repo supports [VS Code Remote Container Development](https://code.visualstudio.com/docs/remote/containers#_quick-start-open-a-git-repository-or-github-pr-in-an-isolated-container-volume) for Dockerized development inside VSCode.

**Step #1**: To get started, first make sure to install the followin prerequisites:

1.  Visual Studio Code

    - Manual installation: https://code.visualstudio.com/download
    - Windows (via [Chocolately](https://chocolatey.org/)):
      ```bash
      choco install vscode
      ```
    - Mac or Linux (via [Homebrew](https://brew.sh/)):
      ```sh
      brew update
      brew tap homebrew/cask-cask
      brew cask search visual-studio-code
      brew cask install visual-studio-code
      ```

2.  [Visual Studio Code Remote Development](https://marketplace.visualstudio.com/items?itemName=ms-vscode-remote.vscode-remote-extensionpack)
    extension pack, which can be installed into VS Code with [this manual installation link](vscode:extension/ms-vscode-remote.vscode-remote-extensionpack).

3.  [Docker Desktop](https://www.docker.com/products/docker-desktop)
    - Manual installation: https://www.docker.com/products/docker-desktop for Widows / Mac
    - Windows (via [Chocolately](https://chocolatey.org/)):
      ```bash
      choco install docker-desktop
      ```
      and follow
    - Mac or Linux (via [Homebrew](https://brew.sh/)):
      ```sh
      brew cask install docker
      ```
    - Linux (Ubuntu, Debian):
      ```sh
      sudo apt-get update
      sudo apt-get remove docker docker-engine docker.io
      sudo apt install docker.io
      sudo systemctl start docker
      sudo systemctl enable docker
      ```

**Step #2**: Start the Docker daemon if it has already not started automatially after the
installation finishes (run the Docker Desktop application). To ensure docker is running,
attempt the following commands:

```bash
docker version
docker run hello-world
```

**Step #3**: Start VS Code and press _F1_ to run
**Remote-Containers: Clone Repository in Container Volume..** from the Command Palette.

<!---TODO: Update below with repository URL -->

**Step #4**: Enter this repository's Git URI: https://github.com/BluMintInc/eslint-custom-rules.git.
VS Code will install all required dependencies and set up the environment from the Dockerfile configuration.

<br />

## Contributing

### [Agile Development](https://agilemanifesto.org/)

We are uncovering better ways of developing
software by doing it and helping others do it.

Through this work we have come to value:

- **Individuals and interactions** over _processes and tools_
- **Working software** over _comprehensive documentation_
- **Customer collaboration** over _contract negotiation_
- **Responding to change** over _following a plan_

That is, while there is value in the items on
_the right_, we value the items **on the left** more.

Furthermore, we value these principles:

1. Our highest priority is to satisfy the customer
   through early and continuous delivery
   of valuable software.
2. Welcome changing requirements, even late in
   development. Agile processes harness change for
   the customer's competitive advantage.
3. Deliver working software frequently, from a
   couple of weeks to a couple of months, with a
   preference to the shorter timescale.
4. Business people and developers must work
   together daily throughout the project.
5. Build projects around motivated individuals.
   Give them the environment and support they need,
   and trust them to get the job done.
6. The most efficient and effective method of
   conveying information to and within a development
   team is face-to-face conversation.
7. Working software is the primary measure of progress.
8. Agile processes promote sustainable development.
   The sponsors, developers, and users should be able
   to maintain a constant pace indefinitely.
9. Continuous attention to technical excellence
   and good design enhances agility.
10. Simplicity--the art of maximizing the amount
    of work not done--is essential.
11. The best architectures, requirements, and designs
    emerge from self-organizing teams.
12. At regular intervals, the team reflects on how
    to become more effective, then tunes and adjusts
    its behavior accordingly.

### Testing

Each contributor to this repository is obligated to provide sufficient test coverage over their contributions. 
We use the [Jest](https://jestjs.io/) test framework.

### [Gitflow](https://nvie.com/posts/a-successful-git-branching-model/)

Version control with git on this repo is in strict adherence to
the [Gitflow Workflow](https://nvie.com/posts/a-successful-git-branching-model/).
Gitflow was architectured by Vincent Driesssen in 2010 and since has been adopted with massive
popularity as a very effective development workflow under distributed version control.

The project also utilizes [githooks](https://git-scm.com/docs/githooks/en) to enforce gitflow and 
prevent users from accidently pushing to the main branch.

Plase read the following article for a sufficient introduction to the Gitflow
Workflow: https://www.atlassian.com/git/tutorials/comparing-workflows/gitflow-workflow.

### [Commitizen](https://commitizen-tools.github.io/commitizen/)

This project uses [githooks](https://git-scm.com/docs/githooks/en) to enforce standarized commits 
according to the [Commitizen](https://commitizen-tools.github.io/commitizen/) style. Running 
`git commit` on the command line instigates a series of prompts guiding you through the standard.

### Diagramming

All diagrams should be included on the repository to which they pertain. We use 
[PlantUML](https://plantuml.com/) to build all of our diagrams. PlantUML has a Domain Specific 
Language (DSL) for declaratively building [various types of diagrams](https://plantuml.com/). 
You can write a .wsd, .pu, .puml, .plantuml, or .iuml file containing PlantUML DSL and the 
[PlantUML Extension](https://marketplace.visualstudio.com/items?itemName=jebbs.plantuml) 
will enable you to render that diagram in a live preview by pressing Alt + D.

<br />
<br />

## Workflow Automation

This repository uses [Github Actions](https://docs.github.com/en/actions) for several workflow 
automations as well as several organizational [Github Integrations](https://github.com/integrations).

### CI

Pre-commit [githooks](https://git-scm.com/docs/githooks/en) lint the codebase and then run all the 
project's [Jest](https://jestjs.io/) tests to prevent regressions from even being checked into 
the codebase. On top of this, the 
[Test](https://github.com/BluMintInc/eslint-custom-rules/blob/master/.github/workflows/test-report.yml) 
Action runs the project's [Jest](https://jestjs.io/) tests to check PRs before they are merged.

### CD
<!---TODO: Update below paragraph with repository URLs -->
The [Release](https://github.com/BluMintInc/eslint-custom-rules/blob/master/.github/workflows/semantic-release.yml) 
Action triggers on commits to the main branch utilzing the repository's 
[Commitizen](https://commitizen-tools.github.io/commitizen/) commit style to automatically version published 
code according to [SemVar](https://semver.org/). The 
[Release](https://github.com/BluMintInc/eslint-custom-rules/blob/master/.github/workflows/semantic-release.yml) 
Action also publishes the project to our private npmjs repository scoped under [@blumint](https://www.npmjs.com/settings/minimap-inc/packages).

This repository also makes use of the [Semantic Pull Probot](https://github.com/zeke/semantic-pull-requests) to 
vet and squash the commits of merged PRs onto the main branch. For more information, see 
[Semantic Release](https://github.com/semantic-release/semantic-release).

### Dependency Management

The [Dependabot](https://docs.github.com/en/code-security/supply-chain-security/understanding-your-software-supply-chain/about-supply-chain-security#what-is-dependabot) integration will periodically 
make PRs suggesting modifications to the dependecy structure to eliminiate vulnerabilities, update depricated 
dependencies, and perform other miscellenous tasks.

### Static Code Analysis

The [Accuracies](https://github.com/marketplace/accurics) integration analyzes the codebase for policy violations and 
vulnerabilities with the use of Cloud infrastructure (AWS, GCP, etc.) and makes PRs to corrct any detected 
issues before they become a problem.

The [Codacy](https://app.codacy.com/) bot will scan PRs and the repository as a whole to detect security vulnerabilities, code smells, performance inefficiencies, compatibility issues, unnecessarily complex code, missing documentation, and unused code.

<br />
<br />

## License

No license is included, as all work is proprietary.

<!-- Markdown links & images -->

[gitpod-shield]: https://img.shields.io/badge/setup-automated-blue?logo=gitpod
<!---TODO: Update below with repository URL -->
[gitpod-url]: https://gitpod.io/#https://github.com/BluMintInc/eslint-custom-rules
