#!/bin/bash
# 魂器挂起/唤醒钩子 - 重启核心和所有频道

case "$1" in
    pre)
        logger "[hunqi] 系统即将挂起"
        ;;
    post)
        logger "[hunqi] 系统唤醒，重启服务..."
        systemctl restart 'hunqi-core@*'
        sleep 3
        systemctl restart 'channel-feishu@*'
        ;;
esac
