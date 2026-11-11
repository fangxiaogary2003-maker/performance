# 飞书月度绩效工作台

企业自托管的月度绩效系统，当前版本 **v0.6.8**。支持飞书登录、组织同步、月度填报、主管与 HRBP 评分、跨部门评价、定向提醒和结果汇总。

## 当前功能

- 员工用一张交互表单填写工作事项、总结、自评和六项典型事例，可暂存未完成草稿、统一提交。
- 主管在一张表中完成每项工作时效/质量评分及六项核心素质评分；HRBP 独立填写六项评分。
- HRBP 按员工和月份指定两位跨部门评分人，按原表五项评价，不要求员工另填跨部门任务或上传成果文件。
- 从飞书同步人员、部门和直属上级；员工提交后核对上级并推送个人评分卡片。
- 工作月份与次月填报月份明确区分，正常月份自动建单，按工作日历发送个人待办与管理员进度汇总。
- 方案草稿、批准版本、月份绑定、五档等级、工作事项/核心素质模块门槛、加分审批和红线处理。
- 评分齐全通知管理员，发布及归档后导出 Excel/PDF；独立试跑单与正式业务隔离。

## 直接本地试用

需要 **Node.js 24+**。仓库已包含 `selfhost/public/` 构建前端，本地自托管运行使用 Node 内置模块，无需先安装前端依赖。

Windows PowerShell：

```powershell
git clone https://github.com/fangxiaogary2003-maker/performance.git
cd performance
$env:DEMO_MODE='true'
node local/server.mjs
```

Linux/macOS：

```sh
git clone https://github.com/fangxiaogary2003-maker/performance.git
cd performance
DEMO_MODE=true node local/server.mjs
```

打开 <http://127.0.0.1:4310/>。演示使用虚构人员和业务数据，仅监听本机，不连接真实飞书、不发送真实通知。

## 开发与验证

```sh
npm ci
node local/build.mjs
node --test tests/*.test.mjs
```

当前已通过 **176 项程序测试**。修改前端后执行构建，并将 `selfhost/public/app.js`、`app.css`、`index.html` 与对应源码一起提交。

## 自托管部署

1. 配置 HTTPS 反向代理，可使用独立域名或 `/performance/` 子路径。
2. 将 `.env.example` 复制为本地配置，填写 `APP_BASE_URL`、`FEISHU_APP_ID`、`FEISHU_APP_SECRET` 和 `DATA_DIR`；生产运行设置 `DEMO_MODE=false`。
3. 在飞书自建应用中配置登录回调，开启机器人及所需通讯录/消息权限并发布版本。
4. 运行 `node --env-file=.env local/server.mjs`，或使用仓库中的 Dockerfile 和 Compose 配置。
5. 首次管理员开通、人员同步、方案绑定、工作日历、备份及回滚按部署说明执行。

现有服务器和业务数据已有独立配置；本仓库同步不修改服务器运行状态。

- [服务器部署与维护](deploy/README.txt)
- [飞书自建应用接入](deploy/飞书自建应用接入说明.txt)
- [完整业务规则与版本说明](README.txt)
- [源码与构建文件来源](deploy/source-manifest.json)

密钥、真实员工数据、数据库、登录会话、附件和备份保存在部署环境，不纳入 Git。`.env.example` 和 `people.example.json` 仅为配置示例。`node_modules/` 与临时开发目录由本地生成。

## 目录

| 目录 | 内容 |
| --- | --- |
| `app/` | React 界面、角色表单与管理页面 |
| `lib/` | 业务规则、权限、评分、流程事件和导出 |
| `local/` | Node 服务、SQLite、飞书客户端、消息队列和备份工具 |
| `selfhost/public/` | 已构建的自托管前端 |
| `tests/` | 业务、权限、流程、通知、并发和表单测试 |
| `deploy/` | 部署、反向代理及飞书配置说明 |

项目保留最初 Sites/Vinext 适配代码及[起始模板说明](docs/sites-starter.md)，目前公司服务器使用 `local/server.mjs` 自托管入口。

### v0.6.8 单人全流程试跑

仅通过服务器明确授权的独立测试单可让同一人兼任员工、主管与 HRBP；评分页按服务端身份列表提供主管/HRBP切换，两份草稿及正式评价分别保存。正式人员管理仍禁止将自己设置为直属上级。此例外不可从表单创建或扩展，必须匹配测试工作区、单张考核、本人及授权记录。
