---
title: redis基础
date: 2018-11-12 22:41:14
tags:
- redis
categories:
- redis

---

# redis基础

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

每次客户端调用都会经历 **发送命令**、**执行命令**、**返回结果** 三个过程。redis是单线程处理的，所以一条命令从客户端到服务端不会立刻被执行，所有的命令都会进入一个队列中，然后逐条执行。由于网络传输无法保证顺序，所以redis无法保证从多个客户端发送的多条命令的执行顺序，但是可以保证不会有两条命令同时被执行。

## 全局命令

### 查询

- dbsize : 查询redis的键个数，O(1)级别的，不会遍历所有，直接获取变量的值

- exists key :查询key是否存储 1 存在，0 不存在

- type key : 查询key的数据结构类型 string、list、hash、set等，键不存在返回none

- object encoding key : 查询值的内部编码 int、embstr、raw等

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
  # 第二次查询返回的游标为0，证明已经查询完毕
  ```

  使用scan命令可以有效的避免redis可能产生的阻塞问题，但是如果在遍历过程中建发生了增删改，使用scan并不能保证结果的正确性。所有尽量使用scan去遍历一些不会变化的数据

### 键过期

- expire key 秒数 : 设置key的n秒后过期

- expireat key timestamp ：键在**秒级**时间戳timestamp后过期

- pexpire key 毫秒数 : 设置key在n毫秒后过期

- pexpireat key timestamp ：键在**毫秒级**时间戳timestamp后过期

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

## 数据结构

### 字符串string

字符串类型的key都是字符串，值可以是字符串、整型、浮点型、二进制，值最大不能超过512mb。

#### 1.内部编码

字符串类型的内部编码有3种

- int : 8个字节的长整型
- embstr : 小于等于44个字节的字符串
- raw : 大于44个字节的字符串

#### 2.命令

- set key value [ex seconds] \[px millseconds] \[nx|xx] ： 更新创建一个key，并设置过期时间

  ```shell
  # ex seconds 可选，为键设置秒级过期时间
  # px seconds 可选，为键设置毫秒级过期时间
  # nx 可选，键必须不存在，才可以设置成功，用于新增
  # xx 可选，键必须存在，才可以设置成功，用于更新
  ```

- setnx key value ：  键不存在创建一个key，原子性的命令

- setex key value seconds : 创建一个key，并设置过期时间，原子性的命令

- get key ： 获取指定键的值

- mset key [key1 key2...]  : 批量设置值

- mget key [key1 key2...] : 批量获取一堆key的值，顺序返回，键不存在会返回 (nil)

  ```properties
  使用单个命令耗时： n次get\set的时间 = n次网络时间 + n次命令时间
  使用批量命令耗时:  n次get\set的时间 = 1次网络时间 + n次命令时间
  使用批量命令能有效的提供访问速度，但是如果一次操作太多的key，可能会导致redis阻塞。
  ```

- incr key ：对于值为整型的key 进行原子加一操作,返回自增后的结果。如果key不存在，值按照0为自增为1

- decr key :  -1操作

- incrby key n ：指定自增数字

- decrby key n ：指定自减数字

- incrbyfloat key n ：指定自增浮点数

- append key value : 向字符串尾追加值

- strlen key : 查询值的字节长度

- getset key value : 设置新的值返回原来的值

- setrange key offset value : 设置指定位置的字符

- getrange key start end : 获取指定范围的值的字符，包含首尾

字符串类型的键的命令操作除了批量的操作，复杂度基本都是O(1)级别的，批量操作的命令复杂度是O(n)级别的(n为操作的key的个数)。所以字符串类型的命令操作特别快

#### 3.应用场景

- 验证码缓存 : 生成的验证码添加到缓存中并设置过期时间，这样重复获取的时候直接从缓存中获取
- 计数 : 利用redis的原子性计数功能实现简单的库存控制
- 流控 : 利用原子计数和过期控制的功能，实现流控，控制接口在单位时间内的访问次数

### 哈希hash

hash类指的是value本身是一种键值对的结构，key : {name:zhangsan,age:18},这种格式能够方便的操作对象类的数据格式

#### 1.内部编码

- ziplist : ziplist比较节省内存，但是读写效率相对较低。当该key对应的值的field个数小于配置 hash-max-ziplist-entries(默认512)配置，同时所有field对应的值大小都小于hash-max-ziplist-value(默认64字节)配置时，使用ziplist。
- hashtable : 当无法满足ziplist的条件时，内部编码会由ziplist转为hashtable。hashtable读写复杂度O(1)

#### 2.命令

hash类型的命令跟字符串类型的基本一致，只是hash类型的命令更多的是针对field的操作，而且每个命令前都会加个`h`

- hset key field value : 创建设置指定key指定field的值
- Hsetnx key field value : field不存在的时候set成功
- hget key field : 获取指定key指定field的值
- hdel key field [field1 field2 ...] :  删除一个或者多个field，返回成功删除field的个数
- hlen key : 计算指定key的field的个数
- hexists key field : 判断field是否存在,1 存在，0 不存在
- hmset key field [field1 field2 ...] : 批量设置field的值
- hmget key field [field1 field2 ...] : 批量获取field的值
- hgetall key : 获取所有的 field-value
- hkeys key : 获取指定key下所有的field
- hvals key : 获取所有field对应的value
- hstrlen key field : 计算field值的字节长度
- hincrby key field n: 对field的值进行自增n，注意值必须是整型
- hincrbyfloat key field n : 对field的值进行浮点数加

**hash类型的field无法单独设置过期时间，过期的作用域只能是key**。hash类型的命令简单的操作复杂度都是O(1)级别的，批量操作和hkeys、hvals、hgetall 操作复杂度为 O(n)  n为field的总数，

#### 3.应用场景

hash类型的值存的是一个对象，相比较字符串类型，hash类型可以减少key的数量，key多了也是会消耗内存的。
如果缓存值是一个对象，并且针对该值的操作更多的是针对对象中的字段单独进行操作时，建议使用hash类型来存储。

### 列表list

列表类型是有序的字符串集合，列表中可以含有重复的元素，一个列表最多存储 2的32次方-1个元素

#### 1.内部编码

- ziplist : 当该key对应的列表的元素个数小于 list-max-ziplist-entries(默认512)配置，并且列表中每个元素的值都小于 list-max-ziplist-value(默认64字节)配置时，使用ziplist，用于节省内存空间
- linkedlist : 当列表中元素无法满足ziplist的条件时，会将ziplist类型转换为linkedlist提高读写效率。

#### 2.命令

列表类型是一个**双向**的数组，对于列表的操作命令跟操作java中的list类似，所有的命令前都会加 `l`或者`r`

- lrange key start end : 查询列表中元素，需要指定start和end

  ```shell
  #索引下标有两个特点 lrange key 0 -1 查询所有的元素
  # 索引下标从左到右 分别是 0 到 n-1，从右往左分别是 -1 到 -n。
  # lrange 查询出来的结果是包含首尾的
  ```

- lpush key value [value1 value2...]  : 左侧插入元素 O(n) n为元素个数

- rpush key value [value1 value2...]  : 右侧插入元素 O(n) n为元素个数

- linsert key before|after preValue value : 找到preValue元素，然后在其前或者后插入元素 O(n) n为挪动的元素个数

- lindex key index : 获取列表中指定索引下标的元素 O(n) n为索引的偏移量

- lset key index newValue : 修改指定索引下标的元素值 O(n) n为索引的偏移量

- lpop key  : 弹出列表最左侧元素，返回该元素 O(1)

- rpop key  : 弹出列表最右侧元素，返回该元素 O(1)

- llen key : 获取列表的长度 O(1)

- lrem key count value : 删除元素，count是要删除值为value的元素的个数  O(n) n为列表长度

  ```shell
  # count > 0，从左到右，删除最多count个值为value的元素
  # count < 0，从右到左，删除最多count个值为value的元素
  # count = 0, 删除所有值为value的元素
  ```

- ltrim key start end : 只保留start和end范围的元素列表 O(n) n为要裁剪的元素总数

- blpop key [key1 key2...] timeout : 阻塞式弹出 O(1)

- brpop key [key1 key2...] timeout 

  ```shell
  # key [key1 key2] : 指定了多个键，只要有一个键对应的列表中有元素就可以弹出
  # timeout 阻塞时间，单位为秒，timeout=0表示一直阻塞，直到有元素弹出
  # timeout 指定了大于0的值 n 时
  	# 该时间范围内有元素添加，直接弹出
  	# 该时间范围内无元素添加，到了阻塞时间 n，直接返回 (nil)
  ```

#### 3.应用场景

- 栈 : lpush + lpop
- 队列 : lpush + rpop
- 消息队列 : 使用lpush + brpop 实现阻塞队列，生产者lpush，多个消费者阻塞获取。
- 有限集合 : lpush + ltrim

### 集合Set

set类型跟list类型一样都是一个数组，set是无序并且不允许有重复元素，无法通过下标获取元素。set支持多个集合之间的交集、并集、差集的命令运算。

#### 1.内部编码

- intset : 当集合中元素都是整数并且元素个数小于 set-max-intset-entries (默认512个)配置时，选用intset作为集合的编码实现，用于节省内存空间
- hashtable : 当集合没有满足intset的条件时，将intset类型转换为hashtable类型，提高读写效率 

#### 2.命令

操作set的命令跟操作java中的set类似，所有的命令都以 `s`开头

- smembers key : 获取集合中所有的元素
- sadd key value [value1 value2...] : 添加元素,返回成功添加的元素个数 O(n) n为元素的个数
- srem key value [value1 value2...] : 删除元素,返回成功删除的元素个数 O(n) n为元素的个数
- scard key : 计算集合中元素的个数 O(1)
- sismember key value : 判断元素是否在集合中 在返回1，不在返回0, O(1)
- srandmember key [count] : 随机从集合中返回指定个数的元素，默认1 , O(count)
- spop key [count]: 从集合中随机弹出元素,返回被弹出的元素 O(count)
- sinter key [key1 key2...] : 求多个集合的交集  O(m*k) m为键个数，k为集合中元素最少的个数
- sunion key [key1 key2...] : 求多个集合的并集  O(n) n为多个集合的元素数总和
- sdiff key [key1 key2...] : 求多个集合的差集  O(n) n为多个集合的元素数总和
- sinterstore destKey key [key1 key2...] : 将交集保存到destKey中

#### 3.应用场景

set类型的数据结构应用场景更多是对多个集合之间做并、交、差集进行操作。当业务场景需要用到多个key集合之间做这些用算的时候，使用set会很方便。

例如求不同用户之间相同的兴趣爱好，可以使用set类型，userId做key，然后将兴趣爱好存到set中，使用set的sinter方法求多个用户兴趣爱好的交集。

### 有序集合sortedSet

有序集合在集合set的基础上对每个元素设置了一个分数，根据分数可以对集合中的元素进行排序。有序集合中的元素同集合set一样不能重复，但是分数可以一样。

#### 1.内部编码

- ziplist : 当有序集合的元素个数小于 zset-max-ziplist-entries(默认128)配置，并且集合中每个元素的值都小于 zset-max-ziplist-value(默认64字节)配置时，使用ziplist，用于节省内存空间
- skiplist : 当集合中元素无法满足ziplist的条件时，会将ziplist类型转换为skiplist提高读写效率。

#### 2.命令

- zrange key start end [withscores] : 从低到高区间返回，withscores是带分数返回

- zrange key start end [withscores] : 从高到低区间返回，withscores是带分数返回

  ```shell
  #索引下标有两个特点 zrange key 0 -1 查询所有的元素
  # 索引下标从左到右 分别是 0 到 n-1，从右往左分别是 -1 到 -n。
  # zrange 查询出来的结果是包含首尾的
  ```

- zrangebyscore key min max [withscores] \[limit offset count]:按照分数从低到高，limit可以限制输出的起始位置和个数

- zrevrangebyscore key max min [withscores] \[limit offset count]:按照分数从高到底

  ```shell
  # min 和 max支持开区间(小括号)，-inf和+inf分辨代表无穷小和无穷大
  # zrangebyscore zkey (2 +inf withsocres
  # zrangebyscore zkey (2 (5 withsocres
  ```

- zadd key score member [score member ...] :向sortedSet中添加元素，并指定分数，时间复杂度 O(log(n))

  ```shell
  # nx : member必须不存在，才可以设置成功，用于添加
  # xx : member必须存在，才可以设置成，用于更新
  # ch : 返回此次操作后，有序集合元素和分数发生变化的个数
  # incr : 当member存在的时候，是更新分数累加，当member不存在的时候，是对分数进行赋值
  ```

- zcard key : 计算成员个数 O(1)

- zcount key min max : 返回指定分数范围成员个数

- zscore key member : 获取某个元素的分数，成员不存在返回nil

- zrank key member : 按分数从低到高返回member的排名,从0开始

- zrevrank key member : 按分数从高到低返回member的排名，从0开始

- zrem key member [member ...] : 删除成员元素

- zremrangebyrank key start end : 删除指定排名内的升序元素

- zremrangebyscore key min max : 删除指定分数范围的元素，返回成功删除的个数

- zincrby key increment member : 增加成员的分数，increment是分数的点数

- zinterstore destination numkeys key [key1 ...] \[weights weight \[weight ...]] \[aggregate sum|min|max] : 交集

- zunionstore destination numkeys key [key1 ...] \[weights weight \[weight ...]] \[aggregate sum|min|max] : 并集

  ```shell
  # destnation:需指定，计算结果保存到的那个键
  # numkeys : 需指定，需要做集合运算的key的个数
  # key [key...] : 需指定，做集合运算的sortedset类型的键
  # weights weight [weight ...] :每个键占的权重，做集合运算时，每个键中的元素的分数乘于自己对应的权重
  # aggregate sum|min|max: 聚合策略，集合运算后，对相同的元素做聚合处理的策略
  ```

#### 3.应用场景

- 排行榜系统 ：通过分数来控制排序

## 持久化

内存中的数据是不安全的，一旦发生断电或者机器故障，数据就会丢失，因此Redis提供了两种持久化方式，用于将内存中的数据保存到磁盘中

- RDB
- AOF

