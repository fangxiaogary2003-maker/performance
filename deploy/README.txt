公司服务器部署记录（v0.1.1，2026-11-10）

入口：https://129.204.171.195/performance/
飞书 App ID：cli_aa78307771b91c17
回调：https://129.204.171.195/performance/auth/callback
服务器：Ubuntu 26.04，沿用已有 Node 24.16.0。

本版已部署与验证：
- 服务 gyroor-performance.service 启用开机自启、异常重启。
- 进程为 performance 专用系统账号，仅监听 127.0.0.1:4310。
- Nginx 只新增 /performance/ 代理，原分销平台、签署系统、数据看板入口检查正常。
- 网页、脚本、接口、附件、登录Cookie和回调都支持 /performance 子路径。
- 应用凭证已通过飞书接口校验，凭证保存在服务器 /etc/gyroor-performance/app.env，root:performance，0640；此包不包含凭证。
- 每日北京时间 03:30 左右执行备份，最长随机延迟 120 秒。
- 首次数据库与附件备份已完成。
- 15 项程序测试通过，包括子路径接口与生产模式拒绝演示角色冒用。

目录：
  版本：/opt/gyroor-performance/releases/
  当前：/opt/gyroor-performance/current
  数据：/var/lib/gyroor-performance/
  备份：/var/backups/gyroor-performance/
  Nginx新增片段：/etc/nginx/snippets/gyroor-performance.conf
  Nginx原配置备份：/var/backups/gyroor-performance/nginx-before-20261110T033205Z.conf

登录开通：
员工使用飞书登录后，如果尚未导入名单，系统只显示开通编号，不开放业务数据，也不允许自行选择角色。
管理员可在服务器列出待开通记录（只显示编号、姓名、时间）：
  sudo -u performance /opt/node-v24.16.0-linux-x64/bin/node --env-file=/etc/gyroor-performance/app.env /opt/gyroor-performance/current/local/admin.mjs pending
由授权管理员核对本人提供的编号后，开通首位管理员（替换编号、部门和员工ID）：
  sudo -u performance /opt/node-v24.16.0-linux-x64/bin/node --env-file=/etc/gyroor-performance/app.env /opt/gyroor-performance/current/local/admin.mjs approve 编号 admin,hrbp 部门 员工ID
之后重新登录即可。后续员工通过人员名单导入，岗位及主管/HRBP关系由企业提供。

日常检查：
  sudo systemctl status gyroor-performance.service
  sudo systemctl list-timers gyroor-performance-backup.timer
  sudo journalctl -u gyroor-performance.service --since today
  curl --fail https://129.204.171.195/performance/health

回滚程序版本：
先核实保留版本目录存在，然后将 current 软链接原子指回该版本，重启 gyroor-performance.service；数据目录不随版本切换。
回滚代理：删除主配置中本次新增的 include /etc/nginx/snippets/gyroor-performance.conf; 一行，执行 nginx -t 成功后 reload。若使用完整备份恢复，应先确认备份后没有其他业务修改，避免覆盖别人的配置。

尚未完成的事项：
真实用户的首次OAuth登录及管理员绑定仍需本人操作；本版评分字段与原绩效表尚未完整对齐，正式计分默认未启用。部署服务不代表这些业务规则已验收完成。
