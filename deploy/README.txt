公司服务器部署与维护说明（v0.3.0，2026-11-10）

入口：https://129.204.171.195/performance/
回调：https://129.204.171.195/performance/auth/callback
服务器：Ubuntu26.04，Node24.16.0；保留已有飞书自建应用和管理员绑定。

运行信息
服务 gyroor-performance.service；账号 performance；监听127.0.0.1:4310。
程序 /opt/gyroor-performance/current -> releases/下的版本目录。
数据 /var/lib/gyroor-performance/；备份 /var/backups/gyroor-performance/。
配置 /etc/gyroor-performance/app.env，root:performance，0640；交付包不含凭证、登录会话或真实数据库。
代理 /etc/nginx/snippets/gyroor-performance.conf，由原 northstar-ops 站点引用。
本次只更新程序版本，不改动Nginx及其他业务配置。
每天北京时间03:30左右自动备份，最长随机延迟120秒；升级前后另做备份。

首次启用
打开人员管理，维护真实员工、岗位及主管/HRBP/HRD关系，再生成本月考核单。
员工先用飞书登录；管理员核对本人开通编号后，在人员管理绑定已有员工，或新建普通员工。
修改关系不重写历史月份。完整CSV导入保留当前管理员行，角色用 | 分隔，字段不使用英文逗号；已有飞书绑定会保留。
评分方案默认未批准：原表权重预填为参考，所有待确认政策选项须明确选择、填写批准依据、创建批准规则并绑定月份，才允许发布正式结果。
当前人员和规则不要用测试名单覆盖。

日常检查
sudo systemctl status gyroor-performance.service
sudo systemctl list-timers gyroor-performance-backup.timer
sudo journalctl -u gyroor-performance.service --since today
curl --fail https://129.204.171.195/performance/health

手动备份
sudo systemctl start gyroor-performance-backup.service
备份包含SQLite一致性快照和附件。配置凭证另按公司秘密管理方式备份；建议保留异机副本。

升级与回滚
每次建立独立releases/版本目录，先备份，再原子切换current软链接并重启服务；健康检查失败立即指回旧版本。
本版在原数据库新增群提醒配置、配置审计与发送记录表，并给OAuth状态表补充return_to列。原账号、会话、附件和业务数据保留。群Webhook及签名密钥用服务端App Secret派生密钥加密保存，不回显；轮换App Secret后需重新配置群机器人。
若回滚到旧程序，在产生新业务记录后应先评估旧代码是否理解新字段，不要直接用旧代码编辑新表单记录。
恢复备份：停服务，保留当前数据目录，将同一备份的数据库与附件恢复到新目录并修复属主权限，再启动。不要混用旧数据库与其他WAL/SHM文件。

发布验证
41项程序测试、前端构建和本地浏览器联调通过；归档Excel/PDF独立读取通过。
本版是可试用的单实例实现，未完成160人并发压测或完整异机灾备演练；建议先用少量真实部门试点。

群提醒调度在现有服务内每分钟检查，不依赖桌面应用开启。未配置Webhook时不发送；09:00之后仅在当天18:00前检查补发，不追发已过期日期。发送结果不确定时保留待核对，不自动重发。详情见飞书群提醒接入说明.txt。
