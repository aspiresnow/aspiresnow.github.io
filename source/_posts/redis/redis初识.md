---
title: redis初识
date: 2018-11-12 22:41:14
tags:
- redis
categories:
- redis

---

# redis初识

## 为什么快

- 首先也是最重要的redis所有的数据都存放在内存中
- 其次redis是C语言实现的，C语言更底层，执行速度相对更快
- Redis使用了单线程架构epoll IO多路复用技术，预防了多线程可能产生的竞争和cpu切换问题

单线程有个问题，如果某个命令执行过长，会造成其他命令的阻塞，所以redis比较适合高速、高频的访问，避免一个命令返回过多数据，导致执行过慢阻塞。

## 丰富功能

redi可以作为键值对数据库，主要提供了5种数据结构:**字符串**、**哈希**、**列表**、**集合**、**有序集合**，同时在字符串基础上演变出了**位图(Bitmaps)**和**HyperLog**。除此之外，还额外提供了很多功能

- 键值过期功能，可以用来实现缓存
- 发布订阅功能，可以用来实现简单消息系统
- 支持Lua脚本功能，可以利用Lua创造出新的Redis命令
- 简单的事务功能，能在一定程度上保证事务特性
- 流水线(Pipeline)功能，支持批量传递命令，减少了网络开销

## 数据库

redis在一个实例上提供多个数据库，默认是16个。连接redis默认是用的是 index为0的数据库。一共有0-15个编号的数据库。可以了使用 select 1切换数据库。

redis上各个数据之间数据是相互隔离的。但是由于redis是单线程，一个实例上多个数据仍然使用一个CPU，彼此之间还是会受到影响。所以redis建议一个实例上只使用一个数据库。可如果想要实现多个数据库的功能，完全可以在一台机器上部署多个redis实例。

## 执行模式

![image](https://image-1257941127.cos.ap-beijing.myqcloud.com/redis/redis%E4%BC%A0%E8%BE%93.png)

每次客户端调用都会经历 **发送命令**、**执行命令**、**返回结果** 三个过程。redis是单线程处理的，所以一条命令从客户端到服务端不会立刻被执行，所有的命令都会进入一个队列中，然后逐条执行。由于网络传输无法保证顺序，所以redis无法保证从多个客户端发送的多条命令的执行顺序，当时可以确定不会有两条命令同时被执行。

## 数据结构

### 字符串

### 哈希

### 列表

### 集合

### 有序集合

## 全局命令

### 查询

- dbsize : 查询redis的键个数，O(1)级别的，不会遍历所有，直接获取变量的值
- exists key :查询key是否存储 1 存在，0 不存在
- type key : 查询key的数据结构类型 string、list、hash、set等，键不存在返回none
- keys  pattern 命令 : 根据规则遍历redis中的键

  ```shell
  keys * #遍历所有的键
  # * 代表匹配任意字符
  # ? 代表匹配一个字符
  # [] 代表匹配部分字符，[a,b]匹配a和b，[1-10]匹配1到10的数字
  # \x 用来转译 * ?等
  redis-cli keys a* | xargs redis-cli del #删除a开头的键
  ```

​      由于redis是单线程架构，假如执行 keys命令时查询到了大量的键，执行该命令会很慢，可能会造成redis阻塞，所以不建议在生产环境使用keys命令，redis提供了一种类似分页查询的命令 scan

- scan cursor [ MATCH pattern]  \[COUNT pagesize] :指定游标(从0开始)，和每次查询数量，每次查询数量默认是10

  scan 每次结果都会返回下次查询的起始游标，如果没有数据，返回的游标为 0

  ```shell
  scan 0 MATCH a* COUNT 2 #从0查询a开头的键，每次查询2个
  # 1) "4"
  # 2) 1) "abcd"
  #    2) "abddd"
  scan 4 MATCH a* COUNT 2 #从上次查询返回游标再次开始查
  # 1) "0"
  # 2) 1) "ab1d"
  #    2) "abd3d"
  # 第二次查询返回的游标为0，正面已经查询完毕
  ```

  使用scan命令可以有效的避免redis可能产生的阻塞问题，但是如果在遍历过程中建发生了增删改，使用scan并不能保证结果的正确性。使用scan去遍历一些不会变化的数据

### 键过期

- expire key 秒数 : 设置key的n秒后过期

- expireat key timestamp ：键再**秒级**时间戳timestamp后过期

- pexpire key 毫秒数 : 设置key的n毫秒后过期

- pexpireat key timestamp ：键再**毫秒级**时间戳timestamp后过期

- ttl key : 获取key剩余过期时间 单位为秒

- pttl key ：获取key剩余过期时间 单位为毫秒

  ```shell
  expire hello 10 #设置 hello的key 10秒后过期
  ttl hello # 返回值有以下三种情况
  # -1 键没有设置过期时间
  # -2 键不存在
  # 0-n 键剩余过期时间
  ```

- persist key : 清除键上的过期时间
- 对于字符串类型的键，执行set命令也会清除键的过期时间，所以redis提供了原子性命令 **setex = set+expire**

### 删除

- del key [key1 key2 ...] :删除键，支持一次删除多个键，返回删除键的个数
- flushdb : 清空当前redis数据库
- flushall : 清空redis实例上所有的数据库
- rename key newkey ：重命名key，会覆盖已经存在的newkey
- renamenx key newkey : 重命名key，当newkey已经存在的时候返回 0，重命名失败

### 数据迁移

- move key db : 在一个redis实例的多个数据库之间迁移数据

- dump + restore : 复制字节码值  --- 存储字节码值

  ```shell
  dump key  # 在一台redis服务器上执行该命令 会打印出 value值
  restore key 过期时间 value # 在另一台服务器上 将复制的key和value 再存储上
  ```

- migrate host port key|"" dest-db timeout [copy] \[replace] \[key1 key2 key3...]

  ```shell
  # host port 目标redis的ip和端口
  # key|"" 如果要迁移一个键，直接指定key值，如果迁移多个键，这使用 ""
  # dest-db 目标redis的数据库编号 ，一般默认使用0的数据库，所以这一般写0
  # timeout 迁移的超时时间 单位为毫米
  # [copy] 如果写了copy,迁移后并不删除源键
  # [replace] 如果写了replace，会覆盖目标redis上相同建的值
  # [key1 key2 ...] 迁移多个键的时候用，前面没有指定键，使用的是 ""
  ```



## 持久化

内存中的数据是不安全的，一旦发生断电或者机器故障，数据就会丢失，因此Redis提供了两种持久化方式，用于将内存中的数据保存到磁盘中

- RDB
- AOF

