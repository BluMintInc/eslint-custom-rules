FROM gitpod/workspace-full@sha256:ae527ca6a5d9f6bce8f4673f59b34a1d5966f53129ea748cbb3956da77fc2684

USER root
RUN apt-get update \
  && apt-get install -y --no-install-recommends bash-completion \
  && apt-get install -y --no-install-recommends shellcheck \
  && apt-get clean \
  && rm -rf /var/lib/apt/lists/*

USER gitpod

RUN npm install -g dotenv-cli
RUN npm install -g commitizen
RUN npm install -g opencommit
