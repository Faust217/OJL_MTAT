# OJL_MTAT Cloud Learning Project

## Communication

- 所有解释、总结、计划和进度更新优先使用中文。
- 技术名称、代码、变量名、Git commit message 可以保留英文。
- 当解释一个新概念时，请说明它为什么存在，而不只是告诉我应该怎么改。

## Project background

这是我的 Final Year Project。

当前目标不是添加 Cloud、Kubernetes 或新功能。
当前第一阶段目标是恢复原项目，使其可以在本地稳定启动。

项目后续会用于学习：

- Docker
- Cloud
- AWS
- Kubernetes
- Observability
- CI/CD

但在本地 baseline 恢复完成以前，不要提前引入这些技术。

## Working principles

1. 不要一次性大规模重构项目。
2. 优先找到导致项目无法启动的根本原因。
3. 每次修改尽量保持小而容易验证。
4. 修改 dependency 前解释原因。
5. 不要为了让程序启动而随意删除原有功能。
6. 不要升级大量 package，除非确实必要。
7. 如果发现多个问题，先记录并按优先级逐个解决。
8. 每完成一个阶段，都运行实际验证命令。
9. 清楚区分：
   - 原项目 bug
   - 环境问题
   - dependency 问题
   - configuration 问题

## Git

- 不要直接 push 到 remote，除非我明确要求。
- 每个稳定的小阶段才 commit。
- commit message 使用英文。
- 不要删除原有 Git history。

## Learning

这个项目的主要目的之一是让我学习。

因此遇到重要修改时，请告诉我：

- 问题是什么
- 为什么会发生
- 你修改了什么
- 修改后如何验证
- 我应该从中理解什么