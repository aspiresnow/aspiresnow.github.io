---
title: mysql
catalog: 保证内存可见性
date: 2017-09-01 10:51:24
subtitle: ""
header-img: 
tags:
- mysql
categories:
- 数据库

---

# Mysql

mysql

<!--more-->

show variables like '%thread%';

```
| Variable_name                           | Value                     |
+-----------------------------------------+---------------------------+
| innodb_purge_threads                    | 1                         |
| innodb_read_io_threads                  | 4                         |
| innodb_thread_concurrency               | 0                         |
| innodb_thread_sleep_delay               | 10000                     |
| innodb_write_io_threads                 | 4                         |
| max_delayed_threads                     | 20                        |
| max_insert_delayed_threads              | 20                        |
| myisam_repair_threads                   | 1                         |
| performance_schema_max_thread_classes   | 50                        |
| performance_schema_max_thread_instances | -1                        |
| pseudo_thread_id                        | 2034351984                |
| thread_cache_size                       | 18                        | //缓存多少个线程
| thread_concurrency                      | 10                        |
| thread_handling                         | one-thread-per-connection | //每个连接一个线程
| thread_stack                            | 262144                    |
+-----------------------------------------+---------------------------+
```

 show variables like '%conn%';

```
+-----------------------------------------------+-----------------+
| Variable_name                                 | Value           |
+-----------------------------------------------+-----------------+
| character_set_connection                      | utf8            |
| collation_connection                          | utf8_general_ci |
| connect_timeout                               | 10              |
| disconnect_on_expired_password                | ON              |
| init_connect                                  |                 |
| max_connect_errors                            | 100             |
| max_connections                               | 1000            | /最大连接数
| max_user_connections                          | 0               |
| performance_schema_session_connect_attrs_size | -1              |
+-----------------------------------------------+-----------------+
```

show status like '%conn%';  查看当前mysql实例连接数情况

```
+-----------------------------------------------+------------+
| Variable_name                                 | Value      |
+-----------------------------------------------+------------+
| Aborted_connects                              | 1992481369 |
| Connection_errors_accept                      | 0          |
| Connection_errors_internal                    | 0          |
| Connection_errors_max_connections             | 0          |
| Connection_errors_peer_address                | 0          |
| Connection_errors_select                      | 0          |
| Connection_errors_tcpwrap                     | 0          |
| Connections                                   | 2034359919 |
| Max_used_connections                          | 968        |  //产生过的最大连接数
| Performance_schema_session_connect_attrs_lost | 0          |
| Ssl_client_connects                           | 0          |
| Ssl_connect_renegotiates                      | 0          |
| Ssl_finished_connects                         | 0          |
| Threads_connected                             | 543        |  //当前已连接数
+-----------------------------------------------+------------+
```

show variables like '%slow%';

```java
+---------------------------+----------------------------------------------+
| Variable_name             | Value                                        |
+---------------------------+----------------------------------------------+
| log_slow_admin_statements | OFF                                          |
| log_slow_slave_statements | OFF                                          |
| slow_launch_time          |
| slow_query_log            | ON                                           |//开启慢sql收集
| slow_query_log_file       | /rdsdbdata/log/slowquery/mysql-slowquery.log |
+---------------------------+----------------------------------------------+
```

 show variables like '%long_query%';

```
+-----------------+----------+
| Variable_name   | Value    |
+-----------------+----------+
| long_query_time | 1.000000 |  //执行时间超过1秒的sql将会被收集到日志里面
+-----------------+----------+
```

select * from mysql.slow_log ;查询慢sql语句

