FROM gitpod/workspace-full@sha256:b484ad49d47bf70776de1d1333379d6b5f1d56c0a3fc1f31a24eb273ef772e3e

USER root
RUN apt-get update \
  && apt-get install -y --no-install-recommends git-flow=1.12.3-1 \
  && apt-get install -y --no-install-recommends bash-completion=1:2.10-1ubuntu1 \
  && apt-get install -y --no-install-recommends shellcheck=0.7.0-2build2 \
  && apt-get clean \
  && rm -rf /var/lib/apt/lists/*
COPY ./git-flow-completion.bash /home/gitpod/

USER gitpod
RUN echo "source ~/git-flow-completion.bash" >> ~/.bashrc

RUN npm install -g npm

RUN npm install -g dotenv-cli
RUN npm install -g commitizen