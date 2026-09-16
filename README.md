# TruckLink

项目基础设施已初始化；业务需求与技术框架将在需求确认后补充。

## 部署流程

- PR → 安装锁定依赖、语法检查、自动测试、Worker 打包校验。
- 合并或推送到 `main` → 上述检查全部成功 → 自动部署 Cloudflare Workers → 验证线上 `/health` 返回本次 Git commit。
- GitHub Actions 的 `CI / CD` 支持手动运行；只有 `main` 能部署生产环境。
- 发布或健康检查失败会将工作流标记为失败。健康检查失败不会自动回滚；回滚代码请通过 PR revert 对应提交，合并后自动重新发布。

线上地址：https://trucklink.obiecrm-ab8ac7.workers.dev

健康接口：https://trucklink.obiecrm-ab8ac7.workers.dev/health

## 本地开发

使用 Node.js 24：

```sh
npm ci
npm run dev
npm run check
npm test
npm run build
```

`npm run build` 仅打包校验，不发布。当前站点是环境验证占位服务，没有业务功能、数据库或用户数据。

## 凭据

GitHub `production` environment 中配置 `CLOUDFLARE_API_TOKEN` 和 `CLOUDFLARE_ACCOUNT_ID` secrets。仅生产部署步骤获取凭据，PR 检查无需凭据。不要把令牌、`.env` 或 `.dev.vars` 提交到仓库。

配置依据：[Cloudflare GitHub Actions 文档](https://developers.cloudflare.com/workers/ci-cd/external-cicd/github-actions/)。
