# 监控系统生产环境部署指南

## 🎯 概述

本指南提供了将 UART Server NG 监控系统部署到生产环境的详细步骤和最佳实践。

## 📋 部署前检查清单

### 1. 安全配置

- [ ] 修改 Grafana 管理员密码（默认 admin/admin）
- [ ] 修改 Grafana Secret Key
- [ ] 配置 SMTP 邮件服务器凭据
- [ ] 检查防火墙规则
- [ ] 启用 HTTPS（推荐）
- [ ] 配置反向代理（Nginx/Caddy）

### 2. 资源规划

- [ ] 确认服务器资源充足
  - Prometheus: 最少 2GB RAM, 10GB 磁盘（30天数据）
  - Grafana: 最少 512MB RAM
  - AlertManager: 最少 256MB RAM
- [ ] 配置数据备份策略
- [ ] 设置数据保留策略

### 3. 网络配置

- [ ] 配置域名和DNS（如果使用）
- [ ] 开放必要端口或配置反向代理
  - Grafana: 3000 (或通过反向代理)
  - Prometheus: 9090 (建议仅内网访问)
  - AlertManager: 9093 (建议仅内网访问)
- [ ] 配置 SSL/TLS 证书

## 🚀 部署步骤

### Step 1: 环境变量配置

1. **复制环境变量模板**:
   ```bash
   cd /path/to/uartserver-ng
   cp .env.monitoring .env.monitoring.production
   ```

2. **编辑生产环境配置**:
   ```bash
   vim .env.monitoring.production
   ```

3. **必须修改的配置**:
   ```bash
   # 修改 Grafana 管理员密码
   GRAFANA_ADMIN_PASSWORD=your-strong-password-here

   # 修改 Secret Key（使用随机字符串）
   GRAFANA_SECRET_KEY=$(openssl rand -base64 32)

   # 配置告警接收邮箱
   ALERT_EMAIL_TO=ops-team@your-company.com
   ```

### Step 2: Docker Compose 配置

1. **创建生产环境 Docker Compose 覆盖文件**:
   ```bash
   cat > docker-compose.monitoring.prod.yml <<EOF
   version: '3.8'

   services:
     prometheus:
       deploy:
         resources:
           limits:
             cpus: '2'
             memory: 2G
           reservations:
             cpus: '0.5'
             memory: 512M

     grafana:
       deploy:
         resources:
           limits:
             cpus: '1'
             memory: 1G
           reservations:
             cpus: '0.25'
             memory: 256M
       environment:
         # 生产环境启用 HTTPS Cookie
         - GF_SECURITY_COOKIE_SECURE=true
         - GF_SESSION_COOKIE_SECURE=true

     alertmanager:
       deploy:
         resources:
           limits:
             cpus: '0.5'
             memory: 512M
           reservations:
             cpus: '0.1'
             memory: 128M
   EOF
   ```

### Step 3: 启动监控系统

1. **使用环境变量启动**:
   ```bash
   # 方式1: 指定环境变量文件
   docker-compose -f docker-compose.monitoring.yml --env-file .env.monitoring.production up -d

   # 方式2: 同时使用基础配置和生产覆盖
   docker-compose -f docker-compose.monitoring.yml -f docker-compose.monitoring.prod.yml up -d
   ```

2. **验证服务状态**:
   ```bash
   docker-compose -f docker-compose.monitoring.yml ps
   ```

3. **检查健康状态**:
   ```bash
   docker ps --filter "name=uartserver" --format "table {{.Names}}\t{{.Status}}"
   ```

### Step 4: 初始配置

1. **首次登录 Grafana**:
   - 访问: http://your-server:3000
   - 用户名: `admin`
   - 密码: 使用您在 `.env.monitoring.production` 中设置的密码

2. **修改默认密码**（如果使用默认密码启动）:
   - 登录后立即在 Profile → Change Password 修改

3. **验证数据源**:
   - 导航至 Configuration → Data Sources
   - 确认 Prometheus 数据源状态为绿色

4. **验证仪表板**:
   - 导航至 Dashboards → Browse
   - 确认所有4个仪表板已加载

### Step 5: 告警测试

1. **测试邮件告警**:
   ```bash
   # 手动发送测试告警到 AlertManager
   curl -XPOST http://localhost:9093/api/v1/alerts -d '[
     {
       "labels": {
         "alertname": "TestAlert",
         "severity": "warning"
       },
       "annotations": {
         "summary": "这是一条测试告警",
         "description": "验证邮件通知配置是否正确"
       }
     }
   ]'
   ```

2. **检查告警状态**:
   - 访问: http://your-server:9093
   - 确认测试告警出现

3. **验证邮件接收**:
   - 检查配置的邮箱是否收到告警邮件
   - 确认邮件格式正确，中文显示正常

## 🔒 安全加固

### 1. 配置 Nginx 反向代理 (推荐)

创建 `nginx/monitoring.conf`:
```nginx
# Grafana
server {
    listen 80;
    server_name monitoring.your-domain.com;

    # 强制 HTTPS
    return 301 https://$server_name$request_uri;
}

server {
    listen 443 ssl http2;
    server_name monitoring.your-domain.com;

    ssl_certificate /path/to/cert.pem;
    ssl_certificate_key /path/to/key.pem;
    ssl_protocols TLSv1.2 TLSv1.3;

    location / {
        proxy_pass http://localhost:3000;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;

        # WebSocket support for Grafana Live
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
    }
}

# Prometheus (仅限内网访问)
server {
    listen 80;
    server_name prometheus.internal.your-domain.com;

    # IP 白名单
    allow 192.168.1.0/24;
    allow 10.0.0.0/8;
    deny all;

    location / {
        proxy_pass http://localhost:9090;
        proxy_set_header Host $host;
    }
}
```

### 2. 配置防火墙

```bash
# 使用 ufw (Ubuntu/Debian)
sudo ufw allow 22/tcp    # SSH
sudo ufw allow 80/tcp    # HTTP
sudo ufw allow 443/tcp   # HTTPS
sudo ufw enable

# 注意：不要直接暴露 9090 (Prometheus) 和 9093 (AlertManager) 到公网
```

### 3. 启用 Grafana 匿名访问限制

在 `docker-compose.monitoring.yml` 中:
```yaml
environment:
  - GF_AUTH_ANONYMOUS_ENABLED=false
  - GF_AUTH_BASIC_ENABLED=true
```

## 📊 监控和维护

### 查看日志

```bash
# Prometheus
docker logs -f uartserver-prometheus

# Grafana
docker logs -f uartserver-grafana

# AlertManager
docker logs -f uartserver-alertmanager
```

### 数据备份

1. **Prometheus 数据备份**:
   ```bash
   # 创建快照
   curl -XPOST http://localhost:9090/api/v1/admin/tsdb/snapshot

   # 备份数据卷
   docker run --rm -v uartserver-ng_prometheus-data:/data \
     -v $(pwd)/backups:/backup alpine \
     tar czf /backup/prometheus-$(date +%Y%m%d).tar.gz /data
   ```

2. **Grafana 配置备份**:
   ```bash
   # 备份 Grafana 数据
   docker run --rm -v uartserver-ng_grafana-data:/data \
     -v $(pwd)/backups:/backup alpine \
     tar czf /backup/grafana-$(date +%Y%m%d).tar.gz /data
   ```

3. **自动备份脚本** (添加到 crontab):
   ```bash
   #!/bin/bash
   # /usr/local/bin/backup-monitoring.sh

   BACKUP_DIR="/path/to/backups/monitoring"
   DATE=$(date +%Y%m%d)

   mkdir -p $BACKUP_DIR

   # 备份 Prometheus
   docker run --rm -v uartserver-ng_prometheus-data:/data \
     -v $BACKUP_DIR:/backup alpine \
     tar czf /backup/prometheus-$DATE.tar.gz /data

   # 备份 Grafana
   docker run --rm -v uartserver-ng_grafana-data:/data \
     -v $BACKUP_DIR:/backup alpine \
     tar czf /backup/grafana-$DATE.tar.gz /data

   # 保留最近30天的备份
   find $BACKUP_DIR -name "*.tar.gz" -mtime +30 -delete

   echo "Backup completed: $DATE"
   ```

   添加到 crontab:
   ```bash
   # 每天凌晨2点备份
   0 2 * * * /usr/local/bin/backup-monitoring.sh >> /var/log/monitoring-backup.log 2>&1
   ```

### 数据恢复

```bash
# 恢复 Prometheus 数据
docker run --rm -v uartserver-ng_prometheus-data:/data \
  -v $(pwd)/backups:/backup alpine \
  tar xzf /backup/prometheus-20231215.tar.gz -C /

# 恢复 Grafana 数据
docker run --rm -v uartserver-ng_grafana-data:/data \
  -v $(pwd)/backups:/backup alpine \
  tar xzf /backup/grafana-20231215.tar.gz -C /
```

## 🔧 故障排查

### Prometheus 无法抓取指标

1. 检查应用是否在运行:
   ```bash
   curl http://localhost:9010/metrics
   ```

2. 检查 Prometheus targets:
   ```bash
   curl http://localhost:9090/api/v1/targets | jq '.data.activeTargets[] | select(.health!="up")'
   ```

### Grafana 无法连接 Prometheus

1. 检查网络连通性:
   ```bash
   docker exec uartserver-grafana wget -O- http://prometheus:9090/api/v1/query?query=up
   ```

2. 重新加载数据源:
   - Grafana UI → Configuration → Data Sources → Prometheus → Save & Test

### 告警未发送

1. 检查 AlertManager 配置:
   ```bash
   docker exec uartserver-alertmanager amtool config show
   ```

2. 查看告警状态:
   ```bash
   curl http://localhost:9093/api/v1/alerts
   ```

3. 测试邮件配置:
   ```bash
   docker exec uartserver-alertmanager amtool alert add test severity=critical
   ```

## 📈 性能优化

### Prometheus 查询优化

1. **限制查询时间范围**:
   - 在 Grafana 中避免查询超过7天的数据
   - 使用相对时间范围（如 "Last 24 hours"）

2. **使用 Recording Rules**:
   编辑 `prometheus/prometheus.yml`:
   ```yaml
   rule_files:
     - 'alerts.yml'
     - 'recording_rules.yml'  # 新增
   ```

   创建 `prometheus/recording_rules.yml`:
   ```yaml
   groups:
     - name: performance
       interval: 30s
       rules:
         - record: job:socketio_query_rate:5m
           expr: sum(rate(uartserver_socketio_queries_total[5m])) by (job)

         - record: job:query_success_rate:5m
           expr: |
             sum(rate(uartserver_socketio_queries_total{status="success"}[5m])) by (job)
             /
             sum(rate(uartserver_socketio_queries_total[5m])) by (job)
   ```

### Grafana 性能优化

1. **限制刷新频率**:
   - 仪表板默认刷新间隔设为 30s 或更长
   - 避免使用 5s 或 10s 自动刷新

2. **优化面板查询**:
   - 使用聚合函数减少数据点
   - 避免在单个面板中查询过多时间序列

## 🆘 紧急联系

- **运维团队**: ops-team@your-company.com
- **技术支持**: tech-support@your-company.com
- **值班电话**: xxx-xxxx-xxxx

## 📚 相关文档

- [监控系统快速开始](../grafana/README.md)
- [完整监控指南](MONITORING.md)
- [告警规则配置](../prometheus/alerts.yml)
- [告警路由配置](../prometheus/alertmanager.yml)

---

**最后更新**: 2025-12-19
**维护者**: UART Server NG Team
