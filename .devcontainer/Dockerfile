FROM gitpod/workspace-full@sha256:658b2803b55bd2424ccaf0ae7b1cb970ecc559c48f05392dcaabd3d57d12c2ef

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

RUN npm install -g npm@10.4.0

RUN npm install -g dotenv-cli
RUN npm install -g commitizen